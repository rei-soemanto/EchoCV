import argparse
import csv
import json
import random
from collections import Counter, defaultdict
from pathlib import Path

import yaml

from inhouse.extract_pose import DERIVED, FRAMES, POSE_CSV, read_csv
from inhouse.relabel import relabelled
from yolo.build_dataset import CLASSES, _write
from yolo.build_dataset import OUT as BEHAVIOUR

FACE_CSV = DERIVED / "face.csv"
SCORES_CSV = DERIVED / "behaviour_scores.csv"
REJECT = DERIVED / "reject.txt"
POSTURE_RESULTS = Path(__file__).resolve().parents[1] / "calibration" / "results"
POSTURE_JSON = POSTURE_RESULTS / "inhouse_posture.json"
SOURCE = "inhouse"
LISTS = BEHAVIOUR / "lists"

CLIP_CLASS = {
    "touching_face": "touching_face",
    "arms_crossed": "arms_crossed",
    "slouching": "slouching",
    "reading_notes_held": "reading_notes",
}
NEUTRAL = ("upright", "looking_away", "smile", "gestures", "desk_hands")
SKIP = ("reading_notes_desk",)
KP_CONF = 0.5
TOUCH_REACH = 1.6
NEGATIVE_CLEAR = 1.2
NEGATIVE_MARGIN = 0.8
ARMS_MIN_TORSO = 0.8
OVERSAMPLE = 1
REPLAY = 2500
SEED = 0

Box = tuple[float, float, float, float]


def point(row: dict, i: int) -> tuple[float, float] | None:
    c = row.get(f"k{i}_c", "")
    if c == "" or float(c) < KP_CONF:
        return None
    return float(row[f"k{i}_x"]), float(row[f"k{i}_y"])


def face_box(row: dict) -> Box | None:
    if row.get("fx", "") in ("", None):
        return None
    w, h = float(row["w"]), float(row["h"])
    fx, fy, fw, fh = (float(row[k]) for k in ("fx", "fy", "fw", "fh"))
    return ((fx - fw / 2) * w, (fy - fh / 2) * h, (fx + fw / 2) * w, (fy + fh / 2) * h)


def clip_box(box: Box, w: float, h: float) -> Box | None:
    x1, y1, x2, y2 = max(0.0, box[0]), max(0.0, box[1]), min(w, box[2]), min(h, box[3])
    if x2 - x1 < 8 or y2 - y1 < 8:
        return None
    return x1, y1, x2, y2


def union(a: Box, b: Box) -> Box:
    return min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])


def touching_face_box(row: dict) -> Box | None:
    face = face_box(row)
    if face is None:
        return None
    fw = face[2] - face[0]
    cx, cy = (face[0] + face[2]) / 2, (face[1] + face[3]) / 2
    best = None
    for i in (9, 10):
        p = point(row, i)
        if p is None:
            continue
        d = ((p[0] - cx) ** 2 + (p[1] - cy) ** 2) ** 0.5 / fw
        if d <= TOUCH_REACH and (best is None or d < best[0]):
            best = (d, p)
    if best is None:
        return None
    r = 0.35 * fw
    x, y = best[1]
    return clip_box(union(face, (x - r, y - r, x + r, y + r)), float(row["w"]), float(row["h"]))


def arms_crossed_box(row: dict) -> Box | None:
    face = face_box(row)
    ls, rs = point(row, 5), point(row, 6)
    if face is None or ls is None or rs is None:
        return None
    w, h = float(row["w"]), float(row["h"])
    fw = face[2] - face[0]
    arms = [p for p in (point(row, i) for i in (7, 8, 9, 10)) if p is not None]
    xs = [ls[0], rs[0], *(p[0] for p in arms)]
    sh_y = (ls[1] + rs[1]) / 2
    if not arms and (h - sh_y) / fw < ARMS_MIN_TORSO:
        return None
    bottom = max((p[1] for p in arms), default=h) + 0.3 * fw
    box = (min(xs) - 0.2 * fw, sh_y - 0.25 * fw, max(xs) + 0.2 * fw, bottom)
    out = clip_box(box, w, h)
    if out is None or out[3] - out[1] < 0.35 * fw:
        return None
    return out


def slouching_box(row: dict) -> Box | None:
    if row.get("px1", "") == "":
        return None
    box = tuple(float(row[k]) for k in ("px1", "py1", "px2", "py2"))
    return clip_box(box, float(row["w"]), float(row["h"]))


def reading_notes_box(row: dict) -> Box | None:
    face = face_box(row)
    if face is None:
        return None
    fw = face[2] - face[0]
    below = face[3] - 0.2 * (face[3] - face[1])
    held = [
        o
        for o in json.loads(row.get("objects") or "[]")
        if o["cls"] in ("book", "cell phone") and (o["box"][1] + o["box"][3]) / 2 > below
    ]
    if held:
        best = max(held, key=lambda o: o["conf"])
        return clip_box(tuple(best["box"]), float(row["w"]), float(row["h"]))
    lw, rw = point(row, 9), point(row, 10)
    if lw and rw and lw[1] > below and rw[1] > below and abs(lw[0] - rw[0]) < 3 * fw:
        box = (
            min(lw[0], rw[0]) - 0.4 * fw,
            min(lw[1], rw[1]) - 0.9 * fw,
            max(lw[0], rw[0]) + 0.4 * fw,
            max(lw[1], rw[1]) + 0.3 * fw,
        )
        return clip_box(box, float(row["w"]), float(row["h"]))
    return None


BOXES = {
    "touching_face": touching_face_box,
    "arms_crossed": arms_crossed_box,
    "slouching": slouching_box,
    "reading_notes": reading_notes_box,
}


def wrist_clear(row: dict) -> bool:
    face = face_box(row)
    if face is None:
        return False
    fw = face[2] - face[0]
    cx, cy = (face[0] + face[2]) / 2, (face[1] + face[3]) / 2
    for i in (9, 10):
        p = point(row, i)
        if p and ((p[0] - cx) ** 2 + (p[1] - cy) ** 2) ** 0.5 / fw < NEGATIVE_CLEAR:
            return False
    return True


def decide(row: dict, scores: dict, thresholds: dict) -> tuple[str, list] | None:
    clip = row["clip"]
    if clip in SKIP:
        return None
    if clip in CLIP_CLASS:
        target = CLIP_CLASS[clip]
        if scores.get(target, 0.0) < thresholds[target]:
            return None
        box = BOXES[target](row)
        return (target, [(target, box)]) if box else None
    if clip in NEUTRAL:
        fired = any(scores.get(b, 0.0) >= NEGATIVE_MARGIN * t for b, t in thresholds.items())
        if fired or not wrist_clear(row):
            return None
        return ("negative", [])
    return None


def load_rows() -> list[dict]:
    pose = {r["frame"]: r for r in relabelled(read_csv(POSE_CSV))}
    face = {r["frame"]: r for r in read_csv(FACE_CSV)}
    scores = {r["frame"]: r for r in read_csv(SCORES_CSV)}
    rows = []
    for frame, p in pose.items():
        if p["part"] != "A" or frame not in face or frame not in scores:
            continue
        f = face[frame]
        if str(f.get("detected")) not in ("True", "true", "1"):
            continue
        s = {k: float(v) for k, v in scores[frame].items() if k != "frame" and v != ""}
        rows.append({**p, **{k: f[k] for k in ("fx", "fy", "fw", "fh")}, "scores": s})
    return rows


def thresholds_from_results() -> dict:
    res = json.loads(POSTURE_JSON.read_text(encoding="utf-8"))
    return {b: r["rule"]["threshold"] for b, r in res["behaviours"].items()}


def write_fold_yaml(name: str, train: list[str], val: list[str], test: list[str]) -> Path:
    cfg = {
        "path": str(BEHAVIOUR),
        "train": train,
        "val": val,
        "test": test,
        "names": dict(enumerate(CLASSES)),
    }
    path = BEHAVIOUR / f"data_{name}.yaml"
    path.write_text(yaml.safe_dump(cfg, sort_keys=False), encoding="utf-8")
    return path


def replay_list(rng: random.Random) -> Path:
    images = []
    for name in ("train_rf", "train_coco"):
        path = LISTS / f"{name}.txt"
        images += [p for p in path.read_text(encoding="utf-8").split("\n") if p]
    rng.shuffle(images)
    out = LISTS / "replay_v0.txt"
    out.write_text("\n".join(sorted(images[:REPLAY])), encoding="utf-8")
    return out


def oversampled(path: Path, times: int) -> Path:
    lines = [p for p in path.read_text(encoding="utf-8").split("\n") if p]
    out = path.with_name(f"{path.stem}_x{times}.txt")
    out.write_text("\n".join(lines * times), encoding="utf-8")
    return out


def main() -> None:
    from yolo.preview import sheet

    ap = argparse.ArgumentParser()
    ap.add_argument("--sheets", type=int, default=36)
    args = ap.parse_args()
    rng = random.Random(SEED)
    thresholds = thresholds_from_results()
    reject = set(REJECT.read_text(encoding="utf-8").split()) if REJECT.exists() else set()
    for sub in ("images", "labels"):
        folder = BEHAVIOUR / sub / SOURCE
        if folder.exists():
            for f in folder.iterdir():
                f.unlink()
    lists: dict[str, list[str]] = defaultdict(list)
    by_class: dict[str, list[Path]] = defaultdict(list)
    counts: Counter = Counter()
    dropped: Counter = Counter()
    for row in load_rows():
        name = Path(row["frame"]).stem
        if name in reject:
            dropped["rejected"] += 1
            continue
        result = decide(row, row["scores"], thresholds)
        if result is None:
            dropped[row["clip"]] += 1
            continue
        kind, labels = result
        dst = _write(FRAMES / row["frame"], name, SOURCE, labels, int(row["w"]), int(row["h"]))
        lists[row["person"]].append(str(dst))
        by_class[kind].append(dst)
        counts[(row["person"], kind)] += 1
    LISTS.mkdir(parents=True, exist_ok=True)
    people = sorted(lists)
    per_person = {}
    for pid in people:
        path = LISTS / f"inhouse_{pid}.txt"
        path.write_text("\n".join(lists[pid]), encoding="utf-8")
        per_person[pid] = path
    replay = replay_list(rng)
    val_rf = str(LISTS / "val_rf.txt")
    for held in people:
        train = [str(oversampled(per_person[p], OVERSAMPLE)) for p in people if p != held]
        write_fold_yaml(
            f"inhouse_{held}",
            train + [str(replay)],
            [str(per_person[held])],
            [str(per_person[held])],
        )
    write_fold_yaml(
        "inhouse_all",
        [str(oversampled(per_person[p], OVERSAMPLE)) for p in people] + [str(replay)],
        [val_rf],
        [str(LISTS / "test_rf.txt")],
    )
    for kind, imgs in by_class.items():
        pick = rng.sample(imgs, min(args.sheets, len(imgs)))
        sheet(pick, DERIVED / "contact" / f"{kind}.jpg")
    summary = {
        "thresholds": thresholds,
        "kept": {f"{p}:{k}": n for (p, k), n in sorted(counts.items())},
        "dropped_by_clip": dict(dropped),
    }
    (DERIVED / "autolabel_summary.json").write_text(json.dumps(summary, indent=2))
    totals = Counter()
    for (_, k), n in counts.items():
        totals[k] += n
    print(json.dumps({"kept": dict(totals), "dropped": dict(dropped)}, indent=2))
    with open(DERIVED / "autolabel_counts.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["person", "kind", "frames"])
        writer.writerows([p, k, n] for (p, k), n in sorted(counts.items()))


if __name__ == "__main__":
    main()

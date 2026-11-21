import argparse
import json
import shutil
from collections import defaultdict
from pathlib import Path

import numpy as np

from common.paths import ARTIFACTS
from common.provenance import write_provenance
from inhouse.autolabel import BEHAVIOUR, CLIP_CLASS, POSTURE_JSON
from inhouse.extract_pose import FRAMES, POSE_CSV, read_csv
from inhouse.relabel import relabelled
from yolo.build_dataset import CLASSES
from yolo.evaluate import _metrics
from yolo.train import RUNS, train

V0 = ARTIFACTS / "yolo" / "v0" / "best.pt"
OUT = ARTIFACTS / "yolo" / "v1"
REPORT = ARTIFACTS / "yolo" / "v1_lopo.json"
HOLDOUT_REPORT = ARTIFACTS / "yolo" / "v1_holdout.json"
CONF = 0.25
WINDOW = 3
SKIP_FOR = {"reading_notes": ("reading_notes_desk",)}


def frame_labels(rows: list[dict], behaviour: str) -> tuple[list[dict], np.ndarray]:
    keep = [r for r in rows if r["clip"] not in SKIP_FOR.get(behaviour, ())]
    y = np.array([CLIP_CLASS.get(r["clip"]) == behaviour for r in keep])
    return keep, y


def smoothed(rows: list[dict], values: np.ndarray, window: int = WINDOW) -> np.ndarray:
    out = np.zeros(len(values), dtype=float)
    history: dict[str, list[float]] = defaultdict(list)
    for i, (r, v) in enumerate(zip(rows, values, strict=True)):
        seen = history[r["stem"]]
        seen.append(float(v))
        recent = seen[-window:]
        out[i] = sum(recent) / len(recent)
    return out


def prf(y: np.ndarray, pred: np.ndarray) -> dict:
    tp, fp, fn = int(np.sum(y & pred)), int(np.sum(~y & pred)), int(np.sum(y & ~pred))
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    return {"f1": 2 * p * r / (p + r) if p + r else 0.0, "precision": p, "recall": r}


def max_conf(model, rows: list[dict]) -> np.ndarray:
    out = np.zeros((len(rows), len(CLASSES)))
    paths = [str(FRAMES / r["frame"]) for r in rows]
    for i in range(0, len(paths), 32):
        for j, res in enumerate(
            model.predict(paths[i : i + 32], imgsz=640, conf=0.05, verbose=False), start=i
        ):
            for cls, conf in zip(res.boxes.cls.tolist(), res.boxes.conf.tolist(), strict=True):
                out[j, int(cls)] = max(out[j, int(cls)], conf)
    return out


def frame_scores(model, rows: list[dict]) -> dict:
    conf = max_conf(model, rows)
    by_index = {r["frame"]: i for i, r in enumerate(rows)}
    result = {}
    for c, behaviour in enumerate(CLASSES):
        keep, y = frame_labels(rows, behaviour)
        idx = [by_index[r["frame"]] for r in keep]
        pred = smoothed(keep, (conf[idx, c] >= CONF).astype(float)) >= 0.5
        clip_rate = defaultdict(list)
        for r, p in zip(keep, pred, strict=True):
            clip_rate[r["clip"]].append(p)
        result[behaviour] = {
            **prf(y, pred),
            "clip_rate": {k: round(float(np.mean(v)), 3) for k, v in sorted(clip_rate.items())},
        }
    return result


def best_epoch(run: Path) -> int:
    rows = [{k.strip(): v for k, v in r.items()} for r in read_csv(run / "results.csv")]
    best = max(rows, key=lambda r: float(r["metrics/mAP50-95(B)"]))
    return int(float(best["epoch"]))


def holdout(model, v0, part_a: list[dict], people: list[str], weights: str) -> None:
    per = {}
    for pid in people:
        rows = [r for r in part_a if r["person"] == pid]
        per[pid] = {"v1": frame_scores(model, rows), "v0": frame_scores(v0, rows)}
    summary = {
        b: {m: float(np.mean([per[p][m][b]["f1"] for p in people])) for m in ("v1", "v0")}
        for b in CLASSES
    }
    shown = Path(weights).resolve().relative_to(ARTIFACTS.parent.resolve()).as_posix()
    report = {"weights": shown, "people": people, "summary": summary, "per_person": per}
    HOLDOUT_REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


def main() -> None:
    from ultralytics import YOLO

    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=30)
    ap.add_argument("--freeze", type=int, default=10)
    ap.add_argument("--lr0", type=float, default=0.002)
    ap.add_argument("--only", default="")
    ap.add_argument("--skip-final", action="store_true")
    ap.add_argument("--prefix", default="v1_lopo")
    ap.add_argument("--holdout", default="")
    ap.add_argument("--weights", default=str(OUT / "best.pt"))
    args = ap.parse_args()

    part_a = [r for r in relabelled(read_csv(POSE_CSV)) if r["part"] == "A"]
    people = sorted({r["person"] for r in part_a})
    rule = json.loads(POSTURE_JSON.read_text(encoding="utf-8"))["behaviours"]
    v0 = YOLO(V0)
    if args.holdout:
        held = args.holdout.split(",")
        holdout(YOLO(args.weights), v0, part_a, held, args.weights)
        return
    folds = []
    for held in people:
        if args.only and held != args.only:
            continue
        name = f"{args.prefix}_{held}"
        run = RUNS / name
        if not (run / "weights" / "best.pt").exists():
            train(
                data=str(BEHAVIOUR / f"data_inhouse_{held}.yaml"),
                name=name,
                weights=str(V0),
                epochs=args.epochs,
                patience=8,
                freeze=args.freeze,
                lr0=args.lr0,
                plots=False,
            )
        model = YOLO(run / "weights" / "best.pt")
        rows = [r for r in part_a if r["person"] == held]
        folds.append(
            {
                "held_out": held,
                "best_epoch": best_epoch(run),
                "map_held_out": {
                    "v1": _metrics(model, f"inhouse_{held}"),
                    "v0": _metrics(v0, f"inhouse_{held}"),
                },
                "frames_held_out": {
                    "v1": frame_scores(model, rows),
                    "v0": frame_scores(v0, rows),
                },
                "forgetting_test_rf": _metrics(model, "test_rf"),
            }
        )
        print(
            held,
            json.dumps(
                {b: round(v["f1"], 3) for b, v in folds[-1]["frames_held_out"]["v1"].items()}
            ),
        )
    summary = {}
    for behaviour in CLASSES:
        v1 = [f["frames_held_out"]["v1"][behaviour]["f1"] for f in folds]
        v0f = [f["frames_held_out"]["v0"][behaviour]["f1"] for f in folds]
        summary[behaviour] = {
            "detector_v1_lopo_f1": float(np.mean(v1)) if v1 else None,
            "detector_v0_lopo_f1": float(np.mean(v0f)) if v0f else None,
            "pose_rule_lopo_f1": rule[behaviour]["lopo_f1"],
        }
        best = max(
            ("detector", summary[behaviour]["detector_v1_lopo_f1"] or 0.0),
            ("pose_rule", summary[behaviour]["pose_rule_lopo_f1"]),
            key=lambda kv: kv[1],
        )
        summary[behaviour]["use"] = best[0]
    report = {
        "settings": {k: v for k, v in vars(args).items() if k not in ("holdout", "weights")}
        | {"conf": CONF, "smoothing_frames": WINDOW},
        "summary": summary,
        "folds": folds,
        "v0_test_rf": _metrics(v0, "test_rf"),
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    if args.skip_final or args.only:
        return
    epochs = max(5, round(float(np.mean([f["best_epoch"] for f in folds]))))
    train(
        data=str(BEHAVIOUR / "data_inhouse_all.yaml"),
        name=f"{args.prefix}_all",
        weights=str(V0),
        epochs=epochs,
        patience=epochs,
        freeze=args.freeze,
        lr0=args.lr0,
        plots=False,
    )
    final = RUNS / f"{args.prefix}_all" / "weights" / "last.pt"
    OUT.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(final, OUT / "best.pt")
    model = YOLO(OUT / "best.pt")
    metrics = {
        "epochs": epochs,
        "test_rf": _metrics(model, "test_rf"),
        "v0_test_rf": report["v0_test_rf"],
        "lopo_summary": summary,
    }
    (OUT / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    write_provenance(
        OUT,
        [
            "rf_body_language",
            "rf_sitting_posture_cls",
            "rf_face_gesture",
            "coco2017_kpts",
            "inhouse",
        ],
        "artifacts/yolo/v0/best.pt (fine-tuned from yolo26n.pt, AGPL-3.0)",
        f"Fine-tuned on in-house frames from {', '.join(people)} plus a v0 replay sample.",
    )
    print(json.dumps({k: metrics[k] for k in ("epochs", "test_rf")}, indent=2, default=str))


if __name__ == "__main__":
    main()

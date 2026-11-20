import argparse
import csv
import json
from pathlib import Path

import cv2
import numpy as np

from common.paths import BASE_MODELS
from inhouse.inventory import INHOUSE, RAW, read_inventory

DERIVED = INHOUSE / "derived"
FRAMES = DERIVED / "frames"
POSE_DIR = DERIVED / "pose"
POSE_CSV = DERIVED / "pose.csv"
FRAMES_CSV = DERIVED / "frames.csv"

SAMPLE_FPS = 5.0
TRIM_S = 2.0
MAX_SIDE = 1280
JPEG_QUALITY = 90
KP_CONF = 0.5
OBJECT_CLASSES = {67: "cell phone", 73: "book", 63: "laptop"}
BATCH = 16

META = ["frame", "stem", "person", "session", "part", "clip", "language", "t", "w", "h"]
PERSON = ["n_people", "px1", "py1", "px2", "py2", "pconf"]
KPS = [f"k{i}_{a}" for i in range(17) for a in ("x", "y", "c")]
POSE_COLUMNS = META + PERSON + KPS + ["objects"]


def sample_window(duration: float, part: str) -> tuple[float, float]:
    if part == "A":
        return TRIM_S, max(TRIM_S, duration - TRIM_S)
    return 0.0, duration


def scale_to(width: int, height: int, max_side: int = MAX_SIDE) -> tuple[int, int]:
    s = min(1.0, max_side / max(width, height))
    return round(width * s), round(height * s)


def main_person(boxes: np.ndarray, confs: np.ndarray) -> int | None:
    if not len(boxes):
        return None
    areas = (boxes[:, 2] - boxes[:, 0]) * (boxes[:, 3] - boxes[:, 1])
    return int(np.argmax(areas * confs))


def next_sample(t: float, next_t: float) -> float:
    step = 1.0 / SAMPLE_FPS
    while next_t <= t:
        next_t += step
    return next_t


def sample_frames(path: Path, start: float, end: float):
    cap = cv2.VideoCapture(str(path))
    next_t = start
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            t = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0
            if t > end:
                break
            if t < next_t:
                continue
            next_t = next_sample(t, next_t)
            h, w = frame.shape[:2]
            frame = cv2.resize(frame, scale_to(w, h), interpolation=cv2.INTER_AREA)
            yield round(t, 3), frame
    finally:
        cap.release()


def pose_rows(entry: dict, frames: list, pose_model, det_model) -> list[dict]:
    rows = []
    for i in range(0, len(frames), BATCH):
        chunk = frames[i : i + BATCH]
        images = [f for _, f, _ in chunk]
        poses = pose_model.predict(images, verbose=False, conf=0.25)
        dets = det_model.predict(images, verbose=False, conf=0.25, classes=list(OBJECT_CLASSES))
        for (t, frame, rel), pose, det in zip(chunk, poses, dets, strict=True):
            h, w = frame.shape[:2]
            row = {
                "frame": rel,
                "stem": entry["stem"],
                "person": entry["person"],
                "session": entry["session"],
                "part": entry["part"],
                "clip": entry["clip"],
                "language": entry["language"],
                "t": t,
                "w": w,
                "h": h,
                "n_people": len(pose.boxes),
            }
            boxes = pose.boxes.xyxy.cpu().numpy() if len(pose.boxes) else np.zeros((0, 4))
            confs = pose.boxes.conf.cpu().numpy() if len(pose.boxes) else np.zeros(0)
            idx = main_person(boxes, confs)
            if idx is not None:
                x1, y1, x2, y2 = boxes[idx]
                row.update(px1=x1, py1=y1, px2=x2, py2=y2, pconf=confs[idx])
                kp = pose.keypoints.data[idx].cpu().numpy()
                for k in range(17):
                    row[f"k{k}_x"], row[f"k{k}_y"], row[f"k{k}_c"] = kp[k]
            objects = []
            for box, cls, conf in zip(
                det.boxes.xyxy.cpu().numpy(),
                det.boxes.cls.cpu().numpy().astype(int),
                det.boxes.conf.cpu().numpy(),
                strict=True,
            ):
                objects.append(
                    {
                        "cls": OBJECT_CLASSES[int(cls)],
                        "conf": round(float(conf), 3),
                        "box": [round(float(v), 1) for v in box],
                    }
                )
            row["objects"] = json.dumps(objects)
            rows.append({k: _round(v) for k, v in row.items()})
    return rows


def _round(v):
    if isinstance(v, np.floating | float):
        return round(float(v), 2)
    return v


def write_csv(path: Path, rows: list[dict], columns: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def read_csv(path: Path) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def process(entry: dict, pose_model, det_model) -> int:
    out_csv = POSE_DIR / f"{entry['stem']}.csv"
    if out_csv.exists():
        return 0
    start, end = sample_window(float(entry["duration_s"]), entry["part"])
    folder = FRAMES / entry["stem"]
    folder.mkdir(parents=True, exist_ok=True)
    frames = []
    for t, frame in sample_frames(RAW / entry["file"], start, end):
        name = f"{entry['stem']}_{round(t * 1000):06d}.jpg"
        cv2.imwrite(str(folder / name), frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
        frames.append((t, frame, f"{entry['stem']}/{name}"))
    rows = pose_rows(entry, frames, pose_model, det_model)
    write_csv(out_csv, rows, POSE_COLUMNS)
    return len(rows)


def merge() -> int:
    rows = []
    for path in sorted(POSE_DIR.glob("*.csv")):
        rows.extend(read_csv(path))
    write_csv(POSE_CSV, rows, POSE_COLUMNS)
    write_csv(FRAMES_CSV, rows, META)
    return len(rows)


def main() -> None:
    from ultralytics import YOLO

    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="stem prefix, e.g. p01_s1")
    args = ap.parse_args()
    BASE_MODELS.mkdir(parents=True, exist_ok=True)
    pose_model = YOLO(str(BASE_MODELS / "yolo26n-pose.pt"))
    det_model = YOLO(str(BASE_MODELS / "yolo26n.pt"))
    entries = []
    for r in read_inventory():
        r["stem"] = Path(r["file"]).stem
        if r["stem"].startswith(args.only):
            entries.append(r)
    for n, entry in enumerate(entries, 1):
        count = process(entry, pose_model, det_model)
        print(f"[{n}/{len(entries)}] {entry['stem']}: {count or 'cached'}")
    print(f"{merge()} frames -> {POSE_CSV}")


if __name__ == "__main__":
    main()

"""Build the behaviour-detector dataset from the Roboflow seed sets and COCO-derived crops.

Output (ml/data/behaviour/):
  images/<source>/<name>.jpg, labels/<source>/<name>.txt   YOLO format (shared/labels.json classes)
  lists/{train,val,test}_{rf,coco}.txt                     image lists per origin
  data_A.yaml (Roboflow only), data_B.yaml (Roboflow + COCO); both validate on Roboflow val.

Run from ml/:  uv run python -m yolo.build_dataset
"""

import hashlib
import json
import shutil
from collections import Counter
from pathlib import Path

import yaml
from PIL import Image

from common.paths import DATA, load_labels

OUT = DATA / "behaviour"
CLASSES = load_labels()["behaviourClasses"]
CLASS_MAP = Path(__file__).with_name("class_map.yaml")
SPLITS = {"train": "train", "valid": "val", "test": "test"}


def _split_by_hash(name: str) -> str:
    h = int(hashlib.md5(name.encode()).hexdigest(), 16) % 100
    return "train" if h < 85 else "val" if h < 95 else "test"


def _half(name: str) -> str:
    """COCO val2017 is split evenly into val and test."""
    return "val" if int(hashlib.md5(name.encode()).hexdigest(), 16) % 2 else "test"


TOUCH_OVERLAP = 0.2  # share of the hand box that must lie on the face box


def _hand_on_face(face, hand) -> bool:
    """Hand box mostly on the face, with its centre on the face (a little extra room below for
    chin rests). Rejects palms raised beside the face whose boxes merely clip the face box."""
    ix = max(0.0, min(face[2], hand[2]) - max(face[0], hand[0]))
    iy = max(0.0, min(face[3], hand[3]) - max(face[1], hand[1]))
    area = (hand[2] - hand[0]) * (hand[3] - hand[1])
    fw, fh = face[2] - face[0], face[3] - face[1]
    cx, cy = (hand[0] + hand[2]) / 2, (hand[1] + hand[3]) / 2
    centre_on_face = (
        face[0] - 0.1 * fw <= cx <= face[2] + 0.1 * fw and face[1] <= cy <= face[3] + 0.3 * fh
    )
    hand_sized = area <= 3 * fw * fh  # some sources box a whole raised arm/person as "hand"
    return area > 0 and ix * iy / area >= TOUCH_OVERLAP and centre_on_face and hand_sized


def keep_negative(name: str, split: str, fraction: float) -> bool:
    """Subsample label-free training images (deterministic); val/test keep all of them so
    false positives are measured on the real mix."""
    if split != "train" or fraction >= 1:
        return True
    return int(hashlib.md5(name.encode()).hexdigest(), 16) % 1000 < fraction * 1000


def _write(src_img: Path | Image.Image, name: str, source: str, labels: list, w: int, h: int):
    img_dir, lbl_dir = OUT / "images" / source, OUT / "labels" / source
    img_dir.mkdir(parents=True, exist_ok=True)
    lbl_dir.mkdir(parents=True, exist_ok=True)
    dst = img_dir / f"{name}.jpg"
    if isinstance(src_img, Image.Image):
        src_img.save(dst, quality=92)
    elif src_img.suffix.lower() in (".jpg", ".jpeg"):
        shutil.copyfile(src_img, dst)
    else:
        Image.open(src_img).convert("RGB").save(dst, quality=92)
    lines = []
    for cls, (x1, y1, x2, y2) in labels:
        cx, cy = (x1 + x2) / 2 / w, (y1 + y2) / 2 / h
        lines.append(
            f"{CLASSES.index(cls)} {cx:.6f} {cy:.6f} {(x2 - x1) / w:.6f} {(y2 - y1) / h:.6f}"
        )
    (lbl_dir / f"{name}.txt").write_text("\n".join(lines), encoding="utf-8")
    return dst


def remap_boxes(boxes: list, rules: dict) -> list | None:
    """boxes: [(source_class, xyxy)]. Returns [(target_class, xyxy)], or None to drop the image."""
    out, faces, hands = [], [], []
    for name, box in boxes:
        role = rules.get(name, "ignore")
        if role == "drop_image":
            return None
        if role == "face":
            faces.append(box)
        elif role == "hand":
            hands.append(box)
        elif role in CLASSES:
            out.append((role, box))
    for f in faces:  # a hand box on a face box -> touching_face over their union
        for hb in hands:
            if _hand_on_face(f, hb):
                out.append(
                    (
                        "touching_face",
                        (min(f[0], hb[0]), min(f[1], hb[1]), max(f[2], hb[2]), max(f[3], hb[3])),
                    )
                )
                break
    return out


def roboflow_detection(source: str, rules: dict, lists: dict) -> Counter:
    export = DATA / "roboflow" / source / "export"
    names = yaml.safe_load((export / "data.yaml").read_text(encoding="utf-8"))["names"]
    if isinstance(names, dict):
        names = [names[k] for k in sorted(names)]
    counts = Counter()
    for img in sorted(export.glob("*/images/*")):
        split = SPLITS.get(img.parent.parent.name) or _split_by_hash(img.name)
        w, h = Image.open(img).size
        boxes = []
        lbl = img.parent.parent / "labels" / f"{img.stem}.txt"
        for line in lbl.read_text().splitlines() if lbl.exists() else []:
            v = line.split()
            if len(v) < 5:
                continue
            c, cx, cy, bw, bh = int(v[0]), *map(float, v[1:5])  # keypoint rows: keep the box only
            box = ((cx - bw / 2) * w, (cy - bh / 2) * h, (cx + bw / 2) * w, (cy + bh / 2) * h)
            boxes.append((names[c], box))
        labels = remap_boxes(boxes, rules)
        name = f"{source}_{img.stem}"[:150]
        if labels is None or (
            not labels and not keep_negative(name, split, rules.get("_neg_keep", 1.0))
        ):
            continue
        lists[f"{split}_rf"].append(_write(img, name, source, labels, w, h))
        counts.update(c for c, _ in labels or [("negative", None)])
    return counts


def roboflow_classification(source: str, rules: dict, lists: dict, person_model) -> Counter:
    """Image-level posture labels -> a slouching box on the main person (or a negative)."""
    export = DATA / "roboflow" / source / "export"
    counts = Counter()
    for img in sorted(export.glob("*/*/*")):
        if img.suffix.lower() not in (".jpg", ".jpeg", ".png"):
            continue
        role = rules.get(img.parent.name, "drop_image")
        if role == "drop_image":
            continue
        split = SPLITS.get(img.parent.parent.name) or _split_by_hash(img.name)
        name = f"{source}_{img.parent.name}_{img.stem}"[:150]
        if role not in CLASSES and not keep_negative(name, split, rules.get("_neg_keep", 1.0)):
            continue
        # CPU: the 4 GB GPU is kept for one training/inference job at a time.
        res = person_model.predict(img, classes=[0], conf=0.35, verbose=False, device="cpu")[0]
        if not len(res.boxes):
            continue
        areas = (res.boxes.xyxy[:, 2] - res.boxes.xyxy[:, 0]) * (
            res.boxes.xyxy[:, 3] - res.boxes.xyxy[:, 1]
        )
        box = tuple(res.boxes.xyxy[int(areas.argmax())].tolist())
        h, w = res.orig_shape
        labels = [(role, box)] if role in CLASSES else []
        lists[f"{split}_rf"].append(_write(img, name, source, labels, w, h))
        counts[role] += 1
    return counts


def coco(lists: dict) -> Counter:
    counts = Counter()
    for split2017 in ("train2017", "val2017"):
        sel = json.loads(
            (DATA / "coco" / f"selection_{split2017}.json").read_text(encoding="utf-8")
        )
        for rec in sel:
            src = DATA / "coco" / "images" / split2017 / rec["file_name"]
            if not src.exists():
                continue
            x1, y1, x2, y2 = rec["crop"]
            crop = Image.open(src).convert("RGB").crop((round(x1), round(y1), round(x2), round(y2)))
            labels = [(c, tuple(b)) for c, b in rec["labels"]]
            split = "train" if split2017 == "train2017" else _half(rec["id"])
            lists[f"{split}_coco"].append(
                _write(crop, f"coco_{rec['id']}", "coco", labels, *crop.size)
            )
            counts.update(c for c, _ in labels or [("negative", None)])
    return counts


def main() -> None:
    from ultralytics import YOLO

    if OUT.exists():
        shutil.rmtree(OUT)
    rules_all = yaml.safe_load(CLASS_MAP.read_text(encoding="utf-8")) if CLASS_MAP.exists() else {}
    lists = {f"{s}_{o}": [] for s in ("train", "val", "test") for o in ("rf", "coco")}
    person_model = YOLO("yolo26n.pt")
    report = {}
    for source, rules in (rules_all or {}).items():
        meta = DATA / "roboflow" / source / "project.json"
        if not meta.exists():
            print(f"  skip {source}: not downloaded")
            continue
        kind = json.loads(meta.read_text())["type"]
        if kind == "classification":
            report[source] = roboflow_classification(source, rules, lists, person_model)
        else:
            report[source] = roboflow_detection(source, rules, lists)
    report["coco"] = coco(lists)

    (OUT / "lists").mkdir(parents=True, exist_ok=True)
    for key, paths in lists.items():
        (OUT / "lists" / f"{key}.txt").write_text(
            "\n".join(str(p) for p in paths), encoding="utf-8"
        )
    names = dict(enumerate(CLASSES))
    for variant, train in (("A", ["train_rf"]), ("B", ["train_rf", "train_coco"])):
        cfg = {
            "path": str(OUT),
            "train": [str(OUT / "lists" / f"{t}.txt") for t in train],
            "val": str(OUT / "lists" / "val_rf.txt"),
            "test": str(OUT / "lists" / "test_rf.txt"),
            "names": names,
        }
        (OUT / f"data_{variant}.yaml").write_text(
            yaml.safe_dump(cfg, sort_keys=False), encoding="utf-8"
        )
    summary = {
        "per_source": {k: dict(v) for k, v in report.items()},
        "images": {k: len(v) for k, v in lists.items()},
    }
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()

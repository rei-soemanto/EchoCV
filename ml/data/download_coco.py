"""Download COCO 2017 keypoint annotations, select upper-body person crops that show (or clearly
don't show) a behaviour, then fetch only those images.

Run from ml/:  uv run python -m data.download_coco
"""

import json
import random
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor

from common.download import extract, fetch
from common.paths import DATA
from yolo import coco_rules as R

ANNOTATIONS = "http://images.cocodataset.org/annotations/annotations_trainval2017.zip"
NEG_FRACTION = 0.25
SEED = 0


def select(split: str) -> list[dict]:
    ann_dir = DATA / "coco" / "annotations"
    kpts = json.loads((ann_dir / f"person_keypoints_{split}.json").read_text(encoding="utf-8"))
    inst = json.loads((ann_dir / f"instances_{split}.json").read_text(encoding="utf-8"))

    images = {im["id"]: im for im in kpts["images"]}
    objects: dict[int, list[R.Box]] = defaultdict(list)
    for a in inst["annotations"]:
        if a["category_id"] in (R.BOOK, R.CELL_PHONE):
            x, y, w, h = a["bbox"]
            objects[a["image_id"]].append((x, y, x + w, y + h))
    del inst

    people: dict[int, list[dict]] = defaultdict(list)
    for a in kpts["annotations"]:
        if not a["iscrowd"]:
            people[a["image_id"]].append(a)

    positives, negatives = [], []
    for image_id, anns in people.items():
        im = images[image_id]
        boxes = [R.from_coco(a).bbox for a in anns]
        for a in anns:
            p = R.from_coco(a)
            if not R.usable(p):
                continue
            crop = R.upper_body_crop(p, im["width"], im["height"])
            if crop[3] - crop[1] < 160 or R.crowded(crop, p.bbox, boxes):
                continue
            labels = []
            for name, box in (
                ("touching_face", R.touching_face(p)),
                ("arms_crossed", R.arms_crossed(p)),
                ("reading_notes", R.reading_notes(p, objects.get(image_id, []))),
            ):
                if box and (b := R.to_crop(box, crop)):
                    labels.append([name, list(b)])
            rec = {
                "id": f"{image_id}_{a['id']}",
                "file_name": im["file_name"],
                "url": im["coco_url"],
                "crop": list(crop),
                "labels": labels,
            }
            if labels:
                positives.append(rec)
            elif R.clean_negative(p):
                negatives.append(rec)

    random.Random(SEED).shuffle(negatives)
    n_neg = int(len(positives) * NEG_FRACTION / (1 - NEG_FRACTION))
    chosen = positives + negatives[:n_neg]
    counts = Counter(lbl[0] for r in positives for lbl in r["labels"])
    print(f"  {split}: {len(positives)} positive crops {dict(counts)}, {n_neg} negatives")
    return chosen


def main() -> None:
    coco = DATA / "coco"
    extract(fetch(ANNOTATIONS, coco / "annotations_trainval2017.zip"), coco)
    for split in ("train2017", "val2017"):
        sel = select(split)
        (coco / f"selection_{split}.json").write_text(json.dumps(sel), encoding="utf-8")
        urls = {r["file_name"]: r["url"] for r in sel}
        out = coco / "images" / split
        with ThreadPoolExecutor(16) as pool:
            list(pool.map(lambda kv: fetch(kv[1], out / kv[0], quiet=True), urls.items()))
        print(f"  {split}: {len(urls)} images")
    print("done")


if __name__ == "__main__":
    main()

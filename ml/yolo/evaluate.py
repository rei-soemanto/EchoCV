"""Compare runs A and B on Roboflow val, keep the better one, report per-class test metrics.

Run from ml/:  uv run python -m yolo.evaluate
"""

import json
import shutil

import yaml
from ultralytics import YOLO

from common.paths import ARTIFACTS, DATA
from common.provenance import write_provenance
from yolo.build_dataset import CLASSES
from yolo.train import RUNS

OUT = ARTIFACTS / "yolo" / "v0"
BEHAVIOUR = DATA / "behaviour"
RF_SOURCES = [
    "rf_body_language",
    "rf_sitting_posture_cls",
    "rf_sitting_posture_hanin",
    "rf_face_gesture",
    "rf_face_hand",
]


def _metrics(model: YOLO, list_name: str) -> dict:
    cfg = yaml.safe_load((BEHAVIOUR / "data_A.yaml").read_text(encoding="utf-8"))
    cfg["val"] = str(BEHAVIOUR / "lists" / f"{list_name}.txt")
    tmp = BEHAVIOUR / f"_eval_{list_name}.yaml"
    tmp.write_text(yaml.safe_dump(cfg), encoding="utf-8")
    r = model.val(data=str(tmp), imgsz=640, batch=16, plots=False, verbose=False, workers=2)
    per_class = {}
    for i, c in enumerate(r.box.ap_class_index.tolist()):
        p, rec, ap50, ap = r.box.class_result(i)
        per_class[CLASSES[c]] = {"precision": p, "recall": rec, "mAP50": ap50, "mAP50-95": ap}
    return {"mAP50": r.box.map50, "mAP50-95": r.box.map, "per_class": per_class}


def main() -> None:
    results = {}
    for variant in ("A", "B"):
        weights = RUNS / f"v0_{variant}" / "weights" / "best.pt"
        if weights.exists():
            results[variant] = {"weights": weights, "val_rf": _metrics(YOLO(weights), "val_rf")}
    best = max(results, key=lambda v: results[v]["val_rf"]["mAP50-95"])
    model = YOLO(results[best]["weights"])
    report = {
        "selected_variant": best,
        "selection_metric": "val_rf mAP50-95",
        "val_rf": {v: r["val_rf"] for v, r in results.items()},
        "test_rf": _metrics(model, "test_rf"),
        "test_coco": _metrics(model, "test_coco"),
        "dataset_summary": json.loads((BEHAVIOUR / "summary.json").read_text(encoding="utf-8")),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(results[best]["weights"], OUT / "best.pt")
    (OUT / "metrics.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    keys = RF_SOURCES + (["coco2017_kpts"] if best == "B" else [])
    write_provenance(OUT, keys, "yolo26n.pt (Ultralytics, AGPL-3.0, COCO-pretrained)")
    print(json.dumps({k: report[k] for k in ("selected_variant", "test_rf")}, indent=2))


if __name__ == "__main__":
    main()

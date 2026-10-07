"""Export the selected detector to ONNX (works on Windows) and check it matches PyTorch.

LiteRT (.tflite) export needs Linux: run ml/yolo/export_litert.ipynb in Colab.
Run from ml/:  uv run python -m yolo.export
"""

import json
from pathlib import Path

from ultralytics import YOLO

from common.paths import ARTIFACTS, DATA

OUT = ARTIFACTS / "yolo" / "v0"
N_IMAGES = 20


def _iou(a, b) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union else 0.0


def main() -> None:
    pt = YOLO(OUT / "best.pt")
    onnx_path = Path(pt.export(format="onnx", imgsz=640, simplify=True))
    onnx = YOLO(onnx_path, task="detect")

    # Images that have labels, so the comparison isn't vacuous (most test images are negatives).
    labelled = []
    for name in ("test_rf", "test_coco"):
        for img in (DATA / "behaviour" / "lists" / f"{name}.txt").read_text().split("\n"):
            lbl = Path(img.replace("\\images\\", "\\labels\\").replace("/images/", "/labels/"))
            if img and lbl.with_suffix(".txt").read_text().strip():
                labelled.append(img)
    images = labelled[:: max(1, len(labelled) // N_IMAGES)][:N_IMAGES]
    matched = total = 0
    max_conf_diff = 0.0
    for img in images:
        a = pt.predict(img, imgsz=640, conf=0.25, verbose=False)[0].boxes
        b = onnx.predict(img, imgsz=640, conf=0.25, verbose=False)[0].boxes
        for box, cls, conf in zip(a.xyxy.tolist(), a.cls.tolist(), a.conf.tolist(), strict=True):
            total += 1
            best = max(
                (
                    (_iou(box, ob), oc)
                    for ob, ocl, oc in zip(
                        b.xyxy.tolist(), b.cls.tolist(), b.conf.tolist(), strict=True
                    )
                    if ocl == cls
                ),
                default=(0.0, 0.0),
            )
            if best[0] >= 0.9:
                matched += 1
                max_conf_diff = max(max_conf_diff, abs(conf - best[1]))
    parity = {
        "images": len(images),
        "pt_detections": total,
        "matched_in_onnx_iou>=0.9": matched,
        "max_conf_diff": max_conf_diff,
        "pass": total == 0 or (matched / total >= 0.95 and max_conf_diff <= 0.05),
    }
    (OUT / "onnx_parity.json").write_text(json.dumps(parity, indent=2), encoding="utf-8")
    print(onnx_path, parity)


if __name__ == "__main__":
    main()

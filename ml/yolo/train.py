"""Fine-tune YOLO26n on the behaviour dataset (local RTX 3050 Ti).

Run from ml/:
  uv run python -m yolo.train --variant A            # Roboflow only
  uv run python -m yolo.train --variant B            # Roboflow + COCO-derived
  uv run python -m yolo.train --variant A --smoke    # 1 epoch on 5% of the data
"""

import argparse

from ultralytics import YOLO

from common.paths import ARTIFACTS, DATA

RUNS = ARTIFACTS / "yolo" / "runs"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", choices=["A", "B"], required=True)
    # ~4 min/epoch for ~16k images on the 3050 Ti, so 60 epochs is ~4 h per run.
    ap.add_argument("--epochs", type=int, default=60)
    ap.add_argument("--smoke", action="store_true")
    args = ap.parse_args()

    model = YOLO("yolo26n.pt")
    model.train(
        data=str(DATA / "behaviour" / f"data_{args.variant}.yaml"),
        imgsz=640,
        epochs=1 if args.smoke else args.epochs,
        fraction=0.05 if args.smoke else 1.0,
        patience=15,
        # AutoBatch (batch=-1) picks 4 on Windows because the display reserves VRAM;
        # 16 measured at 2.3 GB peak.
        batch=16,
        amp=True,
        workers=6,
        seed=0,
        project=str(RUNS),
        name=f"{'smoke' if args.smoke else 'v0'}_{args.variant}",
        exist_ok=True,
        plots=True,
    )


if __name__ == "__main__":  # required on Windows: dataloader workers re-import this module
    main()

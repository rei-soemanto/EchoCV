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


def train(
    data: str,
    name: str,
    weights: str = "yolo26n.pt",
    epochs: int = 60,
    patience: int = 15,
    freeze: int | None = None,
    lr0: float = 0.01,
    smoke: bool = False,
    plots: bool = True,
):
    model = YOLO(weights)
    return model.train(
        data=data,
        imgsz=640,
        epochs=1 if smoke else epochs,
        fraction=0.05 if smoke else 1.0,
        patience=patience,
        # AutoBatch (batch=-1) picks 4 on Windows because the display reserves VRAM;
        # 16 measured at 2.3 GB peak.
        batch=16,
        amp=True,
        workers=6,
        seed=0,
        freeze=freeze,
        lr0=lr0,
        project=str(RUNS),
        name=f"smoke_{name}" if smoke else name,
        exist_ok=True,
        plots=plots,
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", choices=["A", "B"])
    ap.add_argument("--data")
    ap.add_argument("--name")
    ap.add_argument("--weights", default="yolo26n.pt")
    # ~4 min/epoch for ~16k images on the 3050 Ti, so 60 epochs is ~4 h per run.
    ap.add_argument("--epochs", type=int, default=60)
    ap.add_argument("--patience", type=int, default=15)
    ap.add_argument("--freeze", type=int)
    ap.add_argument("--lr0", type=float, default=0.01)
    ap.add_argument("--smoke", action="store_true")
    args = ap.parse_args()
    if not args.variant and not args.data:
        ap.error("give --variant or --data")

    data = args.data or str(DATA / "behaviour" / f"data_{args.variant}.yaml")
    train(
        data=data,
        name=args.name or f"v0_{args.variant}",
        weights=args.weights,
        epochs=args.epochs,
        patience=args.patience,
        freeze=args.freeze,
        lr0=args.lr0,
        smoke=args.smoke,
    )


if __name__ == "__main__":  # required on Windows: dataloader workers re-import this module
    main()

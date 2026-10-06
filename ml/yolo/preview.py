"""Contact sheets of random labelled crops per class and origin, for a visual check before training.

Run from ml/:  uv run python -m yolo.preview
"""

import random
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw

from yolo.build_dataset import CLASSES, OUT

THUMB, COLS, PER_SHEET = 220, 6, 30
COLOURS = ["#e6194b", "#3cb44b", "#4363d8", "#f58231"]


def _label_path(img: Path) -> Path:
    return OUT / "labels" / img.parent.name / f"{img.stem}.txt"


def _draw(img: Path) -> Image.Image:
    im = Image.open(img).convert("RGB")
    w, h = im.size
    d = ImageDraw.Draw(im)
    for line in _label_path(img).read_text().splitlines():
        c, cx, cy, bw, bh = line.split()
        c, cx, cy, bw, bh = int(c), float(cx) * w, float(cy) * h, float(bw) * w, float(bh) * h
        d.rectangle(
            (cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2), outline=COLOURS[c], width=4
        )
        d.text((cx - bw / 2 + 4, cy - bh / 2 + 4), CLASSES[c], fill=COLOURS[c])
    im.thumbnail((THUMB, THUMB))
    return im


def sheet(images: list[Path], out: Path) -> None:
    rows = (len(images) + COLS - 1) // COLS
    canvas = Image.new("RGB", (COLS * THUMB, rows * THUMB), "white")
    for i, img in enumerate(images):
        canvas.paste(_draw(img), ((i % COLS) * THUMB, (i // COLS) * THUMB))
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out, quality=85)
    print(f"  {out}")


def main() -> None:
    rng = random.Random(0)
    for origin in ("rf", "coco"):
        imgs = [
            Path(p) for p in (OUT / "lists" / f"train_{origin}.txt").read_text().split("\n") if p
        ]
        by_class = defaultdict(list)
        for img in imgs:
            lines = _label_path(img).read_text().splitlines()
            for c in {int(line.split()[0]) for line in lines} or {-1}:
                by_class[CLASSES[c] if c >= 0 else "negative"].append(img)
        for name, items in by_class.items():
            sheet(
                rng.sample(items, min(PER_SHEET, len(items))),
                OUT / "preview" / f"{origin}_{name}.jpg",
            )


if __name__ == "__main__":
    main()

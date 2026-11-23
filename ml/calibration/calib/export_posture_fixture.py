import json

import numpy as np
import pandas as pd

from calib.export_face_fixture import WEB_TESTS
from calib.inhouse_calibrate import BASELINE_S, FPS
from calib.inhouse_posture import (
    FEATURES,
    POSTURE_FEATURES,
    apply_exported,
    baseline_relative,
    frame_features,
)
from calib.paths import SHARED

OUT = WEB_TESTS / "fixtures" / "posture-rules.json"
SEED = 11
N_FRAMES = 40
WIDTH, HEIGHT = 1280, 720
OBJECT_IDS = {"cell phone": 67, "book": 73, "laptop": 63}
BASE_COLS = ["fx", "fy", "fw", "fh", "roll", "pitch", "shoulder_drop_raw", "shoulder_width_raw"]


def keypoints(rng: np.random.Generator, face: dict, n: int) -> list[list[float]]:
    fcx, fcy, fw = face["fx"] * WIDTH, face["fy"] * HEIGHT, face["fw"] * WIDTH
    pts = [[fcx + rng.normal(0, 5), fcy + rng.normal(0, 5), rng.uniform(0.6, 1)] for _ in range(5)]
    drop = 1.1 + (0.3 if 20 <= n < 28 else 0.0)
    for side in (1, -1):
        pts.append([fcx + side * fw * 1.2, fcy + drop * fw, rng.uniform(0.2, 1)])
    for side in (1, -1):
        pts.append([fcx + side * fw * 1.4, fcy + 2.3 * fw, rng.uniform(0.2, 1)])
    for side in (1, -1):
        if n % 10 < 3:
            pts.append([fcx + side * 0.2 * fw, fcy + 0.3 * fw, rng.uniform(0.4, 1)])
        elif n % 10 < 6:
            pts.append([fcx - side * 0.6 * fw, fcy + 2.0 * fw, rng.uniform(0.4, 1)])
        else:
            pts.append([fcx + side * 1.6 * fw, fcy + 3.5 * fw, rng.uniform(0.0, 1)])
    for _ in range(6):
        pts.append([rng.uniform(0, WIDTH), rng.uniform(0, HEIGHT), rng.uniform(0, 1)])
    return [[round(float(v), 3) for v in p] for p in pts]


def objects(rng: np.random.Generator, face: dict, n: int) -> list[dict]:
    found = []
    if n % 4 == 1:
        cy = (face["fy"] + 0.6 * face["fh"]) * HEIGHT
        found.append({"cls": "book", "conf": round(rng.uniform(0.3, 0.9), 3), "cy": cy})
    if n % 5 == 2:
        found.append({"cls": "laptop", "conf": 0.8, "cy": 0.9 * HEIGHT})
    if n % 7 == 3:
        found.append({"cls": "cell phone", "conf": 0.5, "cy": 0.1 * HEIGHT})
    out = []
    for o in found:
        x1 = float(rng.uniform(100, 600))
        h = float(rng.uniform(40, 160))
        box = [x1, o["cy"] - h / 2, x1 + float(rng.uniform(40, 200)), o["cy"] + h / 2]
        out.append({"cls": o["cls"], "conf": o["conf"], "box": [round(v, 3) for v in box]})
    return out


def frames(rng: np.random.Generator) -> pd.DataFrame:
    rows = []
    for n in range(N_FRAMES):
        face = {
            "fx": 0.5 + rng.normal(0, 0.01) + (0.05 if n >= 30 else 0.0),
            "fy": 0.35 + rng.normal(0, 0.01) + (0.06 if 20 <= n < 28 else 0.0),
            "fw": 0.18 + rng.normal(0, 0.004),
            "fh": 0.26 + rng.normal(0, 0.004),
            "roll": rng.normal(0, 2),
            "pitch": rng.normal(0, 3) + (12.0 if 20 <= n < 28 else 0.0),
        }
        face = {k: round(float(v), 6) for k, v in face.items()}
        row = {
            "frame": f"f{n}",
            "stem": "answer",
            "person": "p00",
            "session": "s1",
            "sid": "p00_s1",
            "part": "B",
            "clip": "answer",
            "t": round(n / FPS, 3),
            "w": WIDTH,
            "h": HEIGHT,
            **face,
            "objects": json.dumps(objects(rng, face, n)),
        }
        for i, (x, y, c) in enumerate(keypoints(rng, face, n)):
            row.update({f"k{i}_x": x, f"k{i}_y": y, f"k{i}_c": c})
        rows.append(row)
    return pd.DataFrame(rows)


def clean(value: float) -> float | None:
    return None if pd.isna(value) else float(value)


def main() -> None:
    rules = json.loads((SHARED / "thresholds.json").read_text(encoding="utf-8"))["posture"]
    df = frames(np.random.default_rng(SEED))
    df = pd.concat([df, frame_features(df)], axis=1)
    start = df[df["t"] <= BASELINE_S]
    baseline = {c: clean(start[c].median()) for c in BASE_COLS}
    rel = baseline_relative(df)
    probabilities = {
        name: [round(float(p), 10) for p in apply_exported(rule, rel)]
        for name, rule in rules["behaviours"].items()
    }
    raw_cols = [c for c in FEATURES if c in df.columns] + [
        "shoulder_drop_raw",
        "shoulder_width_raw",
    ]
    fixture = {
        "width": WIDTH,
        "height": HEIGHT,
        "baseline": baseline,
        "frames": [
            {
                "timeMs": round(r.t * 1000),
                "face": {k: getattr(r, k) for k in ("fx", "fy", "fw", "fh", "roll", "pitch")},
                "keypoints": [[getattr(r, f"k{i}_{a}") for a in "xyc"] for i in range(17)],
                "objects": [
                    {"classId": OBJECT_IDS[o["cls"]], "score": o["conf"], "box": o["box"]}
                    for o in json.loads(r.objects)
                ],
                "raw": {c: clean(getattr(r, c)) for c in raw_cols},
                "relative": {c: clean(rel.loc[r.Index, c]) for c in POSTURE_FEATURES + FEATURES},
            }
            for r in df.itertuples()
        ],
        "probabilities": probabilities,
    }
    OUT.write_text(json.dumps(fixture, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{N_FRAMES} frames -> {OUT}")


if __name__ == "__main__":
    main()

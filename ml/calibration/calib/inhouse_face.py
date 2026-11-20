import csv
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image

from calib import features
from calib.paths import DATA
from calib.rules import head_angles, iris_offsets

DERIVED = DATA / "inhouse" / "derived"
FRAMES_CSV = DERIVED / "frames.csv"
FRAMES = DERIVED / "frames"
FACE_DIR = DERIVED / "face"
FACE_CSV = DERIVED / "face.csv"

BLENDSHAPES = (
    "eyeLookDownLeft",
    "eyeLookDownRight",
    "eyeLookUpLeft",
    "eyeLookUpRight",
    "eyeBlinkLeft",
    "eyeBlinkRight",
    "mouthSmileLeft",
    "mouthSmileRight",
    "jawOpen",
)


def face_geometry(pts: np.ndarray, w: int, h: int) -> dict:
    x1, y1 = pts.min(axis=0)
    x2, y2 = pts.max(axis=0)
    return {
        "fx": (x1 + x2) / 2 / w,
        "fy": (y1 + y2) / 2 / h,
        "fw": (x2 - x1) / w,
        "fh": (y2 - y1) / h,
    }


def one_frame(rel: str) -> dict:
    import mediapipe as mp

    im = Image.open(FRAMES / rel).convert("RGB")
    w, h = im.size
    res = features._landmarker.detect(
        mp.Image(image_format=mp.ImageFormat.SRGB, data=np.asarray(im))
    )
    if not res.face_landmarks:
        return {"frame": rel, "detected": False, "n_faces": 0}
    pts = np.array([(lm.x * w, lm.y * h) for lm in res.face_landmarks[0]])
    yaw, pitch, roll = head_angles(res.facial_transformation_matrixes[0])
    ix, iy_lid, iy_corner = iris_offsets(pts)
    s = {c.category_name: c.score for c in res.face_blendshapes[0]}
    row = {
        "frame": rel,
        "detected": True,
        "n_faces": len(res.face_landmarks),
        "yaw": yaw,
        "pitch": pitch,
        "roll": roll,
        "iris_x": ix,
        "iris_y_lid": iy_lid,
        "iris_y_corner": iy_corner,
        "look_v": (s["eyeLookDownLeft"] + s["eyeLookDownRight"]) / 2
        - (s["eyeLookUpLeft"] + s["eyeLookUpRight"]) / 2,
        "smile": (s["mouthSmileLeft"] + s["mouthSmileRight"]) / 2,
        **face_geometry(pts, w, h),
    }
    row.update({name: s[name] for name in BLENDSHAPES})
    return row


def init() -> None:
    from mediapipe.tasks.python import BaseOptions, vision

    opts = vision.FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(features.FACE_MODEL)),
        num_faces=2,
        output_face_blendshapes=True,
        output_facial_transformation_matrixes=True,
    )
    features._landmarker = vision.FaceLandmarker.create_from_options(opts)


def read_frames(path: Path = FRAMES_CSV) -> pd.DataFrame:
    return pd.read_csv(path)


def main(workers: int = 8) -> None:
    frames = read_frames()
    FACE_DIR.mkdir(parents=True, exist_ok=True)
    todo = [s for s in frames["stem"].unique() if not (FACE_DIR / f"{s}.csv").exists()]
    with Pool(workers, initializer=init) as pool:
        for n, stem in enumerate(todo, 1):
            rels = frames.loc[frames["stem"] == stem, "frame"].tolist()
            rows = pool.map(one_frame, rels, chunksize=8)
            pd.DataFrame(rows).to_csv(FACE_DIR / f"{stem}.csv", index=False)
            rate = sum(r["detected"] for r in rows) / max(1, len(rows))
            print(f"[{n}/{len(todo)}] {stem}: {len(rows)} frames, face {rate:.0%}")
    parts = [pd.read_csv(p) for p in sorted(FACE_DIR.glob("*.csv"))]
    face = pd.concat(parts, ignore_index=True)
    merged = frames.merge(face, on="frame", how="left")
    merged.to_csv(FACE_CSV, index=False, quoting=csv.QUOTE_MINIMAL)
    print(f"{len(merged)} frames -> {FACE_CSV}, faces found {merged['detected'].mean():.1%}")


if __name__ == "__main__":
    main()

"""Run MediaPipe Face Landmarker on images and cache the features the rules need."""

from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image

from calib.paths import FACE_MODEL, RAW
from calib.rules import head_angles, iris_offsets

MAX_SIDE = 1280  # roughly webcam resolution; Columbia images are 5184x3456
_landmarker = None


def _init() -> None:
    global _landmarker
    from mediapipe.tasks.python import BaseOptions, vision

    opts = vision.FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(FACE_MODEL)),
        num_faces=1,
        output_face_blendshapes=True,
        output_facial_transformation_matrixes=True,
    )
    _landmarker = vision.FaceLandmarker.create_from_options(opts)


def _one(path: str) -> dict:
    import mediapipe as mp

    im = Image.open(path).convert("RGB")
    im.thumbnail((MAX_SIDE, MAX_SIDE))
    w, h = im.size
    res = _landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.asarray(im)))
    if not res.face_landmarks:
        return {"path": path, "detected": False}
    pts = np.array([(lm.x * w, lm.y * h) for lm in res.face_landmarks[0]])
    yaw, pitch, roll = head_angles(res.facial_transformation_matrixes[0])
    ix, iy = iris_offsets(pts)
    shapes = {c.category_name: c.score for c in res.face_blendshapes[0]}
    return {
        "path": path,
        "detected": True,
        "yaw": yaw,
        "pitch": pitch,
        "roll": roll,
        "iris_x": ix,
        "iris_y": iy,
        "smile": (shapes["mouthSmileLeft"] + shapes["mouthSmileRight"]) / 2,
    }


def extract(paths: list[Path], cache_name: str, workers: int = 8) -> pd.DataFrame:
    cache = RAW / f"{cache_name}.csv"
    if cache.exists():
        return pd.read_csv(cache)
    with Pool(workers, initializer=_init) as pool:
        rows = pool.map(_one, [str(p) for p in paths], chunksize=16)
    df = pd.DataFrame(rows)
    RAW.mkdir(parents=True, exist_ok=True)
    df.to_csv(cache, index=False)
    print(f"  {cache_name}: {df['detected'].mean():.1%} of {len(df)} faces detected")
    return df

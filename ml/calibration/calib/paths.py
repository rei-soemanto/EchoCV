from pathlib import Path

CALIB_ROOT = Path(__file__).resolve().parents[1]
DATA = CALIB_ROOT.parent / "data"
RESULTS = CALIB_ROOT / "results"
RAW = RESULTS / "raw"  # cached per-image features (git-ignored)
SHARED = CALIB_ROOT.parents[1] / "shared"
FACE_MODEL = DATA / "mediapipe" / "face_landmarker.task"

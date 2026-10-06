"""Shared filesystem locations for ml/ scripts."""

import json
from pathlib import Path

ML_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ML_ROOT.parent
DATA = ML_ROOT / "data"
ARTIFACTS = ML_ROOT / "artifacts"
SHARED = REPO_ROOT / "shared"
# Base models are downloaded here (not the HF cache in the user profile on C:).
BASE_MODELS = ML_ROOT / ".cache" / "models"
WHISPER_BASE = BASE_MODELS / "whisper-large-v3-turbo"


def load_labels() -> dict:
    return json.loads((SHARED / "labels.json").read_text(encoding="utf-8"))

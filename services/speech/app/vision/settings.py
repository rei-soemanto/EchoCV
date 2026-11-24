import json
import os
from dataclasses import dataclass
from functools import cache
from pathlib import Path

from app.config import REPO, SHARED_DIR

DEFAULT_VISION_DIR = REPO / "apps" / "web" / "public" / "models"
BEHAVIOURS = ("touching_face", "arms_crossed", "reading_notes", "slouching")
IGNORED_OBJECTS = frozenset({"laptop"})


@dataclass(frozen=True)
class PostureRule:
    features: tuple[str, ...]
    mean: tuple[float, ...]
    scale: tuple[float, ...]
    weights: tuple[float, ...]
    bias: float
    smoothing_frames: int
    threshold: float
    source: str


@dataclass(frozen=True)
class YoloSpec:
    file: str
    input_size: int
    stride: int
    num_classes: int
    num_keypoints: int
    class_ids: tuple[int, ...] | None


@dataclass(frozen=True)
class VisionSettings:
    k_x: float
    k_y: float
    tolerance_deg: float
    smile_threshold: float
    sample_fps: float
    baseline_ms: float
    keypoint_conf: float
    predict_conf: float
    rules: dict[str, PostureRule]
    detector_conf: float
    detector_frames: int
    detector_min_fraction: float
    gaze_down_angle_deg: float
    gaze_down_frames: int
    gaze_down_min_fraction: float
    gaze_down_k_y: float
    gaze_down_sign: float
    behaviour_class_ids: dict[str, int]
    ignored_object_ids: frozenset[int]
    pad_value: int
    max_faces: int
    pose: YoloSpec
    objects: YoloSpec
    behaviour: YoloSpec
    face_file: str
    model_dir: Path


def round_half_up(value: float) -> int:
    return int(value + 0.5) if value >= 0 else -int(-value + 0.5)


def _read(name: str) -> dict:
    return json.loads((SHARED_DIR / name).read_text(encoding="utf-8"))


def _yolo(model: dict, key: str) -> YoloSpec:
    channels = int(model["output"][1])
    keypoints = int(model.get("keypoints", 0))
    classes = model.get("classes")
    return YoloSpec(
        file=model["file"],
        input_size=int(model["inputSize"]),
        stride=int(model["stride"]),
        num_classes=channels - 4 - keypoints * 3,
        num_keypoints=keypoints,
        class_ids=tuple(int(c) for c in classes) if key == "objects" and classes else None,
    )


def _rule(raw: dict) -> PostureRule:
    return PostureRule(
        features=tuple(raw["features"]),
        mean=tuple(raw["mean"]),
        scale=tuple(raw["scale"]),
        weights=tuple(raw["weights"]),
        bias=float(raw["bias"]),
        smoothing_frames=int(raw["smoothingFrames"]),
        threshold=float(raw["threshold"]),
        source=raw["source"],
    )


@cache
def vision_settings() -> VisionSettings:
    thresholds, manifest = _read("thresholds.json"), _read("vision-models.json")
    posture, gaze = thresholds["posture"], thresholds["gazeDown"]
    models = manifest["models"]
    behaviour_classes = {name: int(i) for i, name in models["behaviour"]["classes"].items()}
    ignored = {
        int(i) for i, name in models["objects"]["classes"].items() if name in IGNORED_OBJECTS
    }
    return VisionSettings(
        k_x=thresholds["eyeContact"]["kX"],
        k_y=thresholds["eyeContact"]["kY"],
        tolerance_deg=thresholds["eyeContact"]["toleranceDeg"],
        smile_threshold=thresholds["smile"]["threshold"],
        sample_fps=posture["sampleFps"],
        baseline_ms=posture["baselineSeconds"] * 1000,
        keypoint_conf=posture["keypointConf"],
        predict_conf=posture["predictConf"],
        rules={name: _rule(raw) for name, raw in posture["behaviours"].items()},
        detector_conf=posture["detectorRule"]["conf"],
        detector_frames=posture["detectorRule"]["smoothingFrames"],
        detector_min_fraction=posture["detectorRule"]["minFraction"],
        gaze_down_angle_deg=gaze["angleDeg"],
        gaze_down_frames=max(1, round_half_up(gaze["windowS"] * posture["sampleFps"])),
        gaze_down_min_fraction=gaze["minFraction"],
        gaze_down_k_y=gaze["kY"],
        gaze_down_sign=gaze["sign"],
        behaviour_class_ids=behaviour_classes,
        ignored_object_ids=frozenset(ignored),
        pad_value=int(manifest["padValue"]),
        max_faces=2,
        pose=_yolo(models["pose"], "pose"),
        objects=_yolo(models["objects"], "objects"),
        behaviour=_yolo(models["behaviour"], "behaviour"),
        face_file=models["face"]["file"],
        model_dir=Path(os.environ.get("VISION_MODEL_DIR", DEFAULT_VISION_DIR)),
    )

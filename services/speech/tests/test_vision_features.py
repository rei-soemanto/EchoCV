import json
import math
from pathlib import Path

import pytest

from app.vision.face import (
    Baseline,
    FaceFeatures,
    face_features,
    gaze_error,
    head_angles,
    iris_offsets,
)
from app.vision.posture import (
    Detection,
    PostureBaseline,
    PostureFace,
    RollingMean,
    held_object,
    posture_baseline,
    raw_posture_features,
    relative_features,
    rule_probability,
)
from app.vision.settings import vision_settings

FIXTURES = (
    Path(__file__).resolve().parents[3] / "apps" / "web" / "tests" / "unit" / "vision" / "fixtures"
)
FACE = json.loads((FIXTURES / "face-rules.json").read_text(encoding="utf-8"))
POSTURE = json.loads((FIXTURES / "posture-rules.json").read_text(encoding="utf-8"))
CFG = vision_settings()


def num(value):
    return math.nan if value is None else value


@pytest.mark.parametrize("case", FACE["cases"])
def test_head_angles_match_the_browser_for_both_matrix_layouts(case):
    for matrix in (case["matrixColumnMajor"], case["matrixRowMajor"]):
        yaw, pitch, roll = head_angles(matrix)
        assert yaw == pytest.approx(case["expected"]["yaw"], abs=1e-5)
        assert pitch == pytest.approx(case["expected"]["pitch"], abs=1e-5)
        assert roll == pytest.approx(case["expected"]["roll"], abs=1e-5)


@pytest.mark.parametrize("case", FACE["cases"])
def test_iris_offsets_and_gaze_error_match_the_browser(case):
    iris_x, iris_y = iris_offsets([tuple(p) for p in case["points"]])
    assert iris_x == pytest.approx(case["expected"]["irisX"], abs=1e-6)
    assert iris_y == pytest.approx(case["expected"]["irisY"], abs=1e-6)
    e = case["expected"]
    features = FaceFeatures(
        e["yaw"], e["pitch"], e["roll"], e["irisX"], e["irisY"], 0, 0.5, 0.4, 0.2, 0.3
    )
    b = case["baseline"]
    base = Baseline(b["yaw"], b["pitch"], b["irisX"], b["irisY"], 0)
    assert gaze_error(features, base, FACE["kX"], FACE["kY"]) == pytest.approx(
        e["gazeError"], abs=1e-4
    )


def test_face_features_scale_landmarks_and_read_the_smile():
    case = FACE["cases"][1]
    width, height = 640, 480
    points = [(x / width, y / height) for x, y in case["points"]]
    shapes = {"mouthSmileLeft": 0.4, "mouthSmileRight": 0.6}
    out = face_features([points], [case["matrixRowMajor"]], [shapes], width, height)
    assert out.yaw == pytest.approx(case["expected"]["yaw"], abs=1e-5)
    assert out.iris_x == pytest.approx(case["expected"]["irisX"], abs=1e-5)
    assert out.smile == pytest.approx(0.5)
    assert face_features([], [], [], width, height) is None


def face_of(frame) -> PostureFace:
    return PostureFace(**frame["face"])


def raw_for(frame):
    objects = [Detection(tuple(o["box"]), o["score"], o["classId"]) for o in frame["objects"]]
    held = held_object(
        objects, face_of(frame), POSTURE["height"], POSTURE["width"], CFG.ignored_object_ids
    )
    return raw_posture_features(
        face_of(frame),
        frame["keypoints"],
        held,
        POSTURE["width"],
        POSTURE["height"],
        CFG.keypoint_conf,
    )


BASE = PostureBaseline(
    **{k: POSTURE["baseline"][k] for k in ("fx", "fy", "fw", "fh", "roll", "pitch")},
    shoulder_drop_raw=num(POSTURE["baseline"]["shoulder_drop_raw"]),
    shoulder_width_raw=num(POSTURE["baseline"]["shoulder_width_raw"]),
)


@pytest.mark.parametrize("index", range(len(POSTURE["frames"])))
def test_raw_and_relative_posture_features_match_the_browser(index):
    frame = POSTURE["frames"][index]
    raw = raw_for(frame)
    for name, expected in frame["raw"].items():
        if expected is None:
            assert math.isnan(raw[name]), name
        else:
            assert raw[name] == pytest.approx(expected, abs=1e-6), name
    rel = relative_features(face_of(frame), raw, BASE)
    for name, expected in frame["relative"].items():
        value = num(expected)
        if math.isnan(value):
            assert math.isnan(rel[name]), name
        else:
            assert rel[name] == pytest.approx(value, abs=1e-6), name


def test_the_posture_baseline_is_the_median_of_the_first_two_seconds():
    start = [f for f in POSTURE["frames"] if f["timeMs"] <= CFG.baseline_ms]
    built = posture_baseline([(face_of(f), raw_for(f)) for f in start])
    for key in ("fx", "fy", "fw", "fh", "roll", "pitch", "shoulder_drop_raw", "shoulder_width_raw"):
        assert getattr(built, key) == pytest.approx(getattr(BASE, key), abs=1e-6, nan_ok=True), key


@pytest.mark.parametrize("name", list(POSTURE["probabilities"]))
def test_smoothed_rule_probabilities_match_the_browser(name):
    rule = CFG.rules[name]
    window = RollingMean(rule.smoothing_frames)
    for frame, expected in zip(POSTURE["frames"], POSTURE["probabilities"][name], strict=True):
        p = rule_probability(rule, relative_features(face_of(frame), raw_for(frame), BASE))
        assert window.push(p) == pytest.approx(expected, abs=1e-8)


def test_rolling_mean_waits_for_a_full_window_when_asked():
    window = RollingMean(3, 3)
    assert [window.push(v) for v in (1, 0, 1, 1, 1)][:2] == [None, None]
    window = RollingMean(3, 3)
    pushed = [window.push(v) for v in (1, 0, 1, 1, 1)]
    assert pushed[2] == pytest.approx(2 / 3)
    assert pushed[4] == 1

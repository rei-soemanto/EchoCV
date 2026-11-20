import json

import pytest

from inhouse import autolabel as A


def frame(clip="upright", points: dict | None = None) -> dict:
    row = {
        "clip": clip,
        "w": 1280,
        "h": 720,
        "fx": 0.5,
        "fy": 0.4,
        "fw": 0.2,
        "fh": 0.4,
        "px1": 300,
        "py1": 100,
        "px2": 980,
        "py2": 720,
        "objects": "[]",
    }
    for i in range(17):
        row[f"k{i}_x"], row[f"k{i}_y"], row[f"k{i}_c"] = 0, 0, 0
    defaults = {5: (800, 640), 6: (480, 640)}
    defaults.update(points or {})
    for i, (x, y) in defaults.items():
        row[f"k{i}_x"], row[f"k{i}_y"], row[f"k{i}_c"] = x, y, 0.9
    return row


THRESHOLDS = {"touching_face": 0.5, "arms_crossed": 0.5, "slouching": 0.5, "reading_notes": 0.5}


def test_face_box_in_pixels():
    assert A.face_box(frame()) == pytest.approx((512.0, 144.0, 768.0, 432.0))


def test_touching_face_needs_a_wrist_near_the_face():
    assert A.touching_face_box(frame()) is None
    box = A.touching_face_box(frame(points={9: (700, 400)}))
    assert box is not None and box[3] > 432.0
    assert A.touching_face_box(frame(points={9: (1200, 700)})) is None


def test_arms_crossed_box_spans_shoulders_to_frame_bottom():
    box = A.arms_crossed_box(frame(points={5: (800, 500), 6: (480, 500)}))
    assert box is not None
    assert box[0] < 480 and box[2] > 800 and box[3] == 720


def test_arms_crossed_rejects_shoulders_at_the_bottom_edge():
    assert A.arms_crossed_box(frame(points={5: (800, 715), 6: (480, 715)})) is None


def test_reading_notes_prefers_a_held_object():
    row = frame(clip="reading_notes_held")
    row["objects"] = json.dumps([{"cls": "book", "conf": 0.8, "box": [500, 450, 800, 700]}])
    assert A.reading_notes_box(row) == (500.0, 450.0, 800.0, 700.0)


def test_object_at_ear_height_is_not_notes():
    row = frame(clip="reading_notes_held")
    row["objects"] = json.dumps([{"cls": "cell phone", "conf": 0.9, "box": [760, 200, 840, 330]}])
    assert A.reading_notes_box(row) is None


def test_positive_needs_score_agreement():
    row = frame(clip="slouching")
    assert A.decide(row, {"slouching": 0.2}, THRESHOLDS) is None
    kind, labels = A.decide(row, {"slouching": 0.8}, THRESHOLDS)
    assert kind == "slouching" and labels[0][0] == "slouching"


def test_negative_only_when_nothing_fires_and_hands_are_clear():
    row = frame(clip="gestures")
    assert A.decide(row, {"touching_face": 0.1}, THRESHOLDS) == ("negative", [])
    assert A.decide(row, {"touching_face": 0.45}, THRESHOLDS) is None
    assert A.decide(frame(clip="gestures", points={9: (650, 300)}), {}, THRESHOLDS) is None


def test_desk_notes_are_not_detector_data():
    assert A.decide(frame(clip="reading_notes_desk"), {}, THRESHOLDS) is None


def test_frame_labels_and_smoothing():
    import numpy as np

    from inhouse.evaluate_lopo import frame_labels, prf, smoothed

    rows = [
        {"clip": "touching_face", "stem": "a"},
        {"clip": "upright", "stem": "b"},
        {"clip": "reading_notes_desk", "stem": "c"},
    ]
    keep, y = frame_labels(rows, "reading_notes")
    assert [r["clip"] for r in keep] == ["touching_face", "upright"]
    assert not y.any()
    keep, y = frame_labels(rows, "touching_face")
    assert y.tolist() == [True, False, False]
    s = smoothed([{"stem": "a"}] * 3 + [{"stem": "b"}], np.array([1.0, 0.0, 1.0, 0.0]), window=2)
    assert s.tolist() == [1.0, 0.5, 0.5, 0.0]
    assert prf(np.array([True, False]), np.array([True, True]))["precision"] == 0.5


def test_arms_crossed_needs_visible_arms_or_enough_torso():
    shoulders_low = {5: (800, 600), 6: (480, 600)}
    assert A.arms_crossed_box(frame(points=shoulders_low)) is None
    with_wrist = {**shoulders_low, 9: (560, 700)}
    assert A.arms_crossed_box(frame(points=with_wrist)) is not None
    assert A.arms_crossed_box(frame(points={5: (800, 450), 6: (480, 450)})) is not None

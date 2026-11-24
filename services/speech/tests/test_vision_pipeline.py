import io

import numpy as np
import pytest

from app.vision.face import Baseline, FaceFeatures
from app.vision.posture import Detection
from app.vision.settings import vision_settings
from app.vision.tracker import BehaviourTracker, Frame, upload_baseline, visual_metrics
from app.vision.video import read_ppm_frames
from app.vision.yolo import decode, letterbox_for

CFG = vision_settings()
STEP = 1000 / CFG.sample_fps
ZERO = Baseline(0, 0, 0, 0, 0)


def face(yaw=0.0, pitch=0.0, smile=0.0) -> FaceFeatures:
    return FaceFeatures(yaw, pitch, 0.0, 0.0, 0.0, smile, 0.5, 0.35, 0.18, 0.26)


def notes(score: float) -> list[Detection]:
    return [Detection((0, 0, 10, 10), score, CFG.behaviour_class_ids["reading_notes"])]


def frames(faces, behaviours=None) -> list[Frame]:
    behaviours = behaviours or [[] for _ in faces]
    return [
        Frame(i * STEP, f, [], [], b, 1280, 720)
        for i, (f, b) in enumerate(zip(faces, behaviours, strict=True))
    ]


def test_baseline_comes_from_the_first_seconds_of_the_answer():
    early = [face(yaw=10) for _ in range(int(CFG.baseline_ms / STEP) + 1)]
    later = [face(yaw=40) for _ in range(20)]
    base = upload_baseline(frames(early + later), CFG)
    assert base.yaw == pytest.approx(10)


def test_no_face_means_no_eye_contact_and_no_baseline():
    out = visual_metrics(frames([None] * 10), 2, 2000, CFG)
    assert (out.answer_index, out.eye_contact_pct, out.smile_pct, out.events) == (2, 0.0, 0.0, [])


def test_eye_contact_and_smile_are_shares_of_all_sampled_frames():
    looking = [face() for _ in range(15)]
    away = [face(yaw=CFG.tolerance_deg + 20) for _ in range(5)]
    smiling = [face(smile=CFG.smile_threshold + 0.1) for _ in range(5)]
    out = visual_metrics(frames(looking + away + smiling + [None] * 5), 0, 6000, CFG)
    assert out.eye_contact_pct == pytest.approx(round(20 / 30 * 100, 1))
    assert out.smile_pct == pytest.approx(round(5 / 30 * 100, 1))


def test_reading_notes_from_the_detector_becomes_an_event_clipped_to_the_answer():
    n = 20
    detections = [[] for _ in range(5)] + [notes(0.9) for _ in range(n - 5)]
    out = visual_metrics(frames([face()] * n, detections), 0, 3500, CFG)
    [event] = out.events
    assert event.type == "reading_notes"
    assert event.start_ms >= 5 * STEP
    assert event.end_ms == 3500


def test_weak_detections_never_flag_reading_notes():
    tracker = BehaviourTracker(ZERO, CFG)
    for f in frames([face()] * 8, [notes(0.1)] * 8):
        tracker.add(f)
    assert "reading_notes" not in tracker.active()


def test_letterbox_matches_the_browser_for_a_720p_frame():
    box = letterbox_for(1280, 720, 640, 32)
    assert (box.resized_width, box.resized_height) == (640, 360)
    assert (box.input_width, box.input_height, box.top, box.left) == (640, 384, 12, 0)


def test_decode_keeps_the_best_box_and_maps_it_back_to_the_frame():
    spec = CFG.behaviour
    anchors = 3
    out = np.zeros((1, 4 + spec.num_classes, anchors), dtype=np.float32)
    out[0, :4, 0] = [320, 192, 64, 64]
    out[0, :4, 1] = [322, 194, 64, 64]
    out[0, :4, 2] = [100, 100, 10, 10]
    out[0, 4 + 2, 0] = 0.9
    out[0, 4 + 2, 1] = 0.8
    out[0, 4 + 1, 2] = 0.1
    box = letterbox_for(1280, 720, 640, 32)
    [d] = decode(out, box, spec, 0.25)
    assert d.class_id == 2
    assert d.score == pytest.approx(0.9)
    assert d.box == pytest.approx((576, 296, 704, 424))


def test_ppm_frames_are_read_one_after_another():
    frame = np.arange(2 * 3 * 3, dtype=np.uint8).reshape(2, 3, 3)
    data = b"".join(b"P6\n3 2\n255\n" + frame.tobytes() for _ in range(2))
    read = list(read_ppm_frames(io.BytesIO(data)))
    assert len(read) == 2
    assert np.array_equal(read[1], frame)

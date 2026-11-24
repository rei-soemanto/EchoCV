import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app, get_engine, get_vision
from app.vision.face import FaceFeatures
from tests.fakes import answer

client = TestClient(app)
LOOKING = FaceFeatures(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.5, 0.35, 0.18, 0.26)


class FakeVision:
    def __init__(self, count: int = 20, unreadable: bool = False) -> None:
        self.count = count
        self.unreadable = unreadable
        self.paths = []

    def frames(self, path):
        from app.vision.video import VideoUnreadable

        self.paths.append(path)
        if self.unreadable:
            raise VideoUnreadable("broken")
        for i in range(self.count):
            yield i * 200.0, np.zeros((72, 128, 3), dtype=np.uint8)

    def face(self, rgb, time_ms):
        return LOOKING

    def detect(self, rgb):
        return [], [], []


@pytest.fixture
def vision():
    fake = FakeVision()
    app.dependency_overrides[get_engine] = answer
    app.dependency_overrides[get_vision] = lambda: fake
    yield fake
    app.dependency_overrides.clear()


def post(data: bytes = b"video", **form):
    fields = {"language": "id", "answerIndex": "2"} | form
    return client.post("/analyze-video", files={"video": ("answer.mp4", data)}, data=fields)


def test_a_video_returns_speech_and_visual_metrics_against_the_answer_start(vision):
    res = post()
    assert res.status_code == 200
    body = res.json()
    assert body["baseline"] == "answer_start"
    assert body["speech"]["answerIndex"] == 2
    assert body["visual"] == {
        "answerIndex": 2,
        "durationMs": body["speech"]["durationMs"],
        "eyeContactPct": 100.0,
        "smilePct": 0.0,
        "events": [],
    }


def test_the_video_is_deleted_after_analysis(vision):
    assert post().status_code == 200
    assert vision.paths and not vision.paths[0].exists()


def test_video_and_video_url_are_mutually_exclusive(vision):
    res = client.post("/analyze-video", data={"language": "id", "answerIndex": "0"})
    assert res.status_code == 422


def test_unreadable_frames_are_a_client_error(vision):
    app.dependency_overrides[get_vision] = lambda: FakeVision(unreadable=True)
    assert post().status_code == 422


def test_a_video_without_audio_is_rejected(vision):
    assert post(b"not audio").status_code == 422


def test_an_empty_video_is_rejected(vision):
    assert post(b"").status_code == 422


def test_video_urls_need_an_allowed_host(vision, monkeypatch):
    monkeypatch.delenv("SPEECH_AUDIO_URL_HOSTS", raising=False)
    res = client.post(
        "/analyze-video",
        data={"language": "id", "answerIndex": "0", "videoUrl": "https://example.com/a.mp4"},
    )
    assert res.status_code == 422
    assert "videoUrl" in res.json()["detail"]


def test_missing_vision_models_answer_503(monkeypatch, tmp_path):
    from app.vision import settings as vision

    vision.vision_settings.cache_clear()
    monkeypatch.setenv("VISION_MODEL_DIR", str(tmp_path))
    app.dependency_overrides[get_engine] = answer
    try:
        assert post().status_code == 503
    finally:
        app.dependency_overrides.clear()
        vision.vision_settings.cache_clear()

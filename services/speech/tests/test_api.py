import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app, get_engine
from tests.fakes import FakeEngine, answer

client = TestClient(app)


@pytest.fixture
def engine():
    fake = answer()
    app.dependency_overrides[get_engine] = lambda: fake
    yield fake
    app.dependency_overrides.clear()


def post(data: bytes = b"audio", **form):
    fields = {"language": "id", "answerIndex": "1"} | form
    return client.post("/analyze", files={"audio": ("answer.webm", data)}, data=fields)


def test_analyze_returns_camel_case_metrics(engine):
    res = post()
    assert res.status_code == 200
    body = res.json()
    assert body["answerIndex"] == 1
    assert body["language"] == "id"
    assert body["fillers"][0] == {"token": "[EEE]", "startMs": 100, "endMs": 400, "kind": "vocal"}
    assert {"speakingRateWps", "syllablesPerSecond", "words", "prosody"} <= set(body)


def test_language_outside_the_session_languages_is_rejected(engine):
    assert post(language="fr").status_code == 422


def test_negative_answer_index_is_rejected(engine):
    assert post(answerIndex="-1").status_code == 422


def test_empty_audio_is_rejected(engine):
    assert post(b"").status_code == 422


def test_undecodable_audio_is_rejected(engine):
    assert post(b"not audio").status_code == 422


def test_answer_over_the_time_limit_is_rejected():
    cfg = settings()
    fake = FakeEngine([], [], seconds=cfg.max_audio_seconds + 1)
    app.dependency_overrides[get_engine] = lambda: fake
    try:
        assert post().status_code == 413
    finally:
        app.dependency_overrides.clear()


def test_missing_model_gives_503(monkeypatch, tmp_path):
    monkeypatch.setenv("WHISPER_MODEL_DIR", str(tmp_path))
    assert post().status_code == 503

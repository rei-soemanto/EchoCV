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


def test_audio_and_audio_url_together_are_rejected(engine):
    assert post(audioUrl="https://example.supabase.co/a.webm").status_code == 422


def test_neither_audio_nor_audio_url_is_rejected(engine):
    res = client.post("/analyze", data={"language": "id", "answerIndex": "0"})
    assert res.status_code == 422


def test_service_key_is_required_when_set(engine, monkeypatch):
    monkeypatch.setenv("SPEECH_SERVICE_KEY", "secret")
    assert post().status_code == 401
    fields = {"language": "id", "answerIndex": "1"}
    files = {"audio": ("answer.webm", b"audio")}
    wrong = client.post("/analyze", files=files, data=fields, headers={"X-Speech-Key": "nope"})
    assert wrong.status_code == 401
    right = client.post("/analyze", files=files, data=fields, headers={"X-Speech-Key": "secret"})
    assert right.status_code == 200


def test_service_key_is_checked_before_the_model(monkeypatch, tmp_path):
    monkeypatch.setenv("SPEECH_SERVICE_KEY", "secret")
    monkeypatch.setenv("WHISPER_MODEL_DIR", str(tmp_path))
    assert post().status_code == 401


def test_health_needs_no_key(monkeypatch):
    monkeypatch.setenv("SPEECH_SERVICE_KEY", "secret")
    assert client.get("/health").status_code == 200

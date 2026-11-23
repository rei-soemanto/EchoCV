import threading
from functools import cache
from typing import Annotated

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile

from app.access import (
    AudioDownloadFailed,
    AudioTooLarge,
    AudioUrlRejected,
    allowed_audio_hosts,
    check_audio_url,
    download_audio,
    require_service_key,
)
from app.analysis import Engine, analyze
from app.config import SpeechSettings, model_settings, settings
from app.schemas import Language, SpeechMetrics

app = FastAPI(title="EchoCV speech service")
_one_at_a_time = threading.Lock()


@cache
def _local_engine() -> Engine:
    from app.engine import LocalEngine

    return LocalEngine(settings(), model_settings())


def get_engine() -> Engine:
    if not (model_settings().model_dir / "model.bin").exists():
        raise HTTPException(503, "The speech model is not configured")
    try:
        return _local_engine()
    except ImportError as exc:
        raise HTTPException(503, "The speech model dependencies are not installed") from exc


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def read_upload(audio: UploadFile, cfg: SpeechSettings) -> bytes:
    data = audio.file.read(cfg.max_upload_bytes + 1)
    if len(data) > cfg.max_upload_bytes:
        raise HTTPException(413, "The audio file is too large")
    return data


def fetch_url(url: str, cfg: SpeechSettings) -> bytes:
    try:
        check_audio_url(url, allowed_audio_hosts())
        return download_audio(url, cfg.max_upload_bytes, cfg.audio_url_timeout_s)
    except AudioUrlRejected as exc:
        raise HTTPException(422, str(exc)) from exc
    except AudioTooLarge as exc:
        raise HTTPException(413, str(exc)) from exc
    except AudioDownloadFailed as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post("/analyze", response_model=SpeechMetrics, dependencies=[Depends(require_service_key)])
def analyze_answer(
    language: Annotated[Language, Form()],
    answer_index: Annotated[int, Form(alias="answerIndex", ge=0)],
    engine: Annotated[Engine, Depends(get_engine)],
    audio: Annotated[UploadFile | None, File()] = None,
    audio_url: Annotated[str | None, Form(alias="audioUrl")] = None,
) -> SpeechMetrics:
    cfg = settings()
    if (audio is None) == (audio_url is None):
        raise HTTPException(422, "Send either an audio file or an audioUrl")
    data = read_upload(audio, cfg) if audio is not None else fetch_url(audio_url, cfg)
    if not data:
        raise HTTPException(422, "The audio file is empty")
    try:
        samples = engine.decode(data)
    except Exception as exc:
        raise HTTPException(422, "The audio could not be decoded") from exc
    if len(samples) > cfg.max_audio_seconds * cfg.sample_rate:
        raise HTTPException(413, "The answer is longer than the time limit")
    with _one_at_a_time:
        return analyze(samples, language, answer_index, engine, cfg)

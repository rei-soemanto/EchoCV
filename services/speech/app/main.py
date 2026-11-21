import threading
from functools import cache
from typing import Annotated

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile

from app.analysis import Engine, analyze
from app.config import model_settings, settings
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


@app.post("/analyze", response_model=SpeechMetrics)
def analyze_answer(
    audio: Annotated[UploadFile, File()],
    language: Annotated[Language, Form()],
    answer_index: Annotated[int, Form(alias="answerIndex", ge=0)],
    engine: Annotated[Engine, Depends(get_engine)],
) -> SpeechMetrics:
    cfg = settings()
    data = audio.file.read(cfg.max_upload_bytes + 1)
    if not data:
        raise HTTPException(422, "The audio file is empty")
    if len(data) > cfg.max_upload_bytes:
        raise HTTPException(413, "The audio file is too large")
    try:
        samples = engine.decode(data)
    except Exception as exc:
        raise HTTPException(422, "The audio could not be decoded") from exc
    if len(samples) > cfg.max_audio_seconds * cfg.sample_rate:
        raise HTTPException(413, "The answer is longer than the time limit")
    with _one_at_a_time:
        return analyze(samples, language, answer_index, engine, cfg)

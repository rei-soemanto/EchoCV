import tempfile
import threading
from functools import cache
from pathlib import Path
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
from app.config import SpeechSettings, VideoSettings, model_settings, settings, video_settings
from app.schemas import Language, SpeechMetrics, VideoAnalysis
from app.vision.settings import vision_settings
from app.vision.tracker import visual_metrics
from app.vision.video import VideoUnreadable, VisionEngine, video_frames

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


@cache
def _local_vision() -> VisionEngine:
    from app.vision.video import LocalVisionEngine

    return LocalVisionEngine(vision_settings(), video_settings().max_frame_width)


def get_vision() -> VisionEngine:
    cfg = vision_settings()
    files = (cfg.face_file, cfg.pose.file, cfg.objects.file, cfg.behaviour.file)
    if not all((cfg.model_dir / name).exists() for name in files):
        raise HTTPException(503, "The vision models are not configured")
    try:
        return _local_vision()
    except ImportError as exc:
        raise HTTPException(503, "The vision model dependencies are not installed") from exc


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


def save_video(
    video: UploadFile | None, video_url: str | None, folder: Path, cfg: VideoSettings
) -> Path:
    target = folder / "answer"
    if video is not None:
        written = 0
        with target.open("wb") as out:
            while block := video.file.read(1 << 20):
                written += len(block)
                if written > cfg.max_bytes:
                    raise HTTPException(413, "The video file is too large")
                out.write(block)
    else:
        try:
            check_audio_url(video_url, allowed_audio_hosts())
            target.write_bytes(download_audio(video_url, cfg.max_bytes, cfg.url_timeout_s))
        except AudioUrlRejected as exc:
            raise HTTPException(422, str(exc).replace("audioUrl", "videoUrl")) from exc
        except AudioTooLarge as exc:
            raise HTTPException(413, "The video file is too large") from exc
        except AudioDownloadFailed as exc:
            raise HTTPException(422, "The video could not be downloaded") from exc
    if target.stat().st_size == 0:
        raise HTTPException(422, "The video file is empty")
    return target


@app.post(
    "/analyze-video", response_model=VideoAnalysis, dependencies=[Depends(require_service_key)]
)
def analyze_video(
    language: Annotated[Language, Form()],
    answer_index: Annotated[int, Form(alias="answerIndex", ge=0)],
    engine: Annotated[Engine, Depends(get_engine)],
    vision: Annotated[VisionEngine, Depends(get_vision)],
    video: Annotated[UploadFile | None, File()] = None,
    video_url: Annotated[str | None, Form(alias="videoUrl")] = None,
) -> VideoAnalysis:
    cfg, video_cfg = settings(), video_settings()
    if (video is None) == (video_url is None):
        raise HTTPException(422, "Send either a video file or a videoUrl")
    with tempfile.TemporaryDirectory(prefix="echocv-video-") as folder:
        path = save_video(video, video_url, Path(folder), video_cfg)
        try:
            samples = engine.decode(path)
        except Exception as exc:
            raise HTTPException(422, "The video has no audio that could be decoded") from exc
        if len(samples) > video_cfg.max_seconds * cfg.sample_rate:
            raise HTTPException(413, "The video is longer than the time limit")
        with _one_at_a_time:
            speech = analyze(samples, language, answer_index, engine, cfg)
            try:
                frames = video_frames(path, vision)
            except VideoUnreadable as exc:
                raise HTTPException(422, "The video frames could not be read") from exc
    visual = visual_metrics(frames, answer_index, speech.duration_ms, vision_settings())
    return VideoAnalysis(speech=speech, visual=visual, baseline="answer_start")

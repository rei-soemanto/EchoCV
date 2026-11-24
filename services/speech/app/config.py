import json
import os
from dataclasses import dataclass
from functools import cache
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SHARED_DIR = Path(os.environ.get("ECHOCV_SHARED_DIR", REPO / "shared"))
DEFAULT_MODEL_DIR = REPO / "ml" / "artifacts" / "whisper" / "v0" / "ct2"


@dataclass(frozen=True)
class SpeechSettings:
    sample_rate: int
    max_audio_seconds: float
    max_upload_bytes: int
    audio_url_timeout_s: float
    vad_threshold: float
    vad_min_speech_ms: int
    vad_min_silence_ms: int
    vad_speech_pad_ms: int
    pause_min_ms: int
    long_pause_ms: int
    lexical_filler_gap_ms: int
    language_switch_margin: float
    beam_size: int
    pitch_fmin_hz: float
    pitch_fmax_hz: float
    vocal_forms: dict[str, str]
    lexical_fillers: dict[str, frozenset[str]]


@dataclass(frozen=True)
class ModelSettings:
    model_dir: Path
    device: str
    compute_type: str
    cpu_threads: int


def _read(name: str) -> dict:
    return json.loads((SHARED_DIR / name).read_text(encoding="utf-8"))


def vocal_forms(tokens: list[str], spoken: dict[str, list[str]]) -> dict[str, str]:
    forms = {token.lower(): token for token in tokens}
    for token, words in spoken.items():
        forms.update(dict.fromkeys(words, token))
    return forms


@cache
def settings() -> SpeechSettings:
    speech, labels = _read("speech.json"), _read("labels.json")
    vad = speech["vad"]
    lexical = labels["lexicalFillers"]
    return SpeechSettings(
        sample_rate=speech["sampleRate"],
        max_audio_seconds=speech["maxAudioSeconds"],
        max_upload_bytes=speech["maxUploadMb"] * 1024 * 1024,
        audio_url_timeout_s=speech["audioUrlTimeoutS"],
        vad_threshold=vad["threshold"],
        vad_min_speech_ms=vad["minSpeechMs"],
        vad_min_silence_ms=vad["minSilenceMs"],
        vad_speech_pad_ms=vad["speechPadMs"],
        pause_min_ms=speech["pauseMinMs"],
        long_pause_ms=speech["longPauseMs"],
        lexical_filler_gap_ms=speech["lexicalFillerGapMs"],
        language_switch_margin=speech["languageSwitchMarginZipf"],
        beam_size=speech["whisperBeamSize"],
        pitch_fmin_hz=speech["pitchFminHz"],
        pitch_fmax_hz=speech["pitchFmaxHz"],
        vocal_forms=vocal_forms(labels["fillerTokens"], speech["vocalFillerForms"]),
        lexical_fillers={lang: frozenset(lexical.get(lang, [])) for lang in ("id", "en")},
    )


def model_settings() -> ModelSettings:
    return ModelSettings(
        model_dir=Path(os.environ.get("WHISPER_MODEL_DIR", DEFAULT_MODEL_DIR)),
        device=os.environ.get("WHISPER_DEVICE", "cpu"),
        compute_type=os.environ.get("WHISPER_COMPUTE_TYPE", "int8"),
        cpu_threads=int(os.environ.get("WHISPER_CPU_THREADS", max(1, (os.cpu_count() or 2) // 2))),
    )


@dataclass(frozen=True)
class VideoSettings:
    max_bytes: int
    max_seconds: float
    url_timeout_s: float
    max_frame_width: int


@cache
def video_settings() -> VideoSettings:
    video = _read("speech.json")["video"]
    return VideoSettings(
        max_bytes=video["maxMb"] * 1024 * 1024,
        max_seconds=video["maxSeconds"],
        url_timeout_s=video["urlTimeoutS"],
        max_frame_width=video["maxFrameWidth"],
    )

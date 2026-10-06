"""Audio I/O without torchcodec/FFmpeg: soundfile for decode/encode, librosa for resampling."""

import io
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

SR = 16_000


def decode(data: bytes) -> np.ndarray:
    """Encoded audio bytes (wav/flac) -> mono float32 at 16 kHz."""
    audio, sr = sf.read(io.BytesIO(data), dtype="float32", always_2d=True)
    return _mono16k(audio, sr)


def load(path: Path) -> np.ndarray:
    audio, sr = sf.read(path, dtype="float32", always_2d=True)
    return _mono16k(audio, sr)


def _mono16k(audio: np.ndarray, sr: int) -> np.ndarray:
    audio = audio.mean(axis=1)
    if sr != SR:
        audio = librosa.resample(audio, orig_sr=sr, target_sr=SR)
    return audio.astype(np.float32)


def save(path: Path, audio: np.ndarray) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(path, np.clip(audio, -1, 1), SR, format="FLAC")
    return path


def rms(audio: np.ndarray) -> float:
    return float(np.sqrt(np.mean(audio**2) + 1e-12))

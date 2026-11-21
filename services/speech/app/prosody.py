import numpy as np

FRAME_MS = 25
HOP_MS = 10
FLOOR_DB = -120.0
PITCH_FRAME = 1024
PITCH_HOP = 320

Segment = tuple[int, int]


def speech_parts(audio: np.ndarray, speech: list[Segment], sample_rate: int) -> list[np.ndarray]:
    return [audio[s * sample_rate // 1000 : e * sample_rate // 1000] for s, e in speech]


def volume_db(audio: np.ndarray, speech: list[Segment], sample_rate: int) -> float:
    frame = FRAME_MS * sample_rate // 1000
    hop = HOP_MS * sample_rate // 1000
    parts = [p for p in speech_parts(audio, speech, sample_rate) if len(p) >= frame]
    if not parts and len(audio) >= frame:
        parts = [audio]
    levels = []
    for part in parts:
        frames = np.lib.stride_tricks.sliding_window_view(part.astype(np.float64), frame)[::hop]
        rms = np.sqrt(np.mean(frames**2, axis=1))
        levels.append(20 * np.log10(np.maximum(rms, 10 ** (FLOOR_DB / 20))))
    return float(np.mean(np.concatenate(levels))) if levels else FLOOR_DB


def pitch_stats(
    audio: np.ndarray, speech: list[Segment], sample_rate: int, fmin: float, fmax: float
) -> tuple[float, float]:
    import librosa

    voiced = []
    for part in speech_parts(audio, speech, sample_rate):
        if len(part) < PITCH_FRAME:
            continue
        f0, flags, _ = librosa.pyin(
            part,
            fmin=fmin,
            fmax=fmax,
            sr=sample_rate,
            frame_length=PITCH_FRAME,
            hop_length=PITCH_HOP,
        )
        voiced.append(f0[flags & np.isfinite(f0)])
    values = np.concatenate(voiced) if voiced else np.array([])
    if not values.size:
        return 0.0, 0.0
    return float(values.mean()), float(values.std())

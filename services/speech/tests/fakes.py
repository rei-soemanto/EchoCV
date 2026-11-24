from pathlib import Path

import numpy as np

from app.analysis import RawWord

ZIPF = {
    ("saya", "id"): 6.6,
    ("saya", "en"): 2.6,
    ("memimpin", "id"): 4.0,
    ("project", "en"): 5.2,
    ("project", "id"): 4.4,
    ("jadi", "id"): 6.5,
    ("jadi", "en"): 1.8,
    ("data", "id"): 5.4,
    ("data", "en"): 5.3,
}


class FakeEngine:
    def __init__(
        self,
        words: list[RawWord],
        speech: list[tuple[int, int]],
        seconds: float = 10.0,
        sample_rate: int = 16000,
    ) -> None:
        self.words = words
        self.speech = speech
        self.audio = np.zeros(int(seconds * sample_rate), dtype=np.float32)

    def decode(self, data: bytes | Path) -> np.ndarray:
        if isinstance(data, Path):
            data = data.read_bytes()
        if data == b"not audio":
            raise ValueError("cannot decode")
        return self.audio

    def speech_segments(self, audio: np.ndarray) -> list[tuple[int, int]]:
        return self.speech

    def transcribe(self, audio, language, speech) -> list[RawWord]:
        return self.words

    def pitch(self, audio, speech) -> tuple[float, float]:
        return 180.04, 25.06

    def zipf(self, word: str, language: str) -> float:
        return ZIPF.get((word, language), 0.0)


def answer() -> FakeEngine:
    words = [
        RawWord(" [EEE]", 100, 400),
        RawWord(" Jadi,", 1000, 1300),
        RawWord(" saya", 1700, 1900),
        RawWord(" memimpin", 1900, 2400),
        RawWord(" project", 2400, 2900),
        RawWord(" data.", 2900, 3300),
    ]
    return FakeEngine(words, [(0, 1400), (1600, 3400), (6000, 7000)])

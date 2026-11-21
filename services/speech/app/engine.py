import io
import json

import numpy as np

from app.analysis import RawWord
from app.config import ModelSettings, SpeechSettings
from app.prosody import Segment, pitch_stats
from app.schemas import Language


class LocalEngine:
    def __init__(self, cfg: SpeechSettings, model: ModelSettings) -> None:
        from faster_whisper import WhisperModel

        self.cfg = cfg
        self.model = WhisperModel(
            str(model.model_dir),
            device=model.device,
            compute_type=model.compute_type,
            cpu_threads=model.cpu_threads,
        )
        self.suppress = json.loads(
            (model.model_dir / "suppress_tokens.json").read_text(encoding="utf-8")
        )

    def decode(self, data: bytes) -> np.ndarray:
        from faster_whisper.audio import decode_audio

        return decode_audio(io.BytesIO(data), sampling_rate=self.cfg.sample_rate)

    def vad_options(self):
        from faster_whisper.vad import VadOptions

        return VadOptions(
            threshold=self.cfg.vad_threshold,
            min_speech_duration_ms=self.cfg.vad_min_speech_ms,
            min_silence_duration_ms=self.cfg.vad_min_silence_ms,
            speech_pad_ms=self.cfg.vad_speech_pad_ms,
        )

    def speech_segments(self, audio: np.ndarray) -> list[Segment]:
        from faster_whisper.vad import get_speech_timestamps

        rate = self.cfg.sample_rate
        stamps = get_speech_timestamps(audio, self.vad_options(), sampling_rate=rate)
        return [(s["start"] * 1000 // rate, s["end"] * 1000 // rate) for s in stamps]

    def transcribe(
        self, audio: np.ndarray, language: Language, speech: list[Segment]
    ) -> list[RawWord]:
        if not speech:
            return []
        segments, _ = self.model.transcribe(
            audio,
            language=language,
            suppress_tokens=self.suppress,
            word_timestamps=True,
            condition_on_previous_text=False,
            vad_filter=True,
            vad_parameters=self.vad_options(),
            beam_size=self.cfg.beam_size,
        )
        return [
            RawWord(w.word, round(w.start * 1000), round(w.end * 1000))
            for segment in segments
            for w in segment.words or []
        ]

    def pitch(self, audio: np.ndarray, speech: list[Segment]) -> tuple[float, float]:
        return pitch_stats(
            audio, speech, self.cfg.sample_rate, self.cfg.pitch_fmin_hz, self.cfg.pitch_fmax_hz
        )

    def zipf(self, word: str, language: Language) -> float:
        from wordfreq import zipf_frequency

        return zipf_frequency(word, language)

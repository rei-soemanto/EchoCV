import re
from dataclasses import dataclass
from typing import Protocol

import numpy as np

from app.config import SpeechSettings
from app.prosody import Segment, volume_db
from app.schemas import Filler, Language, Pause, Prosody, SpeechMetrics, Word

_EDGE = re.compile(r"^[^\w\[\]]+|[^\w\[\]]+$")
_VOWELS = {"id": re.compile(r"[aeiou]+"), "en": re.compile(r"[aeiouy]+")}
_ID_DIPHTHONGS = frozenset({"ai", "au", "oi", "ei"})


@dataclass(frozen=True)
class RawWord:
    text: str
    start_ms: int
    end_ms: int


class Engine(Protocol):
    def decode(self, data: bytes) -> np.ndarray: ...

    def speech_segments(self, audio: np.ndarray) -> list[Segment]: ...

    def transcribe(
        self, audio: np.ndarray, language: Language, speech: list[Segment]
    ) -> list[RawWord]: ...

    def pitch(self, audio: np.ndarray, speech: list[Segment]) -> tuple[float, float]: ...

    def zipf(self, word: str, language: Language) -> float: ...


def clean(text: str) -> str:
    return _EDGE.sub("", text.strip()).lower()


def vocal_token(text: str, forms: dict[str, str]) -> str | None:
    return forms.get(clean(text))


def syllables(text: str, language: Language) -> int:
    word = clean(text)
    if not any(ch.isalnum() for ch in word):
        return 0
    runs = _VOWELS[language].findall(word)
    if language == "id":
        count = sum(1 if run in _ID_DIPHTHONGS else len(run) for run in runs)
    else:
        count = len(runs)
        if count > 1 and word.endswith("e") and not word.endswith(("le", "ee")):
            count -= 1
    return max(count, 1)


def tag_language(text: str, session: Language, engine: Engine, margin: float) -> Language:
    other: Language = "en" if session == "id" else "id"
    word = clean(text)
    in_other = engine.zipf(word, other)
    return other if in_other > 0 and in_other - engine.zipf(word, session) >= margin else session


def find_pauses(speech: list[Segment], cfg: SpeechSettings) -> list[Pause]:
    pauses = []
    for (_, end), (start, _) in zip(speech, speech[1:], strict=False):
        if start - end >= cfg.pause_min_ms:
            pauses.append(Pause(start_ms=end, end_ms=start, long=start - end >= cfg.long_pause_ms))
    return pauses


def lexical_filler_indexes(
    words: list[RawWord], vocal: set[int], lexicon: frozenset[str], gap_ms: int
) -> set[int]:
    found = set()
    for i, word in enumerate(words):
        if i in vocal or clean(word.text) not in lexicon:
            continue
        before = words[i - 1] if i > 0 else None
        after = words[i + 1] if i + 1 < len(words) else None
        hesitant = (
            (before is not None and (i - 1 in vocal or word.start_ms - before.end_ms >= gap_ms))
            or (after is not None and (i + 1 in vocal or after.start_ms - word.end_ms >= gap_ms))
            or (after is not None and clean(after.text) == clean(word.text))
        )
        if hesitant:
            found.add(i)
    return found


def analyze(
    audio: np.ndarray,
    language: Language,
    answer_index: int,
    engine: Engine,
    cfg: SpeechSettings,
) -> SpeechMetrics:
    speech = engine.speech_segments(audio)
    raw = [w for w in engine.transcribe(audio, language, speech) if clean(w.text)]
    vocal = {i: t for i, w in enumerate(raw) if (t := vocal_token(w.text, cfg.vocal_forms))}
    lexical = lexical_filler_indexes(
        raw, set(vocal), cfg.lexical_fillers[language], cfg.lexical_filler_gap_ms
    )
    fillers = [
        Filler(
            token=vocal.get(i, clean(raw[i].text)),
            start_ms=raw[i].start_ms,
            end_ms=raw[i].end_ms,
            kind="vocal" if i in vocal else "lexical",
        )
        for i in sorted(set(vocal) | lexical)
    ]
    words = {
        i: Word(
            text=w.text.strip(),
            start_ms=w.start_ms,
            end_ms=w.end_ms,
            language=tag_language(w.text, language, engine, cfg.language_switch_margin),
        )
        for i, w in enumerate(raw)
        if i not in vocal
    }
    spoken = [w for i, w in words.items() if i not in lexical]
    speech_ms = sum(end - start for start, end in speech)
    seconds = speech_ms / 1000
    pitch_mean, pitch_std = engine.pitch(audio, speech)
    return SpeechMetrics(
        answer_index=answer_index,
        language=language,
        duration_ms=len(audio) * 1000 // cfg.sample_rate,
        speech_ms=speech_ms,
        transcript=" ".join(w.text.strip() for w in raw),
        words=list(words.values()),
        fillers=fillers,
        pauses=find_pauses(speech, cfg),
        speaking_rate_wps=round(len(spoken) / seconds, 3) if seconds else 0.0,
        syllables_per_second=(
            round(sum(syllables(w.text, w.language) for w in spoken) / seconds, 3)
            if seconds
            else 0.0
        ),
        prosody=Prosody(
            pitch_mean_hz=round(pitch_mean, 1),
            pitch_std_hz=round(pitch_std, 1),
            volume_mean_db=round(volume_db(audio, speech, cfg.sample_rate), 2),
        ),
    )

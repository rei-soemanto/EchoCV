from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

Language = Literal["id", "en"]


class _Wire(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class Word(_Wire):
    text: str
    start_ms: int = Field(ge=0)
    end_ms: int = Field(ge=0)
    language: Language


class Filler(_Wire):
    token: str
    start_ms: int = Field(ge=0)
    end_ms: int = Field(ge=0)
    kind: Literal["vocal", "lexical"]


class Pause(_Wire):
    start_ms: int = Field(ge=0)
    end_ms: int = Field(ge=0)
    long: bool


class Prosody(_Wire):
    pitch_mean_hz: float = Field(ge=0)
    pitch_std_hz: float = Field(ge=0)
    volume_mean_db: float


class SpeechMetrics(_Wire):
    answer_index: int = Field(ge=0)
    language: Language
    duration_ms: int = Field(ge=0)
    speech_ms: int = Field(ge=0)
    transcript: str
    words: list[Word]
    fillers: list[Filler]
    pauses: list[Pause]
    speaking_rate_wps: float = Field(ge=0)
    syllables_per_second: float = Field(ge=0)
    prosody: Prosody

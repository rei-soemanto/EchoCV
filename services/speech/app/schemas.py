"""Pydantic mirror of shared/schemas/speech-metrics.schema.json.

Field names are snake_case in Python and camelCase on the wire. tests/test_schemas.py
fails if this drifts from the shared JSON Schema.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class _Wire(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class Filler(_Wire):
    token: str
    start_ms: int = Field(ge=0)


class Pause(_Wire):
    start_ms: int = Field(ge=0)
    end_ms: int = Field(ge=0)


class Prosody(_Wire):
    pitch_mean_hz: float = Field(ge=0)
    pitch_std_hz: float = Field(ge=0)
    volume_mean_db: float


class SpeechMetrics(_Wire):
    answer_index: int = Field(ge=0)
    language: Literal["id", "en"]
    transcript: str
    fillers: list[Filler]
    pauses: list[Pause]
    speaking_rate_wps: float = Field(ge=0)
    prosody: Prosody

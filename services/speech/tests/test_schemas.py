import json
from pathlib import Path

import jsonschema

from app.schemas import SpeechMetrics

SHARED_SCHEMA = (
    Path(__file__).resolve().parents[3] / "shared" / "schemas" / "speech-metrics.schema.json"
)


def _shared_schema() -> dict:
    return json.loads(SHARED_SCHEMA.read_text(encoding="utf-8"))


def _sample() -> SpeechMetrics:
    return SpeechMetrics(
        answer_index=0,
        language="id",
        transcript="[EEE] saya pernah memimpin proyek",
        fillers=[{"token": "[EEE]", "start_ms": 120}],
        pauses=[{"start_ms": 2000, "end_ms": 2900}],
        speaking_rate_wps=2.4,
        prosody={"pitch_mean_hz": 180.0, "pitch_std_hz": 25.0, "volume_mean_db": -22.5},
    )


def test_pydantic_output_matches_shared_schema():
    payload = _sample().model_dump(by_alias=True)
    jsonschema.validate(payload, _shared_schema())


def test_pydantic_fields_match_shared_schema():
    shared = _shared_schema()
    ours = SpeechMetrics.model_json_schema(by_alias=True)
    assert set(ours["properties"]) == set(shared["properties"])
    assert set(ours["required"]) == set(shared["required"])

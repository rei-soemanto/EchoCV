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
        duration_ms=4000,
        speech_ms=3100,
        transcript="[EEE] saya pernah memimpin project",
        words=[{"text": "project", "start_ms": 1500, "end_ms": 1900, "language": "en"}],
        fillers=[{"token": "[EEE]", "start_ms": 120, "end_ms": 400, "kind": "vocal"}],
        pauses=[{"start_ms": 2000, "end_ms": 2900, "long": False}],
        speaking_rate_wps=2.4,
        syllables_per_second=5.1,
        prosody={"pitch_mean_hz": 180.0, "pitch_std_hz": 25.0, "volume_mean_db": -22.5},
    )


def _resolve(node: dict, defs: dict) -> dict:
    if "$ref" in node:
        return defs[node["$ref"].split("/")[-1]]
    if node.get("type") == "array":
        return _resolve(node["items"], defs)
    return node


def test_pydantic_output_matches_shared_schema():
    payload = _sample().model_dump(by_alias=True)
    jsonschema.validate(payload, _shared_schema())


def test_pydantic_fields_match_shared_schema():
    shared = _shared_schema()
    ours = SpeechMetrics.model_json_schema(by_alias=True)
    defs = ours.get("$defs", {})
    assert set(ours["properties"]) == set(shared["properties"])
    assert set(ours["required"]) == set(shared["required"])
    for name, node in shared["properties"].items():
        theirs = node.get("items", node)
        if "properties" not in theirs:
            continue
        mine = _resolve(ours["properties"][name], defs)
        assert set(mine["properties"]) == set(theirs["properties"]), name
        assert set(mine["required"]) == set(theirs["required"]), name


SCHEMAS = SHARED_SCHEMA.parent


def _visual():
    from app.schemas import VisualMetrics

    return VisualMetrics(
        answer_index=1,
        duration_ms=60000,
        eye_contact_pct=72.5,
        smile_pct=4.0,
        events=[{"type": "slouching", "start_ms": 1000, "end_ms": 5000}],
    )


def test_visual_metrics_match_the_shared_schema():
    from app.schemas import VisualMetrics

    shared = json.loads((SCHEMAS / "visual-metrics.schema.json").read_text(encoding="utf-8"))
    jsonschema.validate(_visual().model_dump(by_alias=True), shared)
    ours = VisualMetrics.model_json_schema(by_alias=True)
    assert set(ours["properties"]) == set(shared["properties"])
    assert set(ours["required"]) == set(shared["required"])
    event = ours["$defs"]["BehaviourEvent"]
    assert set(event["properties"]["type"]["enum"]) == set(
        shared["properties"]["events"]["items"]["properties"]["type"]["enum"]
    )


def test_video_analysis_matches_the_shared_schema():
    from referencing import Registry, Resource

    from app.schemas import VideoAnalysis

    names = ("speech-metrics", "visual-metrics", "video-analysis")
    loaded = {
        n: json.loads((SCHEMAS / f"{n}.schema.json").read_text(encoding="utf-8")) for n in names
    }
    registry = (
        Registry()
        .with_resources((f"{n}.schema.json", Resource.from_contents(s)) for n, s in loaded.items())
        .with_resources((s["$id"], Resource.from_contents(s)) for s in loaded.values())
    )
    payload = VideoAnalysis(speech=_sample(), visual=_visual(), baseline="answer_start")
    validator = jsonschema.Draft202012Validator(loaded["video-analysis"], registry=registry)
    validator.validate(payload.model_dump(by_alias=True))
    ours = VideoAnalysis.model_json_schema(by_alias=True)
    assert set(ours["properties"]) == set(loaded["video-analysis"]["properties"])

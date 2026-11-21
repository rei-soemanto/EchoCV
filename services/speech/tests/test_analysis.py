import json

import jsonschema
import numpy as np
import pytest

from app.analysis import (
    RawWord,
    analyze,
    clean,
    find_pauses,
    lexical_filler_indexes,
    syllables,
    tag_language,
    vocal_token,
)
from app.config import SHARED_DIR, settings
from app.prosody import FLOOR_DB, volume_db
from tests.fakes import FakeEngine, answer


def test_vocal_fillers_match_tokens_and_spoken_forms():
    forms = settings().vocal_forms
    assert vocal_token(" [EEE],", forms) == "[EEE]"
    assert vocal_token("Umm...", forms) == "[UM]"
    assert vocal_token("hmm", forms) == "[HMM]"
    assert vocal_token("eh", forms) is None
    assert vocal_token("saya", forms) is None


def test_clean_keeps_inner_hyphens():
    assert clean(" Teman-teman,") == "teman-teman"


@pytest.mark.parametrize(
    ("word", "language", "expected"),
    [
        ("saya", "id", 2),
        ("pantai", "id", 2),
        ("memimpin", "id", 3),
        ("maaf", "id", 2),
        ("teman-teman", "id", 4),
        ("project", "en", 2),
        ("presentation", "en", 4),
        ("make", "en", 1),
        ("table", "en", 2),
        ("2019", "en", 1),
        ("...", "id", 0),
    ],
)
def test_syllable_estimate(word, language, expected):
    assert syllables(word, language) == expected


def test_language_tag_switches_only_past_the_margin():
    engine = FakeEngine([], [])
    margin = settings().language_switch_margin
    assert tag_language("project", "id", engine, margin) == "en"
    assert tag_language("data", "id", engine, margin) == "id"
    assert tag_language("saya", "id", engine, margin) == "id"
    assert tag_language("saya", "en", engine, margin) == "id"
    assert tag_language("unknownword", "en", engine, margin) == "en"


def test_pauses_are_gaps_between_speech_with_a_long_flag():
    cfg = settings()
    pauses = find_pauses([(0, 1000), (1300, 2000), (2600, 3000), (6000, 7000)], cfg)
    assert [(p.start_ms, p.end_ms, p.long) for p in pauses] == [
        (2000, 2600, False),
        (3000, 6000, True),
    ]


def test_lexical_fillers_count_only_next_to_a_hesitation():
    words = [
        RawWord("jadi", 0, 300),
        RawWord("saya", 300, 500),
        RawWord("jadi", 500, 700),
        RawWord("ketua", 700, 900),
        RawWord("gitu", 1500, 1700),
        RawWord("kayak", 1700, 1900),
        RawWord("kayak", 1900, 2100),
        RawWord("[EEE]", 2100, 2400),
    ]
    lexicon = settings().lexical_fillers["id"]
    assert lexical_filler_indexes(words, {7}, lexicon, 300) == {4, 5, 6}


def test_analyze_builds_metrics_that_match_the_shared_schema():
    engine = answer()
    cfg = settings()
    out = analyze(engine.audio, "id", 2, engine, cfg)
    schema = json.loads(
        (SHARED_DIR / "schemas" / "speech-metrics.schema.json").read_text(encoding="utf-8")
    )
    jsonschema.validate(out.model_dump(by_alias=True), schema)
    assert out.answer_index == 2
    assert out.duration_ms == 10000
    assert out.speech_ms == 4200
    assert out.transcript == "[EEE] Jadi, saya memimpin project data."
    assert [(f.token, f.kind) for f in out.fillers] == [("[EEE]", "vocal"), ("jadi", "lexical")]
    assert [(w.text, w.language) for w in out.words] == [
        ("Jadi,", "id"),
        ("saya", "id"),
        ("memimpin", "id"),
        ("project", "en"),
        ("data.", "id"),
    ]
    assert [(p.start_ms, p.end_ms, p.long) for p in out.pauses] == [(3400, 6000, True)]
    assert out.speaking_rate_wps == round(4 / 4.2, 3)
    assert out.syllables_per_second == round((2 + 3 + 2 + 2) / 4.2, 3)
    assert out.prosody.pitch_mean_hz == 180.0
    assert out.prosody.pitch_std_hz == 25.1
    assert out.prosody.volume_mean_db == FLOOR_DB


def test_silence_gives_empty_metrics():
    engine = FakeEngine([], [], seconds=2.0)
    out = analyze(engine.audio, "en", 0, engine, settings())
    assert out.words == [] and out.fillers == [] and out.pauses == []
    assert out.speaking_rate_wps == 0.0
    assert out.syllables_per_second == 0.0


def test_volume_of_a_half_scale_sine_is_minus_nine_db():
    rate = 16000
    t = np.arange(rate) / rate
    audio = (0.5 * np.sin(2 * np.pi * 200 * t)).astype(np.float32)
    assert volume_db(audio, [(0, 1000)], rate) == pytest.approx(-9.03, abs=0.05)

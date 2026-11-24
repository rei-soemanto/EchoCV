import pytest

from calib.export_scoring import (
    MIGRATION,
    fewer_is_better,
    migration,
    more_is_better,
    pace_bands,
    speech_rows,
)


def score(value, b):
    if value < b["ideal_low"]:
        return max(0.0, 100 * (value - b["zero_low"]) / (b["ideal_low"] - b["zero_low"]))
    if value > b["ideal_high"]:
        if b["ideal_high"] == b["zero_high"]:
            return 0.0
        return max(0.0, 100 * (b["zero_high"] - value) / (b["zero_high"] - b["ideal_high"]))
    return 100.0


def rows(key, values):
    return [{"person": f"p{i}", key: v} for i, v in enumerate(values)]


def test_fewer_is_better_gives_the_worst_team_answer_at_least_half_marks():
    b = fewer_is_better("fillers", "x", rows("x", [0.0, 1.0, 2.0, 6.0]), "")
    assert b["ideal_high"] == pytest.approx(1.5)
    assert b["zero_high"] == pytest.approx(12.0)
    assert score(6.0, b) >= 50


def test_fewer_is_better_never_collapses_when_most_answers_are_zero():
    b = fewer_is_better("pauses", "x", rows("x", [0.0, 0.0, 0.0, 0.0]), "")
    assert b["zero_high"] > b["ideal_high"]


def test_more_variation_is_never_penalised_and_the_least_varied_answer_gets_half():
    b = more_is_better("voice", "x", rows("x", [0.1, 0.2, 0.2, 0.3]), "")
    assert score(0.1, b) == pytest.approx(50.0)
    assert score(0.9, b) == 100.0


def test_pace_falls_to_zero_one_band_width_outside_each_language_band():
    pace = {
        lang: {"answers": 3, "syllablesPerSecond": {"low": 3.0, "median": 4.0, "high": 5.0}}
        for lang in ("en", "id")
    }
    bands = pace_bands(pace)
    assert [b["language"] for b in bands] == ["en", "id"]
    assert bands[0]["zero_high"] == pytest.approx(0.5)


def test_speech_rows_use_answer_minutes_like_the_reports_api():
    row = speech_rows(
        {
            "answers": [
                {
                    "durationMs": 120000,
                    "fillers": 4,
                    "longPauses": 1,
                    "pitchStdHz": 30.0,
                    "pitchMeanHz": 150.0,
                    "mixedWords": 2,
                    "words": 100,
                }
            ]
        }
    )[0]
    assert row["fillers_per_minute"] == pytest.approx(2.0)
    assert row["pitch_variation"] == pytest.approx(0.2)
    assert row["mixed_word_pct"] == pytest.approx(2.0)


def test_the_migration_upserts_every_band_and_drops_replaced_rows():
    bands = [
        {
            "dimension": "pace",
            "language": lang,
            "metric": "pace_deviation",
            "ideal_low": 0.0,
            "ideal_high": 0.0,
            "zero_low": 0.0,
            "zero_high": 0.2,
            "note": "it's provisional",
        }
        for lang in ("en", "id")
    ]
    sql = migration(bands)
    assert "on conflict (dimension, language) do update" in sql
    assert "not in (('pace', 'en'), ('pace', 'id'))" in sql
    assert "it''s provisional" in sql


def test_the_shipped_migration_is_the_one_the_export_writes():
    assert MIGRATION.exists()
    assert "insert into public.scoring_bands" in MIGRATION.read_text(encoding="utf-8")

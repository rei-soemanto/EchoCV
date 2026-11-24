import pytest

from whisper.inhouse_pace import person_weights, summarize, weighted_quantile


def test_weighted_quantile_of_equal_weights_is_the_median():
    assert weighted_quantile([1.0, 2.0, 3.0], [1.0, 1.0, 1.0], 0.5) == pytest.approx(2.0)


def test_each_person_weighs_the_same_however_many_answers():
    rows = [{"person": "p01"}] * 4 + [{"person": "p02"}]
    weights = person_weights(rows)
    assert sum(weights[:4]) == pytest.approx(weights[4])


def test_a_talkative_person_does_not_drag_the_median():
    rows = [
        {"person": "p01", "language": "id", "speakingRateWps": 3.0, "syllablesPerSecond": 6.0}
    ] * 8
    rows += [{"person": "p02", "language": "id", "speakingRateWps": 1.0, "syllablesPerSecond": 2.0}]
    rows += [{"person": "p03", "language": "id", "speakingRateWps": 2.0, "syllablesPerSecond": 4.0}]
    out = summarize(rows)["id"]
    assert out["people"] == 3
    assert out["answers"] == 10
    assert out["wordsPerMinute"]["median"] == pytest.approx(120.0)
    assert out["syllablesPerSecond"]["median"] == pytest.approx(4.0)


def test_languages_are_summarized_apart():
    rows = [
        {"person": "p01", "language": "id", "speakingRateWps": 2.0, "syllablesPerSecond": 5.0},
        {"person": "p01", "language": "en", "speakingRateWps": 2.5, "syllablesPerSecond": 3.5},
    ]
    out = summarize(rows)
    assert set(out) == {"en", "id"}
    assert out["en"]["wordsPerMinute"]["median"] == pytest.approx(150.0)
    assert out["id"]["wordsPerMinute"]["low"] <= out["id"]["wordsPerMinute"]["high"]


def test_delivery_numbers_keep_counts_only():
    from whisper.inhouse_pace import delivery_numbers

    metrics = {
        "language": "en",
        "durationMs": 60000,
        "speechMs": 50000,
        "speakingRateWps": 2.5,
        "syllablesPerSecond": 3.5,
        "transcript": "secret words",
        "words": [
            {"text": "a", "startMs": 0, "endMs": 1, "language": "en"},
            {"text": "b", "startMs": 1, "endMs": 2, "language": "id"},
        ],
        "fillers": [{"token": "[EEE]", "startMs": 0, "endMs": 1, "kind": "vocal"}],
        "pauses": [
            {"startMs": 0, "endMs": 600, "long": False},
            {"startMs": 1000, "endMs": 3500, "long": True},
        ],
        "prosody": {"pitchMeanHz": 200.0, "pitchStdHz": 40.0, "volumeMeanDb": -20.0},
    }
    out = delivery_numbers(metrics)
    assert out["mixedWords"] == 1
    assert out["longPauses"] == 1
    assert out["pauseMs"] == 3100
    assert not any(isinstance(v, str) for v in out.values())

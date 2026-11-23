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

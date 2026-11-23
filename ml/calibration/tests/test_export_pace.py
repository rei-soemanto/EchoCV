from calib.export_thresholds import pace


def test_pace_section_keeps_each_language_band():
    band = {"low": 1.0, "median": 2.0, "high": 3.0}
    result = {
        "band": [0.2, 0.8],
        "languages": {
            "id": {"people": 5, "answers": 26, "wordsPerMinute": band, "syllablesPerSecond": band},
            "en": {"people": 3, "answers": 18, "wordsPerMinute": band, "syllablesPerSecond": band},
        },
    }
    out = pace(result)
    assert out["provisional"] is True
    assert out["id"]["answers"] == 26
    assert out["en"]["syllablesPerSecond"] == band
    assert "20th to 80th percentile" in out["provenance"]

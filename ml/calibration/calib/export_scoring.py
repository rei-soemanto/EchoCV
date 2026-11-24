import json
from collections import defaultdict

import numpy as np

from calib.paths import CALIB_ROOT, RESULTS, SHARED

VISION = RESULTS / "inhouse_scoring.json"
SPEECH = RESULTS / "inhouse_pace.json"
VERSION = "0.2.0"
MIGRATION = (
    CALIB_ROOT.parents[1] / "supabase" / "migrations" / "20261124120000_scoring_bands_0_2_0.sql"
)
WORST_TO_ZERO = 2.0
UNREACHABLE = 10.0
STAGED_BEHAVIOURS = (
    "touching_face",
    "arms_crossed",
    "slouching",
    "reading_notes_desk",
    "reading_notes_held",
)
TEAM = "Team-calibrated on the EchoCV team recordings, every person weighted equally; "
NOT_RATED = " Not yet rated by HR practitioners."


def weighted_quantile(values: list[float], people: list[str], q: float) -> float:
    counts = defaultdict(int)
    for p in people:
        counts[p] += 1
    w = np.array([1.0 / counts[p] for p in people])
    order = np.argsort(values)
    v, w = np.asarray(values, dtype=float)[order], w[order]
    cum = np.cumsum(w) - 0.5 * w
    return float(np.interp(q * w.sum(), cum, v))


def median(rows: list[dict], key: str) -> float:
    return weighted_quantile([r[key] for r in rows], [r["person"] for r in rows], 0.5)


def staged_median(rows: list[dict], key: str, clips: tuple) -> float:
    per_person = defaultdict(list)
    for r in rows:
        if r["clip"] in clips:
            per_person[r["person"]].append(r[key])
    return float(np.median([np.median(v) for v in per_person.values()]))


def r4(value: float) -> float:
    return round(float(value), 4)


def speech_rows(result: dict) -> list[dict]:
    rows = []
    for r in result["answers"]:
        minutes = r["durationMs"] / 60000
        rows.append(
            {
                **r,
                "fillers_per_minute": r["fillers"] / minutes,
                "long_pauses_per_minute": r["longPauses"] / minutes,
                "pitch_variation": r["pitchStdHz"] / r["pitchMeanHz"] if r["pitchMeanHz"] else 0,
                "mixed_word_pct": 100.0 * r["mixedWords"] / r["words"] if r["words"] else 0,
            }
        )
    return rows


def band(dimension, metric, low, high, zero_low, zero_high, note, language="any") -> dict:
    return {
        "dimension": dimension,
        "language": language,
        "metric": metric,
        "ideal_low": r4(low),
        "ideal_high": r4(high),
        "zero_low": r4(zero_low),
        "zero_high": r4(zero_high),
        "note": note,
    }


def fewer_is_better(dimension, metric, rows, note, language="any") -> dict:
    full = median(rows, metric)
    zero = max(WORST_TO_ZERO * max(r[metric] for r in rows), full + 1e-3)
    return band(dimension, metric, 0.0, full, 0.0, zero, note, language)


def more_is_better(dimension, metric, rows, note) -> dict:
    full = median(rows, metric)
    zero = max(0.0, 2 * min(r[metric] for r in rows) - full)
    return band(dimension, metric, full, UNREACHABLE, zero, UNREACHABLE, note)


def pace_bands(pace: dict) -> list[dict]:
    out = []
    for language in ("en", "id"):
        b = pace[language]["syllablesPerSecond"]
        zero = (b["high"] - b["low"]) / b["median"]
        note = (
            "Distance outside this language's syllablesPerSecond band in "
            "shared/thresholds.json, as a fraction of its median; 0 at one band width "
            f"outside the band. {TEAM}{pace[language]['answers']} answers." + NOT_RATED
        )
        out.append(band("pace", "pace_deviation", 0.0, 0.0, 0.0, zero, note, language))
    return out


def build(vision: dict, speech: dict, thresholds: dict) -> list[dict]:
    answers = [r for r in vision["rows"] if r["part"] == "B"]
    clips = [r for r in vision["rows"] if r["part"] == "A"]
    talks = speech_rows(speech)
    english = [r for r in talks if r["language"] == "en"]
    n = f"{len({r['person'] for r in answers})} people, {len(answers)} answers. "
    s = f"{len({r['person'] for r in talks})} people, {len(talks)} answers. "
    worst = f"full marks up to the team median, 0 at {WORST_TO_ZERO:g} times the worst answer."
    return [
        band(
            "eye_contact",
            "eye_contact_pct",
            median(answers, "eyeContactPct"),
            100,
            staged_median(clips, "eyeContactPct", ("looking_away",)),
            100,
            f"Share of answer frames with eye contact. {TEAM}{n}Full marks from the team "
            "median, 0 at the staged looking-away clips." + NOT_RATED,
        ),
        band(
            "smile",
            "smile_pct",
            staged_median(clips, "smilePct", ("smile",)),
            100,
            0,
            100,
            "Feedback only: smile has weight 0 in shared/rubric.json (BR-09). Full marks at the "
            "staged smile clips." + NOT_RATED,
        ),
        band(
            "posture",
            "behaviour_pct",
            0,
            median(answers, "behaviourPct"),
            0,
            staged_median(clips, "behaviourPct", STAGED_BEHAVIOURS),
            "Share of answer time with touching face, arms crossed, slouching or reading notes. "
            f"{TEAM}{n}Full marks up to the team median, 0 at the staged behaviour clips."
            + NOT_RATED,
        ),
        fewer_is_better(
            "fillers",
            "fillers_per_minute",
            talks,
            f"Vocal and lexical fillers per minute of answer audio. {TEAM}{s}{worst} One band "
            "for both languages until the Indonesian filler model is measured on real speech."
            + NOT_RATED,
        ),
        *pace_bands(thresholds["pace"]),
        fewer_is_better(
            "pauses",
            "long_pauses_per_minute",
            talks,
            f"Pauses of at least longPauseMs per minute of answer audio. {TEAM}{s}{worst}"
            + NOT_RATED,
        ),
        more_is_better(
            "voice",
            "pitch_variation",
            talks,
            "Pitch variation as pitchStdHz / pitchMeanHz, so higher and lower voices are judged "
            f"alike; more variation is never penalised. {TEAM}{s}Full marks from the team "
            "median, the least varied answer at 50. Volume is not scored because it depends on "
            "the microphone." + NOT_RATED,
        ),
        fewer_is_better(
            "clarity_mixing",
            "mixed_word_pct",
            english,
            "English sessions only: share of words spoken in Indonesian caps the clarity part "
            f"of content (BR-27, BR-28). {TEAM}{len(english)} English answers; {worst}" + NOT_RATED,
            language="en",
        ),
    ]


def sql_text(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


UPDATED = ("metric", "ideal_low", "ideal_high", "zero_low", "zero_high", "version", "provisional")


def migration(bands: list[dict]) -> str:
    rows = []
    for b in bands:
        values = [
            sql_text(b["dimension"]),
            sql_text(b["language"]),
            sql_text(b["metric"]),
            *(repr(b[k]) for k in ("ideal_low", "ideal_high", "zero_low", "zero_high")),
            sql_text(VERSION),
            "true",
            sql_text(b["note"]),
        ]
        rows.append("  (" + ", ".join(values) + ")")
    columns = ", ".join(("dimension", "language", *UPDATED[:-2], "version", "provisional", "note"))
    updates = ",\n  ".join(f"{c} = excluded.{c}" for c in (*UPDATED, "note"))
    keys = ", ".join(f"({sql_text(b['dimension'])}, {sql_text(b['language'])})" for b in bands)
    dimensions = ", ".join(sorted({sql_text(b["dimension"]) for b in bands}))
    return (
        f"delete from public.scoring_bands\n  where dimension in ({dimensions})\n"
        f"  and (dimension, language) not in ({keys});\n\n"
        f"insert into public.scoring_bands ({columns}) values\n"
        + ",\n".join(rows)
        + f"\non conflict (dimension, language) do update set\n  {updates};\n"
    )


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    bands = build(read(VISION), read(SPEECH), read(SHARED / "thresholds.json"))
    MIGRATION.write_text(migration(bands), encoding="utf-8")
    for b in bands:
        print(
            f"{b['dimension']:15s} {b['language']:4s} {b['metric']:23s} "
            f"ideal {b['ideal_low']}-{b['ideal_high']}  zero {b['zero_low']}/{b['zero_high']}"
        )


if __name__ == "__main__":
    main()

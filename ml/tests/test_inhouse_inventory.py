from inhouse.inventory import PART_A_CLIPS, flags_for, parse_name, parse_rate, session_flags


def test_part_a_name():
    assert parse_name("p01_s1_reading_notes_held") == {
        "person": "p01",
        "session": "s1",
        "part": "A",
        "clip": "reading_notes_held",
        "question": "",
        "language": "",
    }


def test_part_b_uses_question_not_answer_number():
    a = parse_name("p02_s1_answer01_q03_en")
    b = parse_name("p02_s1_answer01_q04_en")
    assert (a["question"], a["language"], a["clip"]) == ("q03", "en", "q03_en")
    assert b["clip"] == "q04_en"


def test_unknown_names_are_rejected():
    assert parse_name("WIN_20261012_14_33_10_Pro") is None
    assert parse_name("p01_s1_dancing") is None
    assert parse_name("p01_s1_answer01_q01_fr") is None


def test_frame_rates():
    assert parse_rate("60/1") == 60
    assert round(parse_rate("119/6"), 2) == 19.83
    assert parse_rate("0/0") == 0


def row(part="A", duration=32.0, audio=True, fps=30.0, w=1920, h=1080):
    return {
        "part": part,
        "duration_s": duration,
        "audio": audio,
        "fps": fps,
        "width": w,
        "height": h,
    }


def test_flags():
    assert flags_for(row()) == []
    assert flags_for(row(duration=20)) == ["short_clip"]
    assert flags_for(row(part="B", duration=30)) == ["short_answer"]
    assert set(flags_for(row(audio=False, fps=10, w=640, h=480))) == {
        "no_audio",
        "low_fps",
        "low_resolution",
    }


def test_session_flags():
    full = [{"person": "p01", "session": "s1", "part": "A", "clip": c} for c in PART_A_CLIPS]
    answers_only = [{"person": "p02", "session": "s2", "part": "B", "clip": "q05_id"}]
    partial = [{"person": "p03", "session": "s1", "part": "A", "clip": "upright"}]
    flags = session_flags(full + answers_only + partial)
    assert flags[("p01", "s1")] == ["no_part_b"]
    assert flags[("p02", "s2")] == ["no_part_a"]
    assert flags[("p03", "s1")][0].startswith("missing_clips:looking_away")

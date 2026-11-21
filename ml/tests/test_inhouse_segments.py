from whisper import inhouse_review
from whisper.inhouse_draft import read_tsv, write_tsv
from whisper.inhouse_segments import group_speech, padded


def test_close_chunks_are_joined():
    assert group_speech([(0.0, 3.0), (3.5, 6.0), (9.0, 12.0)]) == [(0.0, 6.0), (9.0, 12.0)]


def test_groups_never_exceed_max_length():
    chunks = [(i * 5.0, i * 5.0 + 4.5) for i in range(12)]
    groups = group_speech(chunks, max_len=25.0)
    assert all(e - s <= 25.0 for s, e in groups)
    assert groups[0] == (0.0, 24.5)


def test_long_chunk_is_split():
    groups = group_speech([(0.0, 60.0)], max_len=25.0)
    assert groups == [(0.0, 25.0), (25.0, 50.0), (50.0, 60.0)]


def test_tiny_chunks_are_dropped():
    assert group_speech([(0.0, 0.4), (10.0, 13.0)]) == [(10.0, 13.0)]


def test_padding_stays_inside_the_file():
    assert padded((0.1, 9.9), total=10.0, pad=0.25) == (0.0, 10.0)
    assert padded((2.0, 4.0), total=10.0, pad=0.25) == (1.75, 4.25)


def test_tsv_round_trip(tmp_path):
    rows = [
        {"seg": 1, "start": 0.0, "end": 3.2, "draft": "saya [EEE] kerja", "verbatim": "x\ty"},
        {"seg": 2, "start": 3.5, "end": 7.0, "draft": 'kata "kutip"', "verbatim": ""},
    ]
    path = tmp_path / "a.tsv"
    write_tsv(path, rows)
    back = read_tsv(path)
    assert [r["draft"] for r in back] == ["saya [EEE] kerja", 'kata "kutip"']
    assert back[0]["verbatim"] == "x\ty"


def test_import_corrections_marks_checked(tmp_path, monkeypatch):
    monkeypatch.setattr(inhouse_review, "TRANSCRIPTS", tmp_path)
    write_tsv(
        tmp_path / "p01_s1_q01_id.tsv",
        [
            {"seg": 1, "start": 0, "end": 3, "draft": "saya kerja", "verbatim": "saya kerja"},
            {"seg": 2, "start": 4, "end": 6, "draft": "oke", "verbatim": "oke"},
        ],
    )
    corrections = tmp_path / "corrections_p01.tsv"
    corrections.write_text(
        "stem\tseg\tstart\tend\tdraft\tverbatim\n"
        "p01_s1_q01_id\t1\t0\t3\tsaya kerja\tsaya [EEE] kerja\n",
        encoding="utf-8",
    )
    assert inhouse_review.import_corrections(corrections) == 1
    rows = read_tsv(tmp_path / "p01_s1_q01_id.tsv")
    assert rows[0]["verbatim"] == "saya [EEE] kerja"
    assert (rows[0]["checked"], rows[1]["checked"]) == ("yes", "")


def test_review_page_escapes_script_end():
    html = inhouse_review.page("p01", [{"stem": "s", "seg": 1, "draft": "</script>"}])
    assert '</script>"' not in html
    assert "p01" in html

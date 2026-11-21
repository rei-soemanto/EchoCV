from inhouse.relabel import relabelled

RULES = [
    {"stem": "p06_s1_upright", "start": 0.0, "end": 4.0, "clip": "upright"},
    {"stem": "p06_s1_upright", "start": 4.0, "end": 7.0, "clip": ""},
    {"stem": "p06_s1_upright", "start": 7.0, "end": 9999.0, "clip": "looking_away"},
]


def row(stem, t, clip="upright"):
    return {"stem": stem, "t": str(t), "clip": clip}


def test_relabel_keeps_the_start_drops_the_gap_and_renames_the_rest():
    rows = [row("p06_s1_upright", t) for t in (2.0, 4.0, 6.8, 7.0, 20.0)]
    out = relabelled(rows, RULES)
    assert [(r["t"], r["clip"]) for r in out] == [
        ("2.0", "upright"),
        ("7.0", "looking_away"),
        ("20.0", "looking_away"),
    ]


def test_other_stems_are_untouched():
    rows = [row("p07_s1_upright", 10.0), row("p06_s1_smile", 10.0, "smile")]
    assert relabelled(rows, RULES) == rows

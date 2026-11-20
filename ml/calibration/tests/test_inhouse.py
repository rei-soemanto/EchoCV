import json

import numpy as np
import pandas as pd

from calib.inhouse_calibrate import add_baselines, capped_threshold, sustained
from calib.inhouse_face import face_geometry
from calib.inhouse_posture import baseline_relative, frame_features


def test_face_geometry_is_relative_to_frame():
    pts = np.array([[100.0, 50.0], [300.0, 250.0]])
    g = face_geometry(pts, 400, 500)
    assert g == {"fx": 0.5, "fy": 0.3, "fw": 0.5, "fh": 0.4}


def face_rows():
    rows = []
    for stem, part, clip, t, yaw in [
        ("p01_s1_q01_id", "B", "q01_id", 0.0, 2.0),
        ("p01_s1_q01_id", "B", "q01_id", 1.0, 4.0),
        ("p01_s1_q01_id", "B", "q01_id", 30.0, 40.0),
        ("p01_s1_q02_id", "B", "q02_id", 0.4, 10.0),
        ("p01_s1_upright", "A", "upright", 5.0, 99.0),
    ]:
        rows.append(
            {
                "stem": stem,
                "part": part,
                "clip": clip,
                "t": t,
                "sid": "p01_s1",
                "yaw": yaw,
                "pitch": 0.0,
                "iris_x": 0.0,
                "iris_y_corner": 0.0,
                "smile": 0.1,
            }
        )
    return pd.DataFrame(rows)


def test_baselines_come_from_answer_starts_not_the_scored_clip():
    df = add_baselines(face_rows())
    by_stem = df.groupby("stem")["b_yaw"].first()
    assert by_stem["p01_s1_q01_id"] == 3.0
    assert by_stem["p01_s1_q02_id"] == 10.0
    assert by_stem["p01_s1_upright"] == 4.0


def test_sustained_needs_a_full_window():
    df = pd.DataFrame({"stem": ["a"] * 6 + ["b"] * 2})
    flags = np.array([1, 1, 1, 1, 1, 0, 1, 1], dtype=bool)
    out = sustained(df, flags, window_s=0.8, frac=1.0)
    assert out.tolist() == [False, False, False, True, True, False, False, False]


def test_smile_threshold_protects_every_person():
    d = pd.DataFrame(
        {
            "person": ["a"] * 4 + ["b"] * 4,
            "y": [False, False, False, True] * 2,
            "s": [0.0, 0.0, 0.0, 0.5, 0.02, 0.03, 0.04, 0.6],
        }
    )
    assert capped_threshold(d, "s", max_fpr=0.0) > 0.04


def posture_rows(fy_answer=0.4, fy_clip=0.6):
    base = {
        "w": 1000,
        "h": 1000,
        "fx": 0.5,
        "fw": 0.2,
        "fh": 0.25,
        "roll": 0.0,
        "pitch": 0.0,
        "sid": "p01_s1",
        "objects": json.dumps([]),
    }
    rows = [
        {**base, "stem": "p01_s1_q01_id", "part": "B", "clip": "q01_id", "t": 0.5, "fy": fy_answer},
        {
            **base,
            "stem": "p01_s1_slouching",
            "part": "A",
            "clip": "slouching",
            "t": 3.0,
            "fy": fy_clip,
        },
    ]
    for r in rows:
        for i in range(17):
            r[f"k{i}_x"], r[f"k{i}_y"], r[f"k{i}_c"] = 0.0, 0.0, 0.0
        r["k5_x"], r["k5_y"], r["k5_c"] = 600.0, 800.0, 0.9
        r["k6_x"], r["k6_y"], r["k6_c"] = 400.0, 800.0, 0.9
    df = pd.DataFrame(rows)
    return pd.concat([df, frame_features(df)], axis=1)


def test_face_drop_is_measured_in_face_heights_from_the_calibration():
    df = baseline_relative(posture_rows())
    slouch = df[df["clip"] == "slouching"].iloc[0]
    assert round(slouch["face_dy"], 3) == 0.8
    assert slouch["face_scale"] == 1.0
    assert slouch["shoulders_visible"] == 1.0
    assert slouch["wrist_face_dist"] == 4.0

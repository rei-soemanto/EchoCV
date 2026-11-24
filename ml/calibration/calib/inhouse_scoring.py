import json

import numpy as np
import pandas as pd

from calib.inhouse_calibrate import (
    BASE_COLS,
    FACE_CSV,
    add_baselines,
    apply_relabel,
    down_score,
    errors,
    sustained,
)
from calib.inhouse_posture import apply_exported
from calib.inhouse_posture import load as posture_load
from calib.paths import RESULTS, SHARED

OUT = RESULTS / "inhouse_scoring.json"
POSE_RULE = "pose_rule"


def thresholds() -> dict:
    return json.loads((SHARED / "thresholds.json").read_text(encoding="utf-8"))


def face_frames() -> pd.DataFrame:
    df = apply_relabel(pd.read_csv(FACE_CSV))
    df["detected"] = df["detected"].fillna(False).astype(bool)
    df["sid"] = df["person"] + "_" + df["session"]
    df = df.sort_values(["stem", "t"]).reset_index(drop=True)
    seen = add_baselines(df[df["detected"]].copy())
    missing = df[~df["detected"] & ~df["frame"].isin(seen["frame"])]
    missing = missing[missing["stem"].isin(seen["stem"])]
    return pd.concat([seen, missing]).sort_values(["stem", "t"]).reset_index(drop=True)


def face_flags(df: pd.DataFrame, t: dict) -> pd.DataFrame:
    e, s, g = t["eyeContact"], t["smile"], t["gazeDown"]
    seen = df["detected"].to_numpy()
    filled = df.copy()
    for c in BASE_COLS:
        filled[c] = filled[c].fillna(filled[f"b_{c}"])
    contact = seen & (errors(filled, e["kX"], e["kY"]) <= e["toleranceDeg"])
    smiling = seen & ((filled["smile"] - filled["b_smile"]).to_numpy() >= s["threshold"])
    down = seen & (down_score(filled, g["kY"], g["sign"]) >= g["angleDeg"])
    notes = sustained(filled, down, g["windowS"], g["minFraction"])
    return pd.DataFrame(
        {"frame": df["frame"], "contact": contact, "smiling": smiling, "gaze_down": notes},
        index=df.index,
    )


def posture_flags(t: dict) -> pd.DataFrame:
    df = posture_load()
    out = pd.DataFrame({"frame": df["frame"]}, index=df.index)
    for behaviour, rule in t["posture"]["behaviours"].items():
        if rule["source"] == POSE_RULE:
            out[behaviour] = apply_exported(rule, df) >= rule["threshold"]
    return out


def per_stem(face: pd.DataFrame, flags: pd.DataFrame, posture: pd.DataFrame) -> pd.DataFrame:
    frames = face[["frame", "stem", "person", "part", "clip", "language"]].join(
        flags.drop(columns="frame")
    )
    frames = frames.merge(posture, on="frame", how="left")
    behaviours = [c for c in posture.columns if c != "frame"]
    frames[behaviours] = frames[behaviours].fillna(False).astype(bool)
    frames["reading_notes"] = frames["gaze_down"]
    behaviours = [*behaviours, "reading_notes"]
    frames["any_behaviour"] = frames[behaviours].any(axis=1)
    pct = frames.groupby("stem")[["contact", "smiling", "any_behaviour", *behaviours]].mean()
    meta = frames.groupby("stem")[["person", "part", "clip", "language"]].first()
    pct = (
        (pct * 100)
        .round(2)
        .rename(
            columns={
                "contact": "eyeContactPct",
                "smiling": "smilePct",
                "any_behaviour": "behaviourPct",
            }
        )
    )
    return meta.join(pct).join(frames.groupby("stem").size().rename("frames"))


def main() -> None:
    t = thresholds()
    face = face_frames()
    table = per_stem(face, face_flags(face, t), posture_flags(t))
    rows = table.reset_index().to_dict(orient="records")
    result = {
        "rule": "per answer or clip: eye contact, smile and behaviour time as a percentage of "
        "sampled frames, with the constants in shared/thresholds.json; frames without a face "
        "count as no eye contact; reading_notes comes from the gaze-down rule only",
        "rows": rows,
    }
    OUT.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    answers = table[table["part"] == "B"]
    clips = table[table["part"] == "A"]
    cols = ["eyeContactPct", "smilePct", "behaviourPct"]
    print("answers by person (median):")
    print(answers.groupby("person")[cols].median().to_string())
    print("clips (median over people):")
    print(clips.groupby("clip")[cols].median().round(1).to_string())
    print(np.round(answers[cols].describe(), 1).to_string())


if __name__ == "__main__":
    main()

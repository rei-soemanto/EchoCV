import json

import numpy as np
import pandas as pd

from calib.inhouse_calibrate import (
    CONTACT_NEG,
    CONTACT_POS,
    DOWN_NEG,
    DOWN_POS,
    SMILE_NEG,
    SMILE_POS,
    add_baselines,
    clip_rates,
    down_score,
    errors,
    labelled,
    load,
    prf,
    sustained,
)
from calib.inhouse_posture import apply_exported
from calib.inhouse_posture import labelled as posture_labelled
from calib.inhouse_posture import load as posture_load
from calib.paths import RESULTS

FROZEN = RESULTS / "v1_4p"
OUT = RESULTS / "holdout_v1.json"


def per_person(d: pd.DataFrame, pred: np.ndarray) -> dict:
    y = d["y"].to_numpy()
    people = {}
    for p in sorted(d["person"].unique()):
        m = (d["person"] == p).to_numpy()
        people[p] = {**prf(y[m], pred[m]), "clip_rate": clip_rates(d[m], pred[m])}
    return {"mean_f1": float(np.mean([v["f1"] for v in people.values()])), "people": people}


def face_signals(df: pd.DataFrame, frozen: dict) -> dict:
    e, s, g = frozen["eye_contact"], frozen["smile"], frozen["gaze_down"]
    out = {}
    d = labelled(df, CONTACT_POS, CONTACT_NEG)
    p = e["params"]
    out["eye_contact"] = per_person(d, errors(d, p["kX"], p["kY"]) <= p["toleranceDeg"])
    out["eye_contact"]["frozen_lopo_f1"] = e["lopo_f1"]
    d = labelled(df, SMILE_POS, SMILE_NEG)
    d["smile_rel"] = d["smile"] - d["b_smile"]
    out["smile"] = per_person(d, d[s["use"]].to_numpy() >= s[s["use"]]["threshold"])
    out["smile"]["frozen_lopo_f1"] = s[s["use"]]["lopo_f1"]
    d = labelled(df, DOWN_POS, DOWN_NEG)
    flags = down_score(d, g["kY"], g["sign"]) >= g["params"]["angleDeg"]
    pred = sustained(d, flags, g["params"]["windowS"], g["params"]["minFraction"])
    out["gaze_down"] = per_person(d, pred)
    out["gaze_down"]["frozen_lopo_f1"] = g["lopo_f1"]
    return out


def posture_signals(df: pd.DataFrame, frozen: dict) -> dict:
    out = {}
    for behaviour, r in frozen["behaviours"].items():
        d = posture_labelled(df, behaviour)
        out[behaviour] = per_person(d, apply_exported(r["rule"], d) >= r["rule"]["threshold"])
        out[behaviour]["frozen_lopo_f1"] = r["lopo_f1"]
    return out


def main() -> None:
    face = json.loads((FROZEN / "inhouse.json").read_text(encoding="utf-8"))
    posture = json.loads((FROZEN / "inhouse_posture.json").read_text(encoding="utf-8"))
    seen = set(face["data"]["people"])
    df = add_baselines(load())
    df = df[~df["person"].isin(seen)]
    pdf = posture_load()
    pdf = pdf[~pdf["person"].isin(seen)]
    result = {
        "frozen_people": sorted(seen),
        "held_out_people": sorted(df["person"].unique().tolist()),
        "frames": {p: int(n) for p, n in df.groupby("person").size().items()},
        "face": face_signals(df, face),
        "posture": posture_signals(pdf, posture),
    }
    OUT.write_text(json.dumps(result, indent=2), encoding="utf-8")
    summary = {
        name: {
            "held_out_f1": round(r["mean_f1"], 3),
            "frozen_lopo_f1": round(r["frozen_lopo_f1"], 3),
            "per_person": {p: round(v["f1"], 3) for p, v in r["people"].items()},
        }
        for group in ("face", "posture")
        for name, r in result[group].items()
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()

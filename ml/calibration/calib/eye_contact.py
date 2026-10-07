"""Choose the eye-contact rule constants on Columbia Gaze; report false positives on MPIIFaceGaze.

Both datasets are non-commercial: they are used only to choose and measure a few constants.
No model is trained on them.

Rule: gaze ~ (head yaw/pitch) + k * (eye feature), relative to each person's 'looking at the
camera' baseline (the runtime 5-second calibration). Eye contact if the angular error <= T.

Eye contact is scored as the gaze-perception cone (vertical gaze on the camera, horizontal within
5 degrees), not exact lens lock: Columbia's nearest negatives are 5 degrees off, below both
MediaPipe's iris precision and what a viewer perceives as eye contact. Strict gaze-lock is still
reported.

Run from ml/calibration/:  uv run python -m calib.eye_contact
"""

import json
import re

import numpy as np
import pandas as pd

from calib.features import extract
from calib.paths import DATA, RESULTS
from calib.rules import f1, gaze_error

COLUMBIA_NAME = re.compile(r"(\d{4})_2m_(-?\d+)P_(-?\d+)V_(-?\d+)H\.jpg$", re.I)
VERTICAL_FEATURES = ["iris_y_corner", "iris_y_lid", "look_v"]
K_GRID = np.arange(-40, 40.01, 1.0)  # degrees per standard deviation of the eye feature
T_GRID = np.arange(1.0, 25.01, 0.5)
CONE_H = 5
MPII_PER_PERSON = 1000
SEED = 0


def _add_base(df: pd.DataFrame, refs: dict, cols: list[str]) -> pd.DataFrame:
    for c in cols:
        df[f"b_{c}"] = df["key"].map({k: v[c] for k, v in refs.items()})
    return df


def columbia(cols: list[str]) -> pd.DataFrame:
    paths = sorted((DATA / "columbia_gaze").rglob("*.jpg"))
    df = extract(paths, "columbia")
    meta = df["path"].str.extract(COLUMBIA_NAME.pattern, flags=re.I)
    df["key"], df["P"], df["V"], df["H"] = meta[0], *(meta[i].astype(float) for i in (1, 2, 3))
    df = df[df["detected"] & df["key"].notna()].copy()
    df["lock"] = (df["V"] == 0) & (df["H"] == 0)
    df["contact"] = (df["V"] == 0) & (df["H"].abs() <= CONE_H)
    refs = {
        k: g[(g["P"] == 0) & g["lock"]][cols].mean()
        for k, g in df.groupby("key")
        if len(g[(g["P"] == 0) & g["lock"]])
    }
    df = _add_base(df[df["key"].isin(refs)].copy(), refs, cols)
    # The per-subject reference image would trivially score as contact; leave it out of scoring.
    return df[~((df["P"] == 0) & df["lock"])]


def errors(df: pd.DataFrame, p: dict) -> np.ndarray:
    v = p["verticalFeature"]
    base = (df["b_yaw"], df["b_pitch"], df["b_iris_x"], df[f"b_{v}"])
    return gaze_error(
        df["yaw"].to_numpy(),
        df["pitch"].to_numpy(),
        df["iris_x"].to_numpy(),
        df[v].to_numpy(),
        tuple(np.asarray(b) for b in base),
        p["kX"],
        p["kY"],
    )


def fit(df: pd.DataFrame, vertical: str, scale: dict) -> dict:
    y = df["contact"].to_numpy()
    best = {"f1": -1.0}
    for sx in K_GRID:
        for sy in K_GRID:
            p = {
                "kX": sx / scale["iris_x"],
                "kY": sy / scale[vertical],
                "verticalFeature": vertical,
            }
            err = errors(df, p)
            for t in T_GRID:
                s = f1(y, err <= t)
                if s > best["f1"]:
                    best = {"f1": s, **p, "toleranceDeg": float(t)}
    return best


def score(df: pd.DataFrame, p: dict, label: str = "contact") -> dict:
    y = df[label].to_numpy()
    pred = errors(df, p) <= p["toleranceDeg"]
    tp, fp, fn = np.sum(y & pred), np.sum(~y & pred), np.sum(y & ~pred)
    return {
        "f1": f1(y, pred),
        "precision": float(tp / (tp + fp)) if tp + fp else 0.0,
        "recall": float(tp / (tp + fn)) if tp + fn else 0.0,
        "n": int(len(df)),
        "positives": int(y.sum()),
    }


def mpii(params: dict, cols: list[str]) -> dict:
    root = next((DATA / "mpiifacegaze").rglob("p00.txt")).parent.parent
    rng = np.random.default_rng(SEED)
    rows = []
    for ann in sorted(root.glob("p*/p*.txt")):
        lines = ann.read_text().splitlines()
        for i in rng.choice(len(lines), min(MPII_PER_PERSON, len(lines)), replace=False):
            v = lines[i].split()
            fc, gt = np.array(v[21:24], float), np.array(v[24:27], float)
            g, c = gt - fc, -fc
            angle = np.degrees(np.arccos(np.dot(g, c) / np.linalg.norm(g) / np.linalg.norm(c)))
            rows.append({"key": ann.stem, "path": str(ann.parent / v[0]), "true_angle": angle})
    meta = pd.DataFrame(rows)
    feats = extract([*meta["path"]], "mpiifacegaze")
    df = meta.merge(feats, on="path")
    df = df[df["detected"]].copy()
    # Baseline: each person's 30 frames closest to the camera direction (approximate).
    refs = {k: g.nsmallest(30, "true_angle")[cols].mean() for k, g in df.groupby("key")}
    df = _add_base(df, refs, cols)
    df["pred"] = errors(df, params) <= params["toleranceDeg"]
    bins = pd.cut(df["true_angle"], [0, 5, 10, 15, 20, 30, 90])
    by_bin = df.groupby(bins, observed=True)["pred"].agg(["mean", "count"])
    return {
        "images": int(len(df)),
        "note": "Subjects look at on-screen targets; baseline = each person's 30 frames closest "
        "to the camera direction, so the smallest-angle bins are approximate.",
        "predicted_contact_rate_by_true_angle_deg": {
            str(k): {"rate": float(r["mean"]), "count": int(r["count"])}
            for k, r in by_bin.iterrows()
        },
    }


def main() -> None:
    cols = ["yaw", "pitch", "iris_x", *VERTICAL_FEATURES]
    df = columbia(cols)
    frontal = df[df["P"] == 0]
    scale = {c: float(frontal[c].std()) for c in ["iris_x", *VERTICAL_FEATURES]}
    corr = {
        "iris_x_vs_H": float(np.corrcoef(frontal["iris_x"], frontal["H"])[0, 1]),
        **{
            f"{c}_vs_V": float(np.corrcoef(frontal[c], frontal["V"])[0, 1])
            for c in VERTICAL_FEATURES
        },
    }
    vertical = max(VERTICAL_FEATURES, key=lambda c: abs(corr[f"{c}_vs_V"]))
    print("frontal correlations", json.dumps(corr, indent=2), "-> vertical feature:", vertical)

    keys = sorted(df["key"].unique())
    cv = []
    for held in (keys[i::3] for i in range(3)):
        train, test = df[~df["key"].isin(held)], df[df["key"].isin(held)]
        p = fit(train, vertical, scale)
        cv.append({"params": p, "test": score(test, p)})
    final = fit(df, vertical, scale)
    params = {k: final[k] for k in ("kX", "kY", "verticalFeature", "toleranceDeg")}
    result = {
        "dataset": "Columbia Gaze (non-commercial; evaluation and constant choice only)",
        "subjects": len(keys),
        "positive_definition": f"vertical gaze 0 and |horizontal gaze| <= {CONE_H} deg",
        "frontal_feature_correlations": corr,
        "params": params,
        "cv_test_f1_mean": float(np.mean([c["test"]["f1"] for c in cv])),
        "cv_folds": cv,
        "all_subjects_with_final_params": score(df, final),
        "head_pose_within_15deg": score(df[df["P"].abs() <= 15], final),
        "strict_gaze_lock_with_final_params": score(df, final, label="lock"),
        "head_yaw_vs_columbia_pose_corr": float(
            np.corrcoef(df[df["lock"]]["yaw"], df[df["lock"]]["P"])[0, 1]
        ),
        "mpiifacegaze": mpii(final, cols),
    }
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "eye_contact.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k != "cv_folds"}, indent=2))


if __name__ == "__main__":
    main()

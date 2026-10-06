"""Choose the eye-contact rule constants on Columbia Gaze; report false positives on MPIIFaceGaze.

Both datasets are non-commercial: they are used only to choose and measure a few constants.
No model is trained on them.

Rule: gaze ~ (head yaw/pitch) + k * (iris offset), relative to each person's 'looking at the
camera' baseline (the runtime 5-second calibration). Eye contact if the angular error <= T.

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
K_GRID = np.arange(-150, 151, 5.0)
T_GRID = np.arange(1.0, 25.01, 0.5)
MPII_PER_PERSON = 1000
SEED = 0


def _base(rows: pd.DataFrame) -> tuple[float, float, float, float]:
    return tuple(rows[["yaw", "pitch", "iris_x", "iris_y"]].mean())


def columbia() -> pd.DataFrame:
    paths = sorted((DATA / "columbia_gaze").rglob("*.jpg"))
    df = extract(paths, "columbia")
    meta = df["path"].str.extract(COLUMBIA_NAME.pattern, flags=re.I)
    df["subject"], df["P"], df["V"], df["H"] = meta[0], *(meta[i].astype(float) for i in (1, 2, 3))
    df = df[df["detected"] & df["subject"].notna()].copy()
    df["contact"] = (df["V"] == 0) & (df["H"] == 0)
    bases = {}
    for subject, g in df.groupby("subject"):
        ref = g[(g["P"] == 0) & g["contact"]]
        if len(ref):
            bases[subject] = _base(ref)
    df = df[df["subject"].isin(bases)]
    for i, col in enumerate(("b_yaw", "b_pitch", "b_ix", "b_iy")):
        df[col] = df["subject"].map(lambda s, i=i: bases[s][i])
    # The per-subject reference image would trivially score as contact; leave it out of scoring.
    return df[~((df["P"] == 0) & df["contact"])]


def _errors(df: pd.DataFrame, kx: float, ky: float) -> np.ndarray:
    base = (
        df["b_yaw"].to_numpy(),
        df["b_pitch"].to_numpy(),
        df["b_ix"].to_numpy(),
        df["b_iy"].to_numpy(),
    )
    return gaze_error(
        df["yaw"].to_numpy(),
        df["pitch"].to_numpy(),
        df["iris_x"].to_numpy(),
        df["iris_y"].to_numpy(),
        base,
        kx,
        ky,
    )


def fit(df: pd.DataFrame) -> dict:
    y = df["contact"].to_numpy()
    best = {"f1": -1.0}
    for kx in K_GRID:
        for ky in K_GRID:
            err = _errors(df, kx, ky)
            for t in T_GRID:
                score = f1(y, err <= t)
                if score > best["f1"]:
                    best = {"f1": score, "kX": float(kx), "kY": float(ky), "toleranceDeg": float(t)}
    return best


def score(df: pd.DataFrame, p: dict) -> dict:
    y = df["contact"].to_numpy()
    pred = _errors(df, p["kX"], p["kY"]) <= p["toleranceDeg"]
    tp, fp, fn = np.sum(y & pred), np.sum(~y & pred), np.sum(y & ~pred)
    return {
        "f1": f1(y, pred),
        "precision": float(tp / (tp + fp)) if tp + fp else 0.0,
        "recall": float(tp / (tp + fn)) if tp + fn else 0.0,
        "n": int(len(df)),
        "positives": int(y.sum()),
    }


def mpii(params: dict) -> dict:
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
            rows.append({"person": ann.stem, "path": str(ann.parent / v[0]), "true_angle": angle})
    meta = pd.DataFrame(rows)
    feats = extract([*meta["path"]], "mpiifacegaze")
    df = meta.merge(feats, on="path")
    df = df[df["detected"]].copy()
    for _, g in df.groupby("person"):  # baseline: the 30 frames closest to looking at camera
        ref = g.nsmallest(30, "true_angle")
        for col, val in zip(("b_yaw", "b_pitch", "b_ix", "b_iy"), _base(ref), strict=True):
            df.loc[g.index, col] = val
    df["pred"] = _errors(df, params["kX"], params["kY"]) <= params["toleranceDeg"]
    bins = pd.cut(df["true_angle"], [0, 5, 10, 15, 20, 30, 90])
    by_bin = df.groupby(bins, observed=True)["pred"].agg(["mean", "count"])
    return {
        "images": int(len(df)),
        "note": "Subjects look at on-screen targets, so nearly all frames are true negatives; "
        "baseline = each person's 30 frames closest to the camera direction (approximate).",
        "predicted_contact_rate_by_true_angle_deg": {
            str(k): {"rate": float(r["mean"]), "count": int(r["count"])}
            for k, r in by_bin.iterrows()
        },
    }


def main() -> None:
    df = columbia()
    subjects = sorted(df["subject"].unique())
    folds = [subjects[i::3] for i in range(3)]
    cv = []
    for held in folds:
        train, test = df[~df["subject"].isin(held)], df[df["subject"].isin(held)]
        p = fit(train)
        cv.append({"params": p, "test": score(test, p)})
    final = fit(df)
    frontal = df[df["P"].abs() <= 15]
    gaze_locked = df[df["contact"]]
    result = {
        "dataset": "Columbia Gaze (non-commercial; evaluation and constant choice only)",
        "subjects": len(subjects),
        "params": {k: final[k] for k in ("kX", "kY", "toleranceDeg")},
        "cv_test_f1_mean": float(np.mean([c["test"]["f1"] for c in cv])),
        "cv_folds": cv,
        "all_subjects_with_final_params": score(df, final),
        "head_pose_within_15deg": score(frontal, final),
        "head_yaw_vs_columbia_pose_corr": float(
            np.corrcoef(gaze_locked["yaw"], gaze_locked["P"])[0, 1]
        ),
        "mpiifacegaze": mpii(final),
    }
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "eye_contact.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k != "cv_folds"}, indent=2))


if __name__ == "__main__":
    main()

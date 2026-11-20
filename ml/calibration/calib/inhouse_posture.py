import json

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

from calib.inhouse_calibrate import BASELINE_S, FPS, clip_rates, prf
from calib.inhouse_face import DERIVED, FACE_CSV
from calib.paths import RESULTS

POSE_CSV = DERIVED / "pose.csv"
SCORES_CSV = DERIVED / "behaviour_scores.csv"
OUT = RESULTS / "inhouse_posture.json"

NOSE, L_EYE, R_EYE, L_EAR, R_EAR = 0, 1, 2, 3, 4
L_SH, R_SH, L_EL, R_EL, L_WR, R_WR = 5, 6, 7, 8, 9, 10
KP_CONF = 0.5
FAR = 4.0

BEHAVIOURS = {
    "touching_face": ("touching_face",),
    "arms_crossed": ("arms_crossed",),
    "slouching": ("slouching",),
    "reading_notes": ("reading_notes_held",),
}
IGNORE_AS_NEGATIVE = {"reading_notes": ("reading_notes_desk",)}
FEATURES = [
    "face_dy",
    "face_dx",
    "face_scale",
    "roll_rel",
    "pitch_rel",
    "shoulders_visible",
    "shoulder_drop",
    "shoulder_tilt",
    "shoulder_width_rel",
    "wrists_visible",
    "elbows_visible",
    "wrist_face_dist",
    "wrist_mouth_dy",
    "wrists_crossed",
    "wrist_gap",
    "wrists_low_mid",
    "object_held",
    "object_area",
]
POSTURE_FEATURES = [
    "face_dy",
    "face_dx",
    "face_scale",
    "roll_rel",
    "pitch_rel",
    "shoulders_visible",
    "shoulder_drop",
    "shoulder_tilt",
    "shoulder_width_rel",
    "face_dy_abs",
    "face_dx_abs",
    "face_scale_dev",
    "roll_abs",
    "pitch_abs",
    "shoulder_drop_abs",
    "shoulder_width_dev",
    "shoulder_tilt_abs",
]
FEATURE_SETS = {
    "touching_face": FEATURES,
    "arms_crossed": FEATURES,
    "slouching": POSTURE_FEATURES,
    "reading_notes": FEATURES,
}
WINDOWS = (1, 3, 5, 8)
C_GRID = (0.1, 0.3, 1.0, 3.0)


def kp(df: pd.DataFrame, i: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    x, y, c = (df[f"k{i}_{a}"].to_numpy(dtype=float) for a in ("x", "y", "c"))
    vis = np.nan_to_num(c) >= KP_CONF
    return np.where(vis, x, np.nan), np.where(vis, y, np.nan), vis


def object_features(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    held, area = np.zeros(len(df)), np.zeros(len(df))
    for n, (objs, fy, fh, h, w) in enumerate(
        zip(df["objects"], df["fy"], df["fh"], df["h"], df["w"], strict=True)
    ):
        for o in json.loads(objs) if isinstance(objs, str) else []:
            if o["cls"] == "laptop":
                continue
            x1, y1, x2, y2 = o["box"]
            centre_y = (y1 + y2) / 2 / h
            if centre_y > fy + 0.3 * fh:
                held[n] = max(held[n], o["conf"])
                area[n] = max(area[n], (x2 - x1) * (y2 - y1) / (w * h))
    return held, area


def frame_features(df: pd.DataFrame) -> pd.DataFrame:
    w, h = df["w"].to_numpy(float), df["h"].to_numpy(float)
    fw_px = df["fw"].to_numpy(float) * w
    fcx, fcy = df["fx"].to_numpy(float) * w, df["fy"].to_numpy(float) * h
    mouth_y = fcy + 0.25 * df["fh"].to_numpy(float) * h
    lsx, lsy, lsv = kp(df, L_SH)
    rsx, rsy, rsv = kp(df, R_SH)
    _, _, lev = kp(df, L_EL)
    _, _, rev = kp(df, R_EL)
    lwx, lwy, lwv = kp(df, L_WR)
    rwx, rwy, rwv = kp(df, R_WR)
    both_sh = lsv & rsv
    sh_mid_x = (lsx + rsx) / 2
    sh_y = (lsy + rsy) / 2
    d_l = np.hypot(lwx - fcx, lwy - fcy) / fw_px
    d_r = np.hypot(rwx - fcx, rwy - fcy) / fw_px
    dist = np.fmin(np.nan_to_num(d_l, nan=FAR), np.nan_to_num(d_r, nan=FAR))
    side = np.sign(lsx - rsx)
    crossed = both_sh & lwv & rwv & ((lwx - sh_mid_x) * side < 0) & ((rwx - sh_mid_x) * side > 0)
    held, area = object_features(df)
    feats = pd.DataFrame(
        {
            "face_cx_px": fcx,
            "face_cy_px": fcy,
            "fw_px": fw_px,
            "shoulders_visible": both_sh.astype(float),
            "shoulder_drop_raw": np.where(both_sh, (sh_y - fcy) / fw_px, np.nan),
            "shoulder_tilt": np.where(
                both_sh, np.degrees(np.arctan2(lsy - rsy, np.abs(lsx - rsx) + 1e-6)), 0.0
            ),
            "shoulder_width_raw": np.where(both_sh, np.abs(lsx - rsx) / fw_px, np.nan),
            "wrists_visible": lwv.astype(float) + rwv.astype(float),
            "elbows_visible": lev.astype(float) + rev.astype(float),
            "wrist_face_dist": np.clip(dist, 0, FAR),
            "wrist_mouth_dy": np.clip(
                np.fmin(
                    np.nan_to_num(np.abs(lwy - mouth_y) / fw_px, nan=FAR),
                    np.nan_to_num(np.abs(rwy - mouth_y) / fw_px, nan=FAR),
                ),
                0,
                FAR,
            ),
            "wrists_crossed": crossed.astype(float),
            "wrist_gap": np.clip(np.nan_to_num(np.abs(lwx - rwx) / fw_px, nan=FAR), 0, FAR),
            "wrists_low_mid": (
                np.nan_to_num(np.abs(lwx - sh_mid_x) / fw_px, nan=FAR)
                + np.nan_to_num(np.abs(rwx - sh_mid_x) / fw_px, nan=FAR)
            )
            / 2,
            "object_held": held,
            "object_area": area,
        },
        index=df.index,
    )
    return feats


def baseline_relative(df: pd.DataFrame) -> pd.DataFrame:
    starts = df[(df["part"] == "B") & (df["t"] <= BASELINE_S)]
    cols = ["fx", "fy", "fw", "fh", "roll", "pitch", "shoulder_drop_raw", "shoulder_width_raw"]
    per_answer = starts.groupby("stem")[cols].median()
    per_session = starts.groupby("sid")[cols].median()
    base = pd.DataFrame(index=df.index, columns=cols, dtype=float)
    answers = df["part"] == "B"
    base.loc[answers] = per_answer.reindex(df.loc[answers, "stem"]).to_numpy()
    base.loc[~answers] = per_session.reindex(df.loc[~answers, "sid"]).to_numpy()
    df = df.copy()
    df["face_dy"] = (df["fy"] - base["fy"]) / base["fh"]
    df["face_dx"] = (df["fx"] - base["fx"]) / base["fw"]
    df["face_scale"] = df["fw"] / base["fw"]
    df["roll_rel"] = df["roll"] - base["roll"]
    df["pitch_rel"] = df["pitch"] - base["pitch"]
    df["shoulder_drop"] = (df["shoulder_drop_raw"] - base["shoulder_drop_raw"]).fillna(0.0)
    df["shoulder_width_rel"] = (df["shoulder_width_raw"] / base["shoulder_width_raw"]).fillna(1.0)
    df["face_dy_abs"] = df["face_dy"].abs()
    df["face_dx_abs"] = df["face_dx"].abs()
    df["face_scale_dev"] = np.log(df["face_scale"].clip(lower=1e-3)).abs()
    df["roll_abs"] = df["roll_rel"].abs()
    df["pitch_abs"] = df["pitch_rel"].abs()
    df["shoulder_drop_abs"] = df["shoulder_drop"].abs()
    df["shoulder_width_dev"] = np.log(df["shoulder_width_rel"].clip(lower=1e-3)).abs()
    df["shoulder_tilt_abs"] = df["shoulder_tilt"].abs()
    return df.dropna(subset=["face_dy", "face_scale"])


def load() -> pd.DataFrame:
    face = pd.read_csv(FACE_CSV)
    pose = pd.read_csv(POSE_CSV)
    keep = ["frame", "objects"] + [c for c in pose.columns if c.startswith("k")]
    df = face.merge(pose[keep], on="frame", how="inner")
    df = df[df["detected"].fillna(False).astype(bool)].copy()
    df["sid"] = df["person"] + "_" + df["session"]
    df = df.sort_values(["stem", "t"]).reset_index(drop=True)
    df = pd.concat([df, frame_features(df)], axis=1)
    return baseline_relative(df)


def labelled(df: pd.DataFrame, behaviour: str) -> pd.DataFrame:
    a = df[df["part"] == "A"]
    a = a[~a["clip"].isin(IGNORE_AS_NEGATIVE.get(behaviour, ()))].copy()
    a["y"] = a["clip"].isin(BEHAVIOURS[behaviour])
    return a


def smooth(df: pd.DataFrame, prob: np.ndarray, window: int) -> np.ndarray:
    s = pd.Series(prob, index=df.index)
    return s.groupby(df["stem"]).transform(lambda x: x.rolling(window, min_periods=1).mean())


def best_threshold(y: np.ndarray, p: np.ndarray) -> tuple[float, float]:
    best = (0.5, -1.0)
    for t in np.arange(0.05, 0.96, 0.025):
        pred = p >= t
        tp = np.sum(y & pred)
        f = 2 * tp / (2 * tp + np.sum(~y & pred) + np.sum(y & ~pred)) if tp else 0.0
        if f > best[1]:
            best = (float(t), float(f))
    return best


def fit(train: pd.DataFrame, features: list[str]) -> dict:
    x = train[features].to_numpy(float)
    mean, scale = x.mean(axis=0), x.std(axis=0) + 1e-6
    best = None
    for c in C_GRID:
        model = LogisticRegression(C=c, class_weight="balanced", max_iter=2000)
        model.fit((x - mean) / scale, train["y"].to_numpy())
        prob = model.predict_proba((x - mean) / scale)[:, 1]
        for window in WINDOWS:
            p = smooth(train, prob, window).to_numpy()
            t, f = best_threshold(train["y"].to_numpy(), p)
            if best is None or f > best["train_f1"]:
                best = {
                    "C": c,
                    "window": window,
                    "threshold": t,
                    "train_f1": f,
                    "model": model,
                    "mean": mean,
                    "scale": scale,
                    "features": features,
                }
    return best


def predict(p: dict, df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    x = (df[p["features"]].to_numpy(float) - p["mean"]) / p["scale"]
    prob = p["model"].predict_proba(x)[:, 1]
    smoothed = smooth(df, prob, p["window"]).to_numpy()
    return prob, smoothed


def export(p: dict) -> dict:
    return {
        "features": p["features"],
        "mean": [round(float(v), 6) for v in p["mean"]],
        "scale": [round(float(v), 6) for v in p["scale"]],
        "weights": [round(float(v), 6) for v in p["model"].coef_[0]],
        "bias": round(float(p["model"].intercept_[0]), 6),
        "smoothingFrames": p["window"],
        "smoothingFps": FPS,
        "threshold": p["threshold"],
    }


def run(df: pd.DataFrame) -> dict:
    result, scores = {}, pd.DataFrame({"frame": df["frame"]})
    for behaviour in BEHAVIOURS:
        d = labelled(df, behaviour)
        folds = []
        for held in sorted(d["person"].unique()):
            train, test = d[d["person"] != held], d[d["person"] == held]
            p = fit(train, FEATURE_SETS[behaviour])
            prob, smoothed = predict(p, test)
            y = test["y"].to_numpy()
            folds.append(
                {
                    "held_out": held,
                    "C": p["C"],
                    "window": p["window"],
                    "threshold": p["threshold"],
                    "auc_frame": float(roc_auc_score(y, prob)) if 0 < y.sum() < len(y) else None,
                    "test": prf(y, smoothed >= p["threshold"]),
                    "clip_rate": clip_rates(test, smoothed >= p["threshold"]),
                }
            )
        final = fit(d, FEATURE_SETS[behaviour])
        _, all_smoothed = predict(final, df)
        scores[behaviour] = np.round(all_smoothed, 4)
        answers = df["part"] == "B"
        result[behaviour] = {
            "lopo_f1": float(np.mean([f["test"]["f1"] for f in folds])),
            "lopo_auc": float(np.mean([f["auc_frame"] for f in folds if f["auc_frame"]])),
            "folds": folds,
            "rule": export(final),
            "answers_flag_rate_by_person": {
                p: round(
                    float(
                        (all_smoothed[answers & (df["person"] == p)] >= final["threshold"]).mean()
                    ),
                    3,
                )
                for p in sorted(df.loc[answers, "person"].unique())
            },
        }
    scores.to_csv(SCORES_CSV, index=False)
    return result


def main() -> None:
    df = load()
    result = {
        "data": {
            "frames": int(len(df)),
            "labelled_frames": int((df["part"] == "A").sum()),
            "people": sorted(df["person"].unique().tolist()),
            "evaluation": "leave one person out; per-frame logistic model on baseline-relative "
            "face and pose features, rolling-mean smoothing, threshold chosen on training people",
        },
        "behaviours": run(df),
    }
    RESULTS.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                b: {k: r[k] for k in ("lopo_f1", "lopo_auc", "answers_flag_rate_by_person")}
                for b, r in result["behaviours"].items()
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

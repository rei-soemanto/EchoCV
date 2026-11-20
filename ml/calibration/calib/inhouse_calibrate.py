import json

import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score

from calib.inhouse_face import FACE_CSV
from calib.paths import RESULTS, SHARED
from calib.rules import f1, gaze_error

BASELINE_S = 2.0
BASE_COLS = ["yaw", "pitch", "iris_x", "iris_y_corner", "smile"]
CONTACT_POS = ("upright", "smile")
CONTACT_NEG = ("looking_away",)
SMILE_POS = ("smile",)
SMILE_NEG = ("upright", "looking_away", "desk_hands", "gestures")
DOWN_POS = ("reading_notes_desk",)
DOWN_NEG = ("upright", "smile", "gestures", "desk_hands")
K_SCALES = (0.15, 0.25, 0.35, 0.5, 0.75, 1.0, 1.25)
SMILE_MAX_FPR = 0.02
DOWN_IRIS_WEIGHTS = (0.0, 1.0)
T_GRID = np.arange(4.0, 30.01, 0.5)
DOWN_GRID = np.arange(2.0, 30.01, 1.0)
WINDOWS_S = (1.0, 2.0, 3.0, 4.0)
FRACTIONS = (0.5, 0.6, 0.7, 0.8)
FPS = 5.0
OUT = RESULTS / "inhouse.json"


def load(path=FACE_CSV) -> pd.DataFrame:
    df = pd.read_csv(path)
    df = df[df["detected"].fillna(False).astype(bool)].copy()
    df["sid"] = df["person"] + "_" + df["session"]
    return df.sort_values(["stem", "t"]).reset_index(drop=True)


def add_baselines(df: pd.DataFrame) -> pd.DataFrame:
    starts = df[(df["part"] == "B") & (df["t"] <= BASELINE_S)]
    per_answer = starts.groupby("stem")[BASE_COLS].median()
    per_session = starts.groupby("sid")[BASE_COLS].median()
    base = pd.DataFrame(index=df.index, columns=BASE_COLS, dtype=float)
    answers = df["part"] == "B"
    base.loc[answers] = per_answer.reindex(df.loc[answers, "stem"]).to_numpy()
    base.loc[~answers] = per_session.reindex(df.loc[~answers, "sid"]).to_numpy()
    for c in BASE_COLS:
        df[f"b_{c}"] = base[c].astype(float)
    return df.dropna(subset=[f"b_{c}" for c in BASE_COLS])


def errors(df: pd.DataFrame, k_x: float, k_y: float) -> np.ndarray:
    base = tuple(df[f"b_{c}"].to_numpy() for c in ("yaw", "pitch", "iris_x", "iris_y_corner"))
    return gaze_error(
        df["yaw"].to_numpy(),
        df["pitch"].to_numpy(),
        df["iris_x"].to_numpy(),
        df["iris_y_corner"].to_numpy(),
        base,
        k_x,
        k_y,
    )


def prf(y: np.ndarray, pred: np.ndarray) -> dict:
    tp, fp, fn = np.sum(y & pred), np.sum(~y & pred), np.sum(y & ~pred)
    return {
        "f1": f1(y, pred),
        "precision": float(tp / (tp + fp)) if tp + fp else 0.0,
        "recall": float(tp / (tp + fn)) if tp + fn else 0.0,
        "n": int(len(y)),
        "positives": int(y.sum()),
    }


def labelled(df: pd.DataFrame, pos: tuple, neg: tuple) -> pd.DataFrame:
    d = df[df["clip"].isin(pos + neg)].copy()
    d["y"] = d["clip"].isin(pos)
    return d


def fit_contact(train: pd.DataFrame, v0: dict) -> dict:
    y = train["y"].to_numpy()
    best = {"f1": -1.0}
    for sx in K_SCALES:
        for sy in K_SCALES:
            err = errors(train, v0["kX"] * sx, v0["kY"] * sy)
            for t in T_GRID:
                s = f1(y, err <= t)
                if s > best["f1"]:
                    best = {"f1": s, "kX": v0["kX"] * sx, "kY": v0["kY"] * sy, "toleranceDeg": t}
    return best


def clip_rates(d: pd.DataFrame, pred: np.ndarray) -> dict:
    d = d.assign(pred=pred)
    return {c: round(float(g["pred"].mean()), 3) for c, g in d.groupby("clip")}


def eye_contact(df: pd.DataFrame, v0: dict) -> dict:
    d = labelled(df, CONTACT_POS, CONTACT_NEG)
    folds, v0_folds = [], []
    for held in sorted(d["person"].unique()):
        train, test = d[d["person"] != held], d[d["person"] == held]
        p = fit_contact(train, v0)
        y = test["y"].to_numpy()
        pred = errors(test, p["kX"], p["kY"]) <= p["toleranceDeg"]
        v0_pred = errors(test, v0["kX"], v0["kY"]) <= v0["toleranceDeg"]
        folds.append(
            {
                "held_out": held,
                "params": p,
                "test": prf(y, pred),
                "clip_rate": clip_rates(test, pred),
            }
        )
        v0_folds.append(
            {"held_out": held, "test": prf(y, v0_pred), "clip_rate": clip_rates(test, v0_pred)}
        )
    final = fit_contact(d, v0)
    answers = df[df["part"] == "B"]
    answer_rate = errors(answers, final["kX"], final["kY"]) <= final["toleranceDeg"]
    return {
        "positives": list(CONTACT_POS),
        "negatives": list(CONTACT_NEG),
        "lopo_f1": float(np.mean([f["test"]["f1"] for f in folds])),
        "v0_lopo_f1": float(np.mean([f["test"]["f1"] for f in v0_folds])),
        "folds": folds,
        "v0_folds": v0_folds,
        "params": {k: float(final[k]) for k in ("kX", "kY", "toleranceDeg")},
        "answers_contact_rate_by_person": {
            p: round(float(answer_rate[answers["person"] == p].mean()), 3)
            for p in sorted(answers["person"].unique())
        },
    }


def capped_threshold(d: pd.DataFrame, name: str, max_fpr: float = SMILE_MAX_FPR) -> float:
    per_person = [
        float(np.quantile(g.loc[~g["y"], name], 1.0 - max_fpr)) for _, g in d.groupby("person")
    ]
    return max(per_person) + 1e-4


def smile(df: pd.DataFrame, v0_threshold: float) -> dict:
    d = labelled(df, SMILE_POS, SMILE_NEG)
    d["smile_rel"] = d["smile"] - d["b_smile"]
    out = {"positives": list(SMILE_POS), "negatives": list(SMILE_NEG)}
    for name in ("smile", "smile_rel"):
        folds = []
        for held in sorted(d["person"].unique()):
            train, test = d[d["person"] != held], d[d["person"] == held]
            t = capped_threshold(train, name)
            y = test["y"].to_numpy()
            pred = test[name].to_numpy() >= t
            folds.append(
                {
                    "held_out": held,
                    "threshold": t,
                    "auc": float(roc_auc_score(y, test[name])) if 0 < y.sum() < len(y) else None,
                    "test": prf(y, pred),
                    "clip_rate": clip_rates(test, pred),
                }
            )
        out[name] = {
            "lopo_f1": float(np.mean([f["test"]["f1"] for f in folds])),
            "lopo_auc": float(np.mean([f["auc"] for f in folds if f["auc"] is not None])),
            "threshold": capped_threshold(d, name),
            "threshold_rule": f"false-positive rate <= {SMILE_MAX_FPR:.0%} on the non-smile "
            "clips of every training person",
            "folds": folds,
        }
    y = d["y"].to_numpy()
    out["v0_threshold_all_people"] = prf(y, d["smile"].to_numpy() >= v0_threshold)
    out["use"] = "smile_rel" if out["smile_rel"]["lopo_f1"] > out["smile"]["lopo_f1"] else "smile"
    return out


def down_score(df: pd.DataFrame, k_y: float, sign: float) -> np.ndarray:
    pitch = df["pitch"].to_numpy() - df["b_pitch"].to_numpy()
    iy = df["iris_y_corner"].to_numpy() - df["b_iris_y_corner"].to_numpy()
    return sign * (pitch + k_y * iy)


def sustained(df: pd.DataFrame, frame_flags: np.ndarray, window_s: float, frac: float):
    n = max(1, round(window_s * FPS))
    s = pd.Series(frame_flags.astype(float), index=df.index)
    rolled = s.groupby(df["stem"]).transform(lambda x: x.rolling(n, min_periods=n).mean())
    return (rolled.fillna(0.0) >= frac).to_numpy()


def fit_down(train: pd.DataFrame, k_y: float, sign: float) -> dict:
    y = train["y"].to_numpy()
    score = down_score(train, k_y, sign)
    best = {"f1": -1.0}
    for a in DOWN_GRID:
        flags = score >= a
        for w in WINDOWS_S:
            for q in FRACTIONS:
                s = f1(y, sustained(train, flags, w, q))
                if s > best["f1"]:
                    best = {"f1": s, "angleDeg": float(a), "windowS": w, "minFraction": q}
    return best


def fit_down_any(train: pd.DataFrame, k_y: float, sign: float) -> dict:
    fits = [{**fit_down(train, k_y * w, sign), "kY": k_y * w} for w in DOWN_IRIS_WEIGHTS]
    return max(fits, key=lambda f: f["f1"])


def gaze_down(df: pd.DataFrame, k_y: float) -> dict:
    d = labelled(df, DOWN_POS, DOWN_NEG)
    sign = float(np.sign(np.mean(down_score(d[d["y"]], 0.0, 1.0))) or 1.0)
    folds = []
    for held in sorted(d["person"].unique()):
        train, test = d[d["person"] != held], d[d["person"] == held]
        p = fit_down_any(train, k_y, sign)
        flags = down_score(test, p["kY"], sign) >= p["angleDeg"]
        pred = sustained(test, flags, p["windowS"], p["minFraction"])
        folds.append(
            {
                "held_out": held,
                "params": p,
                "test": prf(test["y"].to_numpy(), pred),
                "clip_rate": clip_rates(test, pred),
            }
        )
    final = fit_down_any(d, k_y, sign)
    return {
        "positives": list(DOWN_POS),
        "negatives": list(DOWN_NEG),
        "sign": sign,
        "kY": final["kY"],
        "lopo_f1": float(np.mean([f["test"]["f1"] for f in folds])),
        "folds": folds,
        "params": {k: final[k] for k in ("angleDeg", "windowS", "minFraction")},
    }


def main() -> None:
    v0 = json.loads((SHARED / "thresholds.json").read_text(encoding="utf-8"))
    df = add_baselines(load())
    eye = eye_contact(df, v0["eyeContact"])
    result = {
        "data": {
            "frames": int(len(df)),
            "people": sorted(df["person"].unique().tolist()),
            "sessions": sorted(df["sid"].unique().tolist()),
            "baseline": f"median of the first {BASELINE_S:g} s of each answer (Part A frames use "
            "the session's answers), as the in-app look-at-camera calibration",
            "evaluation": "leave one person out",
        },
        "eye_contact": eye,
        "smile": smile(df, v0["smile"]["threshold"]),
        "gaze_down": gaze_down(df, eye["params"]["kY"]),
    }
    RESULTS.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, indent=2), encoding="utf-8")
    summary = {
        "eye_contact": {k: eye[k] for k in ("lopo_f1", "v0_lopo_f1", "params")},
        "smile": {k: result["smile"][k]["lopo_f1"] for k in ("smile", "smile_rel")},
        "gaze_down": {k: result["gaze_down"][k] for k in ("lopo_f1", "params")},
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()

"""Choose the smile threshold on GENKI-4K (commercially safe, attribution required).

Run from ml/calibration/:  uv run python -m calib.smile
"""

import json

import numpy as np
from sklearn.metrics import roc_auc_score, roc_curve

from calib.features import extract
from calib.paths import DATA, RESULTS


def main() -> None:
    labels_file = next((DATA / "genki4k").rglob("labels.txt"))
    smile = [int(line.split()[0]) for line in labels_file.read_text().splitlines() if line.strip()]
    images = sorted((labels_file.parent / "files").glob("*.jpg"))
    assert len(images) == len(smile), (len(images), len(smile))

    df = extract(images, "genki4k")
    df["label"] = smile
    d = df[df["detected"]]
    y, s = d["label"].to_numpy().astype(bool), d["smile"].to_numpy()
    fpr, tpr, thr = roc_curve(y, s)
    best = int(np.argmax(tpr - fpr))
    threshold = float(thr[best])
    pred = s >= threshold
    result = {
        "dataset": "GENKI-4K",
        "images": len(df),
        "face_detection_rate": float(df["detected"].mean()),
        "score": "mean(mouthSmileLeft, mouthSmileRight)",
        "auc": float(roc_auc_score(y, s)),
        "threshold": threshold,
        "threshold_rule": "max Youden J (TPR - FPR)",
        "at_threshold": {
            "tpr": float(tpr[best]),
            "fpr": float(fpr[best]),
            "accuracy": float(np.mean(pred == y)),
        },
    }
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "smile.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

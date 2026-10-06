"""Merge calibration results into shared/thresholds.json.

Run from ml/calibration/:  uv run python -m calib.export_thresholds
"""

import json

from calib.paths import RESULTS, SHARED


def main() -> None:
    smile = json.loads((RESULTS / "smile.json").read_text(encoding="utf-8"))
    eye = json.loads((RESULTS / "eye_contact.json").read_text(encoding="utf-8"))
    out = {
        "version": "0.1.0",
        "eyeContact": {
            **eye["params"],
            "rule": "hypot((yaw-baseYaw) + kX*(irisX-baseIrisX), "
            "(pitch-basePitch) + kY*(irisY-baseIrisY)) <= toleranceDeg; "
            "baselines come from the 5-second look-at-camera calibration",
            "features": "yaw/pitch (deg) from the facial transformation matrix (R = Ry Rx Rz); "
            "iris offsets in eye-width units along the eye axis (image-right/down positive)",
            "evaluation": {
                "columbia_cv_f1": eye["cv_test_f1_mean"],
                "columbia_head_pose_within_15deg": eye["head_pose_within_15deg"],
            },
            "provenance": "Constants chosen on Columbia Gaze (non-commercial, evaluation only); "
            "false-positive check on MPIIFaceGaze (CC BY-NC-SA, evaluation only).",
        },
        "smile": {
            "score": smile["score"],
            "threshold": smile["threshold"],
            "evaluation": {"genki4k_auc": smile["auc"], **smile["at_threshold"]},
            "provenance": "GENKI-4K (public use, attribution required).",
        },
    }
    (SHARED / "thresholds.json").write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()

import json

from calib.inhouse_calibrate import BASELINE_S, FPS
from calib.inhouse_posture import KP_CONF
from calib.paths import CALIB_ROOT, RESULTS, SHARED

INHOUSE = RESULTS / "inhouse.json"
POSTURE = RESULTS / "inhouse_posture.json"
DETECTOR_LOPO = CALIB_ROOT.parent / "artifacts" / "yolo" / "v1_lopo.json"
PACE = RESULTS / "inhouse_pace.json"
DETECTOR_MIN_FRACTION = 0.5
PREDICT_CONF = 0.25


def _read(path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def eye_contact(eye: dict, inhouse: dict | None) -> dict:
    params = dict(eye["params"])
    provenance = (
        "Constants chosen on Columbia Gaze (non-commercial, evaluation only); "
        "false-positive check on MPIIFaceGaze (CC BY-NC-SA, evaluation only)."
    )
    evaluation = {
        "columbia_cv_f1": eye["cv_test_f1_mean"],
        "columbia_head_pose_within_15deg": eye["head_pose_within_15deg"],
        "mpiifacegaze_contact_rate_by_true_angle_deg": {
            k: round(v["rate"], 3)
            for k, v in eye["mpiifacegaze"]["predicted_contact_rate_by_true_angle_deg"].items()
        },
    }
    if inhouse:
        e = inhouse["eye_contact"]
        evaluation["inhouse_lopo_f1"] = round(e["lopo_f1"], 3)
        evaluation["inhouse_lopo_f1_with_columbia_constants"] = round(e["v0_lopo_f1"], 3)
        evaluation["inhouse_people"] = inhouse["data"]["people"]
        if e["lopo_f1"] > e["v0_lopo_f1"]:
            params.update({k: e["params"][k] for k in ("kX", "kY", "toleranceDeg")})
            provenance = (
                "Constants chosen on EchoCV team laptop-webcam recordings (consented, leave one "
                "person out); Columbia Gaze and MPIIFaceGaze kept as evaluation-only checks."
            )
    return {
        **params,
        "rule": "hypot((yaw-baseYaw) + kX*(irisX-baseIrisX), "
        "(pitch-basePitch) + kY*(irisY-baseIrisY)) <= toleranceDeg; "
        "baselines come from the 5-second look-at-camera calibration",
        "features": "yaw/pitch (deg) from the facial transformation matrix (R = Ry Rx Rz); "
        "irisX = iris offset along the eye-corner axis, irisY = offset perpendicular to the "
        "corner line (not the eyelids, which move with gaze); both in eye-width units, "
        "image-right/down positive, averaged over both eyes",
        "positiveDefinition": eye["positive_definition"],
        "evaluation": evaluation,
        "provenance": provenance,
    }


def smile_section(smile: dict, inhouse: dict | None) -> dict:
    out = {
        "score": smile["score"],
        "mode": "absolute",
        "threshold": smile["threshold"],
        "evaluation": {"genki4k_auc": smile["auc"], **smile["at_threshold"]},
        "provenance": "GENKI-4K (public use, attribution required).",
    }
    if inhouse:
        s = inhouse["smile"]
        out["evaluation"]["inhouse_lopo_f1"] = {
            "absolute": round(s["smile"]["lopo_f1"], 3),
            "relativeToBaseline": round(s["smile_rel"]["lopo_f1"], 3),
            "genki_threshold": round(s["v0_threshold_all_people"]["f1"], 3),
        }
        best = max(s["smile"]["lopo_f1"], s["smile_rel"]["lopo_f1"])
        if best > s["v0_threshold_all_people"]["f1"]:
            relative = s["use"] == "smile_rel"
            out["mode"] = "relativeToBaseline" if relative else "absolute"
            out["threshold"] = s[s["use"]]["threshold"]
            out["provenance"] += " Threshold re-chosen on EchoCV team recordings."
    if out["mode"] == "relativeToBaseline":
        out["rule"] = "score - baselineScore >= threshold; baseline from the calibration step"
    else:
        out["rule"] = "score >= threshold"
    return out


def gaze_down(inhouse: dict) -> dict:
    g = inhouse["gaze_down"]
    return {
        **g["params"],
        "kY": g["kY"],
        "sign": g["sign"],
        "rule": "down = sign*((pitch-basePitch) + kY*(irisY-baseIrisY)) >= angleDeg; flag "
        "reading notes below the frame when at least minFraction of the frames in the last "
        "windowS seconds are down",
        "evaluation": {"inhouse_lopo_f1": round(g["lopo_f1"], 3)},
        "provenance": "EchoCV team recordings (reading_notes_desk clips), leave one person out.",
    }


def posture(result: dict, detector: dict | None) -> dict:
    out = {
        "featureNotes": "Face features come from MediaPipe Face Landmarker (fx, fy, fw, fh as "
        "fractions of the frame, roll and pitch in degrees), relative to the calibration "
        "baseline; pose features come from YOLO26n-pose keypoints (confidence >= 0.5), with "
        "distances in face widths. probability = sigmoid(bias + sum(weights * (x - mean) / "
        "scale)), averaged over the last smoothingFrames frames, flagged when >= threshold.",
        "detector": "artifacts/yolo/v1/best.pt" if detector else "artifacts/yolo/v0/best.pt",
        "sampleFps": FPS,
        "baselineSeconds": BASELINE_S,
        "keypointConf": KP_CONF,
        "predictConf": PREDICT_CONF,
        "behaviours": {},
    }
    if detector:
        out["detectorRule"] = {
            "conf": detector["settings"]["conf"],
            "smoothingFrames": detector["settings"]["smoothing_frames"],
            "minFraction": DETECTOR_MIN_FRACTION,
            "rule": "a frame votes for a class when the detector's best box of that class has "
            "conf >= conf; flagged when at least minFraction of the last smoothingFrames frames "
            "vote",
        }
    for name, r in result["behaviours"].items():
        source = "pose_rule"
        evaluation = {"pose_rule_lopo_f1": round(r["lopo_f1"], 3)}
        if detector and name in detector["summary"]:
            d = detector["summary"][name]
            source = d["use"]
            evaluation["detector_v1_lopo_f1"] = round(d["detector_v1_lopo_f1"], 3)
            evaluation["detector_v0_lopo_f1"] = round(d["detector_v0_lopo_f1"], 3)
        out["behaviours"][name] = {"source": source, **r["rule"], "evaluation": evaluation}
    return out


def pace(result: dict) -> dict:
    low, high = result["band"]
    out = {
        "rule": "score pace on syllablesPerSecond against the band of the session language; "
        "show wordsPerMinute (speakingRateWps * 60) on the pace meter with the same "
        "language's wordsPerMinute band",
        "provisional": True,
        "provenance": f"EchoCV team Part B answers through services/speech /analyze, "
        f"{round(low * 100)}th to {round(high * 100)}th percentile per language, every person "
        "weighted equally. Typical pace of the team, not yet a rated good pace.",
    }
    for language, summary in sorted(result["languages"].items()):
        out[language] = summary
    return out


def main() -> None:
    smile = json.loads((RESULTS / "smile.json").read_text(encoding="utf-8"))
    eye = json.loads((RESULTS / "eye_contact.json").read_text(encoding="utf-8"))
    inhouse = _read(INHOUSE)
    out = {
        "version": "0.3.0" if inhouse else "0.1.0",
        "eyeContact": eye_contact(eye, inhouse),
        "smile": smile_section(smile, inhouse),
    }
    if inhouse:
        out["gazeDown"] = gaze_down(inhouse)
    posture_result = _read(POSTURE)
    if posture_result:
        out["posture"] = posture(posture_result, _read(DETECTOR_LOPO))
    pace_result = _read(PACE)
    if pace_result:
        out["version"] = "0.5.0"
        out["pace"] = pace(pace_result)
    (SHARED / "thresholds.json").write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in out.items() if k != "posture"}, indent=2))


if __name__ == "__main__":
    main()

import json
from collections import Counter

from common.paths import ARTIFACTS, DATA, REPO_ROOT
from report import CALIB, _datasets, _load, _num

OUT = REPO_ROOT / "docs" / "model-report-v1.md"
AUTOLABEL = DATA / "inhouse" / "derived" / "autolabel_summary.json"


def _folds(folds: list[dict]) -> str:
    return ", ".join(f"{f['held_out']} {_num(f['test']['f1'], 2)}" for f in folds)


def data_section(inhouse: dict) -> list[str]:
    d = inhouse["data"]
    return [
        "## Data",
        "",
        f"- {len(d['people'])} team members ({', '.join(d['people'])}), "
        f"{len(d['sessions'])} sessions, recorded on their own devices with camera effects off "
        "and consent v1.0 (analysis, model training).",
        "- Part A: 10 behaviour clips of about 30 s per session. Part B: interview answers "
        "of 1 to 1.5 min in Indonesian and English.",
        f"- {d['frames']:,} frames sampled at 5 fps with a face found; MediaPipe Face "
        "Landmarker and YOLO26n-pose features extracted once and shared by every model.",
        f"- Baseline: {d['baseline']}.",
        "- Evaluation: leave one person out (LOPO). Each number is the mean over the four "
        "held-out people; nothing about the held-out person is used to pick constants, "
        "weights or thresholds.",
        "",
    ]


def face_section(inhouse: dict) -> list[str]:
    e, s, g = inhouse["eye_contact"], inhouse["smile"], inhouse["gaze_down"]
    p = e["params"]
    return [
        "## Eye contact, smile and gaze down",
        "",
        "| Signal | v0 F1 | v1 LOPO F1 | Per held-out person (v1) |",
        "|---|---|---|---|",
        f"| Eye contact | {_num(e['v0_lopo_f1'])} | **{_num(e['lopo_f1'])}** "
        f"| {_folds(e['folds'])} |",
        f"| Smile (relative to baseline) | {_num(s['v0_threshold_all_people']['f1'])} "
        f"| **{_num(s['smile_rel']['lopo_f1'])}** | {_folds(s['smile_rel']['folds'])} |",
        f"| Gaze down (notes on the desk) | — | **{_num(g['lopo_f1'])}** | {_folds(g['folds'])} |",
        "",
        "- v0 constants are fixed, so their F1 is measured on all four people.",
        f"- **Eye contact**: kX {p['kX']:.1f}, kY {p['kY']:.1f}, tolerance "
        f"{p['toleranceDeg']} deg, now chosen on consented team recordings instead of "
        "Columbia Gaze. Positives are the `upright` and `smile` clips, negatives "
        "`looking_away`.",
        f"- **Smile**: the score minus the person's calibration baseline, threshold "
        f"{s['smile_rel']['threshold']:.4f} ({s['smile_rel']['threshold_rule']}). Ranking is "
        f"good (LOPO AUC {_num(s['smile_rel']['lopo_auc'])}) but the F1 is held down by the "
        "strict false-positive cap and by frames inside smile clips with no smile. Smile "
        "stays feedback only and is not in the overall score (BR-09).",
        f"- **Gaze down**: pitch below the baseline by {g['params']['angleDeg']:g} deg or more "
        f"in at least {g['params']['minFraction']:.0%} of the frames of the last "
        f"{g['params']['windowS']:g} s. It misses people who read by moving only their eyes.",
        "",
    ]


def posture_section(posture: dict, lopo: dict | None) -> list[str]:
    lines = [
        "## Behaviours: pose rule against detector",
        "",
        "The pose rule is a per-behaviour logistic model on calibration-relative face and "
        "YOLO26n-pose features, smoothed over a few frames, with weights exported to "
        "`shared/thresholds.json` so the browser runs the same rule. The detector is YOLO26n "
        "fine-tuned from v0. Frame F1 is after the same smoothing for both.",
        "",
        "| Behaviour | Pose rule LOPO F1 | Pose rule AUC | Detector v0 F1 | Detector v1 F1 "
        "| Shipped |",
        "|---|---|---|---|---|---|",
    ]
    for name, b in posture["behaviours"].items():
        d = lopo["summary"].get(name, {}) if lopo else {}
        lines.append(
            f"| {name} | {_num(b['lopo_f1'])} | {_num(b['lopo_auc'])} "
            f"| {_num(d.get('detector_v0_lopo_f1'))} | {_num(d.get('detector_v1_lopo_f1'))} "
            f"| {d.get('use', 'pose_rule').replace('_', ' ')} |"
        )
    return [*lines, ""]


def detector_section(lopo: dict | None) -> list[str]:
    m = _load(ARTIFACTS / "yolo" / "v1" / "metrics.json")
    lines = ["## Behaviour detector v1 (YOLO26n)", ""]
    if not (lopo and m):
        return [*lines, "_Not trained yet._", ""]
    s = lopo["settings"]
    lines += [
        f"Fine-tuned from v0 with the first {s['freeze']} layers frozen, lr0 {s['lr0']}, on "
        "auto-labelled in-house frames plus a replay sample of the v0 training data. The "
        f"final model is trained on all four people for {m['epochs']} epochs (the mean best "
        "epoch of the LOPO folds).",
        "",
        "| Held-out person | Best epoch | v0 mAP50 | v1 mAP50 | v1 mAP50 on v0 test_rf |",
        "|---|---|---|---|---|",
    ]
    for f in lopo["folds"]:
        lines.append(
            f"| {f['held_out']} | {f['best_epoch']} | {_num(f['map_held_out']['v0']['mAP50'])} "
            f"| {_num(f['map_held_out']['v1']['mAP50'])} "
            f"| {_num(f['forgetting_test_rf']['mAP50'])} |"
        )
    lines += [
        "",
        "Forgetting check on the v0 test set (public Roboflow images, no reading_notes):",
        "",
        "| Class | v0 mAP50 | v1 mAP50 |",
        "|---|---|---|",
    ]
    for c, r in m["v0_test_rf"]["per_class"].items():
        v1 = m["test_rf"]["per_class"].get(c, {})
        lines.append(f"| {c} | {_num(r['mAP50'])} | {_num(v1.get('mAP50'))} |")
    lines += [
        f"| all | {_num(m['v0_test_rf']['mAP50'])} | {_num(m['test_rf']['mAP50'])} |",
        "",
        "v1 is promoted: it is used only for `reading_notes`, where it wins clearly on held-out "
        "people, and the small arms_crossed drop on the public set does not reach the app "
        "because arms_crossed comes from the pose rule.",
    ]
    parity = _load(ARTIFACTS / "yolo" / "v1" / "onnx_parity.json")
    if parity:
        lines += [
            "",
            f"ONNX export parity: **{'pass' if parity['pass'] else 'FAIL'}**: "
            f"{parity['matched_in_onnx_iou>=0.9']}/{parity['pt_detections']} PyTorch detections "
            f"matched in ONNX (IoU >= 0.9) on {parity['images']} labelled images; max "
            f"confidence difference {parity['max_conf_diff']:.3f}.",
        ]
    auto = _load(AUTOLABEL)
    if auto:
        kept = Counter()
        for key, n in auto["kept"].items():
            kept[key.split(":")[1]] += n
        lines += [
            "",
            "Auto-labelled frames (the clip name is the label; a frame is kept only when the "
            "pose rule agrees and a box can be built): "
            + ", ".join(f"{k} {n:,}" for k, n in sorted(kept.items()))
            + ".",
        ]
    lines += [
        "",
        "Training data:",
        "",
        *_datasets(_load(ARTIFACTS / "yolo" / "v1" / "datasets.json")),
    ]
    return [*lines, ""]


def speech_section() -> list[str]:
    m = _load(ARTIFACTS / "whisper" / "inhouse_metrics.json")
    lines = ["## Filler-aware Whisper on real speech", ""]
    if not m:
        return [
            *lines,
            "_Waiting for the corrected transcripts._ The answers and Part A clips are cut at "
            "pauses into segments of 25 s or less, drafted with Whisper v0, and each person "
            "corrects their own drafts. The real Indonesian filler F1 and WER, and the "
            "decision on Whisper v1, will be added here.",
            "",
        ]
    return [*lines, "```json", json.dumps(m.get("summary", m), indent=2), "```", ""]


def main() -> None:
    inhouse = _load(CALIB / "inhouse.json")
    posture = _load(CALIB / "inhouse_posture.json")
    lopo = _load(ARTIFACTS / "yolo" / "v1_lopo.json")
    lines = [
        "# EchoCV model report v1",
        "",
        "*Generated by `ml/report_v1.py` from the metrics files in `ml/artifacts/` and "
        "`ml/calibration/results/`.*",
        "",
        "v1 adds the team's own laptop-webcam recordings to the public data used by v0 "
        "(`docs/model-report-v0.md`). Every number below is measured on a person the model "
        "did not see.",
        "",
        *data_section(inhouse),
        *face_section(inhouse),
        *posture_section(posture, lopo),
        *detector_section(lopo),
        *speech_section(),
        "## Known gaps",
        "",
        "- **Four people only.** The data comes from four team members, with little variety "
        "in faces, lighting, rooms and webcams, so the numbers are likely optimistic. The "
        "third sessions and new participants are kept back as an untouched test set.",
        "- **Slouching is weak** (pose rule LOPO F1 below the other behaviours). People slouch "
        "in different directions and laptop webcams show little of the torso.",
        "- **arms_crossed** depends on the arms being in frame; with a close webcam only the "
        "upper chest shows.",
        "- **Gaze down** misses people who look down with their eyes but not their head.",
        "- **Clip labels are noisy.** Every frame of a clip gets the clip's label, including "
        "frames where the behaviour pauses.",
        "- **LiteRT (.tflite) export of detector v1 is pending**: run "
        "`ml/yolo/export_litert.ipynb` in Colab.",
        "",
    ]
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print("wrote", OUT)


if __name__ == "__main__":
    main()

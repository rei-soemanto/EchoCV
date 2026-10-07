"""Compile metrics.json / datasets.json from every v0 model into docs/model-report-v0.md.

Run from ml/:  uv run python report.py
"""

import json
from pathlib import Path

from common.paths import ARTIFACTS, REPO_ROOT

OUT = REPO_ROOT / "docs" / "model-report-v0.md"
CALIB = Path(__file__).parent / "calibration" / "results"


def _load(path: Path) -> dict | None:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def _pct(x) -> str:
    return "—" if x is None else f"{x:.1%}"


def _num(x, d: int = 3) -> str:
    return "—" if x is None else f"{x:.{d}f}"


def _datasets(prov: dict | None) -> list[str]:
    if not prov:
        return ["_No provenance file yet._"]
    lines = ["| Dataset | Licence | Commercial | Use | Caveat |", "|---|---|---|---|---|"]
    for d in prov["datasets"]:
        lines.append(
            f"| [{d['name']}]({d['url']}) | {d['licence']} | {'yes' if d['commercial'] else 'no'} "
            f"| {d['use']} | {d['caveat']} |"
        )
    return lines


def yolo_section() -> list[str]:
    m = _load(ARTIFACTS / "yolo" / "v0" / "metrics.json")
    lines = ["## Behaviour detector (YOLO26n)", ""]
    if not m:
        return [*lines, "_Not trained yet._", ""]
    lines += [
        f"Selected run: **{m['selected_variant']}** ({m['selection_metric']}).",
        "",
        "| Run | val (Roboflow) mAP50 | val mAP50-95 |",
        "|---|---|---|",
    ]
    for v, r in m["val_rf"].items():
        lines.append(f"| {v} | {_num(r['mAP50'])} | {_num(r['mAP50-95'])} |")
    for split in ("test_rf", "test_coco"):
        t = m[split]
        lines += [
            "",
            f"**{split}**: mAP50 {_num(t['mAP50'])}, mAP50-95 {_num(t['mAP50-95'])}",
            "",
            "| Class | Precision | Recall | mAP50 | mAP50-95 |",
            "|---|---|---|---|---|",
        ]
        for c, r in t["per_class"].items():
            lines.append(
                f"| {c} | {_num(r['precision'])} | {_num(r['recall'])} | {_num(r['mAP50'])} "
                f"| {_num(r['mAP50-95'])} |"
            )
    parity = _load(ARTIFACTS / "yolo" / "v0" / "onnx_parity.json")
    if parity:
        lines += [
            "",
            f"ONNX export parity: **{'pass' if parity['pass'] else 'FAIL'}**: "
            f"{parity['matched_in_onnx_iou>=0.9']}/{parity['pt_detections']} PyTorch detections "
            f"matched in ONNX (IoU >= 0.9) on {parity['images']} labelled test images; max "
            f"confidence difference {parity['max_conf_diff']:.3f}.",
        ]
    lines += [
        "",
        "Training data:",
        "",
        *_datasets(_load(ARTIFACTS / "yolo" / "v0" / "datasets.json")),
    ]
    return [*lines, ""]


def whisper_section() -> list[str]:
    base = _load(ARTIFACTS / "whisper" / "baseline_metrics.json")
    v0 = _load(ARTIFACTS / "whisper" / "v0" / "metrics.json")
    lines = ["## Filler-aware Whisper (large-v3-turbo + LoRA)", ""]
    if not (base or v0):
        return [*lines, "_Not evaluated yet._", ""]
    lines += [
        "| Test set | Stock filler F1 | v0 filler F1 | v0 precision | v0 recall "
        "| Stock WER | v0 WER |",
        "|---|---|---|---|---|---|---|",
    ]
    for name in (v0 or base)["sets"]:
        b = base["sets"][name] if base else None
        n = v0["sets"][name] if v0 else None
        bf = b["fillers"]["all"] if b else {}
        nf = n["fillers"]["all"] if n else {}
        lines.append(
            f"| {name} | {_num(bf.get('f1'))} | {_num(nf.get('f1'))} | {_num(nf.get('precision'))} "
            f"| {_num(nf.get('recall'))} | {_pct(b and b['wer'])} | {_pct(n and n['wer'])} |"
        )
    sel = _load(ARTIFACTS / "whisper" / "v0" / "lora" / "selection.json")
    if sel:
        lines += ["", f"Checkpoint: step {sel['selected_step']} ({sel['rule']})."]
    lines += [
        "",
        "Stock and v0 use the same decoding (greedy, filler-safe suppress list, output length "
        "capped by audio duration). `fleurs_test` is original FLEURS read speech: its WER is the "
        "Indonesian regression check; its filler F1 rests on only a handful of fillers.",
    ]
    parity = _load(ARTIFACTS / "whisper" / "v0" / "ct2_parity.json")
    if parity:
        hf, fw = parity["hf"], parity["faster_whisper_cpu_int8"]
        lines += [
            "",
            f"CTranslate2 int8 (faster-whisper) parity: **{'pass' if parity['pass'] else 'FAIL'}** "
            f"on {parity['rows']} test utterances: filler F1 {_num(fw['filler_f1'])} vs HF "
            f"{_num(hf['filler_f1'])}, WER {_pct(fw['wer'])} vs {_pct(hf['wer'])}.",
        ]
    prov = _load(ARTIFACTS / "whisper" / "v0" / "datasets.json")
    return [*lines, "", "Training data:", "", *_datasets(prov), ""]


def calibration_section() -> list[str]:
    smile = _load(CALIB / "smile.json")
    eye = _load(CALIB / "eye_contact.json")
    lines = ["## Eye-contact and smile thresholds", ""]
    if smile:
        lines.append(
            f"- **Smile** (GENKI-4K, {smile['images']} images, "
            f"faces found {_pct(smile['face_detection_rate'])}): "
            f"AUC {_num(smile['auc'])}; threshold {_num(smile['threshold'])} gives TPR "
            f"{_pct(smile['at_threshold']['tpr'])}, FPR {_pct(smile['at_threshold']['fpr'])}."
        )
    if eye:
        p, hp = eye["params"], eye["head_pose_within_15deg"]
        rates = eye["mpiifacegaze"]["predicted_contact_rate_by_true_angle_deg"]
        lines += [
            f"- **Eye contact** (Columbia Gaze, {eye['subjects']} subjects, evaluation only; "
            f"positive = {eye['positive_definition']}): kX {p['kX']:.0f}, kY {p['kY']:.0f} "
            f"({p['verticalFeature']}), tolerance {p['toleranceDeg']} deg. Subject-wise CV F1 "
            f"{_num(eye['cv_test_f1_mean'])}; with head pose within 15 deg F1 {_num(hp['f1'])} "
            f"(precision {_pct(hp['precision'])}, recall {_pct(hp['recall'])}). Head yaw vs "
            f"Columbia pose r = {_num(eye['head_yaw_vs_columbia_pose_corr'])}.",
            "- **Laptop-webcam check** (MPIIFaceGaze, evaluation only): share of frames the rule "
            "calls eye contact, by true angle between gaze and camera: "
            + ", ".join(f"{k} deg {_pct(v['rate'])}" for k, v in rates.items())
            + ". Looking at the screen (15+ deg below the camera) is mostly rejected; telling "
            "5 deg from 10 deg is not reliable with MediaPipe iris landmarks.",
        ]
    else:
        lines.append("- **Eye contact**: _waiting for the Columbia Gaze download._")
    return [*lines, ""]


def main() -> None:
    lines = [
        "# EchoCV model report v0",
        "",
        "*Generated by `ml/report.py` from the metrics files in `ml/artifacts/` and "
        "`ml/calibration/results/`.*",
        "",
        "v0 is trained on public, commercially safe data plus synthetic Indonesian fillers. It "
        "proves the pipeline end to end; the numbers below are not yet measured on real "
        "Indonesian mock interviews.",
        "",
        *yolo_section(),
        *whisper_section(),
        *calibration_section(),
        "## Known gaps",
        "",
        "- **No real Indonesian filler audio.** Indonesian filler scores are on synthetic speech "
        "(AMI filler clips spliced into FLEURS read speech; 'eee' approximated by stretched 'uh').",
        "- **`reading_notes`** comes only from COCO photos of people looking at a phone or book.",
        "- **`slouching`** comes from a mostly side-view sitting-posture set; webcam frames are "
        "frontal.",
        "- **Eye-contact constants** are chosen on non-commercial gaze data (evaluation only).",
        "- **Detector test scores are optimistic.** The Roboflow sets reuse the same few people "
        "across train/val/test, and the COCO test split has only 23 images.",
        "- **DisfluencySpeech filler F1 swung between 0.33 and 0.87 across checkpoints** (one "
        "speaker, 39 validation fillers), so single numbers on it are noisy.",
        "- **LiteRT (.tflite) export is pending**: run `ml/yolo/export_litert.ipynb` in Colab "
        "(the export needs Linux).",
        "",
        "## What v1 needs from team recordings",
        "",
        "- 3–10 h of verbatim-transcribed Indonesian answers with real `eee` / `hmm` / `em` "
        "fillers, for training and for a real filler F1.",
        "- Laptop-webcam frames of all four behaviours (a few hundred to ~1,500 labelled "
        "frames), especially `reading_notes` and frontal `slouching`.",
        "- HR practitioner ratings of held-out interviews to calibrate `shared/rubric.json`.",
        "",
    ]
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print("wrote", OUT)


if __name__ == "__main__":
    main()

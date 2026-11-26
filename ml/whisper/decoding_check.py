import argparse
import json
from collections import defaultdict

import jiwer

from common.paths import ARTIFACTS, SHARED
from whisper.infer import for_wer
from whisper.inhouse_draft import TRANSCRIPTS, model_language, read_tsv
from whisper.inhouse_segments import RAW

MODEL = ARTIFACTS / "whisper" / "v0" / "ct2"
OUT = ARTIFACTS / "whisper" / "decoding_check.json"
SR = 16000
LOOSE_VAD = {"threshold": 0.35, "speech_pad_ms": 400}
VARIANTS = {
    "current": {"beam": None, "vad": {}},
    "beam5": {"beam": 5, "vad": {}},
    "loose_vad": {"beam": None, "vad": LOOSE_VAD},
    "beam5_loose_vad": {"beam": 5, "vad": LOOSE_VAD},
}


def speech_settings() -> dict:
    return json.loads((SHARED / "speech.json").read_text(encoding="utf-8"))


def checked_answers() -> dict[str, str]:
    answers = {}
    for tsv in sorted(TRANSCRIPTS.glob("*_answer*.tsv")):
        rows = read_tsv(tsv)
        if rows and all(r.get("checked") == "yes" for r in rows):
            answers[tsv.stem] = " ".join(r["verbatim"] for r in rows if r["verbatim"].strip())
    return answers


def answer_files() -> dict[str, str]:
    from inhouse.inventory import read_inventory

    return {
        e["file"].split("/")[-1].rsplit(".", 1)[0]: str(RAW / e["file"])
        for e in read_inventory()
        if e["part"] == "B"
    }


def error_counts(refs: list[str], hyps: list[str]) -> dict:
    pairs = [(for_wer(r), for_wer(h)) for r, h in zip(refs, hyps, strict=True) if for_wer(r)]
    if not pairs:
        return {"answers": 0}
    out = jiwer.process_words([p[0] for p in pairs], [p[1] for p in pairs])
    words = out.hits + out.substitutions + out.deletions
    return {
        "answers": len(pairs),
        "reference_words": words,
        "wer": round(out.wer, 4),
        "substitution_rate": round(out.substitutions / words, 4),
        "deletion_rate": round(out.deletions / words, 4),
        "insertion_rate": round(out.insertions / words, 4),
    }


def transcribe(model, audio, language: str, variant: dict, cfg: dict, suppress: list[int]) -> str:
    from faster_whisper.vad import VadOptions

    vad = cfg["vad"]
    options = VadOptions(
        threshold=variant["vad"].get("threshold", vad["threshold"]),
        min_speech_duration_ms=vad["minSpeechMs"],
        min_silence_duration_ms=vad["minSilenceMs"],
        speech_pad_ms=variant["vad"].get("speech_pad_ms", vad["speechPadMs"]),
    )
    segments, _ = model.transcribe(
        audio,
        language=model_language(language),
        suppress_tokens=suppress,
        word_timestamps=True,
        condition_on_previous_text=False,
        vad_filter=True,
        vad_parameters=options,
        beam_size=variant["beam"] or cfg["whisperBeamSize"],
    )
    return " ".join(w.word.strip() for s in segments for w in s.words or [])


def main() -> None:
    from faster_whisper import WhisperModel
    from faster_whisper.audio import decode_audio

    ap = argparse.ArgumentParser()
    ap.add_argument("--device", default="cuda", choices=["cuda", "cpu"])
    args = ap.parse_args()
    refs = checked_answers()
    if not refs:
        raise SystemExit(
            "no fully checked answers yet: import corrections with whisper.inhouse_review"
        )
    files = answer_files()
    stems = [s for s in refs if s in files]
    cfg = speech_settings()
    suppress = json.loads((MODEL / "suppress_tokens.json").read_text(encoding="utf-8"))
    compute = "int8_float16" if args.device == "cuda" else "int8"
    model = WhisperModel(str(MODEL), device=args.device, compute_type=compute)
    audio = {s: decode_audio(files[s], sampling_rate=SR) for s in stems}
    report = {"answers": len(stems), "variants": {}}
    for name, variant in VARIANTS.items():
        hyps = {
            s: transcribe(model, audio[s], s.rsplit("_", 1)[-1], variant, cfg, suppress)
            for s in stems
        }
        groups = defaultdict(list)
        for s in stems:
            for key in ("all", f"language:{s.rsplit('_', 1)[-1]}"):
                groups[key].append(s)
        report["variants"][name] = {
            key: error_counts([refs[s] for s in group], [hyps[s] for s in group])
            for key, group in sorted(groups.items())
        }
        a = report["variants"][name]["all"]
        print(
            f"{name:16} WER {a['wer']:.3f}  wrong {a['substitution_rate']:.3f}  "
            f"missing {a['deletion_rate']:.3f}  extra {a['insertion_rate']:.3f}",
            flush=True,
        )
    OUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

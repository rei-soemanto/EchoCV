"""Evaluate stock turbo (baseline) or the fine-tuned LoRA on the held-out test sets.

Run from ml/:
  uv run python -m whisper.evaluate --model base       # -> artifacts/whisper/baseline_metrics.json
  uv run python -m whisper.evaluate --model lora       # -> artifacts/whisper/v0/metrics.json
"""

import argparse
import json

import torch
from peft import PeftModel
from transformers import WhisperForConditionalGeneration, WhisperProcessor

from common.paths import ARTIFACTS, WHISPER_BASE
from whisper.common import read_manifest
from whisper.infer import score, transcribe
from whisper.tokens import filler_safe_suppress

TEST_SETS = ["ami_test", "disfl_test", "fleurs_test", "fleurs_synth_test"]
V0 = ARTIFACTS / "whisper" / "v0"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", choices=["base", "lora"], required=True)
    ap.add_argument("--limit", type=int, default=0, help="rows per test set (0 = all)")
    args = ap.parse_args()

    processor = WhisperProcessor.from_pretrained(WHISPER_BASE)
    model = WhisperForConditionalGeneration.from_pretrained(
        WHISPER_BASE, dtype=torch.bfloat16, attn_implementation="sdpa"
    )
    suppress = filler_safe_suppress(
        processor.tokenizer, list(model.generation_config.suppress_tokens)
    )
    if args.model == "lora":
        model = PeftModel.from_pretrained(model, V0 / "lora").merge_and_unload()
    model.to("cuda")

    report, samples = {}, {}
    for name in TEST_SETS:
        rows = read_manifest(name)
        if args.limit:
            rows = rows[: args.limit]
        hyps = transcribe(model, processor, rows, suppress)
        report[name] = score(rows, hyps)
        samples[name] = [
            {"ref": r["text"], "hyp": h} for r, h in zip(rows[:15], hyps[:15], strict=True)
        ]
        f = report[name]["fillers"]["all"]
        print(
            f"{name}: filler F1 {f['f1']:.3f} (P {f['precision']:.3f} R {f['recall']:.3f}) "
            f"WER {report[name]['wer']:.3f}"
        )

    out = (
        ARTIFACTS / "whisper" / "baseline_metrics.json"
        if args.model == "base"
        else V0 / "metrics.json"
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(
            {"model": args.model, "sets": report, "samples": samples}, indent=2, ensure_ascii=False
        ),
        encoding="utf-8",
    )
    print("wrote", out)


if __name__ == "__main__":
    main()

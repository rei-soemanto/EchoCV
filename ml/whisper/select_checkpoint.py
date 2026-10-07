"""Pick the final LoRA checkpoint: best validation filler F1 among checkpoints whose WER stays
within the guard (filler F1 alone can peak where the model starts looping or over-inserting).

Run from ml/ after training:  uv run python -m whisper.select_checkpoint
"""

import json
import shutil

from whisper.train_lora import OUT

# Ceilings on validation WER. Stock turbo on the matching test sets: AMI 16.6%, FLEURS-id 7.1%.
AMI_WER_MAX = 0.20
FLEURS_WER_MAX = 0.081  # stock + 1 point (the plan's Indonesian regression budget)


def main() -> None:
    log = [json.loads(line) for line in open(OUT / "train_log.jsonl", encoding="utf-8")]
    log = [r for r in log if (OUT / "lora_steps" / f"step{r['step']}").exists()]
    ok = [
        r
        for r in log
        if r["by_source"]["ami"]["wer"] <= AMI_WER_MAX
        and r["by_source"]["fleurs"]["wer"] <= FLEURS_WER_MAX
    ]
    best = max(ok or log, key=lambda r: r["val_filler_f1"])
    if not ok:
        print("warning: no checkpoint passed the WER guard; using the best filler F1")
    dst = OUT / "lora"
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(OUT / "lora_steps" / f"step{best['step']}", dst)
    summary = {
        "selected_step": best["step"],
        "rule": f"max val filler F1 with AMI WER <= {AMI_WER_MAX}, FLEURS WER <= {FLEURS_WER_MAX}",
        "candidates": [
            {
                "step": r["step"],
                "filler_f1": round(r["val_filler_f1"], 4),
                "ami_wer": round(r["by_source"]["ami"]["wer"], 4),
                "fleurs_wer": round(r["by_source"]["fleurs"]["wer"], 4),
                "passes_guard": r in ok,
            }
            for r in log
        ],
    }
    (dst / "selection.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()

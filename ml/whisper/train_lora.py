"""LoRA fine-tune of whisper-large-v3-turbo to keep fillers, sized for a 4 GB RTX 3050 Ti.

Stage 1 (default): encoder frozen and run under no_grad; LoRA on the 4 decoder layers only.
Stage 2 (--encoder-lora N): also LoRA on the top N encoder layers, with gradient checkpointing.

Run from ml/:
  uv run python -m whisper.train_lora --smoke          # 50 steps, checks VRAM fit
  uv run python -m whisper.train_lora                  # full run, resumes from lora_last/
"""

import argparse
import json
import random
import time
from functools import partial

import numpy as np
import torch
from peft import LoraConfig, PeftModel, get_peft_model
from torch.utils.data import DataLoader, Dataset
from transformers import (
    WhisperForConditionalGeneration,
    WhisperProcessor,
    get_linear_schedule_with_warmup,
)

from common.paths import ARTIFACTS, WHISPER_BASE
from whisper.audio import load
from whisper.common import read_manifest
from whisper.infer import score, transcribe
from whisper.tokens import filler_safe_suppress

OUT = ARTIFACTS / "whisper" / "v0"
MAX_LABEL_TOKENS = 440
SEED = 0


class SpeechSet(Dataset):
    def __init__(self, rows, processor, augment: bool):
        self.rows, self.fe, self.tok, self.augment = (
            rows,
            processor.feature_extractor,
            processor.tokenizer,
            augment,
        )
        conv = self.tok.convert_tokens_to_ids
        self.prefix = {
            lang: [
                conv("<|startoftranscript|>"),
                conv(f"<|{lang}|>"),
                conv("<|transcribe|>"),
                conv("<|notimestamps|>"),
            ]
            for lang in ("id", "en")
        }
        self.eot = self.tok.eos_token_id

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, i):
        r = self.rows[i]
        feats = self.fe(load(r["audio"]), sampling_rate=16_000, return_tensors="np").input_features[
            0
        ]
        if self.augment:
            feats = spec_augment(feats)
        ids = self.prefix[r["language"]] + self.tok.encode(
            " " + r["text"], add_special_tokens=False
        )
        ids = ids[:MAX_LABEL_TOKENS] + [self.eot]
        return torch.from_numpy(feats), torch.tensor(ids)


def spec_augment(feats: np.ndarray, p: float = 0.5) -> np.ndarray:
    """Light SpecAugment: two time masks (<=40 frames) and two frequency masks (<=15 bins)."""
    if random.random() > p:
        return feats
    feats = feats.copy()
    fill = feats.mean()
    for _ in range(2):
        t = random.randint(0, 40)
        t0 = random.randint(0, feats.shape[1] - t)
        feats[:, t0 : t0 + t] = fill
        f = random.randint(0, 15)
        f0 = random.randint(0, feats.shape[0] - f)
        feats[f0 : f0 + f, :] = fill
    return feats


def collate(batch, pad_id: int):
    feats = torch.stack([b[0] for b in batch])
    n = max(len(b[1]) for b in batch) - 1
    dec_in = torch.full((len(batch), n), pad_id)
    labels = torch.full((len(batch), n), -100)
    for i, (_, ids) in enumerate(batch):
        dec_in[i, : len(ids) - 1] = ids[:-1]
        labels[i, : len(ids) - 1] = ids[1:]
    return feats, dec_in, labels


def lora_targets(encoder_layers: int, n_encoder: int) -> str:
    dec = (
        r"model\.decoder\.layers\.\d+\."
        r"((self_attn|encoder_attn)\.(q_proj|k_proj|v_proj|out_proj)|fc1|fc2)"
    )
    if not encoder_layers:
        return rf".*{dec}"
    top = "|".join(str(i) for i in range(n_encoder - encoder_layers, n_encoder))
    enc = rf"model\.encoder\.layers\.({top})\.self_attn\.(q_proj|k_proj|v_proj|out_proj)"
    return rf".*({dec}|{enc})"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--smoke", action="store_true")
    ap.add_argument("--epochs", type=float, default=3)
    ap.add_argument("--lr", type=float, default=5e-4)
    ap.add_argument("--batch", type=int, default=4)
    ap.add_argument("--accum", type=int, default=4)
    ap.add_argument("--eval-every", type=int, default=500)
    ap.add_argument("--encoder-lora", type=int, default=0)
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()
    random.seed(SEED)
    torch.manual_seed(SEED)
    out = OUT.__class__(args.out)
    out.mkdir(parents=True, exist_ok=True)

    processor = WhisperProcessor.from_pretrained(WHISPER_BASE)
    model = WhisperForConditionalGeneration.from_pretrained(
        WHISPER_BASE, dtype=torch.bfloat16, attn_implementation="sdpa"
    )
    model.config.use_cache = False
    suppress = filler_safe_suppress(
        processor.tokenizer, list(model.generation_config.suppress_tokens)
    )
    (out / "suppress_tokens.json").write_text(json.dumps(suppress), encoding="utf-8")

    last = out / "lora_last"
    if (last / "adapter_config.json").exists():
        model = PeftModel.from_pretrained(model, last, is_trainable=True)
        print("resuming from", last)
    else:
        cfg = LoraConfig(
            r=32,
            lora_alpha=64,
            lora_dropout=0.05,
            target_modules=lora_targets(args.encoder_lora, model.config.encoder_layers),
        )
        model = get_peft_model(model, cfg)
    frozen_encoder = args.encoder_lora == 0
    if not frozen_encoder:
        model.gradient_checkpointing_enable()
        model.enable_input_require_grads()
    model.print_trainable_parameters()
    model.to("cuda")
    encoder = model.get_base_model().model.encoder

    train_rows = read_manifest("train")
    val_rows = read_manifest("val_mix")
    if args.smoke:
        train_rows, val_rows = train_rows[:400], val_rows[:16]
    pad_id = processor.tokenizer.eos_token_id
    loader = DataLoader(
        SpeechSet(train_rows, processor, augment=True),
        batch_size=args.batch,
        shuffle=True,
        num_workers=4,
        persistent_workers=True,
        collate_fn=partial(collate, pad_id=pad_id),  # lambdas can't be pickled for Windows workers
    )
    steps_per_epoch = len(loader) // args.accum
    total = 50 if args.smoke else int(steps_per_epoch * args.epochs)
    params = [p for p in model.parameters() if p.requires_grad]
    opt = torch.optim.AdamW(params, lr=args.lr, weight_decay=0.01)
    sched = get_linear_schedule_with_warmup(opt, min(300, total // 10), total)
    step, best_f1 = 0, -1.0
    if (last / "state.pt").exists():
        state = torch.load(last / "state.pt", weights_only=False)
        opt.load_state_dict(state["opt"])
        sched.load_state_dict(state["sched"])
        step, best_f1 = state["step"], state["best_f1"]
    eval_every = 25 if args.smoke else args.eval_every
    log = open(out / "train_log.jsonl", "a", encoding="utf-8")

    def evaluate() -> None:
        nonlocal best_f1
        model.config.use_cache = True
        hyps = transcribe(model, processor, val_rows, suppress, batch_size=8)
        model.config.use_cache = False
        model.train()
        by_src = {}
        for src in sorted({r["source"] for r in val_rows}):
            idx = [i for i, r in enumerate(val_rows) if r["source"] == src]
            by_src[src] = score([val_rows[i] for i in idx], [hyps[i] for i in idx])
        overall = score(val_rows, hyps)
        rec = {
            "step": step,
            "val_filler_f1": overall["fillers"]["all"]["f1"],
            "val_fleurs_wer": by_src.get("fleurs", {}).get("wer"),
            "by_source": by_src,
        }
        log.write(json.dumps(rec) + "\n")
        log.flush()
        print(json.dumps({k: rec[k] for k in ("step", "val_filler_f1", "val_fleurs_wer")}))
        # Keep every checkpoint (17 MB each); select_checkpoint.py picks the final one with a
        # WER guard, since the best filler F1 alone can coincide with hallucination loops.
        model.save_pretrained(out / "lora_steps" / f"step{step}")
        best_f1 = max(best_f1, rec["val_filler_f1"])

    model.train()
    t0, running, micro = time.time(), 0.0, 0
    while step < total:
        for feats, dec_in, labels in loader:
            feats, dec_in, labels = (
                feats.to("cuda", torch.bfloat16),
                dec_in.to("cuda"),
                labels.to("cuda"),
            )
            with torch.autocast("cuda", dtype=torch.bfloat16):
                if frozen_encoder:
                    with torch.no_grad():
                        enc = encoder(feats).last_hidden_state
                    loss = model(
                        encoder_outputs=(enc,), decoder_input_ids=dec_in, labels=labels
                    ).loss
                else:
                    loss = model(input_features=feats, decoder_input_ids=dec_in, labels=labels).loss
            (loss / args.accum).backward()
            running += loss.item()
            micro += 1
            if micro % args.accum:
                continue
            torch.nn.utils.clip_grad_norm_(params, 1.0)
            opt.step()
            sched.step()
            opt.zero_grad(set_to_none=True)
            step += 1
            if step % 10 == 0:
                rate = (time.time() - t0) / 10
                mem = torch.cuda.max_memory_allocated() / 2**30
                print(
                    f"step {step}/{total} loss {running / (10 * args.accum):.4f} "
                    f"{rate:.2f}s/step peak {mem:.2f} GB"
                )
                running, t0 = 0.0, time.time()
            if step % eval_every == 0 or step == total:
                evaluate()
                model.save_pretrained(last)
                torch.save(
                    {
                        "opt": opt.state_dict(),
                        "sched": sched.state_dict(),
                        "step": step,
                        "best_f1": best_f1,
                    },
                    last / "state.pt",
                )
            if step >= total:
                break
    log.close()
    print("best val filler F1", best_f1)


if __name__ == "__main__":
    main()

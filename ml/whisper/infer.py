"""Batched HF Whisper transcription and scoring, shared by training, evaluation and conversion."""

from itertools import groupby

import jiwer
import torch

from whisper.audio import load
from whisper.normalize import filler_prf, for_wer

MAX_NEW_TOKENS = 220


@torch.no_grad()
def transcribe(
    model, processor, rows: list[dict], suppress: list[int], batch_size: int = 8
) -> list[str]:
    """Greedy decoding, grouped by language. Returns hypotheses in the order of rows."""
    model.eval()
    order = sorted(range(len(rows)), key=lambda i: rows[i]["language"])
    hyps: dict[int, str] = {}
    for lang, idx in groupby(order, key=lambda i: rows[i]["language"]):
        idx = list(idx)
        for b in range(0, len(idx), batch_size):
            chunk = idx[b : b + batch_size]
            feats = processor.feature_extractor(
                [load(rows[i]["audio"]) for i in chunk], sampling_rate=16_000, return_tensors="pt"
            ).input_features.to(model.device, torch.bfloat16)
            with torch.autocast("cuda", dtype=torch.bfloat16):
                out = model.generate(
                    input_features=feats,
                    language=lang,
                    task="transcribe",
                    suppress_tokens=suppress,
                    max_new_tokens=MAX_NEW_TOKENS,
                )
            for i, text in zip(
                chunk, processor.batch_decode(out, skip_special_tokens=True), strict=True
            ):
                hyps[i] = text.strip()
    return [hyps[i] for i in range(len(rows))]


def score(rows: list[dict], hyps: list[str]) -> dict:
    refs = [r["text"] for r in rows]
    pairs = [(for_wer(r), for_wer(h)) for r, h in zip(refs, hyps, strict=True) if for_wer(r)]
    return {
        "n": len(rows),
        "fillers": filler_prf(refs, hyps),
        "wer": jiwer.wer([p[0] for p in pairs], [p[1] for p in pairs]) if pairs else None,
        "cer": jiwer.cer([p[0] for p in pairs], [p[1] for p in pairs]) if pairs else None,
    }

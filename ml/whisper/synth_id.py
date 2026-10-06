"""Synthetic Indonesian filler speech: splice filler clips into FLEURS id_id utterances at word
boundaries and insert the matching token into the transcript.

No public Indonesian filler audio exists, so this teaches the model to emit [EEE]/[UM]/[HMM] inside
Indonesian sentences until in-house recordings arrive. "eee" is approximated by time-stretching
"uh" clips (Indonesian "eee" tends to be long).

Run from ml/:  uv run python -m whisper.synth_id
"""

import difflib
import json
import re

import librosa
import numpy as np

from common.paths import WHISPER_BASE
from whisper.audio import SR, load, rms, save
from whisper.common import AUDIO, BANK, WORK, fleurs_rows, write_manifest
from whisper.normalize import EEE, HMM, UM

VARIANTS = {"train": 3, "val": 1, "test": 1}
N_FILLERS = ([1, 2, 3], [0.5, 0.35, 0.15])
TOKEN_P = {EEE: 0.6, UM: 0.2, HMM: 0.2}
MAX_S = 30.0
SEED = 0


def _norm(word: str) -> str:
    return re.sub(r"[^\w]", "", word.lower())


def boundaries(
    ref_words: list[str], hyp: list[tuple[str, float, float]]
) -> list[tuple[int, float]]:
    """(i, t): a filler may go before reference word i at time t (seconds).

    hyp: (word, start, end) from Whisper word timestamps. Only boundaries where both neighbouring
    reference words matched a hypothesis word are used, so the audio and text stay aligned.
    """
    ref_n = [_norm(w) for w in ref_words]
    hyp_n = [_norm(w) for w, _, _ in hyp]
    match: dict[int, int] = {}
    for block in difflib.SequenceMatcher(None, ref_n, hyp_n, autojunk=False).get_matching_blocks():
        for k in range(block.size):
            match[block.a + k] = block.b + k
    out = []
    if 0 in match:
        out.append((0, max(0.0, hyp[match[0]][1] - 0.05)))
    for i in range(1, len(ref_words)):
        if i - 1 in match and i in match:
            end_prev, start_next = hyp[match[i - 1]][2], hyp[match[i]][1]
            out.append((i, (end_prev + start_next) / 2 if start_next >= end_prev else start_next))
    return out


def insert_tokens(ref_words: list[str], insertions: list[tuple[int, str]]) -> str:
    words = list(ref_words)
    for i, token in sorted(insertions, reverse=True):
        words.insert(i, token)
    return " ".join(words)


def splice(audio: np.ndarray, clip: np.ndarray, t: float, pad: tuple[float, float]) -> np.ndarray:
    k = int(round(t * SR))
    silence = [np.zeros(int(p * SR), np.float32) for p in pad]
    return np.concatenate([audio[:k], silence[0], clip, silence[1], audio[k:]])


def _fade(clip: np.ndarray, ms: int = 10) -> np.ndarray:
    n = min(len(clip) // 2, SR * ms // 1000)
    ramp = np.linspace(0, 1, n, dtype=np.float32)
    clip = clip.copy()
    clip[:n] *= ramp
    clip[-n:] *= ramp[::-1]
    return clip


def _filler_clip(rng, bank: dict, token: str, host_rms: float) -> np.ndarray:
    pool = bank[token] if token != EEE else bank[EEE]
    clip = load(rng.choice(pool))
    if token == EEE:  # stretch "uh" into a longer Indonesian-style "eee"
        clip = librosa.effects.time_stretch(clip, rate=float(rng.uniform(0.4, 1.0)))
    clip = librosa.effects.pitch_shift(clip, sr=SR, n_steps=float(rng.uniform(-2, 2)))
    return _fade(clip * (host_rms * rng.uniform(0.6, 1.0) / rms(clip)))


def snap_to_quiet(audio: np.ndarray, t: float, window: float = 0.15) -> float:
    """Move t to the quietest 10 ms frame within +-window seconds (DTW timestamps are coarse)."""
    hop = SR // 100
    lo = max(0, int((t - window) * SR))
    hi = min(len(audio), int((t + window) * SR))
    if hi - lo < hop:
        return t
    frames = audio[lo:hi][: (hi - lo) // hop * hop].reshape(-1, hop)
    return (lo + int(np.argmin((frames**2).mean(axis=1))) * hop + hop // 2) / SR


def token_words(tokens: list[str], times: list[float]) -> list[tuple[str, float, float]]:
    """Group BPE tokens into words with (start, end) times.

    HF token_timestamps[i + 1] is the start of token i (checked empirically: boundaries under
    this reading sit at lower audio energy). Word end = start of the next word.
    """
    words: list[list] = []
    for i, tok in enumerate(tokens):
        start = times[i + 1] if i + 1 < len(times) else times[-1]
        if tok.startswith("Ġ") or not words:
            words.append([tok.replace("Ġ", ""), start, start])
        else:
            words[-1][0] += tok
    for i, w in enumerate(words):
        w[2] = words[i + 1][1] if i + 1 < len(words) else times[-1]
    return [tuple(w) for w in words]


def word_timestamps(rows: list[dict]) -> dict[str, list]:
    """Stock turbo word timestamps on GPU (cached).

    The encoder runs separately so `generate` only keeps the decoder's cross-attentions;
    the HF word-timestamp pipeline keeps every encoder attention map and runs out of 4 GB.
    """
    cache = WORK / "fleurs_word_timestamps.json"
    have = json.loads(cache.read_text(encoding="utf-8")) if cache.exists() else {}
    todo = [r for r in rows if str(r["audio"]) not in have]
    if todo:
        import torch
        from transformers import WhisperForConditionalGeneration, WhisperProcessor

        processor = WhisperProcessor.from_pretrained(WHISPER_BASE)
        tok = processor.tokenizer
        model = WhisperForConditionalGeneration.from_pretrained(WHISPER_BASE, dtype=torch.float16)
        model.to("cuda").eval()
        for i in range(0, len(todo), 4):
            chunk = todo[i : i + 4]
            with torch.no_grad():
                feats = processor.feature_extractor(
                    [load(r["audio"]) for r in chunk], sampling_rate=SR, return_tensors="pt"
                ).input_features.to("cuda", torch.float16)
                out = model.generate(
                    encoder_outputs=model.model.encoder(feats),
                    language="id",
                    task="transcribe",
                    return_token_timestamps=True,
                    return_dict_in_generate=True,
                    max_new_tokens=220,
                )
            for r, ids, ts in zip(
                chunk, out["sequences"].tolist(), out["token_timestamps"].tolist(), strict=True
            ):
                keep = [k for k, t in enumerate(ids) if t < tok.eos_token_id]
                have[str(r["audio"])] = token_words(
                    [tok.convert_ids_to_tokens(ids[k]) for k in keep],
                    [ts[k] for k in keep]
                    + [ts[keep[-1] + 1] if keep and keep[-1] + 1 < len(ts) else ts[-1]],
                )
            if i % 200 == 0 or i + 4 >= len(todo):
                cache.write_text(json.dumps(have, ensure_ascii=False), encoding="utf-8")
                print(f"  timestamps {min(i + 4, len(todo))}/{len(todo)}")
    return have


def main() -> None:
    rng = np.random.default_rng(SEED)
    index = json.loads((BANK / "index.json").read_text(encoding="utf-8"))
    for split, n_var in VARIANTS.items():
        rows = fleurs_rows(split)
        stamps = word_timestamps(rows)
        bank = {t: [c["path"] for c in index[split] if c["token"] == t] for t in (EEE, UM, HMM)}
        originals, synth = [], []
        for r in rows:
            originals.append(
                {
                    "audio": r["audio"],
                    "text": r["raw"],
                    "language": "id",
                    "source": "fleurs",
                    "has_filler": False,
                }
            )
            words = r["raw"].split()
            spots = boundaries(words, [tuple(w) for w in stamps[str(r["audio"])]])
            if not spots:
                continue
            audio = load(r["audio"])
            host = rms(audio)
            for v in range(n_var):
                n = min(int(rng.choice(N_FILLERS[0], p=N_FILLERS[1])), len(spots))
                picks = [spots[i] for i in sorted(rng.choice(len(spots), n, replace=False))]
                tokens = rng.choice(list(TOKEN_P), size=n, p=list(TOKEN_P.values()))
                out = audio
                for (_, t), token in sorted(
                    zip(picks, tokens, strict=True), key=lambda x: -x[0][1]
                ):
                    clip = _filler_clip(rng, bank, str(token), host)
                    # Descending time order, so the original timeline still holds before t.
                    t = snap_to_quiet(audio, t)
                    out = splice(out, clip, t, tuple(rng.uniform(0.05, 0.35, 2)))
                if len(out) / SR > MAX_S:
                    continue
                stem = r["audio"].stem
                path = save(AUDIO / "fleurs_synth" / split / f"{stem}_{v}.flac", out)
                text = insert_tokens(
                    words, [(i, str(tok)) for (i, _), tok in zip(picks, tokens, strict=True)]
                )
                synth.append(
                    {
                        "audio": path,
                        "text": text,
                        "language": "id",
                        "source": "fleurs_synth",
                        "has_filler": True,
                    }
                )
        write_manifest(f"fleurs_{split}", originals)
        write_manifest(f"fleurs_synth_{split}", synth)
        print(f"  {split}: {len(originals)} original, {len(synth)} synthetic")


if __name__ == "__main__":
    main()

"""Build training/eval manifests: AMI (merged same-speaker segments), DisfluencySpeech and the
FLEURS original + synthetic sets from synth_id.py. Writes 16 kHz FLAC files.

Run from ml/ after filler_bank.py and synth_id.py:  uv run python -m whisper.prepare_data
"""

import random
from collections import defaultdict

import numpy as np

from whisper.audio import SR, decode, save
from whisper.common import AUDIO, ami_rows, disfl_rows, read_manifest, write_manifest
from whisper.normalize import TOKENS, to_target

AMI_TARGET = {"train": 5000, "val": 300, "test": 1000}  # half with fillers, half without
MAX_GROUP_S, MAX_GAP_S, MIN_GROUP_S = 25.0, 1.5, 1.0
VAL_MIX_PER_SET = 75
SEED = 0


def _has_filler(text: str) -> bool:
    return any(t in text for t in TOKENS)


def ami_groups(split: str) -> list[list[dict]]:
    """Merge consecutive segments of the same speaker in a meeting into answer-length chunks."""
    by_speaker = defaultdict(list)
    for r in ami_rows(
        split, ["meeting_id", "speaker_id", "audio_id", "text", "begin_time", "end_time"]
    ):
        by_speaker[(r["meeting_id"], r["speaker_id"])].append(r)
    groups = []
    for segs in by_speaker.values():
        segs.sort(key=lambda r: r["begin_time"])
        cur = [segs[0]]
        for s in segs[1:]:
            gap = s["begin_time"] - cur[-1]["end_time"]
            if 0 <= gap <= MAX_GAP_S and s["end_time"] - cur[0]["begin_time"] <= MAX_GROUP_S:
                cur.append(s)
            else:
                groups.append(cur)
                cur = [s]
        groups.append(cur)
    return [g for g in groups if g[-1]["end_time"] - g[0]["begin_time"] >= MIN_GROUP_S]


def ami(split: str, rng: random.Random) -> list[dict]:
    groups = ami_groups(split)
    texts = [to_target(" ".join(s["text"] for s in g), lowercase=True) for g in groups]
    with_f = [i for i, t in enumerate(texts) if _has_filler(t)]
    without = [i for i, t in enumerate(texts) if not _has_filler(t)]
    half = AMI_TARGET[split] // 2
    chosen = rng.sample(with_f, min(half, len(with_f))) + rng.sample(
        without, min(half, len(without))
    )
    need = {s["audio_id"]: i for i in chosen for s in groups[i]}

    pending: dict[int, dict] = defaultdict(dict)
    rows = []
    for r in ami_rows(split, ["audio_id", "audio"]):
        gi = need.get(r["audio_id"])
        if gi is None:
            continue
        pending[gi][r["audio_id"]] = decode(r["audio"]["bytes"])
        g = groups[gi]
        if len(pending[gi]) < len(g):
            continue
        parts = []
        for k, s in enumerate(g):  # keep real gaps between segments, capped at 0.5 s
            if k:
                gap = min(0.5, max(0.0, s["begin_time"] - g[k - 1]["end_time"]))
                parts.append(np.zeros(int(gap * SR), np.float32))
            parts.append(pending[gi][s["audio_id"]])
        del pending[gi]
        path = save(
            AUDIO / "ami" / split / f"{g[0]['audio_id']}_{len(g)}.flac", np.concatenate(parts)
        )
        rows.append(
            {
                "audio": path,
                "text": texts[gi],
                "language": "en",
                "source": "ami",
                "has_filler": _has_filler(texts[gi]),
            }
        )
    print(f"  ami {split}: {len(rows)} ({sum(r['has_filler'] for r in rows)} with fillers)")
    return rows


def disfl(split: str) -> list[dict]:
    rows = []
    for i, r in enumerate(disfl_rows(split, ["audio", "transcript_a"])):
        text = to_target(r["transcript_a"])
        path = save(AUDIO / "disfl" / split / f"{i:05d}.flac", decode(r["audio"]["bytes"]))
        rows.append(
            {
                "audio": path,
                "text": text,
                "language": "en",
                "source": "disfl",
                "has_filler": _has_filler(text),
            }
        )
    print(f"  disfl {split}: {len(rows)} ({sum(r['has_filler'] for r in rows)} with fillers)")
    return rows


def main() -> None:
    rng = random.Random(SEED)
    sets = {}
    for split in ("train", "val", "test"):
        sets[f"ami_{split}"] = ami(split, rng)
        sets[f"disfl_{split}"] = disfl(split)
        sets[f"fleurs_{split}"] = read_manifest(f"fleurs_{split}")
        sets[f"fleurs_synth_{split}"] = read_manifest(f"fleurs_synth_{split}")
    for name, rows in sets.items():
        write_manifest(name, rows)

    train = [r for k in ("ami", "disfl", "fleurs", "fleurs_synth") for r in sets[f"{k}_train"]]
    rng.shuffle(train)
    write_manifest("train", train)
    val_mix = [
        r
        for k in ("ami", "disfl", "fleurs", "fleurs_synth")
        for r in rng.sample(sets[f"{k}_val"], min(VAL_MIX_PER_SET, len(sets[f"{k}_val"])))
    ]
    write_manifest("val_mix", val_mix)
    n_id = sum(r["language"] == "id" for r in train)
    print(f"  train: {len(train)} ({n_id / len(train):.0%} Indonesian), val_mix: {len(val_mix)}")


if __name__ == "__main__":
    main()

"""Collect standalone filler clips from AMI segments whose whole transcript is one filler.

Clips are kept per AMI split (train/val/test meetings), so synthetic val/test audio uses clips the
model never heard in training.

Run from ml/:  uv run python -m whisper.filler_bank
"""

import json
from collections import Counter

import librosa

from whisper.audio import SR, decode, save
from whisper.common import BANK, ami_rows
from whisper.normalize import FORMS

MIN_S, MAX_S = 0.2, 2.0
CAP = {"train": 1500, "val": 200, "test": 300}  # per token type


def main() -> None:
    index = {}
    for split in ("train", "val", "test"):
        counts, clips = Counter(), []
        for row in ami_rows(split, ["audio_id", "text", "audio"]):
            token = FORMS.get(row["text"].strip().lower())
            if not token or counts[token] >= CAP[split]:
                continue
            audio, _ = librosa.effects.trim(decode(row["audio"]["bytes"]), top_db=30)
            if not MIN_S <= len(audio) / SR <= MAX_S:
                continue
            path = save(BANK / split / f"{token.strip('[]')}_{row['audio_id']}.flac", audio)
            clips.append({"token": token, "path": str(path)})
            counts[token] += 1
        index[split] = clips
        print(f"  {split}: {dict(counts)}")
    (BANK / "index.json").write_text(json.dumps(index, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

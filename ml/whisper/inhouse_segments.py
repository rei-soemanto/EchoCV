import argparse
import csv
from pathlib import Path

import numpy as np

from common.paths import DATA
from whisper.audio import SR, save

INHOUSE = DATA / "inhouse"
RAW = INHOUSE / "raw"
AUDIO = INHOUSE / "derived" / "audio"
SEGMENTS = INHOUSE / "derived" / "segments.csv"

MAX_SEGMENT_S = 25.0
MAX_JOIN_GAP_S = 1.2
MIN_SEGMENT_S = 1.0
PAD_S = 0.25

COLUMNS = [
    "stem",
    "seg",
    "start",
    "end",
    "audio",
    "person",
    "session",
    "part",
    "clip",
    "language",
]


def group_speech(
    chunks: list[tuple[float, float]],
    max_len: float = MAX_SEGMENT_S,
    max_gap: float = MAX_JOIN_GAP_S,
    min_len: float = MIN_SEGMENT_S,
) -> list[tuple[float, float]]:
    groups: list[list[float]] = []
    for start, end in chunks:
        while end - start > max_len:
            groups.append([start, start + max_len])
            start += max_len
        if groups and start - groups[-1][1] <= max_gap and end - groups[-1][0] <= max_len:
            groups[-1][1] = end
        else:
            groups.append([start, end])
    return [(s, e) for s, e in groups if e - s >= min_len]


def padded(group: tuple[float, float], total: float, pad: float = PAD_S) -> tuple[float, float]:
    return max(0.0, group[0] - pad), min(total, group[1] + pad)


def speech_chunks(audio: np.ndarray) -> list[tuple[float, float]]:
    from faster_whisper.vad import VadOptions, get_speech_timestamps

    opts = VadOptions(
        threshold=0.4,
        min_silence_duration_ms=400,
        speech_pad_ms=100,
        max_speech_duration_s=MAX_SEGMENT_S,
    )
    return [(t["start"] / SR, t["end"] / SR) for t in get_speech_timestamps(audio, opts)]


def segment_file(entry: dict) -> list[dict]:
    from faster_whisper.audio import decode_audio

    stem = Path(entry["file"]).stem
    audio = decode_audio(str(RAW / entry["file"]), sampling_rate=SR)
    total = len(audio) / SR
    rows = []
    for n, group in enumerate(group_speech(speech_chunks(audio)), 1):
        start, end = padded(group, total)
        path = save(AUDIO / stem / f"{stem}_{n:03d}.flac", audio[int(start * SR) : int(end * SR)])
        rows.append(
            {
                "stem": stem,
                "seg": n,
                "start": round(start, 2),
                "end": round(end, 2),
                "audio": str(path.relative_to(INHOUSE)).replace("\\", "/"),
                "person": entry["person"],
                "session": entry["session"],
                "part": entry["part"],
                "clip": entry["clip"],
                "language": entry["language"],
            }
        )
    return rows


def read_segments(path: Path = SEGMENTS) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def main() -> None:
    from inhouse.inventory import read_inventory

    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    done = {}
    if SEGMENTS.exists():
        for r in read_segments():
            done.setdefault(r["stem"], []).append(r)
    rows = []
    for entry in read_inventory():
        stem = Path(entry["file"]).stem
        if not stem.startswith(args.only):
            continue
        if stem in done:
            rows.extend(done.pop(stem))
            continue
        mine = segment_file(entry)
        seconds = sum(float(r["end"]) - float(r["start"]) for r in mine)
        print(f"  {stem}: {len(mine)} segments, {seconds:.0f} s of speech")
        rows.extend(mine)
    for leftover in done.values():
        rows.extend(leftover)
    SEGMENTS.parent.mkdir(parents=True, exist_ok=True)
    with open(SEGMENTS, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(sorted(rows, key=lambda r: (r["stem"], int(r["seg"]))))
    minutes = sum(float(r["end"]) - float(r["start"]) for r in rows) / 60
    print(f"{len(rows)} segments, {minutes:.1f} min -> {SEGMENTS}")


if __name__ == "__main__":
    main()

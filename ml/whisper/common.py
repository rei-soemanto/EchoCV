"""Locations and readers shared by the Whisper data scripts."""

import csv
import json
from collections.abc import Iterator
from pathlib import Path

import pyarrow.parquet as pq

from common.paths import DATA

WORK = DATA / "whisper"
AUDIO = WORK / "audio"
MANIFESTS = WORK / "manifests"
BANK = WORK / "filler_bank"
AMI_SPLITS = {"train": "train", "val": "validation", "test": "test"}
FLEURS_SPLITS = {"train": "train", "val": "dev", "test": "test"}


def ami_rows(split: str, columns: list[str]) -> Iterator[dict]:
    """Stream AMI IHM rows (audio is {bytes, path}) without loading whole shards into memory."""
    for shard in sorted((DATA / "ami" / "ihm").glob(f"{AMI_SPLITS[split]}-*.parquet")):
        for batch in pq.ParquetFile(shard).iter_batches(batch_size=256, columns=columns):
            yield from batch.to_pylist()


def disfl_rows(split: str, columns: list[str]) -> Iterator[dict]:
    name = {"train": "train", "val": "validation", "test": "test"}[split]
    for shard in sorted((DATA / "disfluencyspeech" / "data").glob(f"{name}-*.parquet")):
        for batch in pq.ParquetFile(shard).iter_batches(batch_size=128, columns=columns):
            yield from batch.to_pylist()


def fleurs_rows(split: str) -> list[dict]:
    """FLEURS tsv: id, file, raw transcription, normalised transcription, chars, samples, gender."""
    root = DATA / "fleurs_id"
    tsv = root / "data" / "id_id" / f"{FLEURS_SPLITS[split]}.tsv"
    audio_dir = next(p for p in root.joinpath("audio").rglob(FLEURS_SPLITS[split]) if p.is_dir())
    rows = []
    with open(tsv, encoding="utf-8") as f:
        for r in csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE):
            rows.append({"id": r[0], "audio": audio_dir / r[1], "raw": r[2], "gender": r[6]})
    return rows


def write_manifest(name: str, rows: list[dict]) -> Path:
    MANIFESTS.mkdir(parents=True, exist_ok=True)
    path = MANIFESTS / f"{name}.jsonl"
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps({**r, "audio": str(r["audio"])}, ensure_ascii=False) + "\n")
    return path


def read_manifest(name: str) -> list[dict]:
    with open(MANIFESTS / f"{name}.jsonl", encoding="utf-8") as f:
        return [json.loads(line) for line in f]

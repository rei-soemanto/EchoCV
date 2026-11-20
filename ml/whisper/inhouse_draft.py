import argparse
import csv
import json
from pathlib import Path

from whisper.audio import load
from whisper.evaluate import V0
from whisper.inhouse_segments import INHOUSE, read_segments

TRANSCRIPTS = INHOUSE / "transcripts"
TSV_COLUMNS = ["seg", "start", "end", "draft", "verbatim", "checked"]


def write_tsv(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=TSV_COLUMNS, delimiter="\t")
        writer.writeheader()
        writer.writerows({k: r.get(k, "") for k in TSV_COLUMNS} for r in rows)


def read_tsv(path: Path) -> list[dict]:
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f, delimiter="\t"))


def model_language(language: str) -> str | None:
    return {"id": "id", "en": "en"}.get(language)


def main() -> None:
    from faster_whisper import WhisperModel

    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--device", default="cuda", choices=["cuda", "cpu"])
    args = ap.parse_args()
    ct2 = V0 / "ct2"
    compute = "int8_float16" if args.device == "cuda" else "int8"
    model = WhisperModel(str(ct2), device=args.device, compute_type=compute)
    suppress = json.loads((ct2 / "suppress_tokens.json").read_text(encoding="utf-8"))
    by_stem: dict[str, list[dict]] = {}
    for r in read_segments():
        if r["stem"].startswith(args.only):
            by_stem.setdefault(r["stem"], []).append(r)
    for n, (stem, segs) in enumerate(sorted(by_stem.items()), 1):
        out = TRANSCRIPTS / f"{stem}.tsv"
        if out.exists():
            continue
        rows = []
        for seg in segs:
            parts, _ = model.transcribe(
                load(INHOUSE / seg["audio"]),
                language=model_language(seg["language"]),
                suppress_tokens=suppress,
                condition_on_previous_text=False,
                without_timestamps=True,
                vad_filter=False,
                beam_size=1,
            )
            text = " ".join(p.text.strip() for p in parts).strip()
            rows.append({**seg, "draft": text, "verbatim": text})
        write_tsv(out, rows)
        print(f"[{n}/{len(by_stem)}] {stem}: {len(rows)} segments")


if __name__ == "__main__":
    main()

import argparse
import json
from collections import defaultdict

from common.paths import ARTIFACTS
from whisper.audio import load
from whisper.infer import score
from whisper.inhouse_draft import TRANSCRIPTS, model_language, read_tsv
from whisper.inhouse_segments import INHOUSE, read_segments

OUT = ARTIFACTS / "whisper" / "inhouse_metrics.json"


def checked_rows() -> list[dict]:
    meta = {(r["stem"], int(r["seg"])): r for r in read_segments()}
    rows = []
    for tsv in sorted(TRANSCRIPTS.glob("*.tsv")):
        for r in read_tsv(tsv):
            if r.get("checked") != "yes":
                continue
            m = meta[(tsv.stem, int(r["seg"]))]
            rows.append(
                {
                    "audio": str(INHOUSE / m["audio"]),
                    "text": r["verbatim"],
                    "draft": r["draft"],
                    "language": m["language"] or "id",
                    "person": m["person"],
                    "part": m["part"],
                    "stem": tsv.stem,
                }
            )
    return rows


def grouped(rows: list[dict], hyps: list[str]) -> dict:
    groups: dict[str, list[int]] = defaultdict(list)
    for i, r in enumerate(rows):
        for key in ("all", f"language:{r['language']}", f"person:{r['person']}"):
            groups[key].append(i)
    return {
        k: score([rows[i] for i in idx], [hyps[i] for i in idx])
        for k, idx in sorted(groups.items())
    }


def transcribe_stock(rows: list[dict], device: str) -> list[str]:
    from faster_whisper import WhisperModel

    compute = "int8_float16" if device == "cuda" else "int8"
    model = WhisperModel("large-v3-turbo", device=device, compute_type=compute)
    out = []
    for r in rows:
        parts, _ = model.transcribe(
            load(r["audio"]),
            language=model_language(r["language"]),
            condition_on_previous_text=False,
            without_timestamps=True,
            vad_filter=False,
            beam_size=1,
        )
        out.append(" ".join(p.text.strip() for p in parts).strip())
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stock", action="store_true")
    ap.add_argument("--device", default="cuda", choices=["cuda", "cpu"])
    args = ap.parse_args()
    rows = checked_rows()
    if not rows:
        raise SystemExit("no checked segments yet: import corrections with whisper.inhouse_review")
    report = {
        "segments": len(rows),
        "v0": grouped(rows, [r["draft"] for r in rows]),
    }
    if args.stock:
        report["stock"] = grouped(rows, transcribe_stock(rows, args.device))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    for name in ("v0", "stock"):
        if name in report:
            for key, s in report[name].items():
                f = s["fillers"]["all"]
                print(
                    f"{name:5} {key:16} n={s['n']:4} filler F1 {f['f1']:.3f} "
                    f"(P {f['precision']:.3f} R {f['recall']:.3f}, {f['support']} fillers) "
                    f"WER {s['wer'] if s['wer'] is None else round(s['wer'], 3)}"
                )


if __name__ == "__main__":
    main()

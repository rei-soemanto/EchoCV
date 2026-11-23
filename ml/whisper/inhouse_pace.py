import argparse
import io
import json
import urllib.request
import uuid
from collections import defaultdict

import numpy as np
import soundfile as sf

from common.paths import ML_ROOT
from whisper.audio import SR
from whisper.inhouse_segments import RAW

OUT = ML_ROOT / "calibration" / "results" / "inhouse_pace.json"
BAND = (0.2, 0.8)


def weighted_quantile(values: list[float], weights: list[float], q: float) -> float:
    order = np.argsort(values)
    v = np.asarray(values, dtype=float)[order]
    w = np.asarray(weights, dtype=float)[order]
    cum = np.cumsum(w) - 0.5 * w
    return float(np.interp(q * w.sum(), cum, v))


def person_weights(rows: list[dict]) -> list[float]:
    counts = defaultdict(int)
    for r in rows:
        counts[r["person"]] += 1
    return [1.0 / counts[r["person"]] for r in rows]


def band(
    rows: list[dict], key: str, scale: float = 1.0, low: float = BAND[0], high: float = BAND[1]
) -> dict:
    values = [r[key] * scale for r in rows]
    weights = person_weights(rows)
    return {
        "low": round(weighted_quantile(values, weights, low), 2),
        "median": round(weighted_quantile(values, weights, 0.5), 2),
        "high": round(weighted_quantile(values, weights, high), 2),
    }


def summarize(rows: list[dict]) -> dict:
    out = {}
    for language in sorted({r["language"] for r in rows}):
        mine = [r for r in rows if r["language"] == language]
        out[language] = {
            "people": len({r["person"] for r in mine}),
            "answers": len(mine),
            "wordsPerMinute": band(mine, "speakingRateWps", 60.0),
            "syllablesPerSecond": band(mine, "syllablesPerSecond"),
        }
    return out


def flac_bytes(audio: np.ndarray) -> bytes:
    buf = io.BytesIO()
    sf.write(buf, audio, SR, format="FLAC")
    return buf.getvalue()


def post_analyze(url: str, audio: bytes, language: str) -> dict:
    boundary = uuid.uuid4().hex
    head = f"--{boundary}\r\nContent-Disposition: form-data; "
    parts = [
        f'{head}name="language"\r\n\r\n{language}\r\n'.encode(),
        f'{head}name="answerIndex"\r\n\r\n0\r\n'.encode(),
        f'{head}name="audio"; filename="answer.flac"\r\nContent-Type: audio/flac\r\n\r\n'.encode(),
        audio,
        f"\r\n--{boundary}--\r\n".encode(),
    ]
    request = urllib.request.Request(
        url,
        data=b"".join(parts),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=900) as response:
        return json.loads(response.read())


def measure(entry: dict, url: str) -> dict:
    from faster_whisper.audio import decode_audio

    audio = decode_audio(str(RAW / entry["file"]), sampling_rate=SR)
    metrics = post_analyze(url, flac_bytes(audio), entry["language"])
    return {
        "answer": entry["file"].split("/")[-1].rsplit(".", 1)[0],
        "person": entry["person"],
        "language": entry["language"],
        "speechMs": metrics["speechMs"],
        "speakingRateWps": metrics["speakingRateWps"],
        "syllablesPerSecond": metrics["syllablesPerSecond"],
    }


def main() -> None:
    from inhouse.inventory import read_inventory

    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:8000/analyze")
    args = ap.parse_args()
    done = {}
    if OUT.exists():
        done = {r["answer"]: r for r in json.loads(OUT.read_text(encoding="utf-8"))["answers"]}
    rows = []
    for entry in read_inventory():
        if entry["part"] != "B":
            continue
        answer = entry["file"].split("/")[-1].rsplit(".", 1)[0]
        row = done.get(answer) or measure(entry, args.url)
        wpm = row["speakingRateWps"] * 60
        print(f"  {answer}: {wpm:.0f} wpm, {row['syllablesPerSecond']:.2f} syl/s")
        rows.append(row)
        result = {"band": list(BAND), "languages": summarize(rows), "answers": rows}
        OUT.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summarize(rows), indent=2))


if __name__ == "__main__":
    main()

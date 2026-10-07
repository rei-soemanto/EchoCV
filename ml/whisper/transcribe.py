"""Transcribe your own recording with the v0 filler model (faster-whisper, CPU int8).

Any common audio format works (wav, mp3, m4a from Windows Voice Recorder...): faster-whisper
decodes with its bundled PyAV, no FFmpeg install needed.

Run from ml/:
  uv run python -m whisper.transcribe path\\to\\answer.m4a --language id
  uv run python -m whisper.transcribe path\\to\\answer.m4a --language en --stock   # compare
"""

import argparse
import json
from collections import Counter

from faster_whisper import WhisperModel

from whisper.evaluate import V0
from whisper.normalize import filler_counts


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("--language", choices=["id", "en"], default="id")
    ap.add_argument("--stock", action="store_true", help="stock large-v3-turbo, for comparison")
    args = ap.parse_args()

    ct2 = V0 / "ct2"
    model_path = "large-v3-turbo" if args.stock else str(ct2)
    model = WhisperModel(model_path, device="cpu", compute_type="int8", cpu_threads=8)
    # The filler-safe suppress list must be used, or "[EEE]"-style tokens can never appear.
    suppress = json.loads((ct2 / "suppress_tokens.json").read_text(encoding="utf-8"))
    segments, info = model.transcribe(
        args.audio,
        language=args.language,
        suppress_tokens=suppress,
        condition_on_previous_text=False,
        vad_filter=True,
    )
    text = " ".join(s.text.strip() for s in segments)
    print(text)
    fillers = Counter(filler_counts(text))
    words = len(text.split()) - sum(fillers.values())
    minutes = info.duration / 60
    print(
        f"\n{info.duration:.1f} s audio | fillers: {dict(fillers) or 'none'} "
        f"| {sum(fillers.values()) / minutes:.1f} fillers/min | {words / minutes:.0f} words/min"
    )


if __name__ == "__main__":
    main()

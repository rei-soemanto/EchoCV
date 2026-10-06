# services/speech

FastAPI service for speech analysis (Silero VAD, faster-whisper, librosa) and upload-mode vision.
Python 3.12, managed with uv.

```bash
uv sync                                   # API + dev tools
uv run uvicorn app.main:app --reload      # http://localhost:8000/health
uv run pytest
uv run ruff check && uv run ruff format --check
```

The heavy ML stack (`faster-whisper`, `silero-vad`, `librosa`, `mediapipe`) is in the `ml`
dependency group and is not installed by default:

```bash
uv sync --group ml
```

`app/schemas.py` mirrors `shared/schemas/speech-metrics.schema.json`; `tests/test_schemas.py`
fails if they drift apart.

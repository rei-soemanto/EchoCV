# services/speech

FastAPI service that analyses one recorded interview answer: Silero VAD for speech and pauses, the
fine-tuned faster-whisper model for a verbatim transcript with filler tokens and word timings,
wordfreq for the Indonesian or English tag of each word, and librosa for pitch. Python 3.12,
managed with uv.

```bash
uv sync --group ml                        # API, dev tools and the ML stack
uv run uvicorn app.main:app --reload      # http://localhost:8000/health
uv run pytest
uv run ruff check && uv run ruff format --check
```

CI installs only the default groups; tests that need the ML stack or the model skip there.

## POST /analyze

`multipart/form-data` with:

| Field | Value |
|---|---|
| `audio` | The answer recording (webm, ogg, wav, mp3, mp4, mkv: anything ffmpeg reads) |
| `language` | `id` or `en`, the interview language of the session |
| `answerIndex` | The answer's position in the session, from 0 |

It returns `SpeechMetrics` (`shared/schemas/speech-metrics.schema.json`, mirrored by
`app/schemas.py`; `tests/test_schemas.py` fails if they drift). Errors: 422 for a bad field or audio
that cannot be decoded, 413 for a file over `maxUploadMb` or an answer over `maxAudioSeconds`, 503
when the model is not configured. Answers are analysed one at a time, and transcripts are never
logged.

Tunable numbers (pause lengths, VAD settings, filler forms, language margin, limits) are in
`shared/speech.json`; the filler lists are in `shared/labels.json`.

## Model and settings

The Whisper weights are not in git. Until they are on Hugging Face Hub, point the service at the
CTranslate2 folder made by `ml/whisper/merge_and_convert.py`:

| Variable | Default |
|---|---|
| `WHISPER_MODEL_DIR` | `ml/artifacts/whisper/v0/ct2` in this repo |
| `WHISPER_DEVICE` | `cpu` (`cuda` needs the CUDA 12 cuBLAS and cuDNN 9 libraries) |
| `WHISPER_COMPUTE_TYPE` | `int8` |
| `WHISPER_CPU_THREADS` | half the CPU cores |
| `ECHOCV_SHARED_DIR` | `shared/` in this repo |

To run the end-to-end test on a local recording (never commit it):

```bash
SPEECH_SAMPLE_AUDIO=path/to/answer.webm SPEECH_SAMPLE_LANGUAGE=id uv run pytest tests/test_ml.py
```

Word frequencies come from wordfreq (data CC BY-SA 4.0, by Robyn Speer and contributors).

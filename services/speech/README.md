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

`multipart/form-data` with exactly one of `audio` or `audioUrl`:

| Field | Value |
|---|---|
| `audio` | The answer recording (webm, ogg, wav, mp3, mp4, mkv: anything ffmpeg reads) |
| `audioUrl` | Instead of `audio`: a signed Supabase Storage URL the service downloads itself, so the backend never streams the file |
| `language` | `id` or `en`, the interview language of the session |
| `answerIndex` | The answer's position in the session, from 0 |

Header `X-Speech-Key`: the shared secret in `SPEECH_SERVICE_KEY`, sent only by the backend. When
`SPEECH_SERVICE_KEY` is unset (local development) the check is off; `/health` never needs it.

`audioUrl` is downloaded only from the hosts in `SPEECH_AUDIO_URL_HOSTS` (for example
`<project-ref>.supabase.co`), only over https (plain http only for `localhost` and `127.0.0.1`),
without following redirects, within `audioUrlTimeoutS` and `maxUploadMb` from `shared/speech.json`.
With no hosts set, `audioUrl` is refused.

It returns `SpeechMetrics` (`shared/schemas/speech-metrics.schema.json`, mirrored by
`app/schemas.py`; `tests/test_schemas.py` fails if they drift). Errors: 401 for a missing or wrong
`X-Speech-Key`, 422 for a bad field, both or neither of `audio` and `audioUrl`, a refused or failed
`audioUrl` download, or audio that cannot be decoded, 413 for a file over `maxUploadMb` or an
answer over `maxAudioSeconds`, 503 when the model is not configured. Answers are analysed one at a time, and transcripts are never
logged.

## POST /analyze-video

Upload mode: one answer video in, speech and visual metrics out. `multipart/form-data` with exactly
one of `video` or `videoUrl`, plus `language` and `answerIndex` as above. The same `X-Speech-Key`
check applies, and `videoUrl` follows the same host, https and redirect rules as `audioUrl`, with
the limits in the `video` block of `shared/speech.json` (`maxMb`, `maxSeconds`, `urlTimeoutS`).

- The video's own audio track goes through the same speech analysis as `/analyze`.
- ffmpeg samples frames at `posture.sampleFps` from `shared/thresholds.json` (5 fps), scaled down
  to at most `maxFrameWidth` pixels wide. Each frame goes through MediaPipe Face Landmarker and the
  same pose, object and behaviour ONNX models as the browser (`shared/vision-models.json`).
- There is no 5-second calibration in upload mode, so eye contact, smile, looking down and posture
  are measured against the median of the first `posture.baselineSeconds` of the answer, with the
  default thresholds. The response says so with `"baseline": "answer_start"`, and the report should
  label upload scores as less precise than Live mode.
- The feature maths in `app/vision/` is a port of `apps/web/lib/vision/`, checked number for number
  against the same parity fixtures (`tests/test_vision_features.py`).
- The video is written to a temporary folder for ffmpeg and deleted when the request ends (BR-05).
  Answers are analysed one at a time. On a laptop CPU a video takes about as long as it plays.

It returns `VideoAnalysis` (`shared/schemas/video-analysis.schema.json`): `speech` is
`SpeechMetrics`, `visual` is `VisualMetrics` (`shared/schemas/visual-metrics.schema.json`).
Errors: as for `/analyze`, plus 422 for a video with no decodable audio or unreadable frames, 413
for a video over `maxMb` or `maxSeconds`, and 503 when the vision models are missing.

The vision models are read from `VISION_MODEL_DIR` (default `apps/web/public/models` in this
repo). `uv run python -m app.pull_model` downloads them there together with the Whisper model.

Tunable numbers (pause lengths, VAD settings, filler forms, language margin, limits) are in
`shared/speech.json`; the filler lists are in `shared/labels.json`.

## Deploy

CI builds the image from the repo root (`docker build -f services/speech/Dockerfile .`), checks
that the speech and vision libraries import and that `/health` answers, and on every merge to
`main` publishes it as `ghcr.io/rei-soemanto/echocv-speech:latest` and `:<commit sha>`. The image
holds the code and `shared/`, never models or secrets. If the package is private, log the host in
first with `docker login ghcr.io` and a token that can read packages.

```bash
docker run -d --name echocv-speech --restart unless-stopped -p 8000:8000   -v echocv-models:/models   -e HF_TOKEN=<read token>   -e SPEECH_SERVICE_KEY=<shared secret>   -e SPEECH_AUDIO_URL_HOSTS=<project-ref>.supabase.co   ghcr.io/rei-soemanto/echocv-speech:latest
```

- On start the container runs `app.pull_model`: the first start downloads the Whisper and vision
  models (about 850 MB) into the `echocv-models` volume, and later starts only check their
  checksums. `HF_TOKEN` is needed only while a model is missing.
- The service must be reachable over https by the web app's server. On a VM, put it behind an https
  reverse proxy. On a laptop, use a tunnel such as `cloudflared tunnel --url http://localhost:8000`.
- The web app's server then gets `SPEECH_SERVICE_URL` (the https address) and the same
  `SPEECH_SERVICE_KEY`.
- The image runs on CPU (`WHISPER_DEVICE=cpu`, int8). Give it at least 4 GB of RAM. Answers are
  analysed one at a time; an answer video takes about as long as it plays.
- Check it with `curl https://<address>/health`.

## Model and settings

The Whisper weights are not in git. They are in the team's private Hugging Face repo named in
`shared/model-hub.json`, pinned to one revision and checked against the SHA-256 listed there. Pull
them with the read token the maintainer shares privately (files already up to date are skipped):

```bash
HF_TOKEN=<read token> uv run python -m app.pull_model
```

It saves the Whisper model into `WHISPER_MODEL_DIR` and the vision models into `VISION_MODEL_DIR`:

| Variable | Default |
|---|---|
| `WHISPER_MODEL_DIR` | `ml/artifacts/whisper/v0/ct2` in this repo |
| `WHISPER_DEVICE` | `cpu` (`cuda` needs the CUDA 12 cuBLAS and cuDNN 9 libraries) |
| `WHISPER_COMPUTE_TYPE` | `int8` |
| `VISION_MODEL_DIR` | `apps/web/public/models` in this repo (face, pose, object and behaviour models for `/analyze-video`) |
| `WHISPER_CPU_THREADS` | half the CPU cores |
| `ECHOCV_SHARED_DIR` | `shared/` in this repo |
| `SPEECH_SERVICE_KEY` | unset: no key check. Set it on every hosted service, and give the backend the same value |
| `SPEECH_AUDIO_URL_HOSTS` | unset: `audioUrl` refused. Comma-separated hostnames, e.g. the Supabase project host |

To run the end-to-end test on a local recording (never commit it):

```bash
SPEECH_SAMPLE_AUDIO=path/to/answer.webm SPEECH_SAMPLE_LANGUAGE=id uv run pytest tests/test_ml.py
```

Word frequencies come from wordfreq (data CC BY-SA 4.0, by Robyn Speer and contributors).

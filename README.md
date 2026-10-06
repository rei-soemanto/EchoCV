# EchoCV

AI interview coach for Indonesian IT students and fresh graduates. It gives feedback on how an
answer is delivered in Indonesian or English (eye contact, posture, smile, filler words, pace,
pauses, voice) and on the answer's content.

- Architecture: [docs/superpowers/specs/2026-10-06-echocv-architecture-design.md](docs/superpowers/specs/2026-10-06-echocv-architecture-design.md)
- Tech stack and datasets research: [docs/tech-stack-and-datasets.md](docs/tech-stack-and-datasets.md)

## Repository layout

| Path | What | Tooling |
|---|---|---|
| `apps/web` | Next.js app: UI, API routes, in-browser vision | pnpm, Vitest, Playwright |
| `services/speech` | FastAPI speech service (VAD, ASR, prosody, upload-mode vision) | uv, Python 3.12, pytest |
| `ml` | YOLO training, Whisper fine-tune notebooks, score calibration | uv, Python 3.12, CUDA torch |
| `shared` | Rubric, labels and JSON Schemas used by web and speech | pnpm package `@echocv/shared` |
| `docs` | Design docs, data-collection protocol, consent form | — |

## Prerequisites

- Node 22+ and pnpm 11 (`corepack enable` or `npm i -g pnpm`)
- [uv](https://docs.astral.sh/uv/) (it installs Python 3.12 itself; the system Python version doesn't matter)
- For upload-mode work: ffmpeg (`winget install Gyan.FFmpeg`)
- Docker is **not** needed locally. Everything runs natively; the speech service's Dockerfile is
  only for deployment and is built in CI.

## Setup and run

```bash
pnpm install
cp .env.example apps/web/.env.local       # fill in keys as they become available

pnpm dev:web                              # http://localhost:3000
pnpm test                                 # Vitest
pnpm --filter web exec playwright install chromium   # once
pnpm --filter web test:e2e                # Playwright

cd services/speech
uv sync
uv run uvicorn app.main:app --reload      # http://localhost:8000/health
uv run pytest
```

## Never commit

Model weights (use the Hugging Face Hub), datasets, interview recordings and `.env` files. The
`.gitignore` covers these; check `git status` before committing.

## Week-1 checklist

Build checks:
- [ ] `cd services/speech && uv sync --group ml`, then confirm
      `uv run python -c "import mediapipe, faster_whisper, silero_vad, librosa"` works on 3.12.
- [ ] `cd ml && uv sync`, then confirm `torch.cuda.is_available()` is `True` on the RTX 3050 Ti.
- [ ] faster-whisper large-v3-turbo int8 runs on CUDA (needs the CUDA 12 cuBLAS + cuDNN 9 DLLs on
      Windows) and on CPU as a fallback.
- [ ] Benchmark MediaPipe Face Landmarker + yolo26n-pose together in the browser on the slowest
      team laptop.
- [ ] In Colab: LiteRT `w8a32` export of yolo26n-pose; check the `nms` / end-to-end output.

Data and admin:
- [ ] Send gated dataset requests through the supervising lecturer (MIT Interview, MA-52, IMED,
      DIKE-Face).
- [ ] Draft the consent form and data-collection protocol (`docs/`), and the bilingual question bank.
- [ ] Start recording mock interviews.

Team decisions (architecture doc §5):
- [ ] Database / auth / storage provider.
- [ ] Licence and repo visibility (Ultralytics YOLO is AGPL-3.0).

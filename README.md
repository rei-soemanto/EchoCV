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
| `supabase` | Supabase config and SQL migrations (database, row-level security, storage buckets) | Supabase CLI |
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

npx supabase link --project-ref <your-project-ref>   # once, against the team Supabase project
npx supabase db push                      # apply supabase/migrations

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

## Features

| Feature | Status |
|---|---|
| Database, row-level security and private storage for answer audio and videos | Done |
| Behaviour detector v1 and posture calibration on laptop-webcam recordings | Done |
| Speech analysis of an answer: fillers, pauses, pace, pitch, volume and language mixing | Done |
| In-browser vision models with a WebGPU path and a CPU fallback | Done |
| End to end test skeleton | Done |
| Browser and webcam test matrix | Done |
| MVP test plan and acceptance tests | Done |
| MVP acceptance criteria and sprint scope | Done |
| Bilingual interview question bank starter dataset | Done |
| Starting, finishing and cancelling a practice session with its questions | Done |
| Smile shown as feedback only, outside the overall score, and one shared setting for session length and timers | Done |
| Speaking pace target ranges for Indonesian and English answers | Done |
| Eye contact and smile in the browser with a 5-second calibration | In progress |

## Progress so far

- The database stores profiles, consents, practice sessions, questions, answers, uploads and reports. Every table has row-level security so a user only ever sees their own data, and answer audio and videos go to private storage buckets.
- Eye contact, smile, looking down at notes and the four behaviours (touching the face, arms crossed, slouching, reading notes) are now tuned on the team's own laptop-webcam recordings and measured on people the models never saw. With seven people, eye-contact accuracy rose from F1 0.70 to 0.89 and reading notes is detected at F1 0.77; a test on three people the first models never saw is included. The results are in `docs/model-report-v1.md`.
- The speech service analyses a recorded answer in Indonesian or English: it finds vocal fillers such as "eee" and "hmm", filler words like "jadi" or "kayak" when they come with a hesitation, pauses and long pauses, words and syllables per second, pitch, pitch variation and volume, and marks each word as Indonesian or English so language mixing can be shown. A one-minute answer takes about half a minute on a laptop CPU.
- The face, pose, object and behaviour models now load in the browser: on WebGPU where the browser has it, and on the CPU otherwise, with a clear message when neither works. The browser letterboxes and decodes frames exactly as during calibration, checked against the Python models on the team's recordings.
- Built the Playwright end-to-end test skeleton with page objects for setup, calibration, interview room, upload and reports, verified with fake media streams.
- Defined the browser and webcam test matrix covering Chrome, Edge, Safari and Firefox across team laptop profiles and mobile viewports for landing and report pages.
- Added the MVP test plan and acceptance tests covering authentication, calibration, live practice, upload mode, and feedback reports.
- Defined testable MVP acceptance criteria, business-rule checks, and sprint scope boundaries across live practice and upload modes.
- Started the bilingual Indonesian and English interview question bank in `shared/questions/` covering general, behavioural, and IT role-specific sets.
- A signed-in user can start a practice session for their role, level, language, question set and mode, and gets three matching questions in the session language (or one "tell me about yourself" question for a quick start). The mode and language stay fixed, and the session can be finished or cancelled.
- Smile is now shown as feedback only and no longer counts in the overall score, and the number of questions, the 15-second preparation time and the 3-minute answer limit come from one shared setting in `shared/session.json`.
- Speaking pace now has its own target range for Indonesian and English, measured on the team's recorded answers: pace is judged in syllables per second so Indonesian answers are not rated slower, and shown in words per minute (about 120 to 145 in Indonesian and 140 to 175 in English for the team). These ranges are a first estimate until they are checked against HR ratings.
- The browser can now take a 5-second look-at-the-camera calibration and then measure eye contact and smile against it for every answer, using the constants tuned on the team's recordings and checked against the Python calibration code. It gives a live hint when the face leaves the frame or the gaze stays away, and counts time out of frame as no eye contact.
- The sessions API, the QA test plan and the MVP acceptance criteria now all use the same session settings (3 questions, 15-second preparation, 3-minute answers), the smile rule and the pace ranges from `shared/`.

## Contributors

| Name | Work |
|---|---|
| Ivan | Defined the MVP acceptance criteria, business-rule verification checks, and scope boundaries across live practice and upload modes. Created the bilingual Indonesian and English interview question bank starter dataset across general, behavioural, and IT role-specific sets. |
| Kenjo | Built the Playwright end-to-end test skeleton with page objects for setup, calibration, interview room, upload and reports. |
| Life | Set up the Supabase database, row-level security and private storage so each user's practice data stays their own. Built the sessions API that starts a practice session with matching questions from the question bank and finishes or cancels it. |
| Rei | Tuned the eye-contact, smile, looking-down and posture rules and trained behaviour detector v1 on the team's own webcam recordings, so feedback holds up on ordinary laptop cameras. Built the speech analysis that turns a recorded answer into fillers, pauses, pace, pitch, volume and language mixing. Packaged the face, pose, object and behaviour models to run in the browser, with a CPU fallback when WebGPU is missing. Kept smile out of the overall score and put the session length and timers in one shared setting. Measured the team's speaking pace in both languages to set fair pace ranges for Indonesian and English. Brought the sessions API, test plan and acceptance criteria in line with these shared settings. Built the in-browser eye-contact and smile measurement with its 5-second calibration and live hints. |

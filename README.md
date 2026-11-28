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
pnpm models:pull                          # face, pose, object and behaviour models (HF_TOKEN in .env.local)

pnpm dev:web                              # http://localhost:3000
pnpm test                                 # Vitest
pnpm --filter web exec playwright install chromium   # once
pnpm --filter web test:e2e                # Playwright

npx supabase link --project-ref <your-project-ref>   # once, against the team Supabase project
npx supabase db push                      # apply supabase/migrations

cd services/speech
uv sync --group ml
HF_TOKEN=<read token> uv run python -m app.pull_model   # Whisper model into ml/artifacts/whisper/v0/ct2
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
| Sign in with Google or an email link, with first-time profile and consent | Done |
| Sign-in and sign-up pages with profile, age check and consents | In progress |
| Backend connection to the speech service | Done |
| Uploading an answer's audio and analysing its speech | Done |
| Session report with delivery and content scores | Done |
| Uploading an answer video with a processing status | Done |
| Upload page with upload progress and analysis status per question | In progress |
| Upload analysis that keeps running after the user leaves, with a reason for each failure | Done |
| Practice history with score trends and the weakest aspect | Done |
| Download my data, delete my account and change consent | Done |
| Score bands calibrated on the team's recorded answers, fair to higher and lower voices | Done |
| Smile shown as feedback only, outside the overall score, and one shared setting for session length and timers | Done |
| Speaking pace target ranges for Indonesian and English answers | Done |
| Speech service ready for the backend: audio by signed link and a service key | Done |
| Eye contact and smile in the browser with a 5-second calibration | Done |
| Posture and behaviour events in the browser: touching the face, arms crossed, slouching, reading notes | Done |
| One command to download the models from a private Hugging Face repo | Done |
| Upload mode vision on the server: eye contact, smile and posture events from an uploaded answer video | Done |
| Speech service deployment image, checked and published by CI | Done |
| Speech service hosted on Google Cloud Run in Jakarta | Done |
| More accurate transcripts and a faster start of a practice session | Done |
| Web app hosted on Vercel at echocv-beta.vercel.app | Done |
| Live practice from session setup through calibration and the interview room to analysed answers | In progress |
| Quick start: a one-question "introduce yourself" session | In progress |
| Real practice history on the dashboard, history and progress pages, and the privacy page | In progress |
| Landing page with all four plans | Done |
| Plans page, with checkout waiting for the Midtrans sandbox API | In progress |
| Midtrans sandbox checkout, payment webhook and current-plan API | Done |
| Report page with scores, time-stamped tips, transcripts and answer content feedback | In progress |

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
- Users can sign in with Google or a sign-in link sent by email. On first sign-in the app saves their profile and consent choices: analysis consent is required, training and sharing stay off unless they turn them on, and users under 18 cannot register on their own. Practice, report and dashboard pages now need a signed-in user.
- The app now has its sign-in and sign-up pages: sign in with an email link or Google, then, the first time, give a name, date of birth (18 or older), status, language and consents, with the analysis consent required and the optional ones off. Nobody reaches practice, reports or the dashboard before that is saved, and the sidebar shows who is signed in and lets them sign out. Email sign-in and sign-up work with a real account; Google sign-in has not been tried yet.
- The backend can send a recorded answer to the speech service and get its speech metrics back, waiting a limited time and trying again when the service is busy or unreachable.
- In a live session, the browser can upload each answer's audio straight to private storage with a short-lived signed link, then ask the backend to analyse it: the speech service fetches the recording by its own signed link and the speech metrics, transcript and the browser's eye-contact numbers are saved with the answer. Re-recording a question is allowed until it is analysed, and a busy speech service can be retried.
- A finished session now gets a report: each delivery aspect is scored from editable scoring bands, the answer content (STAR, relevance, clarity) is scored by the AI in the session language, and the overall score follows the shared rubric with smile left out. Time-stamped tips point to long pauses, fillers and body language. If the AI is unavailable the delivery scores are still saved and the content score can be retried, and the answer audio is deleted afterwards unless the user agreed to keep it. The scoring bands are a first estimate until they are checked against HR ratings.
- In upload mode, the browser can upload an answer video of up to 10 minutes and 500 MB (MP4, MOV or WebM) straight to private storage. The backend sends it to the speech service in the background and the upload page can check its progress; the video is always deleted afterwards, and an analysis that fails is marked as not counted.
- Upload mode now has its page: for each question, pick or drop one video (checked for type, 500 MB and 10 minutes before it is sent), see the upload progress, cancel it, or skip the question, and upload the next video while earlier ones are analysed. Closing and reopening the page picks up where it was, a failed analysis can be uploaded again, and the session goes to its report when every question is done. Not yet tried with real Supabase and the speech service.
- A sent video now keeps being analysed after the user closes the page. The app can list the user's recent videos with their session and pick up each one's status again later, an analysis that runs too long is stopped and marked not counted instead of hanging, and every failure comes with a reason the page can show: too long to analyse, the analysis service is busy, the video could not be read, the file is too large, or a server problem.
- The dashboard can now load a user's practice history in one request: past sessions with their overall score, score trends over time for the overall score and every aspect, each aspect's average, the weakest aspect to work on (smile is never picked) and how much the score has changed since the first session.
- Users can now download all their data as a file, delete their account together with every session, score and stored recording, and turn the training and HR rater consents on or off at any time. Turning off the last of those two consents deletes the audio kept so far. Recordings left in storage after their limit (24 hours to start with) are deleted automatically by a scheduled job, except analysed audio the user agreed to keep.
- Smile is now shown as feedback only and no longer counts in the overall score, and the number of questions, the 15-second preparation time and the 3-minute answer limit come from one shared setting in `shared/session.json`.
- Speaking pace now has its own target range for Indonesian and English, measured on the team's recorded answers: pace is judged in syllables per second so Indonesian answers are not rated slower, and shown in words per minute (about 120 to 145 in Indonesian and 140 to 175 in English for the team). These ranges are a first estimate until they are checked against HR ratings.
- The speech service can now take an answer either as an uploaded file or as a signed storage link that it downloads itself, only from the project's storage host, and it accepts requests only from the backend once a service key is set.
- The browser can now take a 5-second look-at-the-camera calibration and then measure eye contact and smile against it for every answer, using the constants tuned on the team's recordings and checked against the Python calibration code. It gives a live hint when the face leaves the frame or the gaze stays away, and counts time out of frame as no eye contact.
- The device check page now has the 5-second calibration: the user looks at the lens while a countdown runs over the camera preview, the baseline is kept in the browser tab for the interview room, and the interview can only start once it succeeds. When no face is seen it says so and offers a retry, it notes when the face model runs on the CPU, and it points to Chrome, Edge or Upload mode when the browser cannot run it. Not yet tried on a real webcam.
- During a live answer the browser now notices touching the face, crossed arms and slouching from body keypoints, and reading notes held up or on the desk, using the rules and detector tuned on the team's recordings and checked number for number against the Python calibration code. Each behaviour becomes a time-stamped event for the report, and the current ones are available for live hints.
- The sessions API, the QA test plan and the MVP acceptance criteria now all use the same session settings (3 questions, 15-second preparation, 3-minute answers), the smile rule and the pace ranges from `shared/`.
- A signed-in user can now set up a live session (role, level, question set, language, mode), calibrate, and answer the questions in the interview room: 15 seconds to prepare, up to 3 minutes per answer, calm live hints for eye contact and posture, one restart per question, and skip. Each answer's audio and its eye-contact, smile and behaviour numbers are sent for analysis, a busy speech service can be retried, and the session finishes when the last question is done. Not yet tried end to end with real Supabase and a real webcam.
- The report's score bands are now measured on the team's recorded answers instead of starting guesses: full marks start at the team's typical answer, and zero sits at the staged clips (looking away, slouching and the other behaviours) for eye contact and posture, or at twice the team's worst answer for fillers, long pauses and language mixing. Pace has its own band per language, and voice is judged on pitch variation relative to the speaker's own pitch, so higher and lower voices are scored alike. The bands are a first estimate until they are checked against HR ratings.
- Every teammate can now download the face, pose, object and behaviour models with `pnpm models:pull`, and the speech service's Whisper model with one command in `services/speech`, from a private Hugging Face repo using a shared read-only token. Each file is pinned to one upload and checked before use, so everyone runs exactly the same models.
- A finished session now opens its report page: the overall score, fillers per minute, long pauses and the content score, a pace meter against the session language's target range, and for each question a timeline of issues, time-stamped tips, the transcript with fillers marked and what went well or could improve in the answer. The report is built the first time it is opened, and answer content the AI could not score yet can be scored again from the page. Not yet tried end to end with real Supabase.
- The report's filler target now comes from the scoring bands, so it always matches how fillers are scored, and reports from Upload mode say that eye contact, smile and posture are less precise than in Live mode.
- The flow is smoother before the MVP demo: the interview room now finishes the session after the last question (it used to start over), a double click no longer skips two questions, and failed skips or recordings can be retried. First-time users get a short guide before the first question, "Latihan cepat" starts a one-question session, the report leads with the three aspects that cost the most points and one next step for each, and broken or missing pages explain themselves in Indonesian. Not yet tried with a real recording.
- After the mid-MVP check, the app pages show the user's own data: the dashboard, session history and progress pages read the real practice history, and the privacy page changes consents, downloads the user's data and deletes the account. The date of birth fills in three boxes that move on by themselves, new sessions start in the language chosen at sign-up, waiting for an upload or a report shows a moving progress bar, upload failures say exactly what went wrong, the calibration face guide is centred with the countdown above the preview, and small notes are larger and darker. Not yet tried with a signed-in account.
- The landing page now lists all four plans, including Tahunan at Rp 299.000 a year, each leading to the plans page, and a visitor who is already signed in sees "Ke beranda" instead of "Masuk".
- Signed-in users now have a plans page with the four plans and their current one (Gratis for everyone for now). The buy buttons stay off until the Midtrans sandbox checkout is ready.
- Plans can now be bought through the Midtrans sandbox: the server sets the price from the plans table, creates the Snap payment, and activates Sprint Pass (7 days), Premium (30 days) or Tahunan (365 days) only when Midtrans sends a correctly signed payment notification for the right amount. A repeated notification never activates a plan twice, and buying again adds to the time still left.
- The speech service can now analyse an uploaded answer video in one request: the video's audio gets the usual speech analysis, and sampled frames go through the same face, pose, object and behaviour models as the browser to give eye contact, smile and posture events. With no calibration step, upload mode measures against the first seconds of the answer and says so, so the report can mark it as less precise than Live mode. The video is deleted as soon as the request ends. On a laptop CPU a video takes about as long as it plays, and on two of the team's answers eye contact came within a percentage point of the calibration measurements.
- The speech service now has a deployment image that CI builds, starts and checks on every pull request, then publishes on every merge. A host only needs Docker and three settings: on first start the container downloads its models itself, and the service is then reached over https by the web app.
- The speech service now runs on Google Cloud Run in Jakarta, so answers are analysed in Indonesia: audio and video analysis both work on the hosted service. It scales to zero when nobody practises, keeps its models in a private bucket so a cold start downloads nothing, and accepts only requests with the backend's service key.
- The web app is live at https://echocv-beta.vercel.app, hosted on Vercel in Singapore next to the database. It talks to the hosted speech service, downloads the browser models while it builds, and keeps its keys in Vercel's hidden settings instead of the repository.
- Leftover answer recordings are now cleaned up automatically every night at 02:00 WIB by a scheduled job on the host, and the build steps live in the repository instead of only in the host's settings.
- Transcripts are more accurate: measured against hand-corrected answers, the speech service now gets about 11 in 100 words wrong instead of 13, with half as many missing words in Indonesian, for about 5% more processing time. A practice session also opens faster: the face, pose and behaviour models start loading during the device check, load at the same time instead of one after another, and are reused from calibration instead of being loaded twice.

## Contributors

| Name | Work |
|---|---|
| Dave | Built the app shell and pages from the Paper and Ink design, with the landing page, dashboard and sidebar navigation. Added webcam and microphone capture with the device check page, which records only the audio so video stays on the device. Built the 5-second calibration screen that gates the interview room. Built the live practice flow: session setup, the interview room with timers, live hints, restart and skip, and sending each answer for analysis. Built the report page with scores, time-stamped tips, transcripts and content feedback. Built the sign-in and sign-up pages. Built the upload page with progress for Upload mode. Polished the practice flow with a first-time guide, quick start, next steps in the report and error pages. Connected the dashboard, history, progress and privacy pages to real data and made the mid-MVP check fixes. Finished the landing page with all four plans. Built the plans page. |
| Ivan | Defined the MVP acceptance criteria, business-rule verification checks, and scope boundaries across live practice and upload modes. Created the bilingual Indonesian and English interview question bank starter dataset across general, behavioural, and IT role-specific sets. |
| Kenjo | Built the Playwright end-to-end test skeleton with page objects for setup, calibration, interview room, upload and reports. |
| Life | Set up the Supabase database, row-level security and private storage so each user's practice data stays their own. Built the sessions API that starts a practice session with matching questions from the question bank and finishes or cancels it. Added sign-in with Google or an email link, first-time profile and consent saving, and protected app pages. Connected the backend to the speech service so an answer's recording comes back as speech metrics. Built the uploads API that stores each answer's audio in private storage and saves its speech and eye-contact metrics. Built the reports API that scores delivery and answer content, saves the report and deletes the audio unless the user chose to keep it. Added video uploads for upload mode with a processing status the upload page can check. Built the practice history API behind the dashboard's score trends. Added data download, account deletion, consent changes and the automatic clean-up of leftover recordings. Put the web app online on Vercel, connected to the hosted speech service and the database, with a nightly clean-up of leftover recordings. |
| Life | Set up the Supabase database, row-level security and private storage so each user's practice data stays their own. Built the sessions API that starts a practice session with matching questions from the question bank and finishes or cancels it. Added sign-in with Google or an email link, first-time profile and consent saving, and protected app pages. Connected the backend to the speech service so an answer's recording comes back as speech metrics. Built the uploads API that stores each answer's audio in private storage and saves its speech and eye-contact metrics. Built the reports API that scores delivery and answer content, saves the report and deletes the audio unless the user chose to keep it. Added video uploads for upload mode with a processing status the upload page can check. Built the practice history API behind the dashboard's score trends. Added data download, account deletion, consent changes and the automatic clean-up of leftover recordings. Put the web app online on Vercel, connected to the hosted speech service and the database. Built the Midtrans sandbox checkout, the signed payment webhook that activates a plan, and the API that tells the app which plan a user is on. |
| Rei | Tuned the eye-contact, smile, looking-down and posture rules and trained behaviour detector v1 on the team's own webcam recordings, so feedback holds up on ordinary laptop cameras. Built the speech analysis that turns a recorded answer into fillers, pauses, pace, pitch, volume and language mixing. Packaged the face, pose, object and behaviour models to run in the browser, with a CPU fallback when WebGPU is missing. Kept smile out of the overall score and put the session length and timers in one shared setting. Measured the team's speaking pace in both languages to set fair pace ranges for Indonesian and English. Brought the sessions API, test plan and acceptance criteria in line with these shared settings. Let the speech service fetch answers from a signed storage link and accept only the backend's requests. Built the in-browser eye-contact and smile measurement with its 5-second calibration and live hints. Made the browser spot touching the face, crossed arms, slouching and reading notes during an answer. Calibrated the report's score bands on the team's recorded answers and made the voice score fair to higher and lower voices. Put the models in a private Hugging Face repo that every teammate can download from with one command. Made the speech service measure eye contact, smile and posture from uploaded answer videos for Upload mode. Built the speech service deployment image that CI checks and publishes, and set up the speech service on Google Cloud Run in Jakarta. Made transcripts more accurate, measured on hand-corrected answers, and made practice sessions open faster. |

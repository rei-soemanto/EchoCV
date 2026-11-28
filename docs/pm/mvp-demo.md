# EchoCV MVP Demo Script

Runbook and presenter script for the EchoCV Minimum Viable Product demonstration on **Monday, 30 November 2026**, aligned with [docs/pm/mvp-acceptance-criteria.md](mvp-acceptance-criteria.md), [docs/qa/test-plan.md](../qa/test-plan.md), and [docs/model-report-v1.md](../model-report-v1.md).

- **Target environment:** Deployed web app at `https://echocv-beta.vercel.app` (Vercel Singapore) connected to the FastAPI speech service on Google Cloud Run (Jakarta), Supabase (Auth, Postgres with RLS, private Storage), Google Gemini 3.5 Flash (paid tier), and Midtrans Snap sandbox.
- **Target duration:** 15 minutes total (12 minutes guided walkthrough + 3 minutes Q&A and technical verification).
- **Primary demo language:** Bahasa Indonesia UI and interview session (matching the default candidate flow), with a brief bilingual English check noted during setup/questions.

---

## 1. Presenter Roles and Timing

| Segment | Route / Surface | Owner | Duration | Key Proof Point |
|---|---|---|---|---|
| 1. Problem & Landing | `/` | PM | 1.0 min | Value proposition, Paper & Ink design, privacy promise, 4 plans |
| 2. Auth & Onboarding | `/sign-in`, `/sign-up` | Backend | 1.5 min | Passwordless email/Google auth, 18+ gate (`BR-01`), opt-in consents (`BR-02`) |
| 3. Dashboard & Quick Start | `/dashboard`, `/practice?quick=1` | Frontend | 1.0 min | Real history stats, weakest aspect focus, 1-question quick start (`UC-02 A1`) |
| 4. Live Practice Mode | `/practice` → `/practice/check` → `/practice/room` | Frontend + AI / Tech Lead | 3.5 min | 5s personal calibration, on-device vision hints, `BR-04` audio-only upload |
| 5. Upload Practice Mode | `/practice` → `/upload` | Backend + AI / Tech Lead | 1.5 min | `50 MB` / `3 min` validation, async progress polling, `BR-05` video deletion |
| 6. Feedback Report | `/report/[id]` | UI/UX + Backend | 2.0 min | `BR-08` disclaimer, Pace Meter, Timecode Tape, fillers, Gemini STAR, `BR-09` |
| 7. History, Progress, Plans & Privacy | `/history`, `/progress`, `/plans`, `/privacy` | QA + PM | 1.5 min | Trend bars, Midtrans sandbox architecture, UU PDP 27/2022 data controls |
| 8. Q&A & Technical Verification | `docs/model-report-v1.md`, CI, Sec. 5 | QA + PM | 3.0 min | Q&A backup: LOPO F1 (`0.891` eye contact), ~11% WER, CI gates, Dec 7 roadmap |

---

## 2. Pre-Demo Checklist (30 Minutes Before Start)

- [ ] **Warm up Cloud Run speech service:** Send a health check request to the Jakarta Cloud Run `/health` endpoint 10 minutes before the demo so the container is warm and Whisper/vision weights are ready in memory.
- [ ] **Check browser & hardware:** Run the demo in latest **Google Chrome** or **Microsoft Edge** on a laptop with working webcam and microphone. Ensure OS camera effects (Windows Studio Effects, macOS Portrait / Center Stage, manufacturer blur) are turned **off**.
- [ ] **Prepare two clean demo accounts:**
  - **Account A (Returning user):** Has at least 2–3 finished Live and Upload sessions with saved reports, so `/dashboard`, `/history`, `/progress`, and a pre-completed `/report/[id]` load with real trends immediately.
  - **Account B (Fresh test user, optional):** Pre-verified email/Google login ready at `/sign-up` if asked to walk through the 4-step 18+ and consent onboarding live.
- [ ] **Prepare sample upload video:** Keep one pre-recorded `.mp4` interview answer (**15–25 seconds, < 15 MB**) ready on the desktop so Upload mode completes analysis cleanly within the demo window, plus one oversized (`> 50 MB`) or invalid file if demonstrating validation.
- [ ] **Verify `/plans` checkout UI state:** Confirm before going on stage whether `/plans` buy buttons are wired to the Snap sandbox modal or still in read-only preview (`Pembayaran lewat Midtrans sedang disiapkan`); adjust Segment 7 narration accordingly so UI state and narration match 100%.
- [ ] **Open fallback tabs:** Keep a pre-completed Live report and Upload report open in background tabs in case conference room Wi-Fi stalls during audio/video upload.

---

## 3. Step-by-Step Demo Script

### Segment 1 — Opening & Landing Page (`/`) · PM (1.0 min)

1. Open `https://echocv-beta.vercel.app` while signed out (or in an incognito/clean browser window).
2. Point out the hero headline and value proposition: *"Latihan wawancara kerja dengan umpan balik yang tenang."* Explain who EchoCV serves: Indonesian IT students and fresh graduates preparing for technical and behavioural interviews in Indonesian or English.
3. Highlight three key elements on `/`:
   - **Privacy-first Live promise (`BR-04`):** *"Mode Live: video Anda dianalisis di perangkat dan tidak dikirim ke server."*
   - **Annotated Paper & Ink report preview (`#contoh-laporan`):** Show the `PaceMeter`, `TimecodeTape`, and `FeedbackMarker` right on the landing page so reviewers immediately understand the signature time-stamped feedback.
   - **3-step `Cara kerja`, `Paket`, and footer:** Scroll briefly past the 3 numbered steps (`01 Rekam jawaban`, `02 Baca laporan`, `03 Ulangi dan bandingkan`), the 4 plans (`Gratis`, `Sprint Pass Rp 15.000`, `Premium Rp 29.000`, `Tahunan Rp 299.000`, campus note `Rp 50.000 per mahasiswa per tahun`), and the footer showing `Privasi dan data` alongside the `BR-08` disclaimer.
4. Click **"Masuk"** in the header to move to `/sign-in`.

> **Narration cue (PM):** *"EchoCV coaches how candidates deliver an answer and what they say—without sending live webcam video to a server or judging appearance."*

---

### Segment 2 — Authentication, Age Gate & Consents (`/sign-in`, `/sign-up`) · Backend (1.5 min)

1. On `/sign-in`, show passwordless sign-in options via **email link** (`Lanjutkan dengan email`) and **Google OAuth** (`Lanjutkan dengan Google`) backed by Supabase Auth, plus the `18+` eligibility notice.
2. Walk through the 4-step `/sign-up` onboarding (either live with Account B or via prepared screens):
   - **Step 1:** Full name (`Siapa nama Anda?`).
   - **Step 2:** Date of birth with auto-advancing `DD -> MM -> YYYY` fields, enforcing age **18+** (`BR-01`) both in UI validation and the Postgres `profiles_require_adult` trigger.
   - **Step 3:** Candidate status (`Mahasiswa`, `Lulusan baru`, `Sudah bekerja`, `Mencari kerja`) and job field (`IT`).
   - **Step 4:** Preferred interview language (`Bahasa Indonesia` / `English`) and **Privacy Consents (`BR-02`)**:
     - `Analisis jawaban latihan (wajib)` — required to generate reports.
     - `Pelatihan model (opsional)` & `Penilaian oleh praktisi HR (opsional)` — **unchecked (`false`) by default**.
3. Sign in with **Account A** to enter the protected `(app)` layout.

> **Narration cue (Backend):** *"Every database table uses Supabase Row-Level Security so candidates can only read and write their own rows, and optional training consents stay off unless explicitly opted in."*

---

### Segment 3 — Dashboard & Quick Start (`/dashboard`, `/practice?quick=1`) · Frontend (1.0 min)

1. On `/dashboard`, point out:
   - Personalized greeting and summary metrics (`Skor latihan terakhir`, `Perubahan sejak sesi pertama`, `Sesi dengan laporan`).
   - **"Fokus berikutnya"** section showing the lowest-scoring aspect (never `Senyum`, respecting `BR-09`) with a concrete next step and **"Latih sekarang"** shortcut.
   - **"Sesi terakhir"** table linking directly to completed reports.
2. Click **"Latihan cepat: perkenalkan diri"** (`/practice?quick=1`) to show `UC-02 A1`:
   - Notice the setup page skips the question-set picker and prepares a single-question `q01` (*"Perkenalkan diri Anda dan ceritakan latar belakang pendidikan Anda."*) warm-up session (`1 pertanyaan, maks. 4 menit`).
3. Return to `/practice` (**"Latihan baru"** in the sidebar) to configure the full Live session.

---

### Segment 4 — Live Practice Mode End-to-End (`/practice` → `/practice/check` → `/practice/room`) · Frontend + AI / Tech Lead (3.5 min)

1. **Session Setup (`/practice`):**
   - Select **Peran yang dilamar** (e.g., `Backend developer` or `Frontend developer` from the 7 curated IT roles), **Tingkat pengalaman** (`Fresh graduate`), **Set pertanyaan** (`Perilaku (STAR)`), **Bahasa** (`Bahasa Indonesia` — pre-filled from sign-up preference), and **Mode latihan** (`Live: rekam sekarang`).
   - Point out the live sticky **"Ringkasan sesi"** (`3 pertanyaan, maks. 10 menit`) and quota note (*"Analisis yang gagal tidak mengurangi kuota"*, `BR-07`).
   - Click **"Lanjut ke kalibrasi"** (`POST /api/sessions` snapshots 3 matching questions from `shared/questions/bank.json` into `session_questions`, locking `mode` and `language` via `keep_session_settings()`, `BR-25` / `BR-26`).

2. **Device Check & 5-Second Calibration (`/practice/check?session=...`):**
   - Point out the four live readiness checks (`Kamera`, `Mikrofon`, `Pencahayaan`, `Koneksi internet`), the 24-bar voice meter (`Tes suara: ucapkan satu kalimat`), and the centred face guide (`face-guide.png`).
   - Mention that MediaPipe Face Landmarker and YOLO26n-pose models load in parallel in the browser (WebGPU with automatic CPU/ONNX fallback).
   - Click **"Mulai kalibrasi"** and look directly at the webcam lens for **5 seconds** while the countdown counts down above the camera preview.
   - Once **Selesai** badge appears, click **"Mulai wawancara"**.

3. **Live Interview Room (`/practice/room?session=...`):**
   - Show the brief 4-step **"Cara kerja ruang wawancara"** onboarding guide (for first-time sessions) and click **"Saya mengerti, mulai"**.
   - Show Question 1 of 3 (`Pertanyaan 1 dari 3`) and the **15-second preparation countdown** (`Persiapan`, `shared/session.json`). Click **"Mulai menjawab"** to begin recording immediately.
   - Answer naturally for ~20–30 seconds:
     - Look at the camera first -> show the green **"Bagus: Kontak mata dan postur Anda baik."** status.
     - Briefly touch the face or look away -> show the calm amber **"Perhatikan"** live hint badge updating without flashing.
     - Mention **"Ulangi jawaban"** (usable once per question) and **"Lewati pertanyaan"**.
   - Click **"Selesai dan analisis"** on Question 1. (To keep demo pacing crisp, answer Question 1 completely and click **"Lewati pertanyaan"** on Questions 2 and 3, or answer Question 2 briefly.)
   - **Optional quick proof (`BR-04`):** If time permits, open Browser DevTools -> Network tab before clicking **"Selesai dan analisis"** to confirm `POST /api/uploads` only requests a signed link, only the `.webm` audio file uploads to the signed Supabase Storage URL, and numeric `visual_metrics` JSON posts to `POST /api/uploads/[id]/complete`—**0 video bytes leave the browser**.
   - After the final question, the room calls `finishSession` and transitions straight to `/report/[id]`.

> **Narration cue (AI / Tech Lead):** *"Eye contact and posture are evaluated against the user's own 5-second calibration baseline right in the browser, tuned on our team's laptop-webcam recordings."*

---

### Segment 5 — Upload Practice Mode End-to-End (`/practice` → `/upload`) · Backend + AI / Tech Lead (1.5 min)

1. From `/practice`, create a new session choosing **Mode latihan: `Unggah: rekaman video`** (e.g., `QA engineer`, `Magang`, `Teknis sesuai peran`, `English`) and click **"Lanjut ke unggah"** (`/upload?session=...`).
2. Highlight client & server file validation from `shared/speech.json`: accepts **MP4, MOV, or WebM**, max **50 MB**, max **3 minutes** (matching Live mode's 3-minute answer limit).
3. Tick the required upload confirmations and drag-and-drop the prepared 15–25s `.mp4` clip for Question 1:
   - Point out the progress bar (`Mengunggah` -> `Dianalisis`) and explain **asynchronous processing**: a user can close the page and come back later without losing progress, or upload the next question while earlier ones analyze.
   - Explain the analysis pipeline: Jakarta Cloud Run runs `ffmpeg` frame sampling -> MediaPipe & YOLO26n-pose visual metrics + Silero VAD, fine-tuned `faster-whisper`, and `librosa` speech analysis; the web backend (`/api/reports`) then calls Gemini 3.5 Flash for STAR/content scoring and applies `shared/rubric.json`, while **the raw video is permanently deleted from Supabase Storage immediately after analysis (`BR-05`)**.
   - Note that failed uploads are marked not counted and offer retry (`BR-07`).
4. Skip remaining questions or switch to the pre-completed Upload report tab if analysis takes > 25 seconds on conference Wi-Fi.

---

### Segment 6 — Feedback Report (`/report/[id]`) · UI/UX + Backend (2.0 min)

1. Open the finished Live report (and briefly compare the Upload report's `"Mode Unggah: kurang presisi"` notice explaining its uncalibrated opening-seconds baseline).
2. Walk top-to-bottom through the Paper & Ink report layout:
   - **Summary stats:** `Skor latihan` (`0–100`), `Kata pengisi per menit` (compared to the calibrated band target), `Jeda panjang` (`> 2 detik`), and `Isi jawaban` (`0–100`).
   - **Mandatory disclaimer (`BR-08`):** *"Skor ini adalah latihan berbasis AI, bukan prediksi hasil wawancara kerja."*
   - **"Fokus latihan berikutnya":** Leads with the strongest aspect and the top 3 lowest-scoring aspects, each paired with one concrete next step.
   - **Pace Meter (`Tempo bicara dan penanda waktu`):** Shows WPM against the session language's calibrated band (`~119–146` WPM Indonesian / `~138–173` WPM English in `shared/thresholds.json`, scored on syllables per second so Indonesian answers are fairly judged).
   - **Interactive Timecode Tape + Feedback Markers:** Point out amber issue ticks aligned to exact seconds of pauses, fillers, or posture events.
   - **Verbatim Transcript:** Shows `[EEE]` / `[HMM]` / `[UM]` vocal fillers and Indonesian lexical fillers highlighted inline with timestamps.
   - **Content Coaching (Gemini 3.5 Flash):** Shows `Sudah baik` and `Bisa ditingkatkan` STAR feedback in the session language (explain paid-tier key so prompts never train third-party models per `BR-02`, plus code-switching rule `BR-27`/`BR-28` and the **"Nilai ulang isi jawaban"** retry button whenever content scoring is still pending).
   - **Aspect Breakdown (`Skor per aspek`):** Explicitly show the `BR-09` note: *"Senyum hanya umpan balik dan tidak dihitung dalam skor latihan."*

---

### Segment 7 — History, Progress, Plans & Privacy (`/history`, `/progress`, `/plans`, `/privacy`) · QA + PM (1.5 min)

1. **`/history` & `/progress`:** Show the full session log, overall score trajectory across sessions, and per-aspect average bars.
2. **`/plans`:** Show all four tiers (`Gratis Rp 0`, `Sprint Pass Rp 15.000 / 7 hari`, `Premium Rp 29.000 / bulan`, `Tahunan Rp 299.000 / tahun`, plus campus licensing note). Clarify that on `origin/main` the `/plans` page renders hardcoded `Paket Anda: Gratis` and disabled checkout CTAs (`Pembayaran lewat Midtrans sedang disiapkan`) until `KAN-77` wires `/api/plan` and Snap checkout, while the backend Midtrans Snap sandbox checkout, signed webhook verification, and idempotent plan activation (`/api/plans`, `/api/plan`, `/api/checkout`, `/api/payments/midtrans`) are implemented and tested. Demonstrate either the live Snap sandbox popup (if `KAN-77` wiring is deployed) or the read-only tier cards and server-authoritative pricing architecture (noting sandbox only—no real money moves).
3. **`/privacy`:** Demonstrate UU PDP 27/2022 controls:
   - Required `Analisis jawaban latihan` active indicator vs optional `Pelatihan model` and `Penilaian oleh praktisi HR` switches (toggling off immediately removes any kept audio files).
   - **"Unduh data saya"** full JSON export and **"Hapus akun"** (`HAPUS` confirmation modal), backed by the nightly `02:00 WIB` retention cron (`/api/retention`).

---

### Segment 8 — Q&A & Technical Verification · QA + PM (3.0 min)

Use this 3-minute Q&A and technical verification window (referencing Section 5 below as needed) to share verification metrics and close with the post-MVP roadmap:

1. **Verification & model benchmarks (as asked):**
   - **In-house model evaluation (`docs/model-report-v1.md`):** 7 participants, 9 sessions, 26,208 frames evaluated with leave-one-person-out (LOPO) cross-validation; eye-contact F1 improved from `0.704` (v0) to `0.891` (v1), `reading_notes` runs on `behaviour-v1.onnx` (`0.766` F1) alongside calibrated pose rules, and Whisper transcript WER improved from ~13% to ~11% on hand-corrected answers.
   - **Automated checks:** Web Vitest unit suites, Playwright E2E skeleton, and speech FastAPI pytest/ruff checks passing in CI.
2. **Post-MVP Sprint 4–8 focus (1–7 Dec 2026, code freeze 5 Dec, final submission 7 Dec):** LiteRT `.tflite` export and full browser/server parity for behaviour detector v1, real-speech Whisper filler evaluation on corrected transcripts, user testing round 1 + fixes, low-end laptop optimization, bilingual UI polish, user guide, and final demo video.

---

## 4. Contingency Plan (If Something Fails Live)

| Failure Scenario | Immediate Recovery Action |
|---|---|
| Webcam blocked or browser lacks WebGPU | Show the automatic CPU/WASM notice or clear recovery banner (`UC-03 E2`), then pivot seamlessly to Upload Mode (`/upload`). |
| Cloud Run speech container is slow on cold start or conference Wi-Fi stalls | Leave the async upload running (`Dianalisis`) to demonstrate non-blocking persistence, and switch to Account A's pre-completed report tab while analysis completes. |
| LLM content scoring returns timeout | Point out `UC-06 E1` graceful degradation: delivery scores persist immediately with `Ada isi jawaban yang belum dinilai` badge and the **"Nilai ulang isi jawaban"** retry button. |
| Live audio recording has background hall noise | Keep laptop close to speaker, or demonstrate the short pre-recorded `.mp4` sample in Upload Mode for clean transcription & STAR scoring. |

---

## 5. Anticipated Lecturer Q&A

1. **"How do you protect user video privacy?"** (`BR-04`, `BR-05`, UU PDP 27/2022)
   - In Live mode, MediaPipe and YOLO run locally inside the user's browser; zero raw video bytes ever leave the device—only `.webm` audio and numeric visual metrics are sent. In Upload mode, raw video is stored briefly in a private RLS-protected bucket and permanently deleted immediately after analysis, with a nightly `02:00 WIB` cleanup cron catching any abandoned uploads.
2. **"Does Gemini train on student interview transcripts?"** (`BR-02`)
   - No. EchoCV uses Gemini 3.5 Flash on the paid API tier (Contributor Tier disabled), and sends only the question prompt and speech transcript—never names, emails, or student IDs.
3. **"Why is Smile excluded from the overall score?"** (`BR-09`)
   - Different candidates and roles have different neutral expressions, and forced smiling can bias automated hiring scores. EchoCV treats smile as qualitative coaching feedback only (`weight: 0` in `shared/rubric.json`) and never scores appearance or clothing.
4. **"What happens if a candidate mixes Indonesian and English (Jaksel / code-switching)?"** (`BR-27`, `BR-28`)
   - Word-level language tagging isolates mixing. Code-switching never lowers delivery, STAR, or relevance scores; in an English-only session, mixing affects only the clarity score, and speaking pace is scored on `syllablesPerSecond` against separate Indonesian (`~119–146` WPM) and English (`~138–173` WPM) bands so Indonesian speech is not penalized as slow.
5. **"What remains between MVP Demo (30 Nov) and Final Submission (7 Dec)?"**
   - Exporting behaviour detector v1 to LiteRT `.tflite` with full browser/server parity, completing real-speech Whisper filler evaluation on corrected team transcripts, running Round 1 student user testing and fixes, low-end laptop optimization, full English UI parity, user guide, and final QA regression.

# MVP Acceptance Criteria and Sprint Scope

Acceptance criteria and scope boundary for the EchoCV Minimum Viable Product, aligned with the Paper & Ink design system, `docs/qa/test-plan.md`, `docs/model-report-v1.md`, and `supabase/migrations/20261120000000_data_model.sql`.

---

## 1. MVP Definition of Done

The MVP demo is on **Mon 30 Nov 2026**, at the end of the combined Sprint 2 and 3 (23–29 Nov 2026). Sprints 2 and 3 were merged into one sprint when the MVP deadline moved forward; Upload Mode stays in MVP scope.

The EchoCV MVP is complete when a signed-in candidate can complete both **Live Mode** and **Upload Mode** end-to-end on real data in a deployed environment:

1. **Both practice modes functional end-to-end:**
   - **Live Mode:** Browser-side webcam calibration and visual tracking (MediaPipe Face Landmarker + YOLO26n-pose keypoint rules) paired with microphone audio capture, server-side speech analysis, LLM content scoring, and persisted feedback report.
   - **Upload Mode:** Pre-recorded video upload via signed Supabase Storage URL, upload progress and processing status polling, server-side vision + speech extraction, LLM content scoring, immediate raw video deletion, and persisted feedback report.
2. **Infrastructure & Security:**
   - Web app (`apps/web`) and speech service (`services/speech`) deployed and connected.
   - Supabase Postgres schema (`20261120000000_data_model.sql`) active with Row-Level Security (RLS) enabled on all 7 tables (`profiles`, `consents`, `practice_sessions`, `session_questions`, `answers`, `uploads`, `reports`) and private storage buckets (`answer-audio`, `answer-videos`).
3. **Quality Gates:**
   - **CI checks:** `pnpm lint`, `pnpm test`, `pnpm build`, and `services/speech` checks (`ruff check`, `ruff format --check`, `pytest`, Docker build) pass in CI.
   - **Pre-PR / QA sign-off checks:** `pnpm --filter web typecheck`, `pnpm --filter web test:e2e`, and zero open Blocker (P0) or Critical (P1) defects per `docs/qa/test-plan.md`.

---

## 2. Testable Acceptance Criteria (`UC-01` through `UC-07`)

### `UC-01`: Authentication, Registration, and Consent

- **Sign-in & Route Protection:** Candidate can register and sign in with Email/Password or Google OAuth via Supabase Auth. Session refresh and protected-route gating in `apps/web/proxy.ts` redirect unauthenticated visitors to sign-in.
- **Age Eligibility (`BR-01`):** Registration requires `date_of_birth` corresponding to age 18 or older. Both client validation and the database trigger (`profiles_require_adult`) reject underage sign-ups with a clear Indonesian/English error message.
- **Consent Capture (`BR-02`):** Mandatory `analysis` consent must be accepted before registration or practice proceeds. Optional consents (`model_training`, `hr_rater_sharing`) are unchecked (`false`) by default and saved independently in `public.consents`.
- **Data Isolation:** RLS policies restrict every authenticated user to reading and writing only rows matching `auth.uid()`. Service role credentials never run in browser bundles.

### `UC-02`: Interview Session Configuration

- **Configuration Options:** Candidate selects `job_field` (`IT`), `role`, `level` (`internship`, `fresh_graduate`, `junior`, `mid_level`), `language` (`id`, `en`), `question_set` (`general`, `behavioral`, `role_specific`), and `mode` (`live`, `upload`).
- **Question Selection (`BR-03`, `BR-30`):** Questions come exclusively from the curated bank (`shared/questions/bank.json`) filtered by `job_field`, `role`, `level`, and `language`; custom questions are disallowed (`>= 3` questions available per valid `(role, level, question_set)` filter, `BR-03`). Default session setup returns 3 matching questions and snapshots them into `public.session_questions`. Every published question in `shared/questions/bank.json` has complete Indonesian (`id`) and English (`en`) prompts (`BR-30`).
- **Quick-Start Flow (`UC-02 A1`):** Selecting "Practise tell-me-about-yourself" creates a 1-question session using `q01` (`quick_start` tag).
- **Immutable Session Settings (`BR-25`, `BR-26`):** `mode`, `language`, and `user_id` cannot be modified after session creation (enforced by API validation and the `practice_sessions_keep_settings` trigger executing `keep_session_settings()`).
- **Language Separation (`BR-26`):** App navigation follows `profiles.preferred_language`, while interview question prompts, LLM evaluation, and question-specific feedback follow `practice_sessions.language`.

### `UC-03`: Camera and Microphone Calibration

- **Hardware Permission Handling:** Prompts clearly for browser webcam and microphone permissions. Denying permission surfaces actionable recovery instructions without crashing.
- **Framing & Audio Check:** Shows a camera preview with head-to-mid-chest framing guidance and a live microphone input meter.
- **5-Second Baseline Calibration:** Runs a 5-second "look at the lens" calibration to capture the candidate's individual eye-contact and posture baseline before entering the room.
- **Runtime Fallback:** Runs vision models on WebGPU when available and falls back cleanly to CPU/WASM (ONNX Runtime Web) with a non-blocking status notice if neither hardware path is available.
- **Privacy Guarantee (`BR-04`):** Zero raw video bytes leave the browser during calibration or live practice.

### `UC-04`: Live Interview Room

- **Room Controls & Timers:** Displays the active question in the session language, progress indicator (e.g., Question 1 of 3), a **15-second default preparation countdown** (`prep_time_sec: 15`), and a recording timer up to a **3-minute (`180s`) hard maximum** that automatically stops recording and proceeds to submission when reached.
- **Live Hints:** Displays calm, non-intrusive visual hint badges (eye contact, posture/behaviour rules) aligned with the Paper & Ink design system, announced politely to screen readers without flashing.
- **Answer Controls:** Supports restarting an answer once per question (discarding the prior attempt) and skipping a question (marking the answer `skipped`).
- **Submission Payload (`BR-04`):** Ending an answer stops local capture, packages numeric `visual_metrics` JSON (matching `shared/schemas/visual-metrics.schema.json`), and uploads only the recorded audio file via signed URL.

### `UC-05`: Upload Practice Mode

- **File Validation:** Accepts one pre-recorded video per question and validates format (`MP4`, `MOV`, `WebM`), maximum duration (`3 minutes`), and maximum file size (`50 MB`) on the client and server prior to analysis. The limits come from the `video` block of `shared/speech.json`: 50 MB is the largest file the Supabase free plan stores, and 3 minutes keeps the analysis inside the web app's 270-second background budget.
- **Upload & Processing Status:** Uploads directly to private `answer-videos` storage via signed URL with a visible progress bar and status polling (`pending`, `uploaded`, `processing`, `processed`, `failed`, `deleted`).
- **Automatic Video Deletion (`BR-05`):** Uploaded raw video is always permanently deleted from Supabase Storage immediately after analysis finishes (`status = 'deleted'`, `deleted_at` recorded).
- **Failure Handling (`BR-07`):** Corrupted or unreadable uploads transition to `failed` / not counted, do not deduct from any session quota, and present a retry action.

### `UC-06`: Multimodal Analysis Engine

- **Signal Integration:** Merges per-answer visual metrics (eye contact %, smile %, YOLO26n-pose behaviour events) with speech service metrics (`POST /analyze`: Silero VAD pauses, fine-tuned `faster-whisper` verbatim transcript with `[EEE]`/`[HMM]`/`[UM]` vocal fillers and Indonesian lexical fillers, `librosa` pitch/RMS volume, syllables/sec speaking rate) and LLM content scoring (STAR structure, relevance, clarity, 2–3 concrete improvements).
- **Audio Retention (`BR-05`):** Live-mode answer audio in `answer-audio` is deleted immediately after analysis unless the user opted into `model_training` or `hr_rater_sharing`.
- **Failure & LLM Resilience (`BR-07`):** Failed analyses never count against user quota. If the LLM provider times out or errors, delivery scores are persisted with `content_status = 'pending'` so the user still receives delivery feedback and can retry content scoring.
- **Scoring Fairness (`BR-09`):** Clothing, appearance, and protected attributes are never scored. Smile and facial expression are surfaced as qualitative feedback only and contribute `0` weight to the overall score.
- **Code-Switching Rules (`BR-27`, `BR-28`):** Indonesian–English language mixing never penalizes delivery, STAR structure, or relevance scores; in an English-language session (`language = 'en'`), mixing affects only the clarity dimension.
- **Auditability:** Every scored answer and report records `rubric_version` and `model_versions`.

### `UC-07`: Feedback Report Presentation

- **Report Structure:** Displays overall score (`0–100`), 4 summary Stat figures, top 2–3 prioritized weaknesses with one concrete next step each, encouraging coaching copy, and full per-question breakdown below.
- **Mandatory Disclaimer (`BR-08`):** Displays visibly above the fold and in exported/printed views:
  - Indonesian: `"Skor ini adalah latihan berbasis AI, bukan prediksi hasil wawancara kerja."`
  - English: `"These scores are AI-based practice feedback, not predictions of job interview outcomes."`
- **Signature Visualizations (Paper & Ink design system):** Renders the Pace Meter (with target band), interactive Timecode Tape linking issue ticks to Feedback Markers, verbatim transcript with timecoded filler highlights, and 4-column STAR breakdown.
- **Report Actions:** Provides clear actions to retry a question, download/print the summary, or return to the home view.

---

## 3. Business Rules, Usability Priorities, and Design Compliance

### Core Business Rules Matrix

| Rule | Requirement | Verification |
|---|---|---|
| `BR-01` | Minimum age 18 for self-registration | UI validation + `profiles_require_adult` SQL trigger |
| `BR-02` | Mandatory analysis consent; optional consents default `false` | Registration flow + `consents` row assertion |
| `BR-03` | Curated bank only (`shared/questions/bank.json`) filtered by `job_field`, `role`, `level`, and `language`; custom questions disallowed | Matrix check (`>= 3` questions per valid `(role, level, question_set)` filter) |
| `BR-04` | Live mode raw video never leaves the browser | Network payload inspection (`0` video bytes uploaded) |
| `BR-05` | Videos always deleted; audio deleted unless opted in | Storage bucket audit post-analysis (`deleted_at` set) |
| `BR-07` | Failed analysis does not consume session quota | Failure simulation check on session/quota state |
| `BR-08` | Practice-feedback disclaimer visible on all reports | DOM and print/PDF layout check |
| `BR-09` | Protected attributes excluded; smile not in overall score | Scoring unit test (`smile` weight excluded from total) |
| `BR-25` / `BR-26` | Session `mode` and `language` immutable after creation | Update rejection via API & `practice_sessions_keep_settings` trigger (`keep_session_settings()`) |
| `BR-27` / `BR-28` | Mixing never lowers delivery/STAR; EN affects clarity only | Scoring unit tests with mixed-language transcripts |
| `BR-30` | Complete Indonesian (`id`) and English (`en`) prompts required on every published question in `shared/questions/bank.json` | Programmatic completeness check on `shared/questions/bank.json` |
| UU PDP 27/2022 | Zero PII, recordings, emails, or student IDs in repo/logs | Log and fixture audit prior to PR merge |

### Prototype Usability Test Priority Fixes (11 Users, SUS 67.3)

All High-priority findings and key Medium-priority findings from the prototype usability test are part of MVP acceptance:

- **High — Privacy visibility:** Place "Privacy & data" (`Privasi dan data`) with a shield/lock icon and clear label in the Account screen and footer (addressing the 3.8/5 data comfort score).
- **High — Interview room onboarding:** Add a brief first-time guide and unambiguous action labels ("Selesai dan analisis", "Lewati pertanyaan", "Ulangi jawaban") in the Interview Room (hardest task for 4/11 testers).
- **High — Landing clarity:** State what EchoCV does in one line on the landing and home pages, paired with a numbered "How it works" strip and a single primary start CTA.
- **Medium — Report hierarchy & tone:** Lead reports with the top 2–3 weaknesses and one concrete next action, keeping detailed metrics below.
- **Medium — Consistent capitalization & UI polish:** Apply consistent sentence-case headings across every screen per the Paper & Ink design system while adhering to its tokens, >= 44 px touch targets, 4.5:1 contrast, and icon + text status indicators.

---

## 4. Scope Boundary

### In-Scope for MVP (Sprint 1, Sprint 2 and 3)

- `UC-01` Auth, profile, consent (`BR-01`, `BR-02`)
- `UC-02` Session configuration and bilingual question bank (`BR-03`, `BR-25`, `BR-26`, `BR-30`)
- `UC-03` Camera, mic, and 5-second personal calibration (`BR-04`)
- `UC-04` Live interview room (`15s` prep, `3m` max recording, live hints, restart once, skip)
- `UC-05` Upload practice mode (MP4/MOV/WebM, `3m`, `50 MB`, progress, auto-delete)
- `UC-06` Multimodal analysis (browser/server vision + speech service + LLM STAR scoring)
- `UC-07` Feedback report (overall & aspect scores, `BR-08` disclaimer, Pace Meter, Timecode Tape, highlighted transcript, STAR breakdown)
- `UC-12` Plans and checkout with the **Midtrans sandbox** (added to the MVP on 26 Nov 2026): Sprint Pass Rp 15.000 for 7 days, Premium Rp 29.000 per month and Yearly Rp 299.000 per year; a Snap checkout, a payment notification webhook that verifies the Midtrans signature and activates the plan, and plans visible after sign-in. Sandbox only: no real money moves. The free quota (`UC-11`) is not enforced in the MVP.
- Landing page finished to the Figma design, with a plans section that leads to the plans page (added to the MVP on 26 Nov 2026).
- Mid-MVP check revisions (26 Nov 2026): the date field moves to its next part by itself; the app follows the language chosen at sign-up; no placeholder pages in the demo flow; optimistic progress bars; a centred calibration face circle; the countdown above the camera preview; readable confirmation text; a larger upload progress bar; a specific error for each upload failure; asynchronous upload analysis the user can come back to; real practice history; better transcripts and faster session loading; a short explanation of each question set; and real copy instead of template subtexts.

### Post-MVP Planned (Sprint 4-8, 1–7 Dec 2026)

Sprints 4 to 8 are combined into one sprint, 1–7 Dec 2026, after a one-day MVP review on Mon 30 Nov. Code freeze is Sat 5 Dec 2026 and the final submission is Mon 7 Dec 2026, with the full post-MVP scope kept.


- `UC-08`: Single-question retry and side-by-side attempt comparison
- `UC-09`: Practice history and progress trend dashboard
- `UC-10`: Full data download, account/audio deletion, consent withdrawal, and retention automation (`BR-05`, `BR-11`)
- Behaviour detector v1 training and 7-participant LOPO evaluation are recorded in `docs/model-report-v1.md` (`behaviour-v1.onnx`); `.tflite` export, production shipping in `apps/web/lib/vision` + `services/speech`, and real-speech Whisper filler evaluation are scheduled post-MVP alongside a low-end laptop performance pass, full bilingual UI polish, user testing round 1 + fixes, final model report, user guide, and final demo video.

### Unscheduled Use Cases (Require Explicit PM Approval Before Work Begins)

The following exist in the full use case specification and prototype but are **out of MVP scope** and not scheduled in Sprint 1, Sprint 2 and 3, or Sprint 4-8 unless approved by the PM:

- `UC-11`, `UC-18`: Usage quota enforcement and plan administration (plans and checkout, `UC-12`, moved into the MVP)
- `UC-13`, `UC-14`, `UC-19`: Institution / campus career centre (CDC) seats and cohort analytics
- `UC-15`: External HR practitioner rating portal
- `UC-16`, `UC-17`, `UC-20`: Admin screens for question bank, rubric/model management, and institutional partners
- `UC-21`: Extended settings beyond profile language and live-hint preferences

---

## 5. Sprint 1 Exit and Inter-Team Handoff Checklist

| Workstream | Owner | Deliverable & Handoff Verification |
|---|---|---|
| Dataset Collection | All | Each team member completes 3 consented recording sessions per `docs/data-collection-protocol.md` and uploads to restricted storage (never committed). |
| Acceptance Criteria | PM | `docs/pm/mvp-acceptance-criteria.md` published and reviewed by all leads; Sprint 1 scope and MVP boundaries agreed. |
| Database & Auth | Backend, PM, AI / Tech Lead | Supabase selected and confirmed for Postgres, Auth, and Storage. |
| LLM Provider | PM, Backend | LLM provider for content scoring selected, API key/billing configured, and privacy/consent impact documented before Sprint 2 and 3 report wiring. |
| Sprint Ceremonies | PM | Recurring Sprint ceremonies (planning, daily check-in, review/retrospective) scheduled on team calendar. |
| Question Bank | PM | `shared/questions/bank.json` starter dataset (`q01`–`q30`) and contract README ready for `api/sessions` consumption. |
| Speech Service | AI / Tech Lead | `services/speech` FastAPI service running `/health` and `/analyze` returning `speech-metrics.schema.json`-compliant payloads. |
| Browser Vision | AI / Tech Lead | Browser vision models (MediaPipe Face Landmarker + YOLO26n-pose WebGPU/WASM) packaged in `apps/web/lib/vision/`. |
| Supabase Schema | Backend | Supabase migrations (`20261120000000_data_model.sql`), RLS policies, storage buckets, and server/browser Supabase clients ready. |
| Sessions API | Backend | `apps/web/app/api/sessions/` API route contract handed off to Frontend for setup/room integration using `shared/questions/bank.json`. |
| App Shell & Pages | Frontend | App shell, `(app)` / `(focus)` route groups, and core Paper & Ink design system pages scaffolded. |
| Media Capture | Frontend | Browser webcam/mic capture and audio recorder helpers in `apps/web/lib/media.ts` and `apps/web/hooks/use-media-capture.ts` ready for calibration and live room integration. |
| Design Handoff | UI/UX | Design tokens, component specs, and brand exports finalized in `docs/design/handoff.md` and `apps/web/public/brand/` for Frontend and QA. |
| QA Test Plan | QA | `docs/qa/test-plan.md` aligned 1:1 with `UC-01`–`UC-07` and Business Rules compliance matrix. |
| QA Test Matrix | QA | `docs/qa/test-matrix.md` browser, hardware, and mobile viewport matrix finalized. |
| E2E Skeleton | QA | Playwright E2E skeleton (`apps/web/tests/e2e/`) passing in CI with simulated media streams. |

### Resolved Cross-Doc Alignments

1. **Preparation timer & question count (`UC-02` / `UC-04`):** Resolved. A default session has `3` questions, a quick start `1`, with a `15s` preparation countdown and a `180s` answer limit, read from `shared/session.json`. `docs/qa/test-plan.md` now uses the same values.
2. **Smile weight in overall score (`BR-09`):** Resolved. `shared/rubric.json` (`v0.2.0`) gives `smile` weight `0`, so it is shown as feedback only; its share moved to `content` (`0.25`) pending calibration.
3. **Speaking pace display unit:** Resolved. Pace is scored on `syllablesPerSecond` against the band of the session language, and the Pace Meter shows words per minute (`speakingRateWps * 60`) against that language's band. Both bands are in the `pace` section of `shared/thresholds.json` (`v0.4.0`), measured on the team's recorded answers and provisional until HR calibration.

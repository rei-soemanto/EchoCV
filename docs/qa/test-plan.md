# MVP Test Plan and Acceptance Tests

Quality assurance test plan for EchoCV Minimum Viable Product (MVP), verifying end-to-end functionality across Live Practice and Upload modes, rubric scoring, and business rules compliance.

## 1. Scope and Test Strategy

The MVP scope encompasses candidate journeys from initial onboarding through session completion and feedback reporting across use cases UC-01 through UC-07.

Testing levels:
- **Unit Testing**: Vitest for frontend utilities, rubric calculations, audio helpers; pytest for FastAPI speech analysis endpoints and schemas.
- **Integration Testing**: Supabase database row-level security policies, storage upload pipelines, speech service communication.
- **End-to-End Testing**: Playwright suites with simulated media streams validating critical user flows.
- **Cross-Browser & Hardware Verification**: Testing against defined browser tiers and hardware profiles per `docs/qa/test-matrix.md`.

---

## 2. Feature Acceptance Criteria and Flow Test Cases

### UC-01: Authentication, Registration and Consent
Validates candidate account onboarding, profile collection, and consent management.

- **Acceptance Criteria**:
  - Registration requires age 18 or older (BR-01). Users under 18 receive an eligibility error and cannot complete sign up.
  - Analysis consent is mandatory to proceed (BR-02). Model training and HR sharing consents are optional and unchecked by default.
  - Session refresh and route protection are handled via Supabase Auth. Unauthenticated access to protected routes redirects to sign in.
- **Flow Tests**:
  - `TC-AUTH-01 (Main Flow)`: New user signs up with valid email/password or Google OAuth, enters age >= 18, accepts required analysis consent, enters profile info, and arrives at dashboard.
  - `TC-AUTH-02 (Exception - Underage)`: User inputs date of birth indicating age < 18. Registration is prevented with clear error messaging.
  - `TC-AUTH-03 (Exception - Missing Mandatory Consent)`: User submits form without checking analysis consent. Registration button remains disabled or surfaces validation error.
  - `TC-AUTH-04 (Alternative - Optional Consents)`: User checks model training opt-in. Database record reflects optional consent flag set to true while maintaining default false for others.

### UC-02: Interview Session Configuration
Validates setup of role, experience level, language, and interview mode.

- **Acceptance Criteria**:
  - Candidate chooses target role (e.g. Frontend, Backend, Fullstack, Mobile), level (Junior, Fresh Graduate), and language (Indonesian or English).
  - Mode is selected: Live Practice (webcam) or Upload Mode (video file).
  - Selected mode and language remain immutable for the entire session lifecycle (BR-25, BR-26).
- **Flow Tests**:
  - `TC-CONF-01 (Main Flow)`: User configures a Junior Backend session in Indonesian in Live mode. Session is created via `/api/sessions` with matching questions.
  - `TC-CONF-02 (Alternative - English Upload)`: User selects Fullstack role in English in Upload mode. Verify session preserves English language and Upload mode tags.
  - `TC-CONF-03 (Exception - Incomplete Setup)`: User attempts to start without selecting required fields. System prompts with validation indicator.

### UC-03: Camera and Microphone Calibration
Validates hardware check and baseline calibration prior to live practice.

- **Acceptance Criteria**:
  - Prompts for browser webcam and microphone access with clear guidance.
  - Live video preview shows framing guide. Mic level indicator reflects ambient audio input.
  - 5-second calibration establishes individual eye-contact baseline (looking at camera vs looking at screen).
  - Video stream never leaves client browser (BR-04).
- **Flow Tests**:
  - `TC-CALIB-01 (Main Flow)`: User grants camera and mic access, aligns face in guide, completes 5-second calibration countdown. Threshold baseline is computed and stored.
  - `TC-CALIB-02 (Exception - Permission Denied)`: User denies camera or mic access. App displays clear error message and instructions to enable permissions in browser settings.
  - `TC-CALIB-03 (Alternative - WebGPU Fallback)`: Browser without WebGPU loads vision models using CPU/WASM fallback without crashing or freezing UI.

### UC-04: Live Interview Room
Validates the real-time webcam practice room, timer, hints, and answer recording.

- **Acceptance Criteria**:
  - Displays question text, question counter (e.g. Question 1 of 5), and 30-second prep countdown.
  - Answer recording supports up to 3 minutes with visible recording indicator and timer.
  - Non-intrusive live visual hints appear as badges (e.g. eye contact reminder, posture correction).
  - User can restart answer once per question, or skip to next question.
  - Finishing answer stops recording, collects local visual metrics JSON, and stores audio file.
- **Flow Tests**:
  - `TC-ROOM-01 (Main Flow)`: User reads question, records 90-second answer, clicks "Finish and analyze". Audio is captured and visual metrics JSON is passed to upload stage.
  - `TC-ROOM-02 (Alternative - Restart Answer)`: User clicks "Restart answer" within question limits. Recording resets to zero, previous attempt discarded, restart option disabled for remaining attempt.
  - `TC-ROOM-03 (Alternative - Skip Question)`: User chooses to skip question. Session advances to subsequent question without saving incomplete metrics.
  - `TC-ROOM-04 (Exception - Max Duration Timeout)`: User reaches 3-minute hard ceiling. System automatically stops recording and proceeds to analysis submission.

### UC-05: Upload Practice Mode
Validates offline video file upload and server-side processing pipeline.

- **Acceptance Criteria**:
  - Candidate uploads one pre-recorded video per question.
  - Validation enforces formats (MP4, MOV, WebM), maximum duration (10 minutes), and size limit (500 MB).
  - Upload shows progress bar and processing status indicator.
  - Raw video file is permanently deleted from storage immediately after analysis completes (BR-05).
- **Flow Tests**:
  - `TC-UPL-01 (Main Flow)`: User uploads valid 2-minute MP4 (1080p, 45 MB). Progress reaches 100%, status shows processing, report generated, video removed from bucket.
  - `TC-UPL-02 (Exception - Unsupported Format)`: User attempts upload of AVI or MKV file. System rejects file immediately with format guidance.
  - `TC-UPL-03 (Exception - File Oversized)`: User uploads 600 MB file. Client rejects prior to network transmission with clear size constraint notice.
  - `TC-UPL-04 (Exception - Processing Failure)`: Video processing encounters corrupted audio track. Status displays "not counted" and offers retry.

### UC-06: Multimodal Analysis Engine
Validates merging of visual metrics, speech metrics, and LLM rubric scoring.

- **Acceptance Criteria**:
  - Visual metrics (eye contact %, smile %, posture keypoint anomalies, fidgeting) combined with speech metrics.
  - Speech service provides vocal fillers ("eee", "hmm", "um"), lexical fillers ("jadi", "kayak"), speaking rate (syllables/sec), pauses, pitch and volume.
  - LLM evaluates STAR structure, relevance, and clarity in session language.
  - Language mixing does not penalize delivery or STAR scores (BR-27); in English sessions, code-switching impacts only clarity dimension (BR-28).
  - Smile/expression is reported as qualitative feedback and excluded from overall score calculation (BR-09).
  - Temporary audio deleted unless user provided training/sharing consent (BR-05).
- **Flow Tests**:
  - `TC-EVAL-01 (Main Flow)`: Metrics pipeline combines visual and speech data with LLM response, applies `rubric.json` weights summing to 1.0, and outputs valid report schema JSON.
  - `TC-EVAL-02 (Alternative - LLM Service Unavailable)`: LLM endpoint returns timeout or error. System saves delivery scores, marks content analysis pending, and schedules retry.
  - `TC-EVAL-03 (Business Rule - Language Mixing)`: Answer contains code-switching between Indonesian and English. Verify STAR and delivery scores remain unaffected.

### UC-07: Feedback Report Presentation
Validates feedback report rendering, score visualizations, and disclaimers.

- **Acceptance Criteria**:
  - Overall score rendered (0-100) alongside individual aspect scores.
  - Mandatory disclaimer clearly displayed: "Skor ini adalah latihan berbasis AI, bukan prediksi hasil wawancara kerja." (BR-08).
  - Interactive Pace Meter and Timecode Tape display speech markers.
  - Transcripts show timestamps with detected filler words highlighted.
  - Action buttons: Retry question, Download summary, Return to dashboard.
- **Flow Tests**:
  - `TC-REP-01 (Main Flow)`: Completed session report renders with overall score, 4 stat cards, timecode tape, highlighted transcript, and STAR breakdown.
  - `TC-REP-02 (Verification - Disclaimer Presence)`: Verify disclaimer text exists visibly on report and printed outputs.
  - `TC-REP-03 (Alternative - Question Retry)`: User selects "Retry question" from report. User is routed back to room with identical question and previous attempt preserved in history.

---

## 3. Business Rules Compliance Matrix

| Rule ID | Requirement | Verification Method | Pass Criteria |
|---|---|---|---|
| BR-01 | Self-registration requires age 18+ | Form submission test with age boundaries (17 vs 18) | Under 18 blocked with error |
| BR-02 | Analysis consent required; training/sharing optional | Auth consent form checks | Mandatory required; optional default off |
| BR-04 | Live mode raw video never leaves browser | Network payload inspection | Zero video bytes transmitted in live mode |
| BR-05 | Answer audio & video deleted post-analysis | Storage bucket audit post-report generation | Files deleted unless explicit consent granted |
| BR-08 | AI practice disclaimer on all reports | DOM assertion on report page | Disclaimer visible above the fold |
| BR-09 | Protected attributes not scored; smile is feedback only | Rubric calculation unit tests | Smile weight = 0 in overall score sum |
| BR-25 | Session mode immutable after creation | API route parameter tampering check | Mode cannot be changed via PUT/PATCH |
| BR-26 | Session language immutable after creation | API route parameter tampering check | Language cannot be changed mid-session |
| BR-27 | Language mixing never lowers delivery or STAR | Rubric unit test with mixed tokens | Scores identical to unilingual delivery |
| BR-28 | Language mixing in English lowers only clarity | Rubric unit test on English session | Only clarity dimension score reduced |

---

## 4. Defect Severity and Exit Criteria

Defects discovered during testing are categorized into four tiers:
- **Blocker (P0)**: Application crash, live camera feed failure, data loss, violation of privacy rules (e.g. video sent in live mode, audio retained without consent). Must be resolved prior to PR merge.
- **Critical (P1)**: Analysis pipeline timeout, broken authentication redirect, inaccurate rubric weight calculation. Blocks MVP milestone sign-off.
- **Major (P2)**: UI layout overflow on supported mobile viewports, incorrect filler word timestamp offset, missing secondary live hint badge.
- **Minor (P3)**: Minor visual misalignment, non-critical copy typo, animation stutter on low-end hardware.

**MVP Release Exit Criteria**:
- Zero open P0 and P1 defects.
- All automated unit tests and Playwright end-to-end tests passing in CI.
- Verification checklist completed on primary Tier 1 browser targets.

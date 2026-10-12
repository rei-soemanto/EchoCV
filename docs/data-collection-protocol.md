# Data collection protocol

How to record EchoCV's in-house dataset: who records, with what, what to perform, how to name and
hand over the files, and how the data is protected. Participants sign
[consent-form.md](consent-form.md) before recording anything.

One recording session feeds every in-house dataset at once.

| What the recordings become | Used for | Why public data can't do it |
|---|---|---|
| Labelled webcam frames of the 4 behaviours | Fine-tuning the YOLO26n behaviour detector | No commercially safe dataset shows `arms_crossed`, `slouching` or `reading_notes` from a laptop webcam. v0 learned them from outdoor and side-view photos, so on a webcam it only finds `touching_face` |
| Clips with known posture, gaze and expression | Checking the posture, eye-contact and smile thresholds on real webcam footage | The thresholds were chosen on studio and lab images (Columbia Gaze, MPIIFaceGaze, GENKI-4K) |
| Verbatim transcripts of real answers | Training and measuring the Whisper filler model on real Indonesian `eee` / `hmm` / `em` | v0 learned Indonesian fillers from synthetic audio only; its real Indonesian accuracy is unknown |
| Held-out mock interviews | HR practitioner ratings to calibrate `shared/rubric.json` (later round) | No public dataset rates interview answers |

## Roles

| Role | Who | Responsibilities |
|---|---|---|
| **Coordinator** | One team member | Collects signed consent forms and assigns participant IDs (`p01`, `p02`, ...). Owns `sessions.csv` and the shared folder, checks every upload (QA), assigns train/test splits, handles withdrawals |
| **Participant** | Anyone 18+ who signed the consent form, including team members | Records the sessions below on their own laptop and uploads them |
| **Facilitator** (optional) | A team member | Sits off camera, shows the questions and keeps time. Useful for participants outside the team; not needed when recording yourself |

## Participants

- **Eligibility:** 18 or older, signed consent form, comfortable answering in Indonesian (English answers are a bonus).
- **Diversity goals:** a model trained on one face and one room learns that face and that room.
  Aim for a mix of:
  - gender and skin tone;
  - hijab and no hijab;
  - glasses and no glasses;
  - laptop brands and webcam quality.

| Target | Participants | Sessions each | What it gives |
|---|---|---|---|
| **Minimum to start** | 1 (the project lead) | 3 (2 train + 1 test) | ~260 training frames and ~130 test frames per behaviour. Enough for a first fine-tune and an honest held-out check on one person |
| **Good** | 5-10 | 3 | 1,300-2,600 training frames per behaviour, a test set of unseen people, and about 1.5-3.5 h of real answers |
| **Whisper v1 goal** | 10+ | 3+ | The 3-10 h of transcribed Indonesian answers that `docs/model-report-v0.md` asks for |

## Equipment and setup

### Camera and recording app

- **Use the laptop's built-in webcam**, with the laptop on a desk in its normal position. EchoCV
  runs on that camera, so that is the view the model must learn.
  - Don't use a phone or a camera on a tripod.
  - An external webcam on top of the monitor is acceptable only if that is how you would really do
    an online interview. Note it in `sessions.csv`.
- **Use the built-in laptop microphone.** A headset or earphone mic is fine if that is what you
  normally use; note it in `sessions.csv`.
- **Recording app:**

| OS | App | Settings |
|---|---|---|
| Windows | **Camera** (built in), switch to **Video** mode | Gear icon: Video quality **1080p 30 fps** (or 720p 30 fps if 1080p is not offered). Files land in `Pictures\Camera Roll` as `WIN_<date>_<time>_Pro.mp4` |
| macOS | QuickTime Player (File > New Movie Recording) or Photo Booth | Quality: High. Files are `.mov`, which is fine |
| Any | OBS Studio | Output: MP4, 1280x720 or 1920x1080, 30 fps, audio track on |

### Turn off every camera effect

Effects that change your face or the frame destroy the labels. In particular, "eye contact"
correction makes you look at the camera when you aren't, which is the exact thing EchoCV measures.

- [ ] **Windows Studio Effects** (on laptops with an NPU): Settings > Bluetooth & devices > Cameras
      > your camera. Turn off:
  - Eye contact;
  - Background effects (blur);
  - Automatic framing;
  - Portrait light;
  - Creative filters;
  - Voice focus.

  The Studio effects tile in Quick Settings must also be all off.
- [ ] **Manufacturer camera apps:** e.g. Lenovo Smart Camera, ASUS / HP / Dell camera utilities.
      Turn off auto-framing, eye correction, beautify and background effects.
- [ ] **NVIDIA Broadcast / AMD Noise Suppression camera effects:** off, or exit the app.
- [ ] **macOS Control Center > Video Effects:** Center Stage, Portrait, Studio Light, Reactions all off.
- [ ] No video-call app or browser tab is using the camera at the same time.

### Framing, light and scene

- **Framing:** like a normal video call. Sit 50-80 cm from the screen, with the screen tilted as you
  normally use it.
  - The frame should show your **whole head down to mid-chest**, with a little space above your head.
  - Don't zoom, and don't lean in to fill the frame.
  - Crossed arms and notes held in front of the chest should be at least partly visible at the
    bottom of the frame. If they never are, tilt the screen back slightly once, then leave it for
    the whole session.
- **Eye-contact target:** stick a small dot or sticker right next to the webcam lens. "Look at the
  camera" always means look at the **lens**, not at your own face on the screen.
- **Light:** your face must be visible. Different light per session is good (see the matrix below).
  Very dark or a strong window directly behind you is fine for at most one session.
- **Scene privacy:**
  - **No other people in the frame or audible**, not even passing in the background. They haven't consented.
  - Nothing readable that identifies you or others: no ID cards, no student cards, no letters, no
    chat or email windows visible behind you.
  - Posters and books with ordinary titles are fine.

## Session variety matrix

Each session should differ from the previous one in **at least two** of these: room, light,
clothes, glasses or hijab style, time of day, seat or desk. Suggested plan for one person:

| | Session 1 | Session 2 | Session 3 (usually the test session) |
|---|---|---|---|
| Place | Bedroom or study desk | Another room (living room, kos common area, friend's desk) | Campus or library (a quiet corner with no one behind you) |
| Light | Daylight from the front | Evening, ceiling lamp or desk lamp from the side | Whatever is there; ok if dimmer or partly backlit |
| Clothes | T-shirt | Shirt or batik | Jacket, hoodie or a different colour |
| Glasses / hijab | As usual | Swap if you can (glasses on/off, different hijab colour or style) | As usual |
| Chair | Desk chair | Different chair or stool | Whatever is there |

Record sessions on **different days** if possible. A gap between sessions matters more than the exact matrix.

## Session script

**Time per session:** about 30 minutes, which is 10 minutes of setup and checks, 10 minutes of
behaviour clips (Part A) and 10 minutes of interview answers (Part B).

### Before you press record

- [ ] Consent form signed (first session only) and you know your participant ID (e.g. `p01`).
- [ ] Laptop plugged in, on a desk, screen at its normal angle. Camera effects off (checklist above).
- [ ] Sticker next to the lens; framing shows head to mid-chest.
- [ ] Room quiet, nobody else in view, phone on silent.
- [ ] Props within reach for Part A: a sheet of A4 paper with printed or written notes (use the
      question list below, nothing personal), your phone, and a book or notebook.
- [ ] One 3-second test recording plays back with sound. Delete it afterwards.

### Part A: behaviour clips (10 clips, 30 seconds each)

Every clip is a **separate video file**, and each clip shows **one** behaviour the whole time. For
every clip:

1. Press record and sit still in the starting pose for 2 seconds.
2. Perform the behaviour for **30 seconds** (watch the timer in the app).
   - **Keep talking** the whole time, as you would in an interview: describe your day, explain a
     recipe, count slowly. In a real answer your mouth moves, so it should here too.
   - **Change the variant every ~5 seconds** (different hand, height, angle, intensity). Thirty
     seconds of one frozen pose teaches the model one picture.
3. Stop recording, then rename the file right away (see [File naming](#file-naming)).

Don't mix behaviours inside a clip; the clip name is the label. If you notice you did, delete the
clip and record it again.

| # | Clip name | Do (cycle through these) | Don't |
|---|---|---|---|
| 1 | `upright` | Sit up straight but relaxed, as in a good interview. Look at the lens sticker most of the time; a short glance away is natural. Neutral, friendly face | Don't slouch, cross arms, touch face or hold anything. Don't force a big smile |
| 2 | `looking_away` | Keep the upright posture but look **away from the lens**: at your face on the screen, at the keyboard, left, right, up as if thinking, at the door. Switch every 3-5 seconds | Don't look at the lens. Don't touch your face |
| 3 | `smile` | Talk about something pleasant while looking at the lens. Smile naturally: small closed-mouth smile, open smile with teeth, a short laugh | Don't cover your mouth. Don't touch your face |
| 4 | `gestures` | Explain something with your hands: count on fingers, open palms, point, draw shapes in the air. Hands may come **near** the face (pointing at yourself, a wave) | Don't let hands **touch** the face or neck. Don't cross arms |
| 5 | `desk_hands` | Hands busy below the face: clasped on the desk, typing, holding or clicking a pen, hand on the mouse, hands in the lap, resting forearms on the desk | Don't hold paper, phone or book. Don't cross arms. Don't slouch |
| 6 | `touching_face` | Chin resting on hand (the "thinking" pose), scratch or touch nose, cheek on palm, hand over mouth, rub an eye, touch temple or forehead, adjust glasses, tuck hair or hijab edge near the face, touch the neck or throat. Switch hands | Don't hold the touch without changing for the whole clip. Don't cross arms or slouch while doing it |
| 7 | `arms_crossed` | Classic crossed arms with hands tucked, crossed high near the chest, low and loose near the stomach, hugging yourself (hands on opposite upper arms), one arm across the body holding the other elbow or arm. Look at the lens and keep talking | Don't touch your face. Don't slouch heavily (a little lean back is fine) |
| 8 | `slouching` | Slide down in the chair, round the shoulders and let the chest sink, push the head and chin forward toward the screen, lean forward on the forearms, lean back lazily, lean to one side. Go from mild to strong | Keep hands away from the face, don't cross arms, don't hold anything |
| 9 | `reading_notes_held` | Hold the paper, phone or book **in front of your chest** so it is visible in the frame. Read from it, look down at it, look up at the lens, look back down, turn a page, switch objects | Don't hold it at the ear (a phone call is not reading). Don't hide your face behind it |
| 10 | `reading_notes_desk` | Put the notes flat on the desk or keyboard, **below the frame**. Read your answer from them as if cheating in an interview: look down, read a line, look up, look down again | Don't hold the notes up. Don't rest your chin on your hand |

Clip 10 has no visible object. It is used to teach and measure the "eyes down at notes" signal from
gaze, not the detector's boxes.

### Part B: mock-interview answers (4-5 answers, 1-2 minutes each)

This part is natural. **Don't perform any behaviour on purpose, and don't suppress any.** If you
normally say "eee", touch your chin or cross your arms, do it; these answers measure EchoCV on real behaviour.

For each answer:

1. Read the question on the screen (copy the list below into a note on your desktop). Think for a few seconds if you want.
2. Press record and look at the lens for 2 seconds (EchoCV uses this to calibrate).
3. Answer in **1-2 minutes**, speaking to the lens as if the interviewer were behind it.
   - Speak naturally: no script, and don't read your answer from notes.
   - Fillers (`eee`, `hmm`, `em`) and pauses are fine, and they are exactly what we need.
4. Stop and rename the file.

**Language:**
- Answer most questions in **Indonesian**.
- If you are comfortable, answer one question per session in **English**.
- Natural Indonesian-English code-switching is fine. Tag the file `mix` if it is heavily mixed.

**Keep answers free of personal data.** No full names (yours or anyone else's), no addresses, phone
numbers, NIK, student numbers, grades you'd rather not share, or company secrets. Say "teman saya" or
"dosen saya" instead of names. Inventing details is fine; this is practice.

**Which questions:** session 1 answers `q01`-`q04`, session 2 answers `q05`-`q08`, session 3 answers
`q09`-`q12`. Pick any one of the four for English.

| ID | Bahasa Indonesia | English | Type |
|---|---|---|---|
| `q01` | Perkenalkan diri Anda dan ceritakan latar belakang pendidikan Anda. | Introduce yourself and your educational background. | Introduction |
| `q02` | Mengapa Anda tertarik bekerja di bidang IT? | Why do you want to work in IT? | Motivation |
| `q03` | Ceritakan proyek paling menantang yang pernah Anda kerjakan. Apa peran Anda dan bagaimana hasilnya? | Tell me about the most challenging project you have worked on. What was your role and what was the result? | Behavioural (STAR) |
| `q04` | Ceritakan saat Anda berbeda pendapat dengan anggota tim. Bagaimana Anda menyelesaikannya? | Tell me about a time you disagreed with a teammate. How did you resolve it? | Behavioural (STAR) |
| `q05` | Ceritakan pengalaman ketika Anda gagal atau melakukan kesalahan. Apa yang Anda pelajari? | Tell me about a time you failed or made a mistake. What did you learn? | Behavioural (STAR) |
| `q06` | Bagaimana Anda menangani tenggat waktu yang sangat ketat dengan banyak tugas sekaligus? | How would you handle a very tight deadline with several tasks at once? | Situational |
| `q07` | Ceritakan bagaimana Anda mempelajari teknologi baru dalam waktu singkat. | Tell me how you learned a new technology in a short time. | Behavioural (STAR) |
| `q08` | Apa kelebihan dan kekurangan terbesar Anda? | What are your greatest strengths and weaknesses? | Self-assessment |
| `q09` | Jelaskan perbedaan database SQL dan NoSQL, dan kapan Anda memilih masing-masing. | Explain the difference between SQL and NoSQL databases and when you would choose each. | Technical |
| `q10` | Jelaskan apa yang terjadi ketika Anda mengetik alamat sebuah situs web di browser. | Explain what happens when you type a website address into a browser. | Technical |
| `q11` | Aplikasi yang Anda buat tiba-tiba error di production. Apa langkah-langkah Anda? | An app you built suddenly fails in production. What do you do? | Situational / technical |
| `q12` | Di mana Anda melihat diri Anda lima tahun ke depan? | Where do you see yourself in five years? | Career goals |

The question bank will grow toward the 50-150 bilingual questions planned in
`docs/tech-stack-and-datasets.md`. Keep the IDs stable once a question has been answered on video.

## File naming

Rename every file **as soon as you stop recording**. Windows Camera names files by time
(`WIN_20261012_14_33_10_Pro.mp4`), and after ten clips they are impossible to tell apart.

```
<participant>_<session>_<clip>.<ext>                           Part A
<participant>_<session>_answer<NN>_<question>_<lang>.<ext>     Part B
```

| Part | Example | Notes |
|---|---|---|
| A | `p01_s1_upright.mp4` | `<clip>` is exactly one of the 10 names in the Part A table |
| A | `p01_s1_reading_notes_held.mp4` | |
| B | `p01_s1_answer01_q01_id.mp4` | `answer01`, `answer02`, ... count within the session |
| B | `p01_s1_answer04_q03_en.mp4` | `<lang>` is `id`, `en` or `mix` |
| macOS | `p01_s2_slouching.mov` | Keep the original extension; don't convert |

- **Re-takes:** delete the bad take and keep only the final one under the plain name. No `_v2` or `_final`.
- **Folder:** one folder per session, `p01/s1/`, holding that session's 10 clips and 4-5 answers and nothing else.

## Metadata: `sessions.csv`

The coordinator keeps one `sessions.csv` in the root of the shared folder, with **one row per
session**. Participants send their values to the coordinator after each session (a chat message
with the filled-in fields is enough).

```csv
participant,session,date,split,place,lighting,clothing,glasses,head_covering,laptop_model,camera_resolution,mic,studio_effects_off,consent_version,clips,answers,notes
p01,s1,2026-10-14,train,bedroom desk,daylight front,black t-shirt,yes,none,ASUS TUF F15,1080p,built-in,yes,v1.0,10,4,
```

| Column | Values |
|---|---|
| `participant`, `session` | `p01`..., `s1`... (as in the file names) |
| `date` | `YYYY-MM-DD` |
| `split` | `train` or `test`. **Filled in by the coordinator**, not the participant |
| `place`, `lighting`, `clothing` | Short free text: `kos common room`, `evening desk lamp left side`, `blue hoodie` |
| `glasses` | `yes` / `no` |
| `head_covering` | `none`, `hijab`, `cap`, ... |
| `laptop_model`, `camera_resolution` | As printed on the laptop; `720p` or `1080p` |
| `mic` | `built-in`, `earphone`, `headset` |
| `studio_effects_off` | `yes` only if every item of the effects checklist was checked |
| `consent_version` | The version printed on the signed form, e.g. `v1.0` |
| `clips`, `answers` | How many Part A clips and Part B answers the folder holds (10 and 4-5 when complete) |
| `notes` | Anything unusual: "external webcam", "fan noise", "clip 7 arms mostly out of frame" |

## Quality check before upload

Participants check their own session; the coordinator checks again on receipt. **Re-record rather
than trim or edit**: editing software re-encodes the video and can shift audio.

- [ ] Every file plays to the end **with sound**.
- [ ] Part A clips are at least 30 seconds (32+ with the 2-second start). Part B answers are 1-2 minutes.
- [ ] Your whole face is in the frame for the whole file (brief turns are fine).
- [ ] File names follow the pattern exactly; 10 clips + 4-5 answers in the session folder.
- [ ] Nobody else is visible or audible; nothing identifying is readable.
- [ ] Camera effects were off (the background is sharp, not blurred).
- [ ] Each Part A clip shows only its own behaviour.

## Hand-over and storage

- **Where:** only the coordinator's **restricted shared folder**. That is a Google Drive folder shared with named
  team members (not "anyone with the link"), or a private Hugging Face dataset (architecture spec,
  section 2.2). Upload the whole session folder (`p01/s1/`).
- **Never** send recordings:
  - through WhatsApp, Telegram or other chat apps (they recompress the video and leave copies on phones);
  - by email;
  - to git or GitHub (**the EchoCV repo is public**);
  - via public links, social media or cloud links without access control.
- **On the coordinator's computer:** copy sessions to `ml/data/inhouse/raw/<participant>/<session>/`,
  which `.gitignore` (`ml/data/**`) already excludes from git.
  - Check with `git check-ignore -v ml/data/inhouse/raw/p01/s1/p01_s1_upright.mp4` before the first copy.
  - Use a laptop with disk encryption (BitLocker / FileVault) if you can.
- **Consent forms** contain real names. Keep them **separate** from the recordings: a different
  restricted folder, or paper in a closed folder. They are the only place a name is linked to a participant ID.
- **Derived data** (extracted frames, labels, transcripts) keeps the participant ID in every file
  name (`p01_s1_...`), so one participant's data can always be found and deleted.

## Train/test splits

The **coordinator** assigns `split` in `sessions.csv`; participants don't need to know it.

- **One participant:** session 3 is `test`, sessions 1-2 are `train`.
- **Several participants:** hold out **whole people** (about 1 in 5, at least 1) as `test`, so the
  test measures how EchoCV works on someone it has never seen. Re-assigning splits only changes the
  CSV; files never move.
- Test recordings are **only** used for final measurements. Don't watch them, label them by hand or
  tune thresholds on them; that leaks the answers into the model.

## How recordings become labels

This section tells recorders why the naming rules matter. The tools are built after the dataset is complete.

- **Part A:**
  - The clip name **is** the class label. The first and last 2 seconds of each clip are dropped
    (the transitions), and frames are sampled at about 5 per second.
  - A pose model and an object detector draw the box:
    - the hand-on-face region for `touching_face`;
    - the forearms for `arms_crossed`;
    - the upper body for `slouching`;
    - the paper or phone for `reading_notes`.
  - Frames where the geometry disagrees with the clip name are dropped, e.g. a hand that hasn't reached the face yet.
  - `upright`, `looking_away`, `smile`, `gestures` and `desk_hands` give frames with **no**
    behaviour, so the detector learns what not to flag. They also give per-person baselines for
    posture and gaze, and positive and negative examples for eye contact and smile.
  - The team reviews contact sheets of the auto-labelled frames before training. Roboflow is
    optional, only for fixing boxes by hand.
- **Part B:**
  - Verbatim transcripts (rules below) for the filler model.
  - Behaviour intervals (start and end time of each event) annotated later for end-to-end evaluation.

## Verbatim transcription rules

Transcription is done by the team after recording, for Part B answers. To save time, the team
will first generate a draft with the current filler model, and the transcriber corrects it.

- Write **exactly what was said**, including repetitions ("saya saya pikir"), false starts and
  self-corrections. Don't tidy grammar.
- Write vocalised fillers as tokens, using the same mapping as `ml/whisper/normalize.py`:

| You hear | Write | Spellings that mean the same |
|---|---|---|
| Open hesitation sound: "eee...", "uh", "er" | `[EEE]` | eee, ee, eeh, uh, uhh, uhm, er, err |
| Nasal hesitation, mouth closing: "em", "um", "ehm" | `[UM]` | em, emm, ehm, um, umm, erm |
| Hum with closed mouth: "hmm", "mm" | `[HMM]` | hmm, hm, mm, mmm |

- One token per filler. A long "eeeeee" is one `[EEE]`.
- **Not fillers, write as words:**
  - backchannels ("mm-hmm", "uh-huh");
  - short interjections used as words ("ah, iya", "eh, maksud saya");
  - lexical fillers that are real words: `jadi`, `gitu`, `kayak`, `apa`, `anu`, `seperti`.

  Lexical fillers are counted later from the text (`shared/labels.json`), not by the acoustic model.
- English words inside Indonesian answers are written as said, in normal spelling.
- Plain UTF-8 text, one file per answer, with the same base name as the video (`p01_s1_answer01_q01_id.txt`).

## HR practitioner rating

This comes in a later round. HR practitioners will rate held-out Part B answers with the EchoCV
rubric (`shared/rubric.json`) to calibrate the scoring weights. Until then, keep the `test` answers
untouched (see [Train/test splits](#traintest-splits)). Answers go to external raters only if the
participant ticked that option on the consent form.

## Retention, withdrawal and deletion

- **Retention:** recordings and everything derived from them are kept until the project ends, and
  never longer than **3 years after the participant's last recording**, then deleted. Trained models may be kept.
- **Withdrawal:** a participant can withdraw at any time without giving a reason, by contacting the
  coordinator. The coordinator must, **within 30 days**:
  1. Delete the participant's folders from the shared folder (and empty the Drive trash).
  2. Delete `ml/data/inhouse/raw/<participant>/` and every derived file whose name starts with the
     participant ID (frames, labels, transcripts, contact sheets) on every team computer.
  3. Remove their rows from `sessions.csv`.
  4. Confirm the deletion to the participant.

  Keep only the signed consent form and a dated note of the withdrawal, as proof of consent and of deletion.
- **Optional consents** (quotes, images in presentations, external HR raters, LLM processing of
  transcripts) can be withdrawn separately. Check the participant's form before any such use.
- Models trained before a withdrawal are not recalled, but the next training run must not include the withdrawn data.

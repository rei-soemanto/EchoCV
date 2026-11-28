# Design QA: implemented pages against the Figma design

Design QA of the MVP web app against the Figma file "EchoCV Hi-Fi (Paper and Ink)" and `DESIGN.md`, with a usability walkthrough of the live practice flow.

## How it was checked

- **Pages without sign-in** (landing, sign in): screenshots of https://echocv-beta.vercel.app at 1440 px and 390 px wide, compared with the desktop frames (Screens page) and the mobile frames (Mobile page).
- **Pages behind sign-in** (dashboard, setup, calibration, interview room, upload, report, plans, checkout, privacy, history, progress): the page code on `main` compared with the matching Figma frames.
- **The whole web app code** was searched for breaks of the `DESIGN.md` house rules: raw hex colours, shadows, gradients, text under 12 px, big radii and `100vh`.

## Result

Nothing blocks the MVP demo. The pages follow the Paper and Ink system closely:
- They use the colour tokens only, with no shadows or gradients.
- Rules separate sections; content isn't boxed.
- Numbers are in Newsreader and timecodes in mono.
- Every success, warning and danger badge has an icon and a word.
- The report shows the practice disclaimer.

Every revision below is planned after the MVP demo, in the final product sprint (1 to 7 Dec). There are two kinds:
- **Code**: the page should change to match the design.
- **Figma**: the page is right, and the Figma frame or `DESIGN.md` should be updated to match the product as built.

## Findings

### Whole app

| # | Finding | Fix in |
|---|---|---|
| A1 | Below 768 px the sidebar turns into a horizontally scrolling strip at the top. `DESIGN.md` section 7 asks for a bottom tab bar with four destinations (Beranda, Latihan, Paket, Akun) below 1024 px. The app switches layout at 768 px (`md`), not 1024 px (`lg`). | Code |
| A2 | The sidebar footer shows the user's name and email. Figma shows the name and the plan status ("Paket Gratis, sisa 1 dari 3 sesi"). | Code |
| A3 | The sidebar uses `h-screen` (`100vh`). `DESIGN.md` asks for `dvh` or `svh` so mobile browser toolbars don't cut the page. | Code |
| A4 | Some text sizes are one-off values instead of type tokens: `text-[15px]` on the device check error, `text-[13px]` on the interview room timer, `text-[56px]` on the calibration countdown, `text-[44px]` on plan prices and `text-[28px]` on the checkout price. They should map to the `display/*` and `text/*` styles. | Code |
| A5 | Every UI string is in Indonesian only. English for every screen, with the menu language taken from the profile, is still to come (`DESIGN.md` section 9). | Code |
| A6 | The landing and sign-in pages draw thin concentric "paper swirl" lines in the background. They aren't in Figma. Either keep them and add them to the Figma frames, or remove them. | Design decision |

### Landing (01 Landing, M01 Landing, M01b Menu)

| # | Finding | Fix in |
|---|---|---|
| L1 | Desktop matches the frame: top bar, hero, sample report with the pace meter and timecode tape, "Cara kerja", "Paket" and footer. | OK |
| L2 | The app shows four plans (Tahunan added); Figma shows three. | Figma |
| L3 | On a phone there's no hamburger menu (M01b), so the "Cara kerja", "Paket" and "Untuk kampus" links can't be reached. | Code |
| L4 | On a phone the hero buttons aren't full width, the sample report keeps the full meter and tape instead of the simpler card in M01, and the "Cara kerja" numbers use the desktop size. The page is 4,054 px tall against 2,717 px in M01. | Code |
| L5 | The featured plan is Premium on the desktop frame and Sprint Pass on the mobile frame. The app features Premium on both. Pick one. | Figma |

### Sign in (02 Masuk, M02 Masuk)

| # | Finding | Fix in |
|---|---|---|
| S1 | Figma says "Pengguna harus berusia 17 tahun atau lebih". The app says 18, which is correct (BR-01). | Figma |
| S2 | The tagline in the dark panel is bold in the app and regular in Figma. The tape's playhead runs past the bottom of the panel. | Code |
| S3 | On a phone the app shows a dark header without the tagline. M02 has a light header with "EchoCV" and the tagline. | Code |

### Session setup (05 Atur sesi, M05 Atur sesi)

| # | Finding | Fix in |
|---|---|---|
| P1 | Role: Figma has a free-text field with suggestions. The app offers the seven confirmed roles as choices. | Figma |
| P2 | Level: the app adds "Magang", so there are four levels; Figma has three. | Figma |
| P3 | Question sets: the app has "Umum dan perkenalan diri", "Perilaku (STAR)" and "Teknis sesuai peran". Figma has "Perkenalan diri", "Perilaku (STAR)", "Teknis dasar" and "Campuran". | Figma |
| P4 | Upload mode: the app says "Unggah: rekaman video"; Figma says "Unggah: video atau audio". The app is right, because Upload mode takes video only. This also closes the "Upload formats" open question in `DESIGN.md`. | Figma |
| P5 | The quota badge above the start button ("Memakai 1 dari 2 sesi gratis tersisa") is missing from the session summary. | Code |
| P6 | The role and question set explanations are being added to this page. Check them in the final design QA. | Check later |

### Calibration (06 Kalibrasi, M06 Kalibrasi)

| # | Finding | Fix in |
|---|---|---|
| C1 | The layout matches: camera frame on the left; on the right the title, the camera, microphone, lighting and connection checks with badges, the voice test meter, the lighting notice, the privacy line, "Mulai wawancara" and "Kembali". | OK |
| C2 | Face guide: Figma draws a dashed oval with "Posisikan wajah dalam bingkai" inside the frame. The app uses an image guide with the text above the frame. The face circle position is already planned with the mid-MVP copy and size fixes. | Code |
| C3 | Only the app has the 5-second calibration block with its progress bar, its retry, and the note shown when analysis falls back to the CPU. | Figma |
| C4 | "Mulai wawancara" stays disabled until calibration finishes, but nothing says why. Add a line such as "Selesaikan kalibrasi 5 detik dulu." | Code |

### Interview room (07 Ruang wawancara, M07 Ruang wawancara)

| # | Finding | Fix in |
|---|---|---|
| R1 | The layout matches: dark recording bar, question in `display/h1`, one instruction line, live hint as a badge plus a sentence, camera in a dark `radius-xl` frame with the face guide, and the bottom bar with "Selesai dan analisis", "Lewati pertanyaan" and "Ulangi jawaban". | OK |
| R2 | Live hint badges always say "Perhatikan" or "Bagus". Figma names the aspect in the badge ("Tempo baik"). | Code |
| R3 | Only the app has the first-time guide ("Cara kerja ruang wawancara"). | Figma |
| R4 | On a phone the camera sits above the question. Check this order against M07 in the final design QA. | Check later |

### Upload (08 Unggah dan proses, 08b, 08c, M08u)

| # | Finding | Fix in |
|---|---|---|
| U1 | The Figma caption says "MP4, MOV, WEBM, MP3, WAV, M4A. Maksimal 500 MB dan 15 menit." The app reads the real limits from `shared/speech.json`: MP4, MOV and WebM, 50 MB and 3 minutes. | Figma |
| U2 | Figma shows one analysis with four pipeline steps. The app has one upload and status per question. | Figma |
| U3 | The upload progress bar size is already planned with the mid-MVP copy and size fixes. | Code |

### Report (09 Laporan, M09 Laporan, M09c Analisis gagal)

| # | Finding | Fix in |
|---|---|---|
| T1 | Matches: title with the date, the row of four stats, the practice disclaimer (BR-08), the pace meter, the timecode tape with feedback markers, and the transcript with timecodes and fillers underlined in `ink-warning`. | OK |
| T2 | The "Bandingkan percobaan" and "Unduh PDF" actions are missing, because comparing attempts and the PDF aren't built yet. Either plan them or take them out of the frame. | Design decision |
| T3 | Figma shows answer structure (STAR) as four columns with a status badge each. The app shows content feedback per answer ("Sudah baik", "Bisa ditingkatkan") and the per-aspect scores. | Figma |
| T4 | The fourth stat is "Isi jawaban" (0 to 100) in the app and "Kejelasan struktur" (out of 5 STAR elements) in Figma. | Figma |
| T5 | Only the app has "Fokus latihan berikutnya", which leads the report as the usability test asked. | Figma |
| T6 | The report shows words per minute, but pace is scored in syllables per second. The pace unit question in `DESIGN.md` is still open. | Design decision |

### Dashboard (04 Beranda, M04 Beranda)

| # | Finding | Fix in |
|---|---|---|
| D1 | The quota line under the greeting ("Sisa 2 dari 3 sesi gratis bulan ini. Kuota kembali tanggal 1 ...") and the plan badge at the top right are missing. | Code |
| D2 | The stats differ. The app shows the last score, the change since the first session and the number of sessions with a report. Figma shows the last score, fillers per minute and speaking pace. | Figma |
| D3 | The "Fokus berikutnya" button opens a general setup ("Latih sekarang"). Figma's "Latih set STAR" opens the set that trains the weakest aspect. | Code |

### Plans and checkout (11 Paket, 12 Checkout, 12b, 12c, M10, M10b)

| # | Finding | Fix in |
|---|---|---|
| K1 | Plan columns, rupiah prices in Newsreader, the featured band, the campus note and the sandbox note ("Tidak ada uang sungguhan yang ditarik") all match. | OK |
| K2 | Figma's checkout asks for a receipt email and a payment method (QRIS, virtual account, card) on the page. In the app, Midtrans Snap picks the method, and the page lists the methods as text. | Figma |
| K3 | The waiting, success and failed states exist in the app, as in 12b and 12c. The failed state has no Figma frame. | Figma |

### Privacy and data (13 Privasi dan data, M11, Overlay/Hapus akun)

| # | Finding | Fix in |
|---|---|---|
| V1 | The consents in the app follow BR-02: answer analysis (required), model training (optional) and HR rater scoring (optional), both off by default. Figma shows "Simpan rekaman unggahan di riwayat" and "Email pengingat latihan" instead. | Figma |
| V2 | Download data and delete account (typing HAPUS to confirm) match the frame and the overlay. | OK |

### History and progress (M13 Riwayat sesi, M14 Kemajuan)

| # | Finding | Fix in |
|---|---|---|
| H1 | These pages exist on desktop, but Figma only has mobile frames for them. | Figma |

## Usability walkthrough of the live practice flow

A heuristic walkthrough of a first-time user's path, from setup through calibration and the interview room to the report.

The team usability session with real people hasn't been run. It moves to user testing round 1 in the final product sprint, which uses the test script and SUS form.

1. **Set up a session:** five choices, each with plain labels. Missing choices give one clear sentence, and the language starts at the one chosen at sign-up. Without the set explanations (P6), a first-time user can't tell "Umum" from "Perilaku (STAR)".
2. **Check devices:** every check has an icon, a badge and a word, and errors say what to do next. The disabled start button doesn't say why (C4).
3. **Answer questions:** the first-time guide explains the timer, the single restart and skipping. The prep countdown starts recording by itself, and the instruction says so. Hints are short and polite.
4. **Read the report:** it leads with what to practise next, as the prototype usability test asked. Each tip is tied to a second on the tape.

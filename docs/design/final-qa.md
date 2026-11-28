# Final design QA and MVP demo walkthrough

The last design pass over both practice flows before the MVP demo, and the design side of the demo walkthrough. It builds on `docs/design/qa.md`, which lists every difference between the pages and the Figma design. This pass covers what changed after that list was written: the setup explanations, the upload failure reasons and the dashboard's video analysis list.

## Final pass over both flows

| Step | Live mode | Upload mode | Ready for the demo |
|---|---|---|---|
| Setup | The role, level and question set choices now show their description and "Cocok untuk" line under the choice. A quick start shows its own explanation. The text comes from the shared explanations file. | Same page; "Lanjut ke unggah" leads to the upload page. | Yes |
| Device check and calibration | Checks with icon, badge and word; the 5-second calibration gates "Mulai wawancara". | Not used. | Yes |
| Answering | Interview room with the recording bar, live hints, restart once and skip. | One upload per question, with checks before sending and the progress per question. Each failed analysis says what happened, what to try next, and that it does not count against the quota. | Yes |
| Waiting for the analysis | The room sends each answer and moves on. | Analysis keeps running after the page is closed; the dashboard lists video analyses that are still running or failed, with "Buka unggahan". | Yes |
| Report | Leads with what to practise next, then the stats, the practice disclaimer, the pace meter, the timecode tape, the transcript and the per-aspect scores with the smile note. | Same report, with the "Mode Unggah: kurang presisi" notice. | Yes |

New since the first list:

| # | Finding | Fix in |
|---|---|---|
| F1 | The dashboard's "Analisis video" list has no Figma frame. | Figma |
| F2 | The explanations are shown in Indonesian only, like the rest of the app (see A5 in `qa.md`). The English text is already in the explanations file. | Code |
| F3 | The explanation under each choice uses a left rule and secondary ink, which fits the house rules (rules, not boxes). Add it to the Choice component in Figma. | Figma |

Nothing here blocks the demo. All open items from both lists are planned for the final product sprint (1 to 7 Dec).

## Demo walkthrough: the design side

For the presenters of the demo script in `docs/pm/mvp-demo.md`. To be reviewed with the project manager before the dry run.

### Screen and browser

- Chrome or Edge, light mode, zoom at 100 %, window at least 1280 px wide so the desktop layout with the sidebar shows. Hide the bookmarks bar and close other tabs.
- Show the app at desktop width only. The phone layout still lacks the bottom tab bar and the landing menu (A1 and L3 in `qa.md`).
- Sign in to the returning-user account before the demo, so no email or account details appear on the projector. Show the sign-in page signed out, without typing an address.

### What to point out, screen by screen

1. **Landing:** the Paper and Ink look (warm paper, dark ink, one deep green accent, thin rules instead of boxes), and the sample report in the hero with the pace meter and the timecode tape. The privacy line under the buttons ("video Anda dianalisis di perangkat") is the promise of Live mode.
2. **Setup:** each choice now explains itself, so a student knows which question set fits them.
3. **Device check:** status is never colour alone. Every check has an icon, a badge and a word, which keeps it readable for colour-blind users.
4. **Interview room:** one calm instruction, one hint at a time, and the camera in a dark frame, so the student looks at the question, not at themselves.
5. **Report:** the report reads like an annotated page. It leads with the one or two things to practise next. Each amber tick on the timecode tape is a moment in the answer with its note below, and fillers are underlined in the transcript. Point out the disclaimer that scores are practice feedback, not a hiring prediction, and that smile is feedback only and never part of the score.
6. **Plans:** prices in the same serif as the scores, the featured plan as a quiet green band, and the sandbox note that no real money is taken. Checkout is now wired to the Midtrans sandbox, so the narration in the demo script's checklist ("still in read-only preview") no longer applies.

### Questions the design side may get

- **Why is the design so plain?** EchoCV should feel like a calm coach with a notebook, not a game or a dashboard: it coaches and never judges. The prototype usability test (11 users, SUS 67.3) asked for the report to lead with what to improve, which it now does. Its other request, rounder corners and a little more colour, is still an open design decision.
- **Does it work on a phone?** The mobile frames are designed and the pages use responsive layouts. The bottom tab bar, the landing menu and testing on real phones are planned after the MVP demo.
- **Is it in English too?** The question bank, the explanations and the reports work in both languages. The interface text is Indonesian for the MVP; English for every screen is planned after the demo.

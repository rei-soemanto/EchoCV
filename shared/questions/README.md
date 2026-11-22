# Bilingual Interview Question Bank

Starter dataset of bilingual (`id` and `en`) interview questions for EchoCV, stored in `shared/questions/bank.json`.

## Schema Contract

`bank.json` has three top-level fields:

- `version`: semantic version of the question bank (`"0.1.0"`).
- `enums`: canonical filter values aligned with `supabase/migrations/20261120000000_data_model.sql`:
  - `job_fields`: `["IT"]`
  - `levels`: `["internship", "fresh_graduate", "junior", "mid_level"]`
  - `languages`: `["id", "en"]`
  - `question_sets`: `["general", "behavioral", "role_specific"]` (note the SQL spelling `behavioral`)
  - `roles`: `["Backend developer", "Frontend developer", "Fullstack developer", "Mobile developer", "QA engineer", "Data / AI engineer", "UI/UX designer"]`
- `questions`: array of question objects, each containing:
  - `id`: stable string identifier (`q01` through `q30`). `q01`–`q12` match `docs/data-collection-protocol.md` verbatim and must remain stable across versions.
  - `question_set`: `"general" | "behavioral" | "role_specific"`
  - `category`: topic label (`"introduction"`, `"motivation"`, `"behavioral_star"`, `"situational"`, `"self_assessment"`, `"career_goals"`, `"work_style"`, `"technical"`, `"situational_technical"`)
  - `job_field`: `"IT"`
  - `roles`: `["all"]` for cross-role `general` and `behavioral` questions, or an explicit non-empty subset of `enums.roles` for `role_specific` questions
  - `levels`: non-empty subset of `enums.levels`
  - `prep_time_sec`: `15` (matches `UC-04` default 15-second preparation countdown)
  - `suggested_duration_sec`: `90` or `120` (strictly `<= 180` seconds max recording duration per `UC-04`)
  - `text`: `{ "id": "<Indonesian>", "en": "<English>" }` with both strings non-empty (`BR-30`)
  - `tags`: string array used for filtering and quick-start selection (`q01` carries `"quick_start"`)

## Business Rules and Selection Behavior

- **Bilingual completeness (`BR-30`):** Every question provides both Indonesian (`text.id`) and English (`text.en`) prompts. Session text follows the immutable session `language` (`BR-26`).
- **Session question selection (`UC-02` / `api/sessions`):**
  - Default session setup selects **3 questions** matching the requested `(job_field, role, level, question_set)` where `question.roles` includes `"all"` or the requested `role`, and `question.levels` includes the requested `level`.
  - Quick-start flow (`UC-02 A1`, "Practise tell-me-about-yourself") selects the single question tagged `"quick_start"` (`q01`).
  - `session_questions` in Postgres stores a snapshot of the selected `question_id` and localized `question_text` in the chosen session language (`BR-26`).
- **Role/level coverage (`BR-03`):** Every `(role, level, question_set)` combination in `enums` yields at least 3 matching questions.

## Loading from `apps/web`

`shared/package.json` (owned by Rei) currently exports `vision-models.json`, `rubric.json`, `labels.json`, `speech.json`, and `schemas/*`. Until `"./questions/*": "./questions/*"` is added to `shared/package.json` by the maintainer, server-side API routes in `apps/web` (such as `app/api/sessions/route.ts`) can read the file directly with `node:fs`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

const bankPath = join(process.cwd(), "../../shared/questions/bank.json");
const bank = JSON.parse(readFileSync(bankPath, "utf8"));
```

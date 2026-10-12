# Graph Report - EchoCV  (2026-10-12)

## Corpus Check
- Large corpus: 121 files · ~737,720 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 684 nodes · 1063 edges · 49 communities (32 shown, 8 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 47 edges (avg confidence: 0.88)
- Token cost: 127,533 input · 0 output

## Community Hubs (Navigation)
- ML Paths and Provenance
- Whisper Synthetic Filler Data
- Data Collection and Consent
- Eye Contact and Smile Calibration
- Report JSON Schema
- Architecture and CI Docs
- Visual Metrics Schema
- COCO Pose Behaviour Rules
- YOLO Dataset Builder
- Resumable Downloads
- shadcn Config
- Filler Normalization and Metrics
- Web Package Manifest
- TypeScript Config
- Speech Pydantic Schemas
- Prosody Schema Fields
- Web Runtime Dependencies
- Web Dev Dependencies
- Speech Metrics Core Fields
- Filler Item Schema
- Placeholder App Pages
- Speech FastAPI Endpoints
- Root Workspace Manifest
- Shared Package Exports
- Next Layout and Config
- Landing Page and UI Button
- Web Scripts
- YOLO Preview Sheets
- Speech Metrics Schema Root
- Speaking Rate Field
- Next.js Agent Rules
- Playwright E2E
- Pause End Field
- Pauses Field
- ESLint Config
- PostCSS Config
- Rubric Unit Test
- Calibration Project
- ML Project
- Speech Project

## God Nodes (most connected - your core abstractions)
1. `EchoCV architecture design spec` - 18 edges
2. `compilerOptions` - 16 edges
3. `load()` - 14 edges
4. `Person` - 14 edges
5. `frontal()` - 12 edges
6. `transcribe()` - 12 edges
7. `main()` - 12 edges
8. `Tech stack and datasets research` - 12 edges
9. `extract()` - 11 edges
10. `to_target()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `suppress_tokens.json` --conceptually_related_to--> `faster-whisper large-v3-turbo (filler fine-tuned)`  [INFERRED]
  ml/whisper/README.md → docs/superpowers/specs/2026-10-06-echocv-architecture-design.md
- `pnpm workspace config` --references--> `apps/web Next.js app`  [INFERRED]
  pnpm-workspace.yaml → README.md
- `pnpm workspace config` --references--> `@echocv/shared package (rubric, labels, JSON Schemas)`  [INFERRED]
  pnpm-workspace.yaml → README.md
- `CI web job (lint, test, build)` --references--> `apps/web Next.js app`  [INFERRED]
  .github/workflows/ci.yml → README.md
- `Upload mode (server-side analysis)` --references--> `services/speech FastAPI service`  [INFERRED]
  docs/superpowers/specs/2026-10-06-echocv-architecture-design.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Live-mode in-browser vision pipeline** — docs_superpowers_specs_2026_10_06_echocv_architecture_design_mediapipe_face_landmarker, docs_superpowers_specs_2026_10_06_echocv_architecture_design_yolo26n_pose, docs_superpowers_specs_2026_10_06_echocv_architecture_design_yolo26n_behaviour_detector, docs_superpowers_specs_2026_10_06_echocv_architecture_design_frame_aggregator, docs_superpowers_specs_2026_10_06_echocv_architecture_design_live_mode [EXTRACTED 1.00]
- **Speech analysis pipeline to report** — docs_superpowers_specs_2026_10_06_echocv_architecture_design_silero_vad, docs_superpowers_specs_2026_10_06_echocv_architecture_design_faster_whisper, docs_superpowers_specs_2026_10_06_echocv_architecture_design_librosa_prosody, docs_superpowers_specs_2026_10_06_echocv_architecture_design_llm_scoring, docs_superpowers_specs_2026_10_06_echocv_architecture_design_report_builder [EXTRACTED 1.00]
- **One recording session feeds three in-house datasets** — docs_data_collection_protocol_recording_session, docs_data_collection_protocol_verbatim_transcription, docs_data_collection_protocol_frame_labelling_roboflow, docs_data_collection_protocol_hr_rating, ml_eval_readme_rubric_calibration [INFERRED 0.85]

## Communities (49 total, 8 thin omitted)

### Community 0 - "ML Paths and Provenance"
Cohesion: 0.07
Nodes (40): Shared filesystem locations for ml/ scripts., Dataset, Path, Record which datasets each checkpoint touched (see docs/tech-stack-and-…, write_provenance(), test_max_tokens_scales_with_duration_and_caps(), Locations and readers shared by the Whisper data scripts., read_manifest() (+32 more)

### Community 1 - "Whisper Synthetic Filler Data"
Cohesion: 0.08
Nodes (48): test_boundaries_skip_unmatched_words(), test_boundaries_use_gaps_between_matched_words(), test_insert_tokens_at_word_indices(), test_snap_to_quiet_finds_the_gap(), test_splice_inserts_clip_with_padding_at_time(), test_token_words_groups_bpe_pieces_with_shifted_times(), decode(), load() (+40 more)

### Community 2 - "Data Collection and Consent"
Cohesion: 0.07
Nodes (45): Bilingual participant consent, Participant consent form, Data collection protocol, Frame labelling (Roboflow), HR practitioner rating, Consented mock-interview recording session, Verbatim transcription rules, Behaviour detector v0 (YOLO26n, run B) (+37 more)

### Community 3 - "Eye Contact and Smile Calibration"
Cohesion: 0.09
Nodes (38): Merge calibration results into shared/thresholds.json. Run from…, _add_base(), columbia(), errors(), fit(), main(), mpii(), DataFrame (+30 more)

### Community 4 - "Report JSON Schema"
Cohesion: 0.05
Nodes (45): additionalProperties, minimum, type, minimum, type, format, type, description (+37 more)

### Community 5 - "Architecture and CI Docs"
Cohesion: 0.09
Nodes (41): CI workflow, CI speech job (ruff, pytest, docker build), CI web job (lint, test, build), apps/web README, public/models (git-ignored model files from HF Hub), Ultralytics YOLO AGPL-3.0 license risk, EchoCV architecture design spec, faster-whisper large-v3-turbo (filler fine-tuned) (+33 more)

### Community 6 - "Visual Metrics Schema"
Cohesion: 0.05
Nodes (38): additionalProperties, minimum, type, description, minimum, type, minimum, type (+30 more)

### Community 7 - "COCO Pose Behaviour Rules"
Cohesion: 0.10
Nodes (33): Box, frontal(), A person facing the camera; shoulder width 100 px. Keyword args move keypoints., test_crossed_wrists_near_opposite_elbows_is_arms_crossed(), test_crowded_crop_is_rejected(), test_hand_on_face_is_touching_face(), test_hand_raised_above_the_eyes_is_not_touching_face(), test_phone_at_the_ear_is_not_reading_notes() (+25 more)

### Community 8 - "YOLO Dataset Builder"
Cohesion: 0.13
Nodes (27): load_labels(), test_direct_mapping_and_unknown_classes_ignored(), test_drop_image_role_drops_everything(), test_hand_grazing_face_box_is_not_touching_face(), test_hand_mostly_on_face_becomes_touching_face(), test_keep_negative_subsamples_train_only(), test_palm_raised_beside_face_is_not_touching_face(), test_separate_hand_and_face_are_negative() (+19 more)

### Community 9 - "Resumable Downloads"
Cohesion: 0.17
Nodes (18): extract(), fetch(), _fetch_once(), Path, Resumable HTTP downloads and archive extraction (stdlib only)., Download url to dest; resume the .part file after timeouts or dropped…, Extract a .zip/.tar/.tar.gz once; a marker file makes it idempotent., main() (+10 more)

### Community 10 - "shadcn Config"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 11 - "Filler Normalization and Metrics"
Cohesion: 0.16
Nodes (19): test_filler_counts_accepts_tokens_and_spoken_forms(), test_filler_prf_counts_per_utterance(), test_for_wer_strips_fillers_and_punctuation(), test_indonesian_interjections_are_not_fillers(), test_to_target_lowercases_ami_and_keeps_backchannels(), test_to_target_maps_disfluencyspeech_text(), filler_counts(), filler_prf() (+11 more)

### Community 12 - "Web Package Manifest"
Cohesion: 0.11
Nodes (18): name, private, version, @base-ui/react, @echocv/shared, eslint, eslint-config-next, lucide-react (+10 more)

### Community 13 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 14 - "Speech Pydantic Schemas"
Cohesion: 0.28
Nodes (11): BaseModel, Filler, Pause, Prosody, Pydantic mirror of shared/schemas/speech-metrics.schema.json. Field names are…, SpeechMetrics, _Wire, _sample() (+3 more)

### Community 15 - "Prosody Schema Fields"
Cohesion: 0.15
Nodes (13): minimum, type, minimum, type, pitchMeanHz, pitchStdHz, prosody, volumeMeanDb (+5 more)

### Community 16 - "Web Runtime Dependencies"
Cohesion: 0.18
Nodes (11): dependencies, @base-ui/react, class-variance-authority, cn, @echocv/shared, lucide-react, next, react (+3 more)

### Community 17 - "Web Dev Dependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, eslint-config-next, @playwright/test, tailwindcss, @tailwindcss/postcss, @types/node, @types/react (+3 more)

### Community 18 - "Speech Metrics Core Fields"
Cohesion: 0.18
Nodes (11): minimum, type, description, type, enum, properties, answerIndex, fillers (+3 more)

### Community 19 - "Filler Item Schema"
Cohesion: 0.24
Nodes (11): items, additionalProperties, properties, required, type, items, startMs, token (+3 more)

### Community 21 - "Speech FastAPI Endpoints"
Cohesion: 0.22
Nodes (5): get, JSONResponse, post, analyze(), health()

### Community 22 - "Root Workspace Manifest"
Cohesion: 0.22
Nodes (8): name, packageManager, private, scripts, build, dev:web, lint, test

### Community 23 - "Shared Package Exports"
Cohesion: 0.22
Nodes (8): description, exports, ./labels.json, ./rubric.json, ./schemas/*, name, private, version

### Community 24 - "Next Layout and Config"
Cohesion: 0.25
Nodes (5): geistMono, geistSans, metadata, nextConfig, next

### Community 25 - "Landing Page and UI Button"
Cohesion: 0.36
Nodes (5): Home(), Button(), buttonVariants, class-variance-authority, cn

### Community 26 - "Web Scripts"
Cohesion: 0.25
Nodes (8): scripts, build, dev, lint, start, test, test:e2e, typecheck

### Community 27 - "YOLO Preview Sheets"
Cohesion: 0.50
Nodes (7): _draw(), _label_path(), main(), Image, Path, Contact sheets of random labelled crops per class and origin, for a visual…, sheet()

### Community 28 - "Speech Metrics Schema Root"
Cohesion: 0.25
Nodes (7): additionalProperties, description, $id, required, $schema, title, type

### Community 29 - "Speaking Rate Field"
Cohesion: 0.50
Nodes (4): speakingRateWps, description, minimum, type

### Community 30 - "Next.js Agent Rules"
Cohesion: 0.67
Nodes (3): apps/web AGENTS.md (Next.js agent rules), Next.js agent rules (breaking-changes notice), apps/web CLAUDE.md

### Community 32 - "Pause End Field"
Cohesion: 0.67
Nodes (3): minimum, type, endMs

### Community 33 - "Pauses Field"
Cohesion: 0.67
Nodes (3): description, type, pauses

## Knowledge Gaps
- **196 isolated node(s):** `geistSans`, `geistMono`, `metadata`, `$schema`, `style` (+191 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 312 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@echocv/shared package (rubric, labels, JSON Schemas)` connect `Architecture and CI Docs` to `Data Collection and Consent`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `geistSans`, `geistMono`, `metadata` to the rest of the system?**
  _196 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ML Paths and Provenance` be split into smaller, more focused modules?**
  _Cohesion score 0.06892230576441102 - nodes in this community are weakly interconnected._
- **Should `Whisper Synthetic Filler Data` be split into smaller, more focused modules?**
  _Cohesion score 0.08490566037735849 - nodes in this community are weakly interconnected._
- **Should `Data Collection and Consent` be split into smaller, more focused modules?**
  _Cohesion score 0.06859903381642513 - nodes in this community are weakly interconnected._
- **Should `Eye Contact and Smile Calibration` be split into smaller, more focused modules?**
  _Cohesion score 0.09178743961352658 - nodes in this community are weakly interconnected._
- **Should `Report JSON Schema` be split into smaller, more focused modules?**
  _Cohesion score 0.04734299516908213 - nodes in this community are weakly interconnected._
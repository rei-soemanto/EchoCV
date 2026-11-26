# ml/

Training and calibration for EchoCV v0 and v1. Python 3.12, managed with uv. Everything runs locally on
the RTX 3050 Ti (4 GB); only the LiteRT export needs Colab. Datasets, weights and base models never
go in git (`ml/data/`, `ml/artifacts/`, `ml/.cache/` are ignored).

| Folder | What | Where it runs |
|---|---|---|
| `data/` | Download scripts (`python -m data.download_*`); downloaded data lands next to them | Local |
| `yolo/` | Behaviour detector: COCO pose rules, dataset builder, preview sheets, train, evaluate, ONNX export | Local GPU; `export_litert.ipynb` in Colab |
| `whisper/` | Filler fine-tune: filler bank, synthetic Indonesian fillers, manifests, LoRA training, evaluation, CTranslate2 conversion | Local GPU (decoder-only LoRA fits in 4 GB) |
| `calibration/` | Eye-contact and smile thresholds with MediaPipe (its own uv project: mediapipe's OpenCV clashes with ultralytics') | Local CPU |
| `common/` | Paths, resumable downloads, dataset provenance (`datasets.json` next to every model) | — |

Training data is **commercially safe only**. Columbia Gaze and MPIIFaceGaze (non-commercial) are
used only to choose and measure eye-contact constants. See `common/provenance.py`.

## Run order

All commands run from `ml/` unless noted.

```bash
uv sync                                         # CUDA torch (~3 GB) on first run
uv run pytest && uv run ruff check

# 1. Downloads (put ROBOFLOW_API_KEY=... in ml/.env first)
uv run python -m data.download_speech           # FLEURS id, DisfluencySpeech, turbo, AMI (~10 GB)
uv run python -m data.download_coco             # COCO keypoints + selected images
uv run python -m data.download_roboflow         # CC BY 4.0 seed sets
uv run python -m data.download_calibration      # GENKI-4K, MPIIFaceGaze, face_landmarker.task
#   Columbia Gaze needs an e-mail form: download columbia_gaze_data_set.zip manually into
#   data/columbia_gaze/ and rerun download_calibration to extract it.

# 2. Behaviour detector
uv run python -m yolo.build_dataset             # after writing yolo/class_map.yaml
uv run python -m yolo.preview                   # check data/behaviour/preview/*.jpg
uv run python -m yolo.train --variant A         # Roboflow only (~4 h)
uv run python -m yolo.train --variant B         # Roboflow + COCO-derived
uv run python -m yolo.evaluate                  # picks A or B -> artifacts/yolo/v0/
uv run python -m yolo.export                    # ONNX + parity check

# 3. Whisper filler model
uv run python -m whisper.filler_bank
uv run python -m whisper.synth_id               # GPU word timestamps, then synthesis
uv run python -m whisper.prepare_data
uv run python -m whisper.evaluate --model base  # baseline
uv run python -m whisper.train_lora --smoke     # VRAM check
uv run python -m whisper.train_lora             # resumes from artifacts/whisper/v0/lora_last
uv run python -m whisper.select_checkpoint      # best filler F1 within the WER guard -> lora/
uv run python -m whisper.evaluate --model lora
uv run python -m whisper.merge_and_convert      # CTranslate2 int8 + parity check

# 4. Thresholds (from ml/calibration/)
uv run python -m calib.smile
uv run python -m calib.eye_contact
uv run python -m calib.export_thresholds        # -> shared/thresholds.json

# 5. Report (from ml/)
uv run python report.py                         # -> docs/model-report-v0.md
```

## v1: team recordings

Recordings go in `data/inhouse/raw/` with the file names from `docs/data-collection-protocol.md`.
Every number is leave one person out; the final model or constants use everyone. A clip recorded
under the wrong name is fixed in `data/inhouse/relabel.csv` (`stem,start,end,clip`; an empty clip
drops those seconds), which every step reads.

When new people arrive, score the frozen models on them before refitting (copy the current
`calibration/results/inhouse*.json` and `artifacts/yolo/v1_lopo.json` into
`calibration/results/v1_4p/` first):

```bash
cd calibration && uv run python -m calib.inhouse_holdout && cd ..   # -> results/holdout_v1.json
uv run python -m inhouse.evaluate_lopo --holdout p05,p06,p07 --weights artifacts/yolo/v1_4p/best.pt
```

Then refit with a new run prefix so old folds are not reused (`--prefix v1_lopo7`).

```bash
uv run python -m inhouse.inventory              # -> data/inhouse/inventory.csv, flags
uv run python -m inhouse.extract_pose           # GPU: frames + YOLO26n-pose + objects
cd calibration
uv run python -m calib.inhouse_face             # MediaPipe face features on the same frames
uv run python -m calib.inhouse_calibrate        # eye contact, smile, gaze down
uv run python -m calib.inhouse_posture          # pose rules -> derived/behaviour_scores.csv
cd ..
uv run python -m inhouse.autolabel              # check derived/contact/*.jpg; bad frames -> reject.txt
uv run python -m inhouse.evaluate_lopo --prefix v1_lopo7   # GPU: one fold per person + final -> artifacts/yolo/v1/
uv run python -m yolo.export --version v1       # ONNX + parity check
YOLO_AUTOINSTALL=false uv run python -m yolo.export_browser   # pose, objects, detector -> apps/web/public/models
uv run python -m hub.push_models                # private HF repo; rewrites shared/model-hub.json (HF_TOKEN with write access in ml/.env)
uv run python -m whisper.inhouse_pace           # needs services/speech running on :8000 -> calibration/results/inhouse_pace.json
uv run python -m whisper.decoding_check --device cpu   # live decoding settings vs checked answers -> artifacts/whisper/decoding_check.json
cd calibration && uv run python -m calib.export_thresholds && uv run python -m calib.export_face_fixture && uv run python -m calib.export_posture_fixture && cd ..   # browser parity fixtures: apps/web/tests/unit/vision
cd calibration && uv run python -m calib.inhouse_scoring && uv run python -m calib.export_scoring && cd ..   # score bands -> a supabase/migrations file for scoring_bands
uv run python report_v1.py                      # -> docs/model-report-v1.md
```

`whisper.inhouse_pace` sends every Part B answer through the speech service's `/analyze` and keeps
only the numbers (no transcripts): pace, filler and long-pause counts, pitch, volume and the number of
mixed-language words. `calib.export_scoring` turns these and the per-answer eye contact and behaviour
time from `calib.inhouse_scoring` into the 0 to 100 score bands, written as a migration that updates
the `scoring_bands` table read by the reports API. Bump `VERSION` and `MIGRATION` before exporting
new bands so the old migration is never rewritten.
Answers already measured are reused, so delete the file to measure again after a speech model change.

Run `hub.push_models` again after every browser export or Whisper conversion, and commit the new
`shared/model-hub.json` with the new `shared/vision-models.json`: teammates pull exactly the revision
and checksums listed there.

Run GPU jobs one at a time: on the 4 GB card a second CUDA process spills into shared system
memory and both slow to a crawl (or crash).

# ml/

Training and calibration for EchoCV v0. Python 3.12, managed with uv. Everything runs locally on
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
uv run python -m whisper.evaluate --model lora
uv run python -m whisper.merge_and_convert      # CTranslate2 int8 + parity check

# 4. Thresholds (from ml/calibration/)
uv run python -m calib.smile
uv run python -m calib.eye_contact
uv run python -m calib.export_thresholds        # -> shared/thresholds.json
```

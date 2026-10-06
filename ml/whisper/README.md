# ml/whisper

LoRA fine-tune of whisper-large-v3-turbo so it keeps fillers (`[EEE]`, `[HMM]`, `[UM]` from
`shared/labels.json`). Runs on a Colab/Kaggle T4, not locally.

Planned files (weeks 3–5):
- `prepare_data.py`: merge in-house verbatim transcripts with Common Voice, FLEURS and AMI.
- `train_lora.ipynb`: Transformers + PEFT LoRA (INT8) notebook.
- `convert_ct2.py`: merge LoRA weights and convert to CTranslate2 int8 for faster-whisper.

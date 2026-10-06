# ml/whisper

LoRA fine-tune of whisper-large-v3-turbo so it keeps fillers as `[EEE]`, `[UM]` and `[HMM]`
(`shared/labels.json`). Trains locally on the 4 GB RTX 3050 Ti: the encoder is frozen and only the
4 decoder layers get LoRA adapters (stage 1). If recall stays low, `--encoder-lora 8` adds adapters
to the top encoder layers (stage 2).

| Script | Does |
|---|---|
| `normalize.py` | Maps spoken fillers (uh, um, hmm…) to tokens; filler P/R/F1; WER text normalisation |
| `filler_bank.py` | Cuts standalone filler clips from AMI, kept per split so test clips are unseen |
| `synth_id.py` | Splices filler clips into FLEURS Indonesian speech at word boundaries ("eee" = time-stretched "uh") |
| `prepare_data.py` | AMI (merged same-speaker segments) + DisfluencySpeech + FLEURS → 16 kHz FLAC + JSONL manifests |
| `train_lora.py` | Training loop; validates filler F1 every 500 steps; resumable |
| `evaluate.py` | Filler F1 + WER on AMI, DisfluencySpeech, FLEURS and synthetic FLEURS test sets |
| `merge_and_convert.py` | Merge LoRA → CTranslate2 int8 for faster-whisper; CPU parity check |

**`suppress_tokens.json` must ship with the model.** Whisper's default suppress list blocks tokens
starting with `[`, so faster-whisper must be called with `suppress_tokens=<this list>`, not the
default `[-1]`, or it can never output a filler token.

Audio is read with pyarrow + soundfile; the `datasets` library is not used because its audio
decoding needs FFmpeg DLLs.

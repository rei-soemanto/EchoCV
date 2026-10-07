"""Merge the LoRA into turbo, convert to CTranslate2 int8 for faster-whisper, and check parity.

ctranslate2 wheels expect CUDA 12 while this env ships CUDA 13, so the faster-whisper check runs on
CPU int8. The HF reference runs on GPU.

Run from ml/:  uv run python -m whisper.merge_and_convert
"""

import json
import shutil
import subprocess
import sys

import torch
from faster_whisper import WhisperModel
from peft import PeftModel
from transformers import WhisperForConditionalGeneration, WhisperProcessor

from common.paths import WHISPER_BASE
from common.provenance import write_provenance
from whisper.audio import load
from whisper.common import read_manifest
from whisper.evaluate import TEST_SETS, V0
from whisper.infer import score, transcribe
from whisper.tokens import filler_safe_suppress

PARITY_ROWS = 25  # per test set -> 100 utterances
TOLERANCE = 0.02


def main() -> None:
    merged, ct2 = V0 / "merged", V0 / "ct2"
    processor = WhisperProcessor.from_pretrained(WHISPER_BASE)
    model = WhisperForConditionalGeneration.from_pretrained(WHISPER_BASE, dtype=torch.float16)
    model = PeftModel.from_pretrained(model, V0 / "lora").merge_and_unload()
    model.save_pretrained(merged)
    processor.save_pretrained(merged)
    # transformers v5 writes processor_config.json; the CTranslate2 converter and faster-whisper
    # read preprocessor_config.json (n_mels etc.), which is unchanged from the base model.
    shutil.copyfile(WHISPER_BASE / "preprocessor_config.json", merged / "preprocessor_config.json")

    if ct2.exists():
        shutil.rmtree(ct2)
    subprocess.run(
        [
            sys.executable,
            "-m",
            "ctranslate2.converters.transformers",
            "--model",
            str(merged),
            "--output_dir",
            str(ct2),
            "--quantization",
            "int8_float16",
            "--copy_files",
            "tokenizer.json",
            "preprocessor_config.json",
        ],
        check=True,
    )
    suppress = filler_safe_suppress(
        processor.tokenizer, list(model.generation_config.suppress_tokens)
    )
    for d in (V0, ct2):
        (d / "suppress_tokens.json").write_text(json.dumps(suppress), encoding="utf-8")

    rows = [r for name in TEST_SETS for r in read_manifest(name)[:PARITY_ROWS]]
    hf_model = model.to("cuda", torch.bfloat16)
    hf = score(rows, transcribe(hf_model, processor, rows, suppress))
    fw = WhisperModel(str(ct2), device="cpu", compute_type="int8", cpu_threads=8)
    fw_hyps = []
    for r in rows:
        segments, _ = fw.transcribe(
            load(r["audio"]),
            language=r["language"],
            task="transcribe",
            beam_size=1,
            suppress_tokens=suppress,
            without_timestamps=True,
            condition_on_previous_text=False,
        )
        fw_hyps.append(" ".join(s.text.strip() for s in segments))
    cw = score(rows, fw_hyps)
    parity = {
        "rows": len(rows),
        "hf": {"filler_f1": hf["fillers"]["all"]["f1"], "wer": hf["wer"]},
        "faster_whisper_cpu_int8": {"filler_f1": cw["fillers"]["all"]["f1"], "wer": cw["wer"]},
    }
    parity["pass"] = (
        abs(parity["hf"]["filler_f1"] - parity["faster_whisper_cpu_int8"]["filler_f1"]) <= TOLERANCE
        and abs(parity["hf"]["wer"] - parity["faster_whisper_cpu_int8"]["wer"]) <= TOLERANCE
    )
    (V0 / "ct2_parity.json").write_text(json.dumps(parity, indent=2), encoding="utf-8")
    for d in (V0, ct2):
        write_provenance(
            d,
            ["ami_ihm", "disfluencyspeech", "fleurs_id"],
            "openai/whisper-large-v3-turbo (MIT)",
            "Synthetic Indonesian fillers: AMI filler clips spliced into FLEURS id_id.",
        )
    print(json.dumps(parity, indent=2))


if __name__ == "__main__":
    main()

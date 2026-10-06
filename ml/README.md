# ml/

Training and calibration code. Python 3.12, managed with uv. Datasets and weights never go in git;
trained weights are versioned on the Hugging Face Hub.

| Folder | What goes there | Where it runs |
|---|---|---|
| `yolo/` | `train.py` (yolo26n.pt fine-tune, `batch=-1`), `export.py` (LiteRT `.tflite`) | Training: local RTX 3050 Ti. Export: **Colab only** (LiteRT export needs Linux/macOS; this laptop has no WSL) |
| `whisper/` | `prepare_data.py`, `train_lora.ipynb`, `convert_ct2.py` | Colab/Kaggle T4 (LoRA does not fit in 4 GB) |
| `eval/` | Score calibration against HR practitioner ratings | Local |
| `data/` | Download scripts only; downloaded data is git-ignored | Local |

```bash
uv sync    # downloads CUDA torch (~3 GB) on first run
uv run python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

`pyproject.toml` pins `torch`/`torchvision` to the PyTorch `cu130` wheel index because PyPI only
ships CPU builds for Windows.

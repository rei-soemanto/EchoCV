import os
from pathlib import Path

import numpy as np
import pytest

from app.config import model_settings, settings


def test_pitch_of_a_sine_is_its_frequency():
    pytest.importorskip("librosa")
    from app.prosody import pitch_stats

    rate = 16000
    t = np.arange(2 * rate) / rate
    audio = (0.3 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)
    mean, std = pitch_stats(audio, [(0, 2000)], rate, 65, 400)
    assert mean == pytest.approx(220, abs=3)
    assert std < 3


def test_silero_vad_finds_no_speech_in_silence():
    pytest.importorskip("faster_whisper")
    from faster_whisper.vad import VadOptions, get_speech_timestamps

    audio = np.zeros(3 * 16000, dtype=np.float32)
    assert get_speech_timestamps(audio, VadOptions()) == []


def test_real_answer_end_to_end():
    pytest.importorskip("faster_whisper")
    sample = os.environ.get("SPEECH_SAMPLE_AUDIO")
    if not sample or not (model_settings().model_dir / "model.bin").exists():
        pytest.skip("set SPEECH_SAMPLE_AUDIO and WHISPER_MODEL_DIR to run")
    from app.analysis import analyze
    from app.engine import LocalEngine

    engine = LocalEngine(settings(), model_settings())
    audio = engine.decode(Path(sample).read_bytes())
    out = analyze(audio, os.environ.get("SPEECH_SAMPLE_LANGUAGE", "id"), 0, engine, settings())
    assert out.speech_ms > 0
    assert out.words
    assert 0 < out.speaking_rate_wps < 6
    assert 50 < out.prosody.pitch_mean_hz < 400

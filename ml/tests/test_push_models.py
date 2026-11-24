import hashlib
import json

import pytest

from hub.push_models import hub_manifest, web_files, whisper_files


def write(path, data: bytes) -> str:
    path.write_bytes(data)
    return hashlib.sha256(data).hexdigest()


def test_web_files_must_match_the_vision_manifest(tmp_path):
    sha = write(tmp_path / "pose.onnx", b"pose")
    manifest = tmp_path / "vision-models.json"
    manifest.write_text(json.dumps({"models": {"pose": {"file": "pose.onnx", "sha256": sha}}}))
    assert web_files(tmp_path, manifest) == [tmp_path / "pose.onnx"]
    (tmp_path / "pose.onnx").write_bytes(b"changed")
    with pytest.raises(SystemExit, match="does not match"):
        web_files(tmp_path, manifest)


def test_whisper_files_need_the_model_and_list_every_checksum(tmp_path):
    with pytest.raises(SystemExit, match="model.bin"):
        whisper_files(tmp_path)
    sha = write(tmp_path / "model.bin", b"w")
    write(tmp_path / "config.json", b"{}")
    files = whisper_files(tmp_path)
    assert files["model.bin"] == sha
    assert sorted(files) == ["config.json", "model.bin"]


def test_the_hub_manifest_pins_a_private_revision():
    out = hub_manifest("team/echocv-models", "abc", {"model.bin": "f00"})
    assert out["private"] is True
    assert out["revision"] == "abc"
    assert out["whisper"]["target"] == "ml/artifacts/whisper/v0/ct2"

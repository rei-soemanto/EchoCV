import hashlib

import pytest

from app.pull_model import file_url, pull


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


FILES = {"model.bin": b"weights", "config.json": b"{}"}
HUB = {
    "repo": "team/echocv-models",
    "revision": "abc123",
    "whisper": {"path": "whisper/v0/ct2", "files": {k: digest(v) for k, v in FILES.items()}},
}


def fake_fetch(served: dict, calls: list):
    def fetch(url, token, target):
        calls.append((url, token))
        target.write_bytes(served[url.rsplit("/", 1)[1]])

    return fetch


def test_downloads_missing_files_at_the_pinned_revision(tmp_path):
    calls = []
    fetched = pull(HUB, "tok", tmp_path, fake_fetch(FILES, calls))
    assert sorted(fetched) == ["config.json", "model.bin"]
    assert (tmp_path / "model.bin").read_bytes() == b"weights"
    assert calls[0] == (file_url(HUB, "model.bin"), "tok")
    assert "/resolve/abc123/whisper/v0/ct2/model.bin" in calls[0][0]


def test_skips_files_that_already_match(tmp_path):
    (tmp_path / "model.bin").write_bytes(b"weights")
    calls = []
    fetched = pull(HUB, "tok", tmp_path, fake_fetch(FILES, calls))
    assert fetched == ["config.json"]


def test_rejects_a_file_with_the_wrong_checksum(tmp_path):
    bad = {**FILES, "model.bin": b"tampered"}
    with pytest.raises(RuntimeError, match="model.bin"):
        pull(HUB, "tok", tmp_path, fake_fetch(bad, []))
    assert not (tmp_path / "model.bin").exists()
    assert not (tmp_path / "model.bin.part").exists()

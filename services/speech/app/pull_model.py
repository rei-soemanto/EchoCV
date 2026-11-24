import hashlib
import json
import os
import sys
import urllib.request
from pathlib import Path

from app.config import SHARED_DIR, model_settings
from app.vision.settings import vision_settings

HUB_URL = "https://huggingface.co"
CHUNK = 1 << 20


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        while block := f.read(CHUNK):
            digest.update(block)
    return digest.hexdigest()


def is_current(path: Path, expected: str) -> bool:
    return path.exists() and sha256(path) == expected


def file_url(hub: dict, name: str, part: str = "whisper") -> str:
    return f"{HUB_URL}/{hub['repo']}/resolve/{hub['revision']}/{hub[part]['path']}/{name}"


def download(url: str, token: str, target: Path) -> None:
    request = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(request, timeout=60) as response, target.open("wb") as out:
        while block := response.read(CHUNK):
            out.write(block)


def vision_files() -> dict[str, str]:
    manifest = json.loads((SHARED_DIR / "vision-models.json").read_text(encoding="utf-8"))
    return {m["file"]: m["sha256"] for m in manifest["models"].values()}


def pull(
    hub: dict,
    token: str,
    folder: Path,
    fetch=download,
    part: str = "whisper",
    files: dict[str, str] | None = None,
) -> list[str]:
    folder.mkdir(parents=True, exist_ok=True)
    fetched = []
    for name, expected in (files if files is not None else hub[part]["files"]).items():
        target = folder / name
        if is_current(target, expected):
            continue
        partial = folder / f"{name}.part"
        fetch(file_url(hub, name, part), token, partial)
        if sha256(partial) != expected:
            partial.unlink()
            raise RuntimeError(f"{name} does not match its checksum in shared/")
        partial.replace(target)
        fetched.append(name)
    return fetched


def main() -> None:
    token = os.environ.get("HF_TOKEN")
    if not token:
        sys.exit("HF_TOKEN is missing: set the read token shared by the maintainer")
    hub = json.loads((SHARED_DIR / "model-hub.json").read_text(encoding="utf-8"))
    targets = [
        (model_settings().model_dir, "whisper", hub["whisper"]["files"]),
        (vision_settings().model_dir, "web", vision_files()),
    ]
    for folder, part, files in targets:
        fetched = pull(hub, token, folder, part=part, files=files)
        print(f"{folder}: {len(fetched)} downloaded, {len(files) - len(fetched)} up to date")


if __name__ == "__main__":
    main()

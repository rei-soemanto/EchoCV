import argparse
import hashlib
import json
import os
from pathlib import Path

from common.paths import ARTIFACTS, ML_ROOT, REPO_ROOT, SHARED

WEB_MODELS = REPO_ROOT / "apps" / "web" / "public" / "models"
WHISPER = ARTIFACTS / "whisper" / "v0" / "ct2"
HUB_FILE = SHARED / "model-hub.json"
VISION_MANIFEST = SHARED / "vision-models.json"
WEB_PATH = "web"
WHISPER_PATH = "whisper/v0/ct2"
REPO_NAME = "echocv-models"
CHUNK = 1 << 20


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        while block := f.read(CHUNK):
            digest.update(block)
    return digest.hexdigest()


def web_files(models: Path = WEB_MODELS, manifest_path: Path = VISION_MANIFEST) -> list[Path]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    files = []
    for name, model in manifest["models"].items():
        path = models / model["file"]
        if not path.exists():
            raise SystemExit(f"{path} is missing: run yolo.export_browser first")
        if sha256(path) != model["sha256"]:
            raise SystemExit(f"{path} does not match shared/vision-models.json ({name})")
        files.append(path)
    return files


def whisper_files(folder: Path = WHISPER) -> dict[str, str]:
    if not (folder / "model.bin").exists():
        raise SystemExit(f"{folder} has no model.bin: run whisper.merge_and_convert first")
    return {f.name: sha256(f) for f in sorted(folder.iterdir()) if f.is_file()}


def hub_manifest(repo: str, revision: str, whisper: dict[str, str]) -> dict:
    return {
        "repo": repo,
        "revision": revision,
        "private": True,
        "web": {
            "path": WEB_PATH,
            "target": "apps/web/public/models",
            "files": "shared/vision-models.json models[].file and sha256",
        },
        "whisper": {
            "path": WHISPER_PATH,
            "target": "ml/artifacts/whisper/v0/ct2",
            "files": whisper,
        },
    }


def main() -> None:
    from dotenv import load_dotenv
    from huggingface_hub import CommitOperationAdd, HfApi

    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", help="owner/name; defaults to <your account>/echocv-models")
    args = ap.parse_args()
    load_dotenv(ML_ROOT / ".env")
    token = os.environ.get("HF_TOKEN")
    if not token:
        raise SystemExit("HF_TOKEN with write access is missing from ml/.env")
    api = HfApi(token=token)
    repo = args.repo or f"{api.whoami()['name']}/{REPO_NAME}"
    api.create_repo(repo, private=True, exist_ok=True)
    if not api.model_info(repo).private:
        raise SystemExit(f"{repo} is public; make it private before uploading")
    web = web_files()
    whisper = whisper_files()
    operations = [CommitOperationAdd(f"{WEB_PATH}/{p.name}", str(p)) for p in web]
    operations += [
        CommitOperationAdd(f"{WHISPER_PATH}/{name}", str(WHISPER / name)) for name in whisper
    ]
    commit = api.create_commit(repo, operations, commit_message="Upload EchoCV models")
    HUB_FILE.write_text(
        json.dumps(hub_manifest(repo, commit.oid, whisper), indent=2) + "\n", encoding="utf-8"
    )
    print(f"{repo}@{commit.oid}: {len(web)} web files, {len(whisper)} whisper files")


if __name__ == "__main__":
    main()

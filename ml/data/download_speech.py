"""Download speech data and the base Whisper model.

Run from ml/:  uv run python -m data.download_speech
"""

from huggingface_hub import snapshot_download

from common.download import extract
from common.paths import DATA, WHISPER_BASE

# 12 of 42 train shards (~31k segments) is plenty for the ~12k we sample; saves ~8 GB.
AMI_TRAIN_SHARDS = 12


def main() -> None:
    # Smaller items first so later steps can start while AMI is still downloading.
    print("FLEURS id_id")
    fleurs = DATA / "fleurs_id"
    snapshot_download(
        "google/fleurs", repo_type="dataset", allow_patterns=["data/id_id/*"], local_dir=fleurs
    )
    for split in ("train", "dev", "test"):
        extract(fleurs / "data" / "id_id" / "audio" / f"{split}.tar.gz", fleurs / "audio")

    print("DisfluencySpeech")
    disfl = DATA / "disfluencyspeech"
    snapshot_download("amaai-lab/DisfluencySpeech", repo_type="dataset", local_dir=disfl)
    extract(disfl / "MFA.zip", disfl / "mfa")

    print("whisper-large-v3-turbo")
    snapshot_download(
        "openai/whisper-large-v3-turbo",
        allow_patterns=["*.json", "*.safetensors", "*.txt"],
        local_dir=WHISPER_BASE,
    )

    print("AMI ihm")
    train_shards = [f"ihm/train-{i:05d}-of-00042.parquet" for i in range(AMI_TRAIN_SHARDS)]
    snapshot_download(
        "edinburghcstr/ami",
        repo_type="dataset",
        allow_patterns=[*train_shards, "ihm/validation-*", "ihm/test-*"],
        local_dir=DATA / "ami",
    )
    print("done")


if __name__ == "__main__":
    main()

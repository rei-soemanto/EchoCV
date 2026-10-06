"""Record which datasets each checkpoint touched (see docs/tech-stack-and-datasets.md, Conclusion).

Every model output directory gets a datasets.json so a commercial retrain can later drop anything
that isn't commercially safe without forensic work.
"""

import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path


@dataclass(frozen=True)
class Dataset:
    name: str
    url: str
    licence: str
    commercial: bool
    use: str  # "train", "eval" or "eval-only (non-commercial)"
    caveat: str = ""


CATALOGUE = {
    "fleurs_id": Dataset(
        "FLEURS id_id", "https://huggingface.co/datasets/google/fleurs", "CC BY 4.0", True, "train"
    ),
    "ami_ihm": Dataset(
        "AMI Meeting Corpus (IHM)",
        "https://huggingface.co/datasets/edinburghcstr/ami",
        "CC BY 4.0",
        True,
        "train",
    ),
    "disfluencyspeech": Dataset(
        "DisfluencySpeech",
        "https://huggingface.co/datasets/amaai-lab/DisfluencySpeech",
        "Apache-2.0",
        True,
        "train",
        "Transcript text appears to derive from Switchboard; re-check before a commercial launch.",
    ),
    "coco2017_kpts": Dataset(
        "COCO 2017 person keypoints",
        "https://cocodataset.org/#keypoints-2017",
        "Annotations CC BY 4.0; images Flickr terms",
        True,
        "train",
        "Image rights follow Flickr terms.",
    ),
    "rf_body_language": Dataset(
        "Roboflow Body Language Datasets",
        "https://universe.roboflow.com/skin-deseases/body-language-datasets",
        "CC BY 4.0",
        True,
        "train",
    ),
    "rf_sitting_posture_cls": Dataset(
        "Roboflow Sitting Posture Classification",
        "https://universe.roboflow.com/khaldas-workspace/sitting-posture-classification-ccvao-e9i4p",
        "CC BY 4.0",
        True,
        "train",
    ),
    "rf_sitting_posture_hanin": Dataset(
        "Roboflow Sitting_Posture (hanin)",
        "https://universe.roboflow.com/hanin-jumsp/sitting_posture-e3p1v",
        "CC BY 4.0",
        True,
        "train",
    ),
    "rf_face_gesture": Dataset(
        "Roboflow face-gesture_detection_large",
        "https://universe.roboflow.com/clyfars-workspace/face-gesture_detection_large",
        "CC BY 4.0",
        True,
        "train",
    ),
    "rf_face_hand": Dataset(
        "Roboflow Face-Hand",
        "https://universe.roboflow.com/outdoor-strawberry/face-hand",
        "CC BY 4.0",
        True,
        "train",
    ),
    "genki4k": Dataset(
        "GENKI-4K",
        "https://mplab.ucsd.edu/398/",
        "Public use, attribution required",
        True,
        "eval",
    ),
    "columbia_gaze": Dataset(
        "Columbia Gaze Data Set",
        "https://www.cs.columbia.edu/CAVE/databases/columbia_gaze/",
        "Non-commercial",
        False,
        "eval-only (non-commercial)",
        "Used only to measure and choose eye-contact tolerances; no weights trained on it.",
    ),
    "mpiifacegaze": Dataset(
        "MPIIFaceGaze",
        "https://www.mpi-inf.mpg.de/departments/computer-vision-and-machine-learning/research/"
        "gaze-based-human-computer-interaction/"
        "its-written-all-over-your-face-full-face-appearance-based-gaze-estimation",
        "CC BY-NC-SA 4.0",
        False,
        "eval-only (non-commercial)",
        "Used only to report false-positive rates; no weights trained on it.",
    ),
}


def write_provenance(out_dir: Path, keys: list[str], base_model: str, notes: str = "") -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    datasets = [asdict(CATALOGUE[k]) for k in keys]
    record = {
        "created": datetime.now(UTC).isoformat(timespec="seconds"),
        "base_model": base_model,
        "commercially_safe_training_data": all(
            d["commercial"] for d in datasets if d["use"] == "train"
        ),
        "datasets": datasets,
        "notes": notes,
    }
    path = out_dir / "datasets.json"
    path.write_text(json.dumps(record, indent=2), encoding="utf-8")
    return path

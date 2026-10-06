"""Download the CC BY 4.0 Roboflow seed sets over the REST API (no SDK: its OpenCV build clashes
with ultralytics). Needs ROBOFLOW_API_KEY in ml/.env.

Run from ml/:  uv run python -m data.download_roboflow
"""

import json
import os
import time
import urllib.request

from dotenv import load_dotenv

from common.download import extract, fetch
from common.paths import DATA, ML_ROOT

API = "https://api.roboflow.com"

# provenance key -> (workspace, project)
PROJECTS = {
    "rf_body_language": ("skin-deseases", "body-language-datasets"),
    "rf_sitting_posture_cls": ("khaldas-workspace", "sitting-posture-classification-ccvao-e9i4p"),
    "rf_sitting_posture_hanin": ("hanin-jumsp", "sitting_posture-e3p1v"),
    "rf_face_gesture": ("clyfars-workspace", "face-gesture_detection_large"),
    "rf_face_hand": ("outdoor-strawberry", "face-hand"),
}


def get_json(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=120) as resp:
        return json.load(resp)


def export_link(ws: str, project: str, version: int, fmt: str, key: str) -> str:
    url = f"{API}/{ws}/{project}/{version}/{fmt}?api_key={key}"
    for _ in range(120):
        info = get_json(url)
        link = info.get("export", {}).get("link")
        if link:
            return link
        time.sleep(5)  # Roboflow generates the export on first request
    raise TimeoutError(f"export of {ws}/{project}/{version} not ready")


def main() -> None:
    load_dotenv(ML_ROOT / ".env")
    key = os.environ["ROBOFLOW_API_KEY"]
    for name, (ws, project) in PROJECTS.items():
        out = DATA / "roboflow" / name
        meta = get_json(f"{API}/{ws}/{project}?api_key={key}")
        ptype = meta["project"]["type"]
        if not meta["versions"]:  # no generated dataset version: nothing to export
            print(f"{name}: skipped, project has no published version")
            continue
        version = max(int(v["id"].rsplit("/", 1)[1]) for v in meta["versions"])
        fmt = "folder" if ptype == "classification" else "yolov8"
        print(f"{name}: {ptype}, v{version}, {fmt}")
        out.mkdir(parents=True, exist_ok=True)
        (out / "project.json").write_text(json.dumps(meta["project"], indent=2), encoding="utf-8")
        archive = fetch(export_link(ws, project, version, fmt, key), out / f"v{version}-{fmt}.zip")
        extract(archive, out / "export")
    print("done")


if __name__ == "__main__":
    main()

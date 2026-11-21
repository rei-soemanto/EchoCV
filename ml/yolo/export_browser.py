import argparse
import hashlib
import json
import shutil
from pathlib import Path

import cv2
import numpy as np

from common.paths import ARTIFACTS, BASE_MODELS, DATA, REPO_ROOT, SHARED
from inhouse.extract_pose import KP_CONF, OBJECT_CLASSES

IMGSZ = 640
STRIDE = 32
CONF = 0.25
PAD_VALUE = 114
N_FRAMES = 40
OUT = ARTIFACTS / "yolo" / "browser"
WEB = REPO_ROOT / "apps" / "web"
PUBLIC = WEB / "public" / "models"
FIXTURES = DATA / "browser_parity"
FACE_TASK = DATA / "mediapipe" / "face_landmarker.task"
MANIFEST = SHARED / "vision-models.json"
ORT_FILES = ("ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm")
MODELS = {
    "pose": ("yolo26n-pose.onnx", BASE_MODELS / "yolo26n-pose.pt", "pose"),
    "objects": ("yolo26n-objects.onnx", BASE_MODELS / "yolo26n.pt", "detect"),
    "behaviour": ("behaviour-v1.onnx", ARTIFACTS / "yolo" / "v1" / "best.pt", "detect"),
}


def letterbox(
    image: np.ndarray, size: int = IMGSZ, stride: int = STRIDE
) -> tuple[np.ndarray, dict]:
    h, w = image.shape[:2]
    r = min(size / h, size / w)
    new_w, new_h = round(w * r), round(h * r)
    dw, dh = ((size - new_w) % stride) / 2, ((size - new_h) % stride) / 2
    if (new_w, new_h) != (w, h):
        image = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
    top, bottom = round(dh - 0.1), round(dh + 0.1)
    left, right = round(dw - 0.1), round(dw + 0.1)
    image = cv2.copyMakeBorder(
        image, top, bottom, left, right, cv2.BORDER_CONSTANT, value=(PAD_VALUE,) * 3
    )
    return image, {
        "scale": r,
        "left": left,
        "top": top,
        "resizedWidth": new_w,
        "resizedHeight": new_h,
        "inputWidth": image.shape[1],
        "inputHeight": image.shape[0],
        "sourceWidth": w,
        "sourceHeight": h,
    }


def to_tensor(letterboxed_bgr: np.ndarray) -> np.ndarray:
    rgb = letterboxed_bgr[:, :, ::-1].astype(np.float32) / 255.0
    return np.ascontiguousarray(rgb.transpose(2, 0, 1)[None])


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sample_frames(n: int = N_FRAMES) -> list[Path]:
    frames = sorted((DATA / "inhouse" / "derived" / "frames").rglob("*.jpg"))
    return frames[:: max(1, len(frames) // n)][:n]


def iou(a, b) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union else 0.0


def predict(model, image, key: str) -> list:
    classes = list(OBJECT_CLASSES) if key == "objects" else None
    return model.predict(image, imgsz=IMGSZ, conf=CONF, classes=classes, verbose=False)[0]


def results(result, task: str) -> list[dict]:
    rows = []
    boxes = result.boxes
    for i, (box, cls, conf) in enumerate(
        zip(boxes.xyxy.tolist(), boxes.cls.tolist(), boxes.conf.tolist(), strict=True)
    ):
        row = {"box": box, "cls": int(cls), "conf": conf}
        if task == "pose":
            row["keypoints"] = result.keypoints.data[i].tolist()
        rows.append(row)
    return rows


def parity(pt, onnx, key: str, task: str, frames: list[Path]) -> dict:
    total = matched = 0
    conf_diff = kp_diff = 0.0
    for frame in frames:
        a = results(predict(pt, str(frame), key), task)
        b = results(predict(onnx, str(frame), key), task)
        for det in a:
            total += 1
            same = [o for o in b if o["cls"] == det["cls"]]
            best = max(same, key=lambda o: iou(det["box"], o["box"]), default=None)
            if best is None or iou(det["box"], best["box"]) < 0.9:
                continue
            matched += 1
            conf_diff = max(conf_diff, abs(det["conf"] - best["conf"]))
            if task == "pose":
                ka, kb = np.array(det["keypoints"]), np.array(best["keypoints"])
                seen = (ka[:, 2] >= KP_CONF) & (kb[:, 2] >= KP_CONF)
                if seen.any():
                    kp_diff = max(kp_diff, float(np.abs(ka[seen, :2] - kb[seen, :2]).max()))
    report = {
        "frames": len(frames),
        "pt_detections": total,
        "matched_iou_0.9": matched,
        "max_conf_diff": round(conf_diff, 4),
        "pass": total > 0 and matched / total >= 0.95 and conf_diff <= 0.05,
    }
    if task == "pose":
        report["max_keypoint_diff_px"] = round(kp_diff, 2)
        report["pass"] = report["pass"] and kp_diff <= 3.0
    return report


def write_fixture(name: str, onnx, session, task: str, frames: list[Path]) -> None:
    best, expected = frames[0], []
    for frame in frames:
        found = results(predict(onnx, str(frame), name), task)
        if len(found) > len(expected):
            best, expected = frame, found
    frame = best
    image = cv2.imread(str(frame))
    boxed, params = letterbox(image)
    tensor = to_tensor(boxed)
    raw = session.run(None, {session.get_inputs()[0].name: tensor})[0]
    FIXTURES.mkdir(parents=True, exist_ok=True)
    tensor.tofile(FIXTURES / f"{name}.input.bin")
    raw.astype(np.float32).tofile(FIXTURES / f"{name}.output.bin")
    fixture = {
        "letterbox": params,
        "conf": CONF,
        "outputShape": list(raw.shape),
        "expected": expected,
    }
    (FIXTURES / f"{name}.json").write_text(json.dumps(fixture), encoding="utf-8")


def copy_runtime_files() -> dict:
    ort_dist = WEB / "node_modules" / "onnxruntime-web" / "dist"
    mediapipe_wasm = WEB / "node_modules" / "@mediapipe" / "tasks-vision" / "wasm"
    (PUBLIC / "ort").mkdir(parents=True, exist_ok=True)
    for f in ORT_FILES:
        shutil.copy2(ort_dist / f, PUBLIC / "ort" / f)
    shutil.copytree(mediapipe_wasm, PUBLIC / "mediapipe", dirs_exist_ok=True)
    shutil.copy2(FACE_TASK, PUBLIC / "face_landmarker.task")
    deps = json.loads((WEB / "package.json").read_text(encoding="utf-8"))["dependencies"]
    return {
        "onnxruntimeWeb": deps["onnxruntime-web"],
        "mediapipeTasksVision": deps["@mediapipe/tasks-vision"],
    }


def main() -> None:
    import onnxruntime as ort
    from ultralytics import YOLO

    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-parity", action="store_true")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    frames = sample_frames()
    entries, checks = {}, {}
    for key, (file, source, task) in MODELS.items():
        work = OUT / file.replace(".onnx", ".pt")
        shutil.copy2(source, work)
        pt = YOLO(str(work))
        exported = Path(pt.export(format="onnx", imgsz=IMGSZ, simplify=True, dynamic=True))
        onnx_path = OUT / file
        shutil.move(exported, onnx_path)
        work.unlink()
        session = ort.InferenceSession(str(onnx_path))
        output = session.get_outputs()[0].shape
        if not args.skip_parity:
            onnx = YOLO(str(onnx_path), task=task)
            checks[key] = parity(pt, onnx, key, task, frames)
            write_fixture(key, onnx, session, task, frames)
            print(key, checks[key])
        shutil.copy2(onnx_path, PUBLIC / file)
        names = pt.names
        entry = {
            "file": file,
            "task": task,
            "inputSize": IMGSZ,
            "stride": STRIDE,
            "output": output,
            "sha256": sha256(onnx_path),
            "bytes": onnx_path.stat().st_size,
        }
        if key == "objects":
            entry["classes"] = {str(i): n for i, n in OBJECT_CLASSES.items()}
        elif key == "behaviour":
            entry["classes"] = {str(i): n for i, n in names.items()}
        else:
            entry["keypoints"] = 17
        entries[key] = entry
    runtimes = copy_runtime_files()
    entries["face"] = {
        "file": "face_landmarker.task",
        "task": "face",
        "sha256": sha256(FACE_TASK),
        "bytes": FACE_TASK.stat().st_size,
    }
    manifest = {
        "version": "0.1.0",
        "generatedBy": "ml/yolo/export_browser.py",
        "conf": CONF,
        "padValue": PAD_VALUE,
        "runtimes": runtimes,
        "ortFiles": list(ORT_FILES),
        "models": entries,
    }
    if checks:
        manifest["parity"] = checks
        (OUT / "parity.json").write_text(json.dumps(checks, indent=2), encoding="utf-8")
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"models -> {PUBLIC}, manifest -> {MANIFEST}")
    if checks and not all(c["pass"] for c in checks.values()):
        raise SystemExit("parity failed")


if __name__ == "__main__":
    main()

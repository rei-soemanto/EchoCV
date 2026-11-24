from dataclasses import dataclass

import numpy as np

from app.vision.posture import Detection
from app.vision.settings import YoloSpec

DEFAULT_IOU = 0.7
MAX_DETECTIONS = 300
MAX_CANDIDATES = 30000


@dataclass(frozen=True)
class Letterbox:
    scale: float
    left: int
    top: int
    resized_width: int
    resized_height: int
    input_width: int
    input_height: int
    source_width: int
    source_height: int


def letterbox_for(source_width: int, source_height: int, size: int, stride: int) -> Letterbox:
    scale = min(size / source_height, size / source_width)
    resized_width = round(source_width * scale)
    resized_height = round(source_height * scale)
    pad_x = ((size - resized_width) % stride) / 2
    pad_y = ((size - resized_height) % stride) / 2
    left, right = round(pad_x - 0.1), round(pad_x + 0.1)
    top, bottom = round(pad_y - 0.1), round(pad_y + 0.1)
    return Letterbox(
        scale=scale,
        left=left,
        top=top,
        resized_width=resized_width,
        resized_height=resized_height,
        input_width=resized_width + left + right,
        input_height=resized_height + top + bottom,
        source_width=source_width,
        source_height=source_height,
    )


def letterbox_image(rgb: np.ndarray, box: Letterbox, pad_value: int) -> np.ndarray:
    import cv2

    resized = cv2.resize(
        rgb, (box.resized_width, box.resized_height), interpolation=cv2.INTER_LINEAR
    )
    canvas = np.full((box.input_height, box.input_width, 3), pad_value, dtype=np.uint8)
    canvas[box.top : box.top + box.resized_height, box.left : box.left + box.resized_width] = (
        resized
    )
    return np.ascontiguousarray(canvas.transpose(2, 0, 1)[None], dtype=np.float32) / 255.0


def iou(a, b) -> float:
    w = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    h = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = w * h
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def _to_source(x: np.ndarray, y: np.ndarray, box: Letterbox):
    sx = np.clip((x - box.left) / box.scale, 0, box.source_width)
    sy = np.clip((y - box.top) / box.scale, 0, box.source_height)
    return sx, sy


def decode(output: np.ndarray, box: Letterbox, spec: YoloSpec, conf: float) -> list[Detection]:
    out = output.reshape(output.shape[-2], output.shape[-1])
    scores = out[4 : 4 + spec.num_classes]
    best = scores.argmax(axis=0)
    score = scores.max(axis=0)
    keep = score > conf
    if spec.class_ids is not None:
        keep &= np.isin(best, spec.class_ids)
    anchors = np.flatnonzero(keep)
    anchors = anchors[np.argsort(-score[anchors], kind="stable")][:MAX_CANDIDATES]
    cx, cy, w, h = out[0], out[1], out[2], out[3]
    boxes = np.stack([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], axis=1)
    kept: list[int] = []
    for a in anchors:
        if len(kept) >= MAX_DETECTIONS:
            break
        if all(best[k] != best[a] or iou(boxes[k], boxes[a]) <= DEFAULT_IOU for k in kept):
            kept.append(int(a))
    detections = []
    kp_start = 4 + spec.num_classes
    for a in kept:
        x1, y1 = _to_source(boxes[a, 0], boxes[a, 1], box)
        x2, y2 = _to_source(boxes[a, 2], boxes[a, 3], box)
        keypoints = None
        if spec.num_keypoints:
            rows = kp_start + np.arange(spec.num_keypoints) * 3
            kx, ky = _to_source(out[rows, a], out[rows + 1, a], box)
            keypoints = tuple(
                (float(x), float(y), float(c))
                for x, y, c in zip(kx, ky, out[rows + 2, a], strict=True)
            )
        detections.append(
            Detection(
                box=(float(x1), float(y1), float(x2), float(y2)),
                score=float(score[a]),
                class_id=int(best[a]),
                keypoints=keypoints,
            )
        )
    return detections


class OnnxYolo:
    def __init__(self, path: str, spec: YoloSpec) -> None:
        import onnxruntime as ort

        self.spec = spec
        self.session = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
        self.input = self.session.get_inputs()[0].name

    def detect(self, tensor: np.ndarray, box: Letterbox, conf: float) -> list[Detection]:
        output = self.session.run(None, {self.input: tensor})[0]
        return decode(output, box, self.spec, conf)

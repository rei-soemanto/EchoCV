import math
from dataclasses import dataclass
from statistics import median

Point = tuple[float, float]

RIGHT_EYE = (33, 133, 468)
LEFT_EYE = (362, 263, 473)
TRANSLATION_MIN = 1.5
DEGREES = 180 / math.pi


@dataclass(frozen=True)
class FaceFeatures:
    yaw: float
    pitch: float
    roll: float
    iris_x: float
    iris_y: float
    smile: float
    fx: float
    fy: float
    fw: float
    fh: float


@dataclass(frozen=True)
class Baseline:
    yaw: float
    pitch: float
    iris_x: float
    iris_y: float
    smile: float


def rotation_entry(matrix: list[float], row: int, col: int) -> float:
    column_major = abs(matrix[14]) > TRANSLATION_MIN or abs(matrix[11]) <= TRANSLATION_MIN
    return matrix[col * 4 + row] if column_major else matrix[row * 4 + col]


def head_angles(matrix: list[float]) -> tuple[float, float, float]:
    def r(row: int, col: int) -> float:
        return rotation_entry(matrix, row, col)

    pitch = math.asin(max(-1.0, min(1.0, -r(1, 2)))) * DEGREES
    yaw = math.atan2(r(0, 2), r(2, 2)) * DEGREES
    roll = math.atan2(r(1, 0), r(1, 1)) * DEGREES
    return yaw, pitch, roll


def _eye_offset(points: list[Point], eye: tuple[int, int, int], iris: int):
    a, b = points[eye[0]], points[eye[1]]
    left, right = (a, b) if a[0] <= b[0] else (b, a)
    axis_x, axis_y = right[0] - left[0], right[1] - left[1]
    width = math.hypot(axis_x, axis_y)
    ux = (axis_x / width, axis_y / width)
    uy = (-ux[1], ux[0])
    centre = ((left[0] + right[0]) / 2, (left[1] + right[1]) / 2)
    p = points[iris]
    dx, dy = p[0] - centre[0], p[1] - centre[1]
    along = (p[0] - left[0]) * ux[0] + (p[1] - left[1]) * ux[1]
    x = (dx * ux[0] + dy * ux[1]) / width
    y = (dx * uy[0] + dy * uy[1]) / width
    return x, y, 0 <= along <= width


def iris_offsets(points: list[Point]) -> tuple[float, float]:
    right = left = None
    for right_iris, left_iris in ((RIGHT_EYE[2], LEFT_EYE[2]), (LEFT_EYE[2], RIGHT_EYE[2])):
        right = _eye_offset(points, RIGHT_EYE, right_iris)
        left = _eye_offset(points, LEFT_EYE, left_iris)
        if right[2] and left[2]:
            break
    return (right[0] + left[0]) / 2, (right[1] + left[1]) / 2


def smile_score(blendshapes: dict[str, float]) -> float:
    return (blendshapes.get("mouthSmileLeft", 0.0) + blendshapes.get("mouthSmileRight", 0.0)) / 2


def _bounds(points: list[Point]) -> tuple[float, float, float, float]:
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return min(xs), min(ys), max(xs), max(ys)


def largest_face(faces: list[list[Point]]) -> int:
    best, best_area = -1, -1.0
    for index, face in enumerate(faces):
        x1, y1, x2, y2 = _bounds(face)
        area = (x2 - x1) * (y2 - y1)
        if area > best_area:
            best, best_area = index, area
    return best


def face_features(
    faces: list[list[Point]],
    matrices: list[list[float]],
    blendshapes: list[dict[str, float]],
    width: int,
    height: int,
) -> FaceFeatures | None:
    index = largest_face(faces)
    if index < 0 or index >= len(matrices) or index >= len(blendshapes):
        return None
    points = [(x * width, y * height) for x, y in faces[index]]
    yaw, pitch, roll = head_angles(matrices[index])
    iris_x, iris_y = iris_offsets(points)
    x1, y1, x2, y2 = _bounds(points)
    return FaceFeatures(
        yaw=yaw,
        pitch=pitch,
        roll=roll,
        iris_x=iris_x,
        iris_y=iris_y,
        smile=smile_score(blendshapes[index]),
        fx=(x1 + x2) / 2 / width,
        fy=(y1 + y2) / 2 / height,
        fw=(x2 - x1) / width,
        fh=(y2 - y1) / height,
    )


def build_baseline(samples: list[FaceFeatures]) -> Baseline:
    if not samples:
        raise ValueError("A baseline needs at least one face sample")
    return Baseline(
        yaw=median(s.yaw for s in samples),
        pitch=median(s.pitch for s in samples),
        iris_x=median(s.iris_x for s in samples),
        iris_y=median(s.iris_y for s in samples),
        smile=median(s.smile for s in samples),
    )


def gaze_error(features: FaceFeatures, base: Baseline, k_x: float, k_y: float) -> float:
    horizontal = features.yaw - base.yaw + k_x * (features.iris_x - base.iris_x)
    vertical = features.pitch - base.pitch + k_y * (features.iris_y - base.iris_y)
    return math.hypot(horizontal, vertical)

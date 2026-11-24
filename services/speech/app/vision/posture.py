import math
from collections import deque
from dataclasses import dataclass
from statistics import median

from app.vision.settings import PostureRule

Keypoint = tuple[float, float, float]
FeatureMap = dict[str, float]

L_SHOULDER, R_SHOULDER, L_ELBOW, R_ELBOW, L_WRIST, R_WRIST = 5, 6, 7, 8, 9, 10
FAR = 4.0
MOUTH_BELOW_CENTRE = 0.25
OBJECT_BELOW_FACE = 0.3
TILT_EPSILON = 1e-6
DEGREES = 180 / math.pi
NAN = float("nan")


@dataclass(frozen=True)
class Detection:
    box: tuple[float, float, float, float]
    score: float
    class_id: int
    keypoints: tuple[Keypoint, ...] | None = None


@dataclass(frozen=True)
class PostureFace:
    fx: float
    fy: float
    fw: float
    fh: float
    roll: float
    pitch: float


@dataclass(frozen=True)
class PostureBaseline:
    fx: float
    fy: float
    fw: float
    fh: float
    roll: float
    pitch: float
    shoulder_drop_raw: float
    shoulder_width_raw: float


def _point(keypoints, index: int, min_conf: float) -> tuple[float, float, bool]:
    if keypoints is None or index >= len(keypoints) or keypoints[index][2] < min_conf:
        return NAN, NAN, False
    return keypoints[index][0], keypoints[index][1], True


def _or_far(value: float) -> float:
    return FAR if math.isnan(value) else value


def _clamp_far(value: float) -> float:
    return min(max(value, 0.0), FAR)


def _sign(value: float) -> float:
    if math.isnan(value):
        return NAN
    return (value > 0) - (value < 0)


def main_person(people: list[Detection]) -> Detection | None:
    best, best_score = None, -math.inf
    for person in people:
        x1, y1, x2, y2 = person.box
        score = (x2 - x1) * (y2 - y1) * person.score
        if score > best_score:
            best, best_score = person, score
    return best


def held_object(
    objects: list[Detection], face: PostureFace, height: int, width: int, ignored: frozenset[int]
) -> tuple[float, float]:
    held = area = 0.0
    for o in objects:
        if o.class_id in ignored:
            continue
        x1, y1, x2, y2 = o.box
        if (y1 + y2) / 2 / height > face.fy + OBJECT_BELOW_FACE * face.fh:
            held = max(held, o.score)
            area = max(area, (x2 - x1) * (y2 - y1) / (width * height))
    return held, area


def raw_posture_features(
    face: PostureFace,
    keypoints,
    held: tuple[float, float],
    width: int,
    height: int,
    min_conf: float,
) -> FeatureMap:
    fw_px = face.fw * width
    fcx, fcy = face.fx * width, face.fy * height
    mouth_y = fcy + MOUTH_BELOW_CENTRE * face.fh * height
    ls, rs = _point(keypoints, L_SHOULDER, min_conf), _point(keypoints, R_SHOULDER, min_conf)
    le, re = _point(keypoints, L_ELBOW, min_conf), _point(keypoints, R_ELBOW, min_conf)
    lw, rw = _point(keypoints, L_WRIST, min_conf), _point(keypoints, R_WRIST, min_conf)
    both = ls[2] and rs[2]
    mid_x = (ls[0] + rs[0]) / 2
    shoulder_y = (ls[1] + rs[1]) / 2
    dist_left = math.hypot(lw[0] - fcx, lw[1] - fcy) / fw_px
    dist_right = math.hypot(rw[0] - fcx, rw[1] - fcy) / fw_px
    side = _sign(ls[0] - rs[0])
    crossed = both and lw[2] and rw[2] and (lw[0] - mid_x) * side < 0 and (rw[0] - mid_x) * side > 0
    tilt = math.atan2(ls[1] - rs[1], abs(ls[0] - rs[0]) + TILT_EPSILON) * DEGREES if both else 0.0
    return {
        "shoulders_visible": 1.0 if both else 0.0,
        "shoulder_drop_raw": (shoulder_y - fcy) / fw_px if both else NAN,
        "shoulder_tilt": tilt,
        "shoulder_width_raw": abs(ls[0] - rs[0]) / fw_px if both else NAN,
        "wrists_visible": float(lw[2]) + float(rw[2]),
        "elbows_visible": float(le[2]) + float(re[2]),
        "wrist_face_dist": _clamp_far(min(_or_far(dist_left), _or_far(dist_right))),
        "wrist_mouth_dy": _clamp_far(
            min(
                _or_far(abs(lw[1] - mouth_y) / fw_px),
                _or_far(abs(rw[1] - mouth_y) / fw_px),
            )
        ),
        "wrists_crossed": 1.0 if crossed else 0.0,
        "wrist_gap": _clamp_far(_or_far(abs(lw[0] - rw[0]) / fw_px)),
        "wrists_low_mid": (
            _or_far(abs(lw[0] - mid_x) / fw_px) + _or_far(abs(rw[0] - mid_x) / fw_px)
        )
        / 2,
        "object_held": held[0],
        "object_area": held[1],
    }


def _nan_median(values: list[float]) -> float:
    finite = [v for v in values if not math.isnan(v)]
    return median(finite) if finite else NAN


def posture_baseline(samples: list[tuple[PostureFace, FeatureMap]]) -> PostureBaseline:
    def of(pick) -> float:
        return _nan_median([pick(face, raw) for face, raw in samples])

    return PostureBaseline(
        fx=of(lambda f, r: f.fx),
        fy=of(lambda f, r: f.fy),
        fw=of(lambda f, r: f.fw),
        fh=of(lambda f, r: f.fh),
        roll=of(lambda f, r: f.roll),
        pitch=of(lambda f, r: f.pitch),
        shoulder_drop_raw=of(lambda f, r: r["shoulder_drop_raw"]),
        shoulder_width_raw=of(lambda f, r: r["shoulder_width_raw"]),
    )


def _log_deviation(ratio: float) -> float:
    return abs(math.log(max(ratio, 1e-3)))


def relative_features(face: PostureFace, raw: FeatureMap, base: PostureBaseline) -> FeatureMap:
    face_dy = (face.fy - base.fy) / base.fh
    face_dx = (face.fx - base.fx) / base.fw
    face_scale = face.fw / base.fw
    roll_rel = face.roll - base.roll
    pitch_rel = face.pitch - base.pitch
    drop = raw["shoulder_drop_raw"] - base.shoulder_drop_raw
    width = raw["shoulder_width_raw"] / base.shoulder_width_raw
    shoulder_drop = 0.0 if math.isnan(drop) else drop
    shoulder_width_rel = 1.0 if math.isnan(width) else width
    return {
        **raw,
        "face_dy": face_dy,
        "face_dx": face_dx,
        "face_scale": face_scale,
        "roll_rel": roll_rel,
        "pitch_rel": pitch_rel,
        "shoulder_drop": shoulder_drop,
        "shoulder_width_rel": shoulder_width_rel,
        "face_dy_abs": abs(face_dy),
        "face_dx_abs": abs(face_dx),
        "face_scale_dev": _log_deviation(face_scale),
        "roll_abs": abs(roll_rel),
        "pitch_abs": abs(pitch_rel),
        "shoulder_drop_abs": abs(shoulder_drop),
        "shoulder_width_dev": _log_deviation(shoulder_width_rel),
        "shoulder_tilt_abs": abs(raw["shoulder_tilt"]),
    }


def rule_probability(rule: PostureRule, features: FeatureMap) -> float:
    logit = rule.bias
    for name, mean, scale, weight in zip(
        rule.features, rule.mean, rule.scale, rule.weights, strict=True
    ):
        logit += weight * (features[name] - mean) / scale
    return 1 / (1 + math.exp(-logit))


class RollingMean:
    def __init__(self, window: int, min_count: int = 1) -> None:
        self.values: deque[float] = deque(maxlen=window)
        self.min_count = min_count

    def push(self, value: float) -> float | None:
        self.values.append(value)
        if len(self.values) < self.min_count:
            return None
        return sum(self.values) / len(self.values)

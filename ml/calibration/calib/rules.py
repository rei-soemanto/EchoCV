"""Pure geometry for the eye-contact and smile rules (no MediaPipe import, so it is unit-testable).

These mirror what the browser will compute from MediaPipe Face Landmarker output.
"""

import math

import numpy as np

# MediaPipe face mesh indices (refined landmarks). "Right" = the subject's right eye (image left).
RIGHT_EYE = {"corner_a": 33, "corner_b": 133, "upper": 159, "lower": 145, "iris": 468}
LEFT_EYE = {"corner_a": 362, "corner_b": 263, "upper": 386, "lower": 374, "iris": 473}


def head_angles(matrix: np.ndarray) -> tuple[float, float, float]:
    """Yaw, pitch, roll in degrees from a 4x4 facial transformation matrix (R = Ry Rx Rz)."""
    r = np.asarray(matrix)[:3, :3]
    pitch = math.degrees(math.asin(max(-1.0, min(1.0, -r[1, 2]))))
    yaw = math.degrees(math.atan2(r[0, 2], r[2, 2]))
    roll = math.degrees(math.atan2(r[1, 0], r[1, 1]))
    return yaw, pitch, roll


def _eye_offset(pts: np.ndarray, eye: dict, iris: int) -> tuple[float, float, bool]:
    """Iris offset in eye-width units: along the eye axis (x, image-right positive), and
    perpendicular to it (image-down positive) measured from the eyelid midpoint (y_lid) and from
    the corner line (y_corner). Eyelids follow vertical gaze, so y_lid carries little vertical
    signal; the corners do not move. Also returns whether the iris lies between the corners
    (used to catch swapped iris indices)."""
    a, b = pts[eye["corner_a"]], pts[eye["corner_b"]]
    left, right = (a, b) if a[0] <= b[0] else (b, a)
    axis = right - left
    width = float(np.linalg.norm(axis))
    ux = axis / width
    uy = np.array([-ux[1], ux[0]])  # 90 degrees clockwise in image coords: points down
    centre = (left + right) / 2
    lid_mid = (pts[eye["upper"]] + pts[eye["lower"]]) / 2
    d = pts[iris] - centre
    inside = 0.0 <= float(np.dot(pts[iris] - left, ux)) <= width
    x = float(np.dot(d, ux)) / width
    y_lid = float(np.dot(pts[iris] - lid_mid, uy)) / width
    y_corner = float(np.dot(d, uy)) / width
    return x, y_lid, y_corner, inside


def iris_offsets(pts: np.ndarray) -> tuple[float, float, float]:
    """Average (x, y_lid, y_corner) iris offset of both eyes. pts: (478, 2) pixel coordinates."""
    for r_iris, l_iris in (
        (RIGHT_EYE["iris"], LEFT_EYE["iris"]),
        (LEFT_EYE["iris"], RIGHT_EYE["iris"]),
    ):
        *r, r_in = _eye_offset(pts, RIGHT_EYE, r_iris)
        *lft, l_in = _eye_offset(pts, LEFT_EYE, l_iris)
        if r_in and l_in:
            break
    return tuple((p + q) / 2 for p, q in zip(r, lft, strict=True))


def gaze_error(
    yaw: np.ndarray,
    pitch: np.ndarray,
    ix: np.ndarray,
    iy: np.ndarray,
    base: tuple[float, float, float, float],
    k_x: float,
    k_y: float,
    yaw_sign: float = 1.0,
) -> np.ndarray:
    """Angular distance (deg) of the estimated gaze from the calibrated 'looking at camera' pose.

    gaze ~ head angle + k * iris offset, both relative to the per-user baseline captured during
    the 5-second calibration step. yaw_sign aligns the head-yaw and iris-x sign conventions.
    """
    by, bp, bix, biy = base
    gx = yaw_sign * (yaw - by) + k_x * (ix - bix)
    gy = (pitch - bp) + k_y * (iy - biy)
    return np.hypot(gx, gy)


def f1(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    tp = float(np.sum(y_true & y_pred))
    fp = float(np.sum(~y_true & y_pred))
    fn = float(np.sum(y_true & ~y_pred))
    return 2 * tp / (2 * tp + fp + fn) if tp else 0.0

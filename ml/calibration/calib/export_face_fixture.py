import json
import math

import numpy as np

from calib.paths import CALIB_ROOT, SHARED
from calib.rules import LEFT_EYE, RIGHT_EYE, gaze_error, head_angles, iris_offsets

WEB_TESTS = CALIB_ROOT.parents[1] / "apps" / "web" / "tests" / "unit" / "vision"
OUT = WEB_TESTS / "fixtures" / "face-rules.json"
N_POINTS = 478
SEED = 7


def rotation(yaw: float, pitch: float, roll: float) -> np.ndarray:
    y, p, r = (math.radians(a) for a in (yaw, pitch, roll))
    ry = np.array([[math.cos(y), 0, math.sin(y)], [0, 1, 0], [-math.sin(y), 0, math.cos(y)]])
    rx = np.array([[1, 0, 0], [0, math.cos(p), -math.sin(p)], [0, math.sin(p), math.cos(p)]])
    rz = np.array([[math.cos(r), -math.sin(r), 0], [math.sin(r), math.cos(r), 0], [0, 0, 1]])
    return ry @ rx @ rz


def matrix(yaw: float, pitch: float, roll: float, rng: np.random.Generator) -> np.ndarray:
    m = np.eye(4)
    m[:3, :3] = rotation(yaw, pitch, roll)
    m[:3, 3] = [rng.uniform(-3, 3), rng.uniform(-3, 3), rng.uniform(-60, -30)]
    return m


def face_points(rng: np.random.Generator, swap_iris: bool) -> np.ndarray:
    pts = rng.uniform([200, 150], [440, 400], size=(N_POINTS, 2))
    tilt = rng.uniform(-0.15, 0.15)
    for eye, cx in ((RIGHT_EYE, 270.0), (LEFT_EYE, 370.0)):
        cy = 230.0 + tilt * (cx - 320.0)
        half = rng.uniform(18, 26)
        pts[eye["corner_a"]] = [cx - half, cy - tilt * half]
        pts[eye["corner_b"]] = [cx + half, cy + tilt * half]
        pts[eye["upper"]] = [cx, cy - 6]
        pts[eye["lower"]] = [cx, cy + 6]
        pts[eye["iris"]] = [cx + rng.uniform(-8, 8), cy + rng.uniform(-4, 4)]
    if swap_iris:
        pts[[RIGHT_EYE["iris"], LEFT_EYE["iris"]]] = pts[[LEFT_EYE["iris"], RIGHT_EYE["iris"]]]
    return pts


def main() -> None:
    rng = np.random.default_rng(SEED)
    poses = [(0, 0, 0), (12, -5, 3), (-25, 10, -8), (40, 20, 15), (-5, -30, 2), (8, 4, -20)]
    contact = json.loads((SHARED / "thresholds.json").read_text(encoding="utf-8"))["eyeContact"]
    k_x, k_y = contact["kX"], contact["kY"]
    cases = []
    for n, pose in enumerate(poses):
        m = np.round(matrix(*pose, rng), 8)
        pts = np.round(face_points(rng, swap_iris=n % 3 == 2), 4)
        yaw, pitch, roll = head_angles(m)
        ix, _, iy = iris_offsets(pts)
        base = (rng.uniform(-5, 5), rng.uniform(-5, 5), rng.uniform(-0.05, 0.05), 0.0)
        arrays = (np.array(v) for v in (yaw, pitch, ix, iy))
        err = float(gaze_error(*arrays, base, k_x, k_y))
        cases.append(
            {
                "matrixColumnMajor": [round(float(v), 8) for v in m.T.reshape(-1)],
                "matrixRowMajor": [round(float(v), 8) for v in m.reshape(-1)],
                "points": [[round(float(x), 4), round(float(y), 4)] for x, y in pts],
                "baseline": {"yaw": base[0], "pitch": base[1], "irisX": base[2], "irisY": base[3]},
                "expected": {
                    "yaw": yaw,
                    "pitch": pitch,
                    "roll": roll,
                    "irisX": ix,
                    "irisY": iy,
                    "gazeError": err,
                },
            }
        )
    OUT.parent.mkdir(parents=True, exist_ok=True)
    fixture = {"kX": k_x, "kY": k_y, "cases": cases}
    OUT.write_text(json.dumps(fixture, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(cases)} cases -> {OUT}")


if __name__ == "__main__":
    main()

import math

import numpy as np

from calib.rules import LEFT_EYE, RIGHT_EYE, f1, gaze_error, head_angles, iris_offsets


def _ry(deg):
    t = math.radians(deg)
    return np.array([[math.cos(t), 0, math.sin(t)], [0, 1, 0], [-math.sin(t), 0, math.cos(t)]])


def _rx(deg):
    t = math.radians(deg)
    return np.array([[1, 0, 0], [0, math.cos(t), -math.sin(t)], [0, math.sin(t), math.cos(t)]])


def test_head_angles_recovers_yaw_and_pitch():
    m = np.eye(4)
    m[:3, :3] = _ry(20) @ _rx(-10)
    yaw, pitch, roll = head_angles(m)
    assert (round(yaw, 6), round(pitch, 6), round(roll, 6)) == (20.0, -10.0, 0.0)


def _eyes(iris_dx=0.0, iris_dy=0.0, swap=False):
    pts = np.zeros((478, 2))
    # subject's right eye on image left
    pts[RIGHT_EYE["corner_a"]], pts[RIGHT_EYE["corner_b"]] = (100, 200), (140, 200)
    pts[RIGHT_EYE["upper"]], pts[RIGHT_EYE["lower"]] = (120, 195), (120, 205)
    pts[LEFT_EYE["corner_a"]], pts[LEFT_EYE["corner_b"]] = (180, 200), (220, 200)
    pts[LEFT_EYE["upper"]], pts[LEFT_EYE["lower"]] = (200, 195), (200, 205)
    right, left = (120 + iris_dx, 200 + iris_dy), (200 + iris_dx, 200 + iris_dy)
    pts[RIGHT_EYE["iris"]], pts[LEFT_EYE["iris"]] = (left, right) if swap else (right, left)
    return pts


def test_iris_offsets_centred_and_shifted():
    assert iris_offsets(_eyes()) == (0.0, 0.0, 0.0)
    x, y_lid, y_corner = iris_offsets(_eyes(iris_dx=8, iris_dy=4))
    assert (round(x, 6), round(y_lid, 6), round(y_corner, 6)) == (0.2, 0.1, 0.1)


def test_iris_offsets_handles_swapped_iris_indices():
    x, _, _ = iris_offsets(_eyes(iris_dx=8, swap=True))
    assert round(x, 6) == 0.2


def test_gaze_error_zero_when_eyes_compensate_head_turn():
    # head turned +20 deg, eyes rotated back so gaze stays on the camera: k_x * dx = -20
    err = gaze_error(
        np.array([20.0]), np.array([0.0]), np.array([-0.4]), np.array([0.0]), (0, 0, 0, 0), 50, 50
    )
    assert err[0] == 0.0


def test_f1():
    y = np.array([True, True, False, False])
    assert f1(y, np.array([True, False, True, False])) == 0.5
    assert f1(y, np.zeros(4, bool)) == 0.0

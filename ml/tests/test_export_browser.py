import numpy as np

from yolo.export_browser import PAD_VALUE, letterbox, to_tensor


def test_letterbox_pads_to_the_next_multiple_of_32():
    image, params = letterbox(np.zeros((720, 1280, 3), dtype=np.uint8))
    assert image.shape == (384, 640, 3)
    assert params["top"] == 12 and params["left"] == 0
    assert params["inputHeight"] == 384 and params["resizedHeight"] == 360
    assert (image[:12] == PAD_VALUE).all()


def test_letterbox_rounds_halves_like_ultralytics():
    _, params = letterbox(np.zeros((853, 1280, 3), dtype=np.uint8))
    assert (params["resizedHeight"], params["top"], params["inputHeight"]) == (426, 11, 448)


def test_tensor_is_rgb_planes_scaled_to_one():
    bgr = np.array([[[0, 0, 255]]], dtype=np.uint8)
    tensor = to_tensor(bgr)
    assert tensor.shape == (1, 3, 1, 1)
    assert tensor[0, :, 0, 0].tolist() == [1.0, 0.0, 0.0]

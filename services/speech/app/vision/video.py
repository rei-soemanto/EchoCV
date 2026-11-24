import subprocess
from collections.abc import Iterator
from pathlib import Path
from typing import Protocol

import numpy as np

from app.vision.face import FaceFeatures, face_features
from app.vision.posture import Detection
from app.vision.settings import VisionSettings
from app.vision.tracker import Frame
from app.vision.yolo import OnnxYolo, letterbox_for, letterbox_image

PPM_MAGIC = b"P6"


class VideoUnreadable(ValueError):
    pass


class VisionEngine(Protocol):
    def frames(self, path: Path) -> Iterator[tuple[float, np.ndarray]]: ...

    def face(self, rgb: np.ndarray, time_ms: int) -> FaceFeatures | None: ...

    def detect(
        self, rgb: np.ndarray
    ) -> tuple[list[Detection], list[Detection], list[Detection]]: ...


def _token(stream, first: bytes = b"") -> bytes:
    token = first
    while True:
        ch = stream.read(1)
        if not ch:
            return token
        if ch == b"#":
            while ch not in (b"\n", b""):
                ch = stream.read(1)
            continue
        if ch.isspace():
            if token:
                return token
            continue
        token += ch


def read_ppm_frames(stream) -> Iterator[np.ndarray]:
    while True:
        magic = stream.read(2)
        if not magic:
            return
        if magic != PPM_MAGIC:
            raise VideoUnreadable("Unexpected frame format from ffmpeg")
        width, height, _ = int(_token(stream)), int(_token(stream)), int(_token(stream))
        size = width * height * 3
        data = stream.read(size)
        if len(data) < size:
            return
        yield np.frombuffer(data, dtype=np.uint8).reshape(height, width, 3)


def ffmpeg_command(path: Path, fps: float, max_width: int) -> list[str]:
    scale = f"scale=w='min(iw,{max_width})':h=-2"
    return [
        "ffmpeg",
        "-nostdin",
        "-v",
        "error",
        "-i",
        str(path),
        "-an",
        "-vf",
        f"fps={fps},{scale}",
        "-f",
        "image2pipe",
        "-c:v",
        "ppm",
        "pipe:1",
    ]


class LocalVisionEngine:
    def __init__(self, cfg: VisionSettings, max_width: int) -> None:
        import mediapipe as mp
        from mediapipe.tasks.python import BaseOptions
        from mediapipe.tasks.python.vision import FaceLandmarker, FaceLandmarkerOptions, RunningMode

        self.cfg = cfg
        self.max_width = max_width
        self.mp = mp
        options = FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(cfg.model_dir / cfg.face_file)),
            running_mode=RunningMode.VIDEO,
            num_faces=cfg.max_faces,
            output_face_blendshapes=True,
            output_facial_transformation_matrixes=True,
        )
        self.landmarker_options = options
        self.landmarker_class = FaceLandmarker
        self.pose = OnnxYolo(str(cfg.model_dir / cfg.pose.file), cfg.pose)
        self.objects = OnnxYolo(str(cfg.model_dir / cfg.objects.file), cfg.objects)
        self.behaviour = OnnxYolo(str(cfg.model_dir / cfg.behaviour.file), cfg.behaviour)
        self.landmarker = None

    def frames(self, path: Path) -> Iterator[tuple[float, np.ndarray]]:
        self.landmarker = self.landmarker_class.create_from_options(self.landmarker_options)
        command = ffmpeg_command(path, self.cfg.sample_fps, self.max_width)
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        step = 1000 / self.cfg.sample_fps
        try:
            for index, rgb in enumerate(read_ppm_frames(process.stdout)):
                yield index * step, rgb
        finally:
            process.stdout.close()
            stderr = process.stderr.read()
            code = process.wait()
            self.landmarker.close()
            self.landmarker = None
            if code != 0:
                raise VideoUnreadable(stderr.decode("utf-8", "replace").strip()[:200])

    def face(self, rgb: np.ndarray, time_ms: int) -> FaceFeatures | None:
        image = self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
        result = self.landmarker.detect_for_video(image, time_ms)
        faces = [[(p.x, p.y) for p in face] for face in result.face_landmarks]
        matrices = [
            np.asarray(m, dtype=float).reshape(-1).tolist()
            for m in result.facial_transformation_matrixes
        ]
        shapes = [{c.category_name: c.score for c in face} for face in result.face_blendshapes]
        height, width = rgb.shape[:2]
        return face_features(faces, matrices, shapes, width, height)

    def detect(self, rgb: np.ndarray):
        height, width = rgb.shape[:2]
        box = letterbox_for(width, height, self.cfg.pose.input_size, self.cfg.pose.stride)
        tensor = letterbox_image(rgb, box, self.cfg.pad_value)
        conf = self.cfg.predict_conf
        return (
            self.pose.detect(tensor, box, conf),
            self.objects.detect(tensor, box, conf),
            self.behaviour.detect(tensor, box, min(conf, self.cfg.detector_conf)),
        )


def video_frames(path: Path, engine: VisionEngine) -> list[Frame]:
    frames = []
    for time_ms, rgb in engine.frames(path):
        height, width = rgb.shape[:2]
        people, objects, behaviours = engine.detect(rgb)
        frames.append(
            Frame(
                time_ms=time_ms,
                face=engine.face(rgb, int(round(time_ms))),
                people=people,
                objects=objects,
                behaviours=behaviours,
                width=width,
                height=height,
            )
        )
    if not frames:
        raise VideoUnreadable("The video has no frames")
    return frames

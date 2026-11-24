from dataclasses import dataclass, field

from app.vision.face import Baseline, FaceFeatures, build_baseline, gaze_error
from app.vision.posture import (
    Detection,
    FeatureMap,
    PostureBaseline,
    PostureFace,
    RollingMean,
    held_object,
    main_person,
    posture_baseline,
    raw_posture_features,
    relative_features,
    rule_probability,
)
from app.vision.settings import BEHAVIOURS, VisionSettings, round_half_up


@dataclass(frozen=True)
class Frame:
    time_ms: float
    face: FaceFeatures | None
    people: list[Detection] = field(default_factory=list)
    objects: list[Detection] = field(default_factory=list)
    behaviours: list[Detection] = field(default_factory=list)
    width: int = 0
    height: int = 0


@dataclass(frozen=True)
class Event:
    type: str
    start_ms: int
    end_ms: int


def _posture_face(face: FaceFeatures) -> PostureFace:
    return PostureFace(
        fx=face.fx, fy=face.fy, fw=face.fw, fh=face.fh, roll=face.roll, pitch=face.pitch
    )


class BehaviourTracker:
    def __init__(self, eye_baseline: Baseline, cfg: VisionSettings) -> None:
        self.eye_baseline = eye_baseline
        self.cfg = cfg
        self.rule_windows = {b: RollingMean(cfg.rules[b].smoothing_frames) for b in BEHAVIOURS}
        self.detector_windows = {b: RollingMean(cfg.detector_frames) for b in BEHAVIOURS}
        self.gaze_down_window = RollingMean(cfg.gaze_down_frames, cfg.gaze_down_frames)
        self.baseline_samples: list[tuple[PostureFace, FeatureMap]] = []
        self.flags: dict[str, bool] = {}
        self.open_since: dict[str, float] = {}
        self.closed: list[tuple[str, float, float]] = []
        self.baseline: PostureBaseline | None = None
        self.start_ms: float | None = None
        self.last_ms = 0.0

    def add(self, frame: Frame) -> list[str]:
        if self.start_ms is None:
            self.start_ms = frame.time_ms
        self.last_ms = frame.time_ms
        detector = self._detector_flags(frame.behaviours)
        pose = self._pose_flags(frame, frame.face) if frame.face else None
        gaze_down = self._gaze_down(frame.face) if frame.face else None
        for behaviour in BEHAVIOURS:
            if self.cfg.rules[behaviour].source == "detector":
                from_model = detector.get(behaviour, False)
            else:
                from_model = (pose or {}).get(behaviour, False)
            active = from_model or (behaviour == "reading_notes" and gaze_down is True)
            self._set_flag(behaviour, active, frame.time_ms)
        return self.active()

    def active(self) -> list[str]:
        return [b for b in BEHAVIOURS if self.flags.get(b)]

    def events(self, end_ms: float | None = None) -> list[Event]:
        end = self.last_ms if end_ms is None else end_ms
        spans = [*self.closed, *((t, s, max(s, end)) for t, s in self.open_since.items())]
        start = self.start_ms or 0.0
        return [
            Event(t, round_half_up(s - start), round_half_up(e - start))
            for t, s, e in sorted(spans, key=lambda x: x[1])
        ]

    def _set_flag(self, behaviour: str, active: bool, time_ms: float) -> None:
        was = self.flags.get(behaviour, False)
        self.flags[behaviour] = active
        if active and not was:
            self.open_since[behaviour] = time_ms
        if not active and was:
            start = self.open_since.pop(behaviour, time_ms)
            self.closed.append((behaviour, start, time_ms))

    def _detector_flags(self, detections: list[Detection]) -> dict[str, bool]:
        flags = {}
        for behaviour in BEHAVIOURS:
            class_id = self.cfg.behaviour_class_ids[behaviour]
            best = max([0.0, *(d.score for d in detections if d.class_id == class_id)])
            vote = 1.0 if best >= self.cfg.detector_conf else 0.0
            share = self.detector_windows[behaviour].push(vote) or 0.0
            flags[behaviour] = share >= self.cfg.detector_min_fraction
        return flags

    def _pose_flags(self, frame: Frame, face: FaceFeatures) -> dict[str, bool] | None:
        pf = _posture_face(face)
        held = held_object(
            frame.objects, pf, frame.height, frame.width, self.cfg.ignored_object_ids
        )
        person = main_person(frame.people)
        keypoints = person.keypoints if person else None
        raw = raw_posture_features(
            pf, keypoints, held, frame.width, frame.height, self.cfg.keypoint_conf
        )
        if self.baseline is None:
            self.baseline_samples.append((pf, raw))
            if frame.time_ms - (self.start_ms or frame.time_ms) < self.cfg.baseline_ms:
                return None
            self.baseline = posture_baseline(self.baseline_samples)
        features = relative_features(pf, raw, self.baseline)
        flags = {}
        for behaviour in BEHAVIOURS:
            rule = self.cfg.rules[behaviour]
            smoothed = self.rule_windows[behaviour].push(rule_probability(rule, features)) or 0.0
            flags[behaviour] = smoothed >= rule.threshold
        return flags

    def _gaze_down(self, face: FaceFeatures) -> bool:
        c, base = self.cfg, self.eye_baseline
        score = c.gaze_down_sign * (
            face.pitch - base.pitch + c.gaze_down_k_y * (face.iris_y - base.iris_y)
        )
        share = self.gaze_down_window.push(1.0 if score >= c.gaze_down_angle_deg else 0.0)
        return share is not None and share >= c.gaze_down_min_fraction


def _percent(count: int, total: int) -> float:
    return round_half_up(count / total * 1000) / 10 if total else 0.0


def upload_baseline(frames: list[Frame], cfg: VisionSettings) -> Baseline | None:
    faces = [f for f in frames if f.face is not None]
    if not faces:
        return None
    start = frames[0].time_ms
    early = [f.face for f in faces if f.time_ms - start <= cfg.baseline_ms]
    if not early:
        early = [
            f.face for f in faces[: max(1, round_half_up(cfg.baseline_ms / 1000 * cfg.sample_fps))]
        ]
    return build_baseline(early)


def visual_metrics(frames: list[Frame], answer_index: int, duration_ms: int, cfg: VisionSettings):
    from app.schemas import BehaviourEvent, VisualMetrics

    base = upload_baseline(frames, cfg)
    contact = smiling = 0
    events: list[Event] = []
    if base is not None:
        behaviour = BehaviourTracker(base, cfg)
        for frame in frames:
            if frame.face is not None:
                error = gaze_error(frame.face, base, cfg.k_x, cfg.k_y)
                contact += error <= cfg.tolerance_deg
                smiling += frame.face.smile - base.smile >= cfg.smile_threshold
            behaviour.add(frame)
        events = behaviour.events(max(behaviour.last_ms, duration_ms))
    return VisualMetrics(
        answer_index=answer_index,
        duration_ms=max(0, duration_ms),
        eye_contact_pct=_percent(contact, len(frames)),
        smile_pct=_percent(smiling, len(frames)),
        events=[
            BehaviourEvent(type=e.type, start_ms=e.start_ms, end_ms=min(e.end_ms, duration_ms))
            for e in events
            if min(e.end_ms, duration_ms) > e.start_ms
        ],
    )

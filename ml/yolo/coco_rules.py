"""Derive behaviour labels from COCO 2017 person keypoints.

COCO has no interview-behaviour labels, so we infer three classes from geometry and crop each person
to the upper body to look more like a laptop-webcam frame. Distances are in shoulder widths.
"""

from dataclasses import dataclass

import numpy as np

# COCO-17 keypoint indices
NOSE, L_EYE, R_EYE, L_EAR, R_EAR = 0, 1, 2, 3, 4
L_SH, R_SH, L_ELB, R_ELB, L_WR, R_WR, L_HIP, R_HIP = 5, 6, 7, 8, 9, 10, 11, 12
FACE = (NOSE, L_EYE, R_EYE, L_EAR, R_EAR)

BOOK, CELL_PHONE = 84, 77  # COCO category ids

MIN_PERSON_H = 200  # px
MIN_SHOULDER_W = 40  # px
TOUCH_DIST = 0.35  # wrist-to-face, in shoulder widths
CROSS_ELBOW_DIST = 0.85  # wrist-to-opposite-elbow
NOTES_DIST = 0.5  # held object centre to wrist
NOTES_BELOW_NOSE = 0.5  # held object below the chin (excludes phone calls at the ear)
CLEAN_NEG_DIST = 0.9  # wrists at least this far from the face for a negative

Box = tuple[float, float, float, float]  # x1, y1, x2, y2 in image pixels


@dataclass
class Person:
    kps: np.ndarray  # (17, 3): x, y, visibility
    bbox: Box

    def vis(self, i: int) -> bool:
        return self.kps[i, 2] > 0

    def pt(self, i: int) -> np.ndarray:
        return self.kps[i, :2]

    @property
    def shoulder_w(self) -> float:
        return float(np.linalg.norm(self.pt(L_SH) - self.pt(R_SH)))


def from_coco(ann: dict) -> Person:
    x, y, w, h = ann["bbox"]
    return Person(np.asarray(ann["keypoints"], dtype=float).reshape(17, 3), (x, y, x + w, y + h))


def usable(p: Person) -> bool:
    return (
        p.vis(NOSE)
        and p.vis(L_SH)
        and p.vis(R_SH)
        and (p.bbox[3] - p.bbox[1]) >= MIN_PERSON_H
        and p.shoulder_w >= MIN_SHOULDER_W
    )


def _union(a: Box, b: Box) -> Box:
    return (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))


def face_box(p: Person) -> Box:
    sw = p.shoulder_w
    pts = np.array([p.pt(i) for i in FACE if p.vis(i)])
    return (
        pts[:, 0].min() - 0.2 * sw,
        pts[:, 1].min() - 0.35 * sw,
        pts[:, 0].max() + 0.2 * sw,
        pts[:, 1].max() + 0.45 * sw,
    )


def _face_dist(p: Person, wrist: int) -> float:
    return min(float(np.linalg.norm(p.pt(wrist) - p.pt(i))) for i in FACE if p.vis(i))


def touching_face(p: Person) -> Box | None:
    """A wrist at the face, not raised above the eyes (waving, throwing, hands on head)."""
    sw = p.shoulder_w
    eye_y = min(p.pt(i)[1] for i in (L_EYE, R_EYE, NOSE) if p.vis(i))
    for w in (L_WR, R_WR):
        if p.vis(w) and _face_dist(p, w) < TOUCH_DIST * sw and p.pt(w)[1] >= eye_y - 0.1 * sw:
            x, y = p.pt(w)
            r = 0.25 * sw
            return _union(face_box(p), (x - r, y - r, x + r, y + r))
    return None


def arms_crossed(p: Person) -> Box | None:
    if not all(p.vis(i) for i in (L_ELB, R_ELB, L_WR, R_WR)):
        return None
    sw = p.shoulder_w
    mid = (p.pt(L_SH)[0] + p.pt(R_SH)[0]) / 2
    side = np.sign(p.pt(L_SH)[0] - p.pt(R_SH)[0])  # +1 if the person's left is on image right
    sh_y = (p.pt(L_SH)[1] + p.pt(R_SH)[1]) / 2
    low_y = sh_y + 2.2 * sw
    if p.vis(L_HIP) and p.vis(R_HIP):
        low_y = (p.pt(L_HIP)[1] + p.pt(R_HIP)[1]) / 2
    wrists_cross = (p.pt(L_WR)[0] - mid) * side < 0 and (p.pt(R_WR)[0] - mid) * side > 0
    wrists_level = all(sh_y < p.pt(w)[1] < low_y for w in (L_WR, R_WR))
    near_elbows = (
        np.linalg.norm(p.pt(L_WR) - p.pt(R_ELB)) < CROSS_ELBOW_DIST * sw
        and np.linalg.norm(p.pt(R_WR) - p.pt(L_ELB)) < CROSS_ELBOW_DIST * sw
    )
    if not (wrists_cross and wrists_level and near_elbows):
        return None
    pts = np.array([p.pt(i) for i in (L_SH, R_SH, L_ELB, R_ELB, L_WR, R_WR)])
    pad = 0.15 * sw
    return (
        pts[:, 0].min() - pad,
        sh_y - pad,
        pts[:, 0].max() + pad,
        pts[:, 1].max() + pad,
    )


def reading_notes(p: Person, objects: list[Box]) -> Box | None:
    """A book or phone held next to a wrist, below the chin (not at the ear)."""
    sw = p.shoulder_w
    for box in objects:
        c = np.array([(box[0] + box[2]) / 2, (box[1] + box[3]) / 2])
        if c[1] <= p.pt(NOSE)[1] + NOTES_BELOW_NOSE * sw:
            continue
        for w in (L_WR, R_WR):
            if p.vis(w) and np.linalg.norm(c - p.pt(w)) < NOTES_DIST * sw:
                return box
    return None


def clean_negative(p: Person) -> bool:
    """Both wrists visible and well away from the face: safe 'no behaviour' example."""
    sw = p.shoulder_w
    return all(p.vis(w) and _face_dist(p, w) > CLEAN_NEG_DIST * sw for w in (L_WR, R_WR))


def upper_body_crop(p: Person, img_w: int, img_h: int) -> Box:
    """Head-to-hips crop at roughly 4:3, like a laptop webcam frame."""
    sw = p.shoulder_w
    cx = (p.pt(L_SH)[0] + p.pt(R_SH)[0]) / 2
    sh_y = (p.pt(L_SH)[1] + p.pt(R_SH)[1]) / 2
    top = p.pt(NOSE)[1] - 1.0 * sw
    bottom = sh_y + 1.6 * sw
    h = bottom - top
    w = max(2.6 * sw, h * 4 / 3)
    return (
        max(0.0, cx - w / 2),
        max(0.0, top),
        min(float(img_w), cx + w / 2),
        min(float(img_h), bottom),
    )


def crowded(crop: Box, me: Box, others: list[Box]) -> bool:
    """Another large person inside the crop would carry unlabelled behaviours."""
    crop_h = crop[3] - crop[1]
    for o in others:
        if o == me:
            continue
        ix = max(0.0, min(crop[2], o[2]) - max(crop[0], o[0]))
        iy = max(0.0, min(crop[3], o[3]) - max(crop[1], o[1]))
        area = (o[2] - o[0]) * (o[3] - o[1])
        if area > 0 and ix * iy / area > 0.3 and (o[3] - o[1]) > 0.5 * crop_h:
            return True
    return False


def to_crop(box: Box, crop: Box) -> Box | None:
    """Clip box to crop and shift into crop coordinates; drop it if mostly cut off."""
    x1, y1 = max(box[0], crop[0]), max(box[1], crop[1])
    x2, y2 = min(box[2], crop[2]), min(box[3], crop[3])
    if x2 <= x1 or y2 <= y1:
        return None
    if (x2 - x1) * (y2 - y1) < 0.5 * (box[2] - box[0]) * (box[3] - box[1]):
        return None
    return (x1 - crop[0], y1 - crop[1], x2 - crop[0], y2 - crop[1])

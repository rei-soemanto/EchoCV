import numpy as np

from yolo import coco_rules as R


def frontal(**moves) -> R.Person:
    """A person facing the camera; shoulder width 100 px. Keyword args move keypoints."""
    pts = {
        R.NOSE: (250, 120),
        R.L_EYE: (265, 110),
        R.R_EYE: (235, 110),
        R.L_EAR: (280, 115),
        R.R_EAR: (220, 115),
        R.L_SH: (300, 200),
        R.R_SH: (200, 200),
        R.L_ELB: (320, 300),
        R.R_ELB: (180, 300),
        R.L_WR: (330, 400),
        R.R_WR: (170, 400),
        R.L_HIP: (290, 420),
        R.R_HIP: (210, 420),
    }
    names = {"l_wr": R.L_WR, "r_wr": R.R_WR}
    for k, v in moves.items():
        pts[names[k]] = v
    kps = np.zeros((17, 3))
    for i, (x, y) in pts.items():
        kps[i] = (x, y, 2)
    return R.Person(kps, (150, 50, 350, 600))


def test_resting_person_is_usable_clean_negative():
    p = frontal()
    assert R.usable(p)
    assert p.shoulder_w == 100
    assert R.touching_face(p) is None
    assert R.arms_crossed(p) is None
    assert R.clean_negative(p)


def test_hand_on_face_is_touching_face():
    p = frontal(r_wr=(240, 140))
    box = R.touching_face(p)
    assert box is not None
    assert box[0] <= 215 and box[3] >= 165  # covers the hand and the face
    assert not R.clean_negative(p)


def test_hand_raised_above_the_eyes_is_not_touching_face():
    assert R.touching_face(frontal(r_wr=(225, 85))) is None


def test_phone_at_the_ear_is_not_reading_notes():
    phone = (205.0, 100.0, 225.0, 140.0)
    assert R.reading_notes(frontal(r_wr=(215, 125)), [phone]) is None


def test_crossed_wrists_near_opposite_elbows_is_arms_crossed():
    assert R.arms_crossed(frontal(l_wr=(195, 305), r_wr=(305, 305))) is not None


def test_wrists_past_midline_but_far_from_elbows_is_not_arms_crossed():
    assert R.arms_crossed(frontal(l_wr=(240, 420), r_wr=(260, 420))) is None


def test_phone_next_to_wrist_is_reading_notes():
    phone = (320.0, 380.0, 360.0, 430.0)
    assert R.reading_notes(frontal(), [phone]) == phone
    assert R.reading_notes(frontal(), [(500.0, 380.0, 540.0, 430.0)]) is None


def test_upper_body_crop_and_box_conversion():
    p = frontal()
    crop = R.upper_body_crop(p, 640, 480)
    assert crop[1] <= 110 and 350 <= crop[3] < 420  # head to just above the hips
    assert R.to_crop((crop[0] + 10, crop[1] + 10, crop[0] + 50, crop[1] + 50), crop) == (
        10,
        10,
        50,
        50,
    )
    assert R.to_crop((-500, -500, -400, -400), crop) is None


def test_crowded_crop_is_rejected():
    p = frontal()
    crop = R.upper_body_crop(p, 640, 480)
    neighbour = (crop[0] + 5, crop[1], crop[0] + 120, crop[3])
    assert R.crowded(crop, p.bbox, [p.bbox, neighbour])
    assert not R.crowded(crop, p.bbox, [p.bbox])

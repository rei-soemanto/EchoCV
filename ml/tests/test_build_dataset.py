from yolo.build_dataset import keep_negative, remap_boxes

RULES = {"Face": "face", "Hand": "hand", "ARMS CROSSED": "arms_crossed", "junk": "drop_image"}


def test_hand_mostly_on_face_becomes_touching_face():
    out = remap_boxes([("Face", (10, 10, 50, 50)), ("Hand", (35, 35, 65, 65))], RULES)
    assert out == [("touching_face", (10, 10, 65, 65))]


def test_hand_grazing_face_box_is_not_touching_face():
    # 10x10 corner overlap = 11% of the 30x30 hand box
    assert remap_boxes([("Face", (10, 10, 50, 50)), ("Hand", (40, 40, 70, 70))], RULES) == []


def test_palm_raised_beside_face_is_not_touching_face():
    # 30% of the hand box is on the face, but the hand's centre is beside it
    assert remap_boxes([("Face", (10, 10, 50, 50)), ("Hand", (41, 10, 71, 40))], RULES) == []


def test_keep_negative_subsamples_train_only():
    names = [f"img{i}" for i in range(2000)]
    kept = sum(keep_negative(n, "train", 0.3) for n in names)
    assert 500 < kept < 700
    assert all(keep_negative(n, "val", 0.3) for n in names)


def test_separate_hand_and_face_are_negative():
    assert remap_boxes([("Face", (10, 10, 50, 50)), ("Hand", (60, 60, 90, 90))], RULES) == []


def test_direct_mapping_and_unknown_classes_ignored():
    out = remap_boxes([("ARMS CROSSED", (1, 2, 3, 4)), ("something", (0, 0, 1, 1))], RULES)
    assert out == [("arms_crossed", (1, 2, 3, 4))]


def test_drop_image_role_drops_everything():
    assert remap_boxes([("junk", (0, 0, 1, 1)), ("ARMS CROSSED", (1, 2, 3, 4))], RULES) is None

import numpy as np

from whisper.audio import SR
from whisper.synth_id import boundaries, insert_tokens, snap_to_quiet, splice, token_words

REF = "Kapsul tersebut akan lebih menyerupai bintang.".split()
HYP = [
    ("kapsul", 0.10, 0.50),
    ("tersebut", 0.60, 1.00),
    ("akan", 1.20, 1.40),
    ("lebih", 1.45, 1.70),
    ("menyerupai", 1.80, 2.40),
    ("bintang.", 2.50, 3.00),
]


def test_boundaries_use_gaps_between_matched_words():
    spots = dict(boundaries(REF, HYP))
    assert spots[0] == 0.05
    assert spots[2] == 1.10  # midpoint of the 1.00-1.20 gap before "akan"
    assert len(spots) == len(REF)


def test_boundaries_skip_unmatched_words():
    hyp = [w for w in HYP if w[0] != "lebih"] + []
    hyp = [(("lbh" if w[0] == "akan" else w[0]), w[1], w[2]) for w in hyp]
    spots = dict(boundaries(REF, hyp))
    assert 2 not in spots and 3 not in spots and 4 not in spots  # around the mismatches
    assert 1 in spots and 5 in spots


def test_insert_tokens_at_word_indices():
    assert insert_tokens(REF, [(0, "[EEE]"), (3, "[HMM]")]) == (
        "[EEE] Kapsul tersebut akan [HMM] lebih menyerupai bintang."
    )


def test_token_words_groups_bpe_pieces_with_shifted_times():
    tokens = ["ĠP", "ert", "ama", "Ġyang", "Ġdi"]
    times = [0.0, 3.02, 3.18, 3.34, 3.44, 3.62]  # times[i + 1] = start of token i
    assert token_words(tokens, times) == [
        ("Pertama", 3.02, 3.44),
        ("yang", 3.44, 3.62),
        ("di", 3.62, 3.62),
    ]


def test_snap_to_quiet_finds_the_gap():
    audio = np.ones(SR, np.float32)
    audio[int(0.55 * SR) : int(0.58 * SR)] = 0.0  # 30 ms gap
    t = snap_to_quiet(audio, 0.5, window=0.15)
    assert 0.55 <= t <= 0.58


def test_splice_inserts_clip_with_padding_at_time():
    audio = np.ones(SR, np.float32)
    clip = np.full(SR // 10, 2.0, np.float32)
    out = splice(audio, clip, 0.5, (0.1, 0.2))
    assert len(out) == SR + SR // 10 + int(0.1 * SR) + int(0.2 * SR)
    k = SR // 2 + int(0.1 * SR)
    assert out[k] == 2.0 and out[SR // 2] == 0.0

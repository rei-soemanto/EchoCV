from whisper.normalize import filler_counts, filler_prf, for_wer, to_target


def test_to_target_maps_disfluencyspeech_text():
    text = "Exactly. I, I see more men, uh, like participating in like the family things."
    assert to_target(text) == (
        "Exactly. I, I see more men, [EEE], like participating in like the family things."
    )


def test_to_target_lowercases_ami_and_keeps_backchannels():
    assert to_target("BECAUSE I UM I TALKED ABOUT MM-HMM HMM", lowercase=True) == (
        "because i [UM] i talked about mm-hmm [HMM]"
    )


def test_indonesian_interjections_are_not_fillers():
    assert filler_counts("Ah, begitu. Eh, saya lupa") == {}


def test_filler_counts_accepts_tokens_and_spoken_forms():
    assert filler_counts("[EEE] saya Um, pernah hmm [HMM]") == {"EEE": 1, "UM": 1, "HMM": 2}


def test_filler_prf_counts_per_utterance():
    refs = ["[EEE] a [UM] b", "c [HMM]"]
    hyps = ["uh a b", "c [HMM] [HMM]"]
    m = filler_prf(refs, hyps)
    assert m["all"]["support"] == 3
    assert (m["EEE"]["precision"], m["EEE"]["recall"]) == (1.0, 1.0)
    assert m["UM"]["recall"] == 0.0
    assert m["HMM"]["precision"] == 0.5
    assert round(m["all"]["f1"], 3) == round(2 * (2 / 3) * (2 / 3) / (4 / 3), 3)


def test_for_wer_strips_fillers_and_punctuation():
    assert for_wer("[EEE] Saya, um, pernah memimpin proyek.") == "saya pernah memimpin proyek"

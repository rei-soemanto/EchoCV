from whisper.infer import MAX_NEW_TOKENS, max_tokens


def test_max_tokens_scales_with_duration_and_caps():
    assert max_tokens(2.0) == 32  # a 2 s clip can't loop for 220 tokens
    assert max_tokens(10.0) == 96
    assert max_tokens(30.0) == MAX_NEW_TOKENS

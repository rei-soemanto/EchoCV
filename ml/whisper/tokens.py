"""Whisper's default suppress list blocks tokens starting with '[' (and ']'), so the filler tokens
could never be generated. Remove the token ids that spell the filler tokens from that list.

The resulting list ships with the model (suppress_tokens.json); services/speech must pass it to
faster-whisper as `suppress_tokens` instead of the default [-1].
"""

from whisper.normalize import TOKENS


def filler_token_ids(tokenizer) -> set[int]:
    ids: set[int] = set()
    for token in TOKENS:
        for text in (token, " " + token):
            ids.update(tokenizer.encode(text, add_special_tokens=False))
    return ids


def filler_safe_suppress(tokenizer, base_suppress: list[int]) -> list[int]:
    keep = filler_token_ids(tokenizer)
    return [i for i in base_suppress if i not in keep]

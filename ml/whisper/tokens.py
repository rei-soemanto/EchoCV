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

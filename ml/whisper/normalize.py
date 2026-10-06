"""Filler-token mapping, filler metrics and WER normalisation.

The same mapping builds training targets (AMI / DisfluencySpeech text) and scores model output, so
a stock model that writes "Um," still gets credit for hearing the filler.
"""

import re
from collections import Counter

EEE, UM, HMM = "[EEE]", "[UM]", "[HMM]"
TOKENS = (EEE, UM, HMM)

# Lowercased spoken forms -> canonical token. Backchannels (mm-hmm, uh-huh) stay words, and so do
# interjections that are real words in Indonesian ("ah", "eh").
FORMS = {
    **dict.fromkeys(("uh", "uhh", "uhm", "er", "err", "eee", "ee", "eeh", "eeee"), EEE),
    **dict.fromkeys(("um", "umm", "erm", "em", "emm", "ehm"), UM),
    **dict.fromkeys(("hmm", "hm", "hmmm", "mm", "mmm"), HMM),
}

_EDGE = re.compile(r"^([^\w\[\]]*)(.*?)([^\w\[\]]*)$")
_TOKEN_RE = re.compile(r"\[(EEE|UM|HMM)\]")


def _map_word(word: str) -> str:
    lead, core, trail = _EDGE.match(word).groups()
    token = FORMS.get(core.lower())
    return f"{lead}{token}{trail}" if token else word


def to_target(text: str, lowercase: bool = False) -> str:
    """Replace spoken filler words with canonical tokens. AMI is all caps, so lowercase it."""
    if lowercase:
        text = text.lower()
    return " ".join(_map_word(w) for w in text.split())


def filler_counts(text: str) -> Counter:
    """Count fillers in model output or a reference, accepting tokens or spoken forms."""
    return Counter(_TOKEN_RE.findall(to_target(text)))


def filler_prf(refs: list[str], hyps: list[str]) -> dict:
    """Per-utterance, per-type count matching: tp = min(ref, hyp) for each token type."""
    stats = {t: Counter() for t in ("EEE", "UM", "HMM", "all")}
    for ref, hyp in zip(refs, hyps, strict=True):
        rc, hc = filler_counts(ref), filler_counts(hyp)
        for t in ("EEE", "UM", "HMM"):
            tp = min(rc[t], hc[t])
            for key in (t, "all"):
                stats[key]["tp"] += tp
                stats[key]["fp"] += hc[t] - tp
                stats[key]["fn"] += rc[t] - tp
    out = {}
    for key, s in stats.items():
        p = s["tp"] / (s["tp"] + s["fp"]) if s["tp"] + s["fp"] else 0.0
        r = s["tp"] / (s["tp"] + s["fn"]) if s["tp"] + s["fn"] else 0.0
        f = 2 * p * r / (p + r) if p + r else 0.0
        out[key] = {"precision": p, "recall": r, "f1": f, "support": s["tp"] + s["fn"]}
    return out


def for_wer(text: str) -> str:
    """Lowercase, drop fillers and punctuation, collapse whitespace."""
    text = _TOKEN_RE.sub(" ", to_target(text)).lower()
    text = re.sub(r"[^\w\s'-]", " ", text)
    return " ".join(text.split())

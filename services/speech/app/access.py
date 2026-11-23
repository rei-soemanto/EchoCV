import hmac
import os
import urllib.error
import urllib.request
from typing import Annotated
from urllib.parse import urlsplit

from fastapi import Header, HTTPException

SERVICE_KEY_ENV = "SPEECH_SERVICE_KEY"
AUDIO_HOSTS_ENV = "SPEECH_AUDIO_URL_HOSTS"
LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1"})


class AudioUrlRejected(ValueError):
    pass


class AudioDownloadFailed(RuntimeError):
    pass


class AudioTooLarge(ValueError):
    pass


def require_service_key(
    x_speech_key: Annotated[str | None, Header(alias="X-Speech-Key")] = None,
) -> None:
    expected = os.environ.get(SERVICE_KEY_ENV, "")
    if not expected:
        return
    if not x_speech_key or not hmac.compare_digest(x_speech_key, expected):
        raise HTTPException(401, "The service key is missing or wrong")


def allowed_audio_hosts() -> frozenset[str]:
    raw = os.environ.get(AUDIO_HOSTS_ENV, "")
    return frozenset(h.strip().lower() for h in raw.split(",") if h.strip())


def check_audio_url(url: str, hosts: frozenset[str]) -> None:
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    if not hosts:
        raise AudioUrlRejected("audioUrl is not enabled on this service")
    if host not in hosts:
        raise AudioUrlRejected("audioUrl points to a host this service does not download from")
    local_http = parts.scheme == "http" and host in LOCAL_HOSTS
    if parts.scheme != "https" and not local_http:
        raise AudioUrlRejected("audioUrl must use https")


class _RefuseRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def download_audio(url: str, max_bytes: int, timeout_s: float) -> bytes:
    opener = urllib.request.build_opener(_RefuseRedirects)
    try:
        with opener.open(url, timeout=timeout_s) as response:
            data = response.read(max_bytes + 1)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise AudioDownloadFailed("The audio could not be downloaded") from exc
    if len(data) > max_bytes:
        raise AudioTooLarge("The audio file is too large")
    return data

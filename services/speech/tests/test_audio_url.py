import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
from fastapi.testclient import TestClient

from app.access import AudioUrlRejected, check_audio_url
from app.config import settings
from app.main import app, get_engine
from tests.fakes import answer

client = TestClient(app)
BODY = b"audio bytes"


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/redirect":
            self.send_response(302)
            self.send_header("Location", "http://127.0.0.1:1/elsewhere")
            self.end_headers()
            return
        if self.path == "/missing":
            self.send_error(404)
            return
        body = b"x" * (settings().max_upload_bytes + 1) if self.path == "/big" else BODY
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


@pytest.fixture(scope="module")
def server():
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}"
    httpd.shutdown()


@pytest.fixture
def engine(monkeypatch):
    monkeypatch.setenv("SPEECH_AUDIO_URL_HOSTS", "127.0.0.1")
    fake = answer()
    decoded = []
    original = fake.decode

    def decode(data):
        decoded.append(data)
        return original(data)

    fake.decode = decode
    fake.decoded = decoded
    app.dependency_overrides[get_engine] = lambda: fake
    yield fake
    app.dependency_overrides.clear()


def post_url(url: str):
    return client.post("/analyze", data={"language": "en", "answerIndex": "0", "audioUrl": url})


def test_audio_url_is_downloaded_and_analysed(server, engine):
    res = post_url(f"{server}/answer.webm")
    assert res.status_code == 200
    assert res.json()["language"] == "en"
    assert engine.decoded == [BODY]


def test_redirects_are_not_followed(server, engine):
    assert post_url(f"{server}/redirect").status_code == 422


def test_failed_download_is_rejected(server, engine):
    assert post_url(f"{server}/missing").status_code == 422


def test_download_over_the_size_limit_is_rejected(server, engine):
    assert post_url(f"{server}/big").status_code == 413


def test_host_outside_the_allowlist_is_rejected(engine):
    assert post_url("https://attacker.example/answer.webm").status_code == 422


def test_audio_url_is_off_without_an_allowlist(server, engine, monkeypatch):
    monkeypatch.delenv("SPEECH_AUDIO_URL_HOSTS")
    assert post_url(f"{server}/answer.webm").status_code == 422


@pytest.mark.parametrize(
    "url",
    [
        "http://project.supabase.co/a.webm",
        "ftp://project.supabase.co/a.webm",
        "file:///etc/passwd",
        "https://project.supabase.co.attacker.example/a.webm",
    ],
)
def test_unsafe_urls_are_rejected(url):
    with pytest.raises(AudioUrlRejected):
        check_audio_url(url, frozenset({"project.supabase.co"}))


def test_https_on_an_allowed_host_passes():
    check_audio_url(
        "https://Project.supabase.co/a.webm?token=t", frozenset({"project.supabase.co"})
    )

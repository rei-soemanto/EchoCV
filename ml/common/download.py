"""Resumable HTTP downloads and archive extraction (stdlib only)."""

import shutil
import tarfile
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

CHUNK = 1 << 20
USER_AGENT = "Mozilla/5.0 (EchoCV dataset downloader)"


def fetch(
    url: str, dest: Path, expect_binary: bool = True, quiet: bool = False, retries: int = 30
) -> Path:
    """Download url to dest; resume the .part file after timeouts or dropped connections."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        if not quiet:
            print(f"  have {dest.name}")
        return dest
    for attempt in range(retries):
        try:
            return _fetch_once(url, dest, expect_binary, quiet)
        except (TimeoutError, ConnectionError, urllib.error.URLError) as err:
            if attempt == retries - 1:
                raise
            if not quiet:
                print(f"  retry {dest.name} after {type(err).__name__}")
            time.sleep(5)
    raise AssertionError("unreachable")


def _fetch_once(url: str, dest: Path, expect_binary: bool, quiet: bool) -> Path:
    part = dest.with_suffix(dest.suffix + ".part")
    have = part.stat().st_size if part.exists() else 0
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    if have:
        req.add_header("Range", f"bytes={have}-")
    with urllib.request.urlopen(req, timeout=60) as resp:
        if expect_binary and "text/html" in resp.headers.get("Content-Type", ""):
            raise RuntimeError(f"{url} returned an HTML page, not a file (login or form required?)")
        mode = "ab" if have and resp.status == 206 else "wb"
        total = resp.headers.get("Content-Length")
        if not quiet:
            size = f" ({int(total) / 1e6:.0f} MB)" if total else ""
            print(f"  get {dest.name}{size}")
        with open(part, mode) as f:
            shutil.copyfileobj(resp, f, CHUNK)
    part.rename(dest)
    return dest


def extract(archive: Path, out_dir: Path) -> Path:
    """Extract a .zip/.tar/.tar.gz once; a marker file makes it idempotent."""
    marker = out_dir / f".extracted-{archive.name}"
    if marker.exists():
        return out_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"  extract {archive.name}")
    if archive.suffix == ".zip":
        with zipfile.ZipFile(archive) as z:
            z.extractall(out_dir)
    else:
        with tarfile.open(archive) as t:
            t.extractall(out_dir, filter="data")
    marker.touch()
    return out_dir

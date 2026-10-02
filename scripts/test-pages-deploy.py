"""Run with python scripts/test-pages-deploy.py; no network or third-party modules."""
import json
import os
import pathlib
import runpy
import tempfile
import urllib.parse
import zipfile
from unittest.mock import patch

prepare = runpy.run_path(str(pathlib.Path(__file__).with_name("prepare-pages-deploy.py")))["prepare"]
publisher = runpy.run_path(str(pathlib.Path(__file__).with_name("publish-pages.py")))


def rejected(action, message):
    try:
        action()
    except ValueError as error:
        assert message in str(error), str(error)
    else:
        raise AssertionError(f"Expected rejection: {message}")


with tempfile.TemporaryDirectory() as directory:
    root = pathlib.Path(directory)
    source, state, site = (root / name for name in ("build", "state", "site"))
    source.mkdir()
    state.mkdir()
    (state / ".git").write_text("keep git metadata", encoding="utf-8")
    (source / "index.html").write_text("main v1", encoding="utf-8")
    (source / "old.js").write_text("old chunk", encoding="utf-8")
    (source / "mobile").mkdir()
    (source / "mobile/web.zip").write_bytes(b"old native bundle")
    rejected(lambda: prepare(source, state, site, "dev", "a" * 40), "Publish main first")
    rejected(lambda: prepare(source, state, site, "../main", "a" * 40), "main/dev/test")
    rejected(lambda: prepare(source, state, site, "main", "invalid"), "commit SHA")
    rejected(lambda: prepare(source, state, state / "site", "main", "a" * 40), "overlap")
    (source / "dev").mkdir()
    rejected(lambda: prepare(source, state, site, "main", "a" * 40), "reserved")
    (source / "dev").rmdir()
    prepare(source, state, site, "main", "a" * 40)
    production_zip = (site / "mobile/web.zip").read_bytes()

    for branch, letter in (("dev", "b"), ("test", "c"), ("dev", "d"), ("main", "e")):
        (source / "index.html").write_text(branch + letter, encoding="utf-8")
        (source / "old.js").unlink(missing_ok=True)
        (source / "new.js").write_text(letter, encoding="utf-8")
        prepare(source, state, site, branch, letter * 40)
        if branch != "main":
            assert (site / "mobile/web.zip").read_bytes() == production_zip
            assert (site / "index.html").read_text() == "main v1"
            assert (site / "old.js").exists()
        assert not (state / branch / "mobile").exists()
        assert not (state / branch / "old.js").exists()

    for branch, prefix, letter in (("main", "", "e"), ("dev", "dev", "d"), ("test", "test", "c")):
        output = site / prefix
        assert (output / "index.html").read_text() == branch + letter
        assert (output / "new.js").read_text() == letter
        assert json.loads((output / "deployment.json").read_text()) == {"branch": branch, "sha": letter * 40}
    assert (state / ".git").read_text() == "keep git metadata"
    assert not (site / ".git").exists()
    assert not (site / "old.js").exists()
    with zipfile.ZipFile(site / "mobile/web.zip") as archive:
        assert set(archive.namelist()) == {"index.html", "new.js", "deployment.json"}
        assert archive.read("index.html") == b"maine"

    # Use the combined site's revision even when source branches share a commit.
    payloads = []
    statuses = iter(("deployment_in_progress", "succeed"))
    endpoint = "https://api.github.com/repos/example/arcade/pages/deployments"
    def response(url, token=None, payload=None):
        if url == "https://oidc.example/token":
            return {"value": "test-oidc"}
        if url == endpoint:
            payloads.append(payload)
            return {"id": "f" * 40, "page_url": "https://example.github.io/arcade/"}
        if url == endpoint + "/" + "f" * 40:
            return {"status": next(statuses)}
        assert token is None  # Never send credentials to the public site.
        name = urllib.parse.urlsplit(url).path.removeprefix("/arcade/")
        return json.loads((site / name).read_text(encoding="utf-8"))

    with patch.dict(os.environ, {
        "GITHUB_API_URL": "https://api.github.com", "GITHUB_REPOSITORY": "example/arcade",
        "GH_TOKEN": "test-token", "ACTIONS_ID_TOKEN_REQUEST_URL": "https://oidc.example/token",
        "ACTIONS_ID_TOKEN_REQUEST_TOKEN": "test-request", "GITHUB_OUTPUT": str(root / "outputs"),
    }), patch.dict(publisher["publish"].__globals__, {"request_json": response}), patch("time.sleep"):
        publisher["publish"]("123", "f" * 40, site)
    assert payloads == [{"artifact_id": 123, "pages_build_version": "f" * 40, "oidc_token": "test-oidc"}]
    assert (root / "outputs").read_text().strip() == "page_url=https://example.github.io/arcade/"
    with patch.dict(publisher["verify"].__globals__, {"request_json": lambda url: {"sha": "old"}}):
        try:
            publisher["verify"](site, "https://example.github.io/arcade/", timeout=0)
        except RuntimeError as error:
            assert "Stale Pages content" in str(error)
        else:
            raise AssertionError("A successful API response must not hide a stale live site")

    prepare.__globals__["MAX_GIT_FILE_BYTES"] = 1
    rejected(lambda: prepare(source, state, site, "main", "f" * 40), "100 MiB")
    prepare.__globals__["MAX_GIT_FILE_BYTES"] = 100 * 1024 ** 2
    prepare.__globals__["MAX_SITE_BYTES"] = 1
    rejected(lambda: prepare(source, state, site, "main", "f" * 40), "1 GiB")

print("Pages bootstrap, isolation, deployment revision, live verification, native bundle and size checks passed")

"""Run with python scripts/test-pages-deploy.py; no network or third-party modules."""
import json
import pathlib
import runpy
import tempfile
import zipfile

prepare = runpy.run_path(str(pathlib.Path(__file__).with_name("prepare-pages-deploy.py")))["prepare"]


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

    prepare.__globals__["MAX_GIT_FILE_BYTES"] = 1
    rejected(lambda: prepare(source, state, site, "main", "f" * 40), "100 MiB")
    prepare.__globals__["MAX_GIT_FILE_BYTES"] = 100 * 1024 ** 2
    prepare.__globals__["MAX_SITE_BYTES"] = 1
    rejected(lambda: prepare(source, state, site, "main", "f" * 40), "1 GiB")

print("Pages bootstrap, branch isolation, replacement, metadata, native bundle and size checks passed")

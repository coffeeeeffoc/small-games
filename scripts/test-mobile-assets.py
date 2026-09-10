import importlib.util
import pathlib
import tempfile
import zipfile

spec = importlib.util.spec_from_file_location("mobile_assets", pathlib.Path(__file__).with_name("mobile-assets.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
with tempfile.TemporaryDirectory() as directory:
    root = pathlib.Path(directory)
    (root / "index.html").write_text("hello", encoding="utf-8")
    first = module.package(root)
    assert module.package(root) == first, "Packaging must be deterministic and exclude its own output"
    with zipfile.ZipFile(root / "mobile/web.zip") as archive:
        assert archive.namelist() == ["index.html"]
        assert archive.read("index.html") == b"hello"
    (root / "index.html").write_text("new", encoding="utf-8")
    assert module.package(root)["version"] != first["version"]
print("Mobile bundle determinism, contents and version checks passed")

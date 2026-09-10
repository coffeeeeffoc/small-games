"""Package the Pages build for the native Android cache (Python stdlib only)."""
import hashlib
import json
import pathlib
import sys
import zipfile


def package(root):
    root = pathlib.Path(root).resolve()
    if not (root / "index.html").is_file():
        raise ValueError("Build the Pages site first")
    files = sorted(p for p in root.rglob("*") if p.is_file() and "mobile" != p.relative_to(root).parts[0])
    output = root / "mobile"
    output.mkdir(exist_ok=True)
    archive = output / "web.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for file in files:
            entry = zipfile.ZipInfo(file.relative_to(root).as_posix(), (2020, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            bundle.writestr(entry, file.read_bytes())
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    manifest = {"schema": 1, "version": digest, "sha256": digest, "bytes": archive.stat().st_size}
    (output / "update.json").write_text(json.dumps(manifest) + "\n", encoding="utf-8")
    print(f"Mobile web bundle: {digest} ({manifest['bytes']} bytes)")
    return manifest


if __name__ == "__main__":
    package(sys.argv[1] if len(sys.argv) > 1 else "apps/shell-web/dist")

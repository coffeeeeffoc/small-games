"""Fetch only the pinned, official Blender CC0 human asset bundle."""
import hashlib
from pathlib import Path
import urllib.request
import zipfile

ROOT=Path(__file__).resolve().parent/'source'
ROOT.mkdir(parents=True,exist_ok=True)
URL='https://download.blender.org/demo/bundles/bundles-3.6/human-base-meshes-bundle-v1.0.0.zip'
SHA256='46a912c0524072ac3b78c35d5d2471df7b8df102394a050ca8cd7184e3393648'
archive=ROOT/'human-base-meshes-bundle-v1.0.0.zip'
if not archive.exists():
    with urllib.request.urlopen(URL,timeout=90) as response:
        archive.write_bytes(response.read())
assert hashlib.sha256(archive.read_bytes()).hexdigest()==SHA256,'Unexpected source bundle; do not import'
destination=(ROOT/'human-base-meshes').resolve()
destination.mkdir(exist_ok=True)
with zipfile.ZipFile(archive) as bundle:
    for member in bundle.infolist():
        assert (destination/member.filename).resolve().is_relative_to(destination),'Unsafe archive path'
    bundle.extractall(destination)
print(destination/'human_base_meshes_bundle.blend')

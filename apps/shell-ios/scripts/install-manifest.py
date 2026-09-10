"""Emit an OTA manifest only for IPA export methods installable on registered devices."""
import pathlib
import plistlib
import sys
import urllib.parse
import zipfile


def manifest(ipa, options, address, output):
    target = pathlib.Path(output)
    target.unlink(missing_ok=True)
    settings = plistlib.loads(pathlib.Path(options).read_bytes())
    if settings.get("method") not in ("ad-hoc", "release-testing", "enterprise"):
        print("No OTA manifest: this export method is not directly installable")
        return False
    url = urllib.parse.urlparse(address)
    if url.scheme != "https" or url.hostname != "github.com" or url.username or not url.path.startswith("/coffeeeeffoc/small-games/releases/download/"):
        raise ValueError("Expected a public HTTPS release asset in this repository")
    with zipfile.ZipFile(ipa) as archive:
        names = [n for n in archive.namelist() if n.startswith("Payload/") and n.endswith(".app/Info.plist") and n.count("/") == 2]
        if len(names) != 1:
            raise ValueError("Expected one app in the IPA")
        info = plistlib.loads(archive.read(names[0]))
    if info["CFBundleIdentifier"] != "com.coffeeeeffoc.smallgames":
        raise ValueError("Unexpected iOS bundle identifier")
    target.write_bytes(plistlib.dumps({"items": [{
        "assets": [{"kind": "software-package", "url": address}],
        "metadata": {"bundle-identifier": info["CFBundleIdentifier"], "bundle-version": info["CFBundleVersion"], "kind": "software", "title": "摸鱼游戏社测试版"},
    }]}))
    print("Generated OTA manifest for registered test devices")
    return True


if __name__ == "__main__":
    manifest(*sys.argv[1:])

import importlib.util
import pathlib
import plistlib
import tempfile
import zipfile

spec = importlib.util.spec_from_file_location("install_manifest", pathlib.Path(__file__).with_name("install-manifest.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
with tempfile.TemporaryDirectory() as directory:
    root = pathlib.Path(directory)
    ipa, options, output = [root / name for name in ("app.ipa", "options.plist", "manifest.plist")]
    with zipfile.ZipFile(ipa, "w") as archive:
        archive.writestr("Payload/SmallGames.app/Info.plist", plistlib.dumps({"CFBundleIdentifier": "com.coffeeeeffoc.smallgames", "CFBundleVersion": "42"}))
    options.write_bytes(plistlib.dumps({"method": "release-testing"}))
    address = "https://github.com/coffeeeeffoc/small-games/releases/download/test/moyu-arcade.ipa"
    assert module.manifest(ipa, options, address, output)
    assert plistlib.loads(output.read_bytes())["items"][0]["metadata"]["bundle-version"] == "42"
    options.write_bytes(plistlib.dumps({"method": "app-store-connect"}))
    assert not module.manifest(ipa, options, address, output)
    assert not output.exists(), "Store export must not retain a stale install manifest"
print("iOS install manifest version and distribution-method checks passed")

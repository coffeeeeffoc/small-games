"""Optional release-art conversion/check; never called by the game build.

Reproduce with Python 3.10, Pillow 10.3.0 / libwebp 1.3.2:
    python scripts/optimize-images.py --report outputs/image-quality.json
    python scripts/optimize-images.py --check
Original PNG artwork and sprite coordinates are never modified.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path

import PIL
from PIL import Image, ImageChops, ImageStat, features


ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "src" / "assets"
SETTINGS = {
    "home-city": {"lossless": True, "quality": 100, "method": 6},
    "characters": {"lossless": True, "quality": 100, "method": 6},
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def compare(original, decoded):
    alpha_equal = (
        ImageChops.difference(
            original.getchannel("A"), decoded.getchannel("A")
        ).getbbox()
        is None
    )
    composites = {}
    for background in ("white", "black"):
        base = Image.new("RGBA", original.size, background)
        before = Image.alpha_composite(base, original).convert("RGB")
        after = Image.alpha_composite(base, decoded).convert("RGB")
        difference = ImageChops.difference(before, after)
        mse = sum(ImageStat.Stat(difference).sum2) / (
            original.width * original.height * 3
        )
        composites[background] = {
            "pixelIdentical": difference.getbbox() is None,
            "psnrDb": round(10 * math.log10(255**2 / mse), 3) if mse else None,
        }
    return alpha_equal, composites


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="check committed WebP without writing")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    report = {
        "pillow": PIL.__version__,
        "libwebp": features.version("webp"),
        "checkOnly": args.check,
        "images": [],
    }
    for name, options in SETTINGS.items():
        source, release = ASSETS / f"{name}.png", ASSETS / f"{name}.webp"
        original = Image.open(source).convert("RGBA")
        if not args.check:
            original.save(release, "WEBP", **options)
        decoded = Image.open(release).convert("RGBA")
        assert original.size == decoded.size, f"{name}: dimensions changed"
        alpha_equal, composites = compare(original, decoded)
        assert alpha_equal, f"{name}: alpha changed"
        if options["lossless"]:
            assert all(c["pixelIdentical"] for c in composites.values()), (
                f"{name}: visible sprite pixels changed"
            )
        else:
            assert all(c["pixelIdentical"] or c["psnrDb"] >= 40 for c in composites.values()), (
                f"{name}: quality regression; inspect original and release art"
            )
        assert release.stat().st_size < source.stat().st_size, (
            f"{name}: release asset is no smaller than its original"
        )
        report["images"].append({
            "name": name,
            "dimensions": list(original.size),
            "options": options,
            "originalBytes": source.stat().st_size,
            "releaseBytes": release.stat().st_size,
            "sourceSha256": digest(source),
            "releaseSha256": digest(release),
            "alphaIdentical": alpha_equal,
            "composites": composites,
        })
    report["originalBytes"] = sum(i["originalBytes"] for i in report["images"])
    report["releaseBytes"] = sum(i["releaseBytes"] for i in report["images"])
    text = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()

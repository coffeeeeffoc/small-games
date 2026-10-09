"""Keep branch builds in gh-pages, then assemble one Pages site (stdlib only)."""
import json
import pathlib
import re
import runpy
import shutil
import sys

BRANCHES = ("main", "dev", "test")
MAX_SITE_BYTES = 1024 ** 3
MAX_GIT_FILE_BYTES = 100 * 1024 ** 2
package_mobile = runpy.run_path(str(pathlib.Path(__file__).with_name("mobile-assets.py")))["package"]


def files(root):
    entries = list(root.rglob("*"))
    if any(p.is_symlink() or ".git" in p.relative_to(root).parts for p in entries):
        raise ValueError("Pages builds must not contain symlinks or Git metadata")
    return [p for p in entries if p.is_file()]


def unpublished_art(directory, names):
    # These seven retained drafts are unused by Travel; apply to saved previews too.
    if pathlib.Path(directory).parts[-5:] == ("games", "travel", "assets", "journey", "layers"):
        return {f"source-{name}.png" for name in ("cafe", "foreground", "meadow", "oldtown", "pagodas", "pier", "village")}
    return set()


def prepare(source, state, site, branch, sha):
    if branch not in BRANCHES or not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ValueError("Expected main/dev/test and a full commit SHA")
    source, state, site = (pathlib.Path(p).resolve() for p in (source, state, site))
    roots = (source, state, site)
    if any(a == b or a in b.parents or b in a.parents for i, a in enumerate(roots) for b in roots[i + 1:]):
        raise ValueError("Build, state and site directories must not overlap")
    if not (source / "index.html").is_file():
        raise ValueError("Missing build index.html")
    if any((source / name).exists() for name in ("dev", "test", "deployment.json")):
        raise ValueError("Build uses reserved environment paths")
    if branch != "main" and not (state / "main/index.html").is_file():
        raise ValueError("Publish main first to preserve the production site")
    build_files = files(source)
    for name in BRANCHES:
        if (state / name).is_symlink():
            raise ValueError("Environment directory must not be a symlink")
        if (state / name).exists():
            files(state / name)
            if not (state / name / "index.html").is_file():
                raise ValueError(f"Missing saved {name} index.html")
    if any(p.stat().st_size >= MAX_GIT_FILE_BYTES for p in build_files if p.relative_to(source).parts[0] != "mobile"):
        raise ValueError("A Pages build file exceeds Git's 100 MiB limit")

    target = state / branch
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True)
    # The native updater follows production; never store its >100 MiB ZIP in Git.
    for entry in source.iterdir():
        if entry.name != "mobile":
            destination = target / entry.name
            shutil.copytree(entry, destination) if entry.is_dir() else shutil.copy2(entry, destination)
    (target / "deployment.json").write_text(
        json.dumps({"branch": branch, "sha": sha}) + "\n", encoding="utf-8"
    )

    if site.exists():
        shutil.rmtree(site)
    shutil.copytree(state / "main", site, ignore=unpublished_art)
    # Package before adding previews so Android keeps downloading only production.
    package_mobile(site)
    for name in ("dev", "test"):
        if (state / name).exists():
            shutil.copytree(state / name, site / name, ignore=unpublished_art)
    size = sum(p.stat().st_size for p in files(site))
    if size > MAX_SITE_BYTES:
        raise ValueError(f"Combined Pages site exceeds 1 GiB: {size} bytes")
    print(f"Pages {branch}@{sha}: {size} bytes including all saved environments")


if __name__ == "__main__":
    prepare(*sys.argv[1:])

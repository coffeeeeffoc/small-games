"""Deploy the saved site revision and verify the versions actually served by Pages."""
import json
import os
import pathlib
import re
import sys
import time
import urllib.request


def request_json(url, token=None, payload=None):
    headers = {"Accept": "application/json", "User-Agent": "small-games-pages"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = None if payload is None else json.dumps(payload).encode()
    if data is not None:
        headers["Content-Type"] = "application/json"
    with urllib.request.urlopen(urllib.request.Request(url, data, headers), timeout=30) as response:
        body = response.read()
        return json.loads(body) if body else None


def verify(site, page_url, timeout=300):
    site = pathlib.Path(site)
    expected = {
        name: json.loads((site / name).read_text(encoding="utf-8"))
        for name in ("deployment.json", "dev/deployment.json", "test/deployment.json")
        if (site / name).is_file()
    }
    if "deployment.json" not in expected:
        raise ValueError("Missing production deployment metadata")
    deadline = time.monotonic() + timeout
    while True:
        try:
            for name, version in expected.items():
                actual = request_json(f"{page_url.rstrip('/')}/{name}?verify={time.time_ns()}")
                if actual != version:
                    raise ValueError(f"Stale Pages content at {name}: expected {version}, got {actual}")
            print(f"Verified live Pages versions: {expected}")
            return
        except (OSError, ValueError) as error:
            if time.monotonic() >= deadline:
                raise RuntimeError(f"Pages did not serve the published versions: {error}") from error
            time.sleep(10)


def publish(artifact_id, version, site):
    if not artifact_id.isdecimal() or not re.fullmatch(r"[0-9a-f]{40}", version):
        raise ValueError("Expected an artifact ID and the saved gh-pages commit SHA")
    endpoint = f"{os.environ['GITHUB_API_URL']}/repos/{os.environ['GITHUB_REPOSITORY']}/pages/deployments"
    token = os.environ["GH_TOKEN"]
    oidc = request_json(os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"], os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"])
    deployment = request_json(endpoint, token, {
        "artifact_id": int(artifact_id),
        # Source branches can share a SHA while the combined site differs.
        "pages_build_version": version,
        "oidc_token": oidc["value"],
    })
    status_url = f"{endpoint}/{deployment['id']}"
    deadline = time.monotonic() + 600
    try:
        while True:
            status = request_json(status_url, token)["status"]
            print(f"Pages {version}: {status}", flush=True)
            if status == "succeed":
                break
            if status in ("deployment_failed", "deployment_content_failed", "deployment_cancelled", "deployment_lost"):
                raise RuntimeError(f"Pages deployment failed: {status}")
            if time.monotonic() >= deadline:
                raise TimeoutError("Pages deployment exceeded 10 minutes")
            time.sleep(5)
    except Exception:
        try:
            request_json(status_url + "/cancel", token, {})
        except OSError:
            pass
        raise
    page_url = deployment["page_url"]
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
        output.write(f"page_url={page_url.rstrip('/')}/\n")
    verify(site, page_url)


if __name__ == "__main__":
    publish(*sys.argv[1:])

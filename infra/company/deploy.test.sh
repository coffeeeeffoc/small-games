#!/usr/bin/env bash
set -euo pipefail
source_script=$(cd "$(dirname "$0")" && pwd)/deploy.sh
workspace=$(mktemp -d /tmp/company-deploy-test-XXXXXXXX)
trap 'status=$?; if [[ $status != 0 && -f "$workspace/last.log" ]]; then cat "$workspace/last.log" >&2; fi; rm -rf -- "$workspace"; exit "$status"' EXIT
mkdir "$workspace/bin"
export COMPANY_FIXTURE_LOG="$workspace/commands.log"
cat > "$workspace/bin/docker" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$COMPANY_FIXTURE_LOG"
exit 99
MOCK
cat > "$workspace/bin/curl" <<'MOCK'
#!/usr/bin/env bash
set -eu
[[ "${COMPANY_FIXTURE_FAILURE:-}" != tls ]] || exit 60
if [[ "${COMPANY_FIXTURE_FAILURE:-}" == mismatch ]]; then echo wrong; else cat "$COMPANY_FIXTURE_BASE/current/site/release.json"; fi
MOCK
chmod +x "$workspace/bin/"*
export PATH="$workspace/bin:$PATH"
fixture() {
  base="$workspace/$1"
  caddy="$workspace/$1-caddy"
  mkdir -p "$base/releases/old/site" "$base/releases/new/site" "$caddy/current"
  printf '%s\n' "$base" > "$caddy/current/website-directory"
  for version in old new; do
    release="$base/releases/$version"
    cp "$source_script" "$release/deploy.sh"
    printf '<html>%s</html>\n' "$version" > "$release/site/index.html"
    printf '{"release":"%s"}\n' "$version" > "$release/site/release.json"
    (cd "$release" && sha256sum deploy.sh site/index.html site/release.json > SHA256SUMS)
  done
  # A legacy release can be restored without ever executing its old container script.
  printf 'exit 99\n' > "$base/releases/old/deploy.sh"
  (cd "$base/releases/old" && sha256sum deploy.sh site/index.html site/release.json > SHA256SUMS)
  ln -s "$base/releases/old" "$base/current"
  export COMPANY_FIXTURE_BASE="$base"
  export COMPANY_FIXTURE_FAILURE=''
  : > "$COMPANY_FIXTURE_LOG"
}
activate() { bash "$base/releases/new/deploy.sh" "$base" deploy example.com www.example.com "$caddy"; }
expect_failed() {
  if activate > "$workspace/last.log" 2>&1; then cat "$workspace/last.log"; echo 'Expected failure' >&2; exit 1; fi
  [[ ! -s "$COMPANY_FIXTURE_LOG" ]]
}
fixture success
activate > "$workspace/last.log" 2>&1
[[ $(readlink -f "$base/current") == "$base/releases/new" ]]
[[ $(readlink -f "$base/previous") == "$base/releases/old" ]]
bash "$source_script" "$base" rollback example.com www.example.com "$caddy" >> "$workspace/last.log" 2>&1
[[ $(readlink -f "$base/current") == "$base/releases/old" ]]
[[ $(readlink -f "$base/previous") == "$base/releases/new" ]]
[[ ! -s "$COMPANY_FIXTURE_LOG" ]]
echo 'PASS activate and explicit rollback without Docker or legacy scripts'
for failure in tls mismatch; do
  fixture "failure-$failure"
  export COMPANY_FIXTURE_FAILURE="$failure"
  expect_failed
  [[ $(readlink -f "$base/current") == "$base/releases/old" ]]
  [[ ! -e "$base/previous" ]]
  echo "PASS $failure failure restores previous website link"
done
fixture first
rm "$base/current"
export COMPANY_FIXTURE_FAILURE=tls
expect_failed
[[ ! -e "$base/current" && ! -L "$base/current" ]]
echo 'PASS first failure removes only website link'
fixture checksum
echo changed >> "$base/releases/new/site/release.json"
expect_failed
[[ $(readlink -f "$base/current") == "$base/releases/old" ]]
echo 'PASS tampered artifact stops before switching'
fixture no-gateway
rm "$caddy/current/website-directory"
expect_failed
[[ $(readlink -f "$base/current") == "$base/releases/old" ]]
echo 'PASS missing independent Caddy blocks publication'
fixture locked
(exec 7>"$caddy/deploy.lock"; flock 7; activate > "$workspace/last.log" 2>&1 && exit 99; exit 0)
[[ $(readlink -f "$base/current") == "$base/releases/old" ]]
echo 'PASS Caddy maintenance lock blocks website switch'

#!/usr/bin/env bash
set -euo pipefail
source_script=$(cd "$(dirname "$0")" && pwd)/deploy.sh
workspace=$(mktemp -d /tmp/caddy-deploy-test-XXXXXXXX)
trap 'status=$?; if [[ $status != 0 && -f "$workspace/last.log" ]]; then cat "$workspace/last.log" >&2; fi; rm -rf -- "$workspace"; exit "$status"' EXIT
mkdir "$workspace/bin"
export CADDY_FIXTURE_LOG="$workspace/commands.log"
cat > "$workspace/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$CADDY_FIXTURE_LOG"
if [[ "$1" == ps ]]; then
  echo game
  [[ "${CADDY_FIXTURE_FAILURE:-}" != port ]] || echo occupied
elif [[ "$1" == inspect ]]; then
  if [[ "$*" == *HostPort* ]]; then
    if [[ "$2" == game ]]; then echo 8080; else echo 80; fi
  else echo small-games; fi
elif [[ "$1" == volume && "${CADDY_FIXTURE_FAILURE:-}" == volume ]]; then exit 1
elif [[ "$1" == compose ]]; then
  if [[ "$*" == *' run '* && "${CADDY_FIXTURE_FAILURE:-}" == config ]]; then exit 3; fi
  if [[ "$*" == *'/new/compose.yaml up '* && "${CADDY_FIXTURE_FAILURE:-}" == up ]]; then exit 42; fi
fi
MOCK
cat > "$workspace/bin/ss" <<'MOCK'
#!/usr/bin/env bash
exit 0
MOCK
cat > "$workspace/bin/curl" <<'MOCK'
#!/usr/bin/env bash
set -eu
[[ "${CADDY_FIXTURE_FAILURE:-}" != tls ]] || exit 60
cat "$CADDY_FIXTURE_WEBSITE/current/site/release.json"
MOCK
chmod +x "$workspace/bin/"*
export PATH="$workspace/bin:$PATH"
fixture() {
  base="$workspace/$1-caddy"
  website="$workspace/$1-company"
  mkdir -p "$base/releases/old" "$base/releases/new" "$website/releases/legacy/site"
  for version in old new; do
    release="$base/releases/$version"
    cp "$source_script" "$release/deploy.sh"
    printf 'name: company-web\n' > "$release/compose.yaml"
    printf '%s\n' "$website" > "$release/website-directory"
    (cd "$release" && sha256sum compose.yaml deploy.sh website-directory > SHA256SUMS)
  done
  printf '{}\n' > "$website/releases/legacy/site/release.json"
  printf 'name: company-web\n' > "$website/releases/legacy/compose.yaml"
  ln -s "$website/releases/legacy" "$website/current"
  export CADDY_FIXTURE_WEBSITE="$website"
  export CADDY_FIXTURE_FAILURE=''
  : > "$CADDY_FIXTURE_LOG"
}
activate() { bash "$base/releases/new/deploy.sh" "$base" "$website" example.com www.example.com; }
expect_failed() { if activate > "$workspace/last.log" 2>&1; then cat "$workspace/last.log"; echo 'Expected failure' >&2; exit 1; fi; }
fixture migration
activate > "$workspace/last.log" 2>&1
[[ $(readlink -f "$base/current") == "$base/releases/new" ]]
[[ $(readlink -f "$base/previous") == "$website/releases/legacy" ]]
[[ $(readlink -f "$website/current") == "$website/releases/legacy" ]]
echo 'PASS Caddy migration and website mount'
for layout in legacy independent; do
  for failure in up tls; do
    fixture "$layout-$failure"
    fallback="$website/releases/legacy"
    if [[ "$layout" == independent ]]; then ln -s "$base/releases/old" "$base/current"; fallback="$base/releases/old"; fi
    export CADDY_FIXTURE_FAILURE="$failure"
    expect_failed
    grep -F "$fallback/compose.yaml up" "$CADDY_FIXTURE_LOG" >/dev/null
    [[ $(readlink -f "$website/current") == "$website/releases/legacy" ]]
    if [[ "$layout" == independent ]]; then [[ $(readlink -f "$base/current") == "$fallback" ]]; else [[ ! -L "$base/current" ]]; fi
    echo "PASS $layout $failure restores old configuration"
  done
done
for failure in config port volume; do
  fixture "failure-$failure"
  export CADDY_FIXTURE_FAILURE="$failure"
  expect_failed
  ! grep -F ' up ' "$CADDY_FIXTURE_LOG"
  ! grep -F ' down' "$CADDY_FIXTURE_LOG"
  [[ ! -L "$base/current" ]]
  echo "PASS $failure stops before changing containers"
done
fixture checksum
echo changed >> "$base/releases/new/compose.yaml"
expect_failed
[[ ! -s "$CADDY_FIXTURE_LOG" ]]
echo 'PASS checksum stops before Docker'

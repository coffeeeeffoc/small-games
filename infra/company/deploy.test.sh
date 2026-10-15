#!/usr/bin/env bash
set -euo pipefail
source_script=$(cd "$(dirname "$0")" && pwd)/deploy.sh
workspace=$(mktemp -d /tmp/company-deploy-test-XXXXXXXX)
trap 'status=$?; if [[ $status != 0 && -f "$workspace/last.log" ]]; then cat "$workspace/last.log" >&2; fi; rm -rf -- "$workspace"; exit "$status"' EXIT
mkdir "$workspace/bin"
export COMPANY_FIXTURE_LOG="$workspace/commands.log"
cat > "$workspace/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$COMPANY_FIXTURE_LOG"
if [[ "$1" == ps ]]; then
  echo game
  [[ "${COMPANY_FIXTURE_FAILURE:-}" != port ]] || echo occupied
elif [[ "$1" == inspect ]]; then
  if [[ "$*" == *HostPort* ]]; then
    if [[ "$2" == game ]]; then echo 8080; else echo 80; fi
  else
    echo small-games
  fi
elif [[ "$1" == compose ]]; then
  file=''
  for arg in "$@"; do [[ "$arg" != */compose.yaml ]] || file="$arg"; done
  if [[ "$*" == *' run '* && "${COMPANY_FIXTURE_FAILURE:-}" == config ]]; then exit 3; fi
  if [[ "$*" == *' up '* && "$file" == */new/compose.yaml && "${COMPANY_FIXTURE_FAILURE:-}" == up ]]; then exit 42; fi
fi
MOCK
cat > "$workspace/bin/ss" <<'MOCK'
#!/usr/bin/env bash
exit 0
MOCK
cat > "$workspace/bin/curl" <<'MOCK'
#!/usr/bin/env bash
set -eu
[[ "${COMPANY_FIXTURE_FAILURE:-}" != tls ]] || exit 60
cat "$COMPANY_FIXTURE_TARGET/site/release.json"
MOCK
chmod +x "$workspace/bin/"*
export PATH="$workspace/bin:$PATH"
fixture() {
  base="$workspace/$1"
  mkdir -p "$base/releases/old/site" "$base/releases/new/site"
  for version in old new; do
    release="$base/releases/$version"
    cp "$source_script" "$release/deploy.sh"
    printf 'name: company-web\n' > "$release/compose.yaml"
    printf '{"release":"%s"}\n' "$version" > "$release/site/release.json"
    (cd "$release" && sha256sum compose.yaml deploy.sh site/release.json > SHA256SUMS)
  done
  ln -s "$base/releases/old" "$base/current"
  export COMPANY_FIXTURE_TARGET="$base/releases/new"
  export COMPANY_FIXTURE_FAILURE=''
  : > "$COMPANY_FIXTURE_LOG"
}
activate() { bash "$base/releases/new/deploy.sh" "$base" deploy example.com www.example.com; }
expect_failed() {
  if activate > "$workspace/last.log" 2>&1; then cat "$workspace/last.log"; echo 'Expected failure' >&2; exit 1; fi
}

fixture success
activate > "$workspace/last.log" 2>&1
[[ $(readlink -f "$base/current") == "$base/releases/new" ]]
[[ $(readlink -f "$base/previous") == "$base/releases/old" ]]
export COMPANY_FIXTURE_TARGET="$base/releases/old"
bash "$base/current/deploy.sh" "$base" rollback example.com www.example.com >> "$workspace/last.log" 2>&1
[[ $(readlink -f "$base/current") == "$base/releases/old" ]]
[[ $(readlink -f "$base/previous") == "$base/releases/new" ]]
echo 'PASS activate and explicit rollback'
echo 'PASS existing game host port 8080 is ignored'

for failure in up tls; do
  fixture "failure-$failure"
  export COMPANY_FIXTURE_FAILURE="$failure"
  expect_failed
  [[ $(readlink -f "$base/current") == "$base/releases/old" ]]
  grep -F "$base/releases/old/compose.yaml up" "$COMPANY_FIXTURE_LOG" >/dev/null
  echo "PASS $failure failure restores previous container"
done

fixture first
rm "$base/current"
export COMPANY_FIXTURE_FAILURE=up
expect_failed
[[ ! -e "$base/current" ]]
grep -F "$base/releases/new/compose.yaml down" "$COMPANY_FIXTURE_LOG" >/dev/null
echo 'PASS first failure closes company entry'

for failure in config port; do
  fixture "failure-$failure"
  export COMPANY_FIXTURE_FAILURE="$failure"
  expect_failed
  [[ $(readlink -f "$base/current") == "$base/releases/old" ]]
  ! grep -F ' up ' "$COMPANY_FIXTURE_LOG"
  ! grep -F ' down' "$COMPANY_FIXTURE_LOG"
  echo "PASS $failure fails without altering live containers"
done

fixture checksum
echo 'changed' >> "$base/releases/new/site/release.json"
expect_failed
! grep -F 'compose ' "$COMPANY_FIXTURE_LOG"
echo 'PASS tampered artifact stops before any compose operation'

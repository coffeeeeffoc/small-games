#!/usr/bin/env bash
set -Eeuo pipefail

base=${1:?deployment directory required}
mode=${2:?deploy or rollback required}
domain=${3:?primary domain required}
www=${4:?www domain required}
caddy=${5:?Caddy directory required}
[[ "$base" =~ ^/([a-zA-Z0-9_-]+/)+[a-zA-Z0-9_-]+$ && "$caddy" =~ ^/([a-zA-Z0-9_-]+/)+[a-zA-Z0-9_-]+$ ]] || exit 2
[[ "$domain" =~ ^[a-z0-9.-]+$ && "$www" =~ ^[a-z0-9.-]+$ ]] || exit 2
[[ "$mode" == deploy || "$mode" == rollback ]] || exit 2
mkdir -p "$base"
exec 9>"$base/deploy.lock"
flock -n 9 || { echo 'Another company deployment is running.' >&2; exit 1; }
# Shared with Caddy maintenance so it cannot race a website switch.
exec 8>"$caddy/deploy.lock"
flock -n 8 || { echo 'Caddy maintenance is running.' >&2; exit 1; }
[[ $(cat "$caddy/current/website-directory") == "$base" ]] || {
  echo 'Deploy the independent Caddy configuration first.' >&2; exit 1;
}
old=$(readlink -f "$base/current" || true)
if [[ "$mode" == rollback ]]; then
  target=$(readlink -f "$base/previous" || true)
else
  target=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
fi
valid_release() {
  [[ "$(dirname "$1")" == "$base/releases" && -f "$1/site/release.json" && -f "$1/site/index.html" ]]
}
valid_release "$target" || { echo 'Missing company release.' >&2; exit 1; }
if [[ -n "$old" && "$old" != "$base/current" ]]; then valid_release "$old" || exit 1; else old=''; fi
(cd "$target" && sha256sum -c SHA256SUMS)
switch_to() {
  ln -sfn "$1" "$base/current.next"
  mv -Tf "$base/current.next" "$base/current"
}
restore() {
  status=$?
  trap - ERR HUP INT TERM
  echo 'Company activation failed; restoring the previous website link.' >&2
  if [[ -n "$old" ]]; then switch_to "$old"; else rm -f "$base/current"; fi
  exit "$status"
}
trap restore ERR
trap 'false' HUP INT TERM
switch_to "$target"
for host in "$domain" "$www"; do
  if ! actual=$(curl --noproxy '*' --fail --silent --show-error --location --retry 3 --retry-all-errors --retry-delay 1 --connect-timeout 5 --max-time 10 --resolve "$domain:443:127.0.0.1" --resolve "$www:443:127.0.0.1" "https://$host/release.json"); then
    false
  fi
  [[ "$actual" == "$(cat "$target/site/release.json")" ]]
done
if [[ -n "$old" && "$old" != "$target" ]]; then
  ln -sfn "$old" "$base/previous.next"
  mv -Tf "$base/previous.next" "$base/previous"
fi
trap - ERR HUP INT TERM
printf 'COMPANY_ACTIVE=%s\n' "$target"

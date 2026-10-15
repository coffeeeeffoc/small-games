#!/usr/bin/env bash
set -Eeuo pipefail

base=${1:?deployment directory required}
mode=${2:?deploy or rollback required}
domain=${3:?primary domain required}
www=${4:?www domain required}
[[ "$base" =~ ^/([a-zA-Z0-9_-]+/)+[a-zA-Z0-9_-]+$ ]] || exit 2
[[ "$domain" =~ ^[a-z0-9.-]+$ && "$www" =~ ^[a-z0-9.-]+$ ]] || exit 2
[[ "$mode" == deploy || "$mode" == rollback ]] || exit 2
mkdir -p "$base"
exec 9>"$base/deploy.lock"
flock -n 9 || { echo 'Another company deployment is running.' >&2; exit 1; }

old=$(readlink -f "$base/current" || true)
if [[ "$mode" == rollback ]]; then
  target=$(readlink -f "$base/previous" || true)
else
  target=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
fi
[[ "$target" == "$base"/releases/* && -f "$target/compose.yaml" ]] || { echo 'Missing company release.' >&2; exit 1; }
if [[ -n "$old" && "$old" != "$base/current" ]]; then
  [[ "$old" == "$base"/releases/* && -f "$old/compose.yaml" ]] || exit 1
else
  old=''
fi

# Reject port owners outside this Compose project; never stop an existing service.
for port in 80 443; do
  company_owns_port=false
  for id in $(docker ps -q); do
    bindings=$(docker inspect "$id" --format '{{range .NetworkSettings.Ports}}{{range .}}{{println .HostPort}}{{end}}{{end}}')
    if ! grep -qx "$port" <<< "$bindings"; then continue; fi
    owner=$(docker inspect "$id" --format '{{index .Config.Labels "com.docker.compose.project"}}')
    [[ "$owner" == company-web ]] || { echo "Port $port belongs to another container." >&2; exit 1; }
    company_owns_port=true
  done
  if ss -H -ltn "sport = :$port" | grep -q .; then
    [[ "$company_owns_port" == true ]] || {
      echo "Port $port is occupied by another service." >&2; exit 1;
    }
  fi
done

compose() { docker compose --project-name company-web --env-file /dev/null -f "$1/compose.yaml" "${@:2}"; }
(cd "$target" && sha256sum -c SHA256SUMS)
compose "$target" run --rm --no-deps --interactive=false -T --entrypoint nginx web -t

restore() {
  status=$?
  trap - ERR
  echo 'Company activation failed; restoring the previous release.' >&2
  if [[ -n "$old" ]]; then
    compose "$old" up -d --wait --wait-timeout 90 || echo 'ROLLBACK FAILED: inspect company-web manually.' >&2
  else
    compose "$target" down || true
  fi
  exit "$status"
}
trap restore ERR
compose "$target" up -d --wait --wait-timeout 90
for host in "$domain" "$www"; do
  if ! actual=$(curl --noproxy '*' --fail --silent --show-error --retry 4 --retry-delay 1 --connect-timeout 5 --max-time 15 --resolve "$host:443:127.0.0.1" "https://$host/release.json"); then
    false # Trigger one rollback in the parent shell, not another inside command substitution.
  fi
  [[ "$actual" == "$(cat "$target/site/release.json")" ]]
done
if [[ -n "$old" && "$old" != "$target" ]]; then
  ln -sfn "$old" "$base/previous.next"
  mv -Tf "$base/previous.next" "$base/previous"
fi
ln -sfn "$target" "$base/current.next"
mv -Tf "$base/current.next" "$base/current"
trap - ERR
printf 'COMPANY_ACTIVE=%s\n' "$target"

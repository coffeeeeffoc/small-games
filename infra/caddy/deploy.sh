#!/usr/bin/env bash
set -Eeuo pipefail
base=${1:?Caddy directory required}
website=${2:?website directory required}
domain=${3:?primary domain required}
www=${4:?www domain required}
for directory in "$base" "$website"; do [[ "$directory" =~ ^/([a-zA-Z0-9_-]+/)+[a-zA-Z0-9_-]+$ ]] || exit 2; done
[[ "$domain" =~ ^[a-z0-9.-]+$ && "$www" =~ ^[a-z0-9.-]+$ ]] || exit 2
exec 9>"$base/deploy.lock"
flock -n 9 || { echo 'Another Caddy/website deployment is running.' >&2; exit 1; }
target=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
[[ $(dirname "$target") == "$base/releases" ]] || exit 2
[[ $(cat "$target/website-directory") == "$website" ]] || exit 2
test -f "$website/current/site/release.json"
(cd "$target" && sha256sum -c SHA256SUMS)
old=$(readlink -f "$base/current" || true)
if [[ -f "$old/compose.yaml" ]]; then
  [[ $(dirname "$old") == "$base/releases" ]] || exit 2
else
  old=''
fi
# The legacy website release is only a migration fallback, never a publication script.
fallback=$old
if [[ -z "$fallback" && -f "$website/current/compose.yaml" ]]; then fallback=$(readlink -f "$website/current"); fi
if [[ -f "$target/ingress.json" ]]; then
  # Caddy lock is held; the proxy-only transaction takes the game lock second.
  exec python3 "$target/ingress.py" "$base" "$website" "$domain" "$www"
fi
if [[ -f "$old/ingress.json" || -e /opt/small-games/ingress-managed || -L /opt/small-games/ingress-managed ]]; then
  echo 'Managed ingress must be retained; refusing a website-only Caddy candidate.' >&2
  exit 1
fi
for port in 80 443; do
  owns_port=false
  for id in $(docker ps -q); do
    bindings=$(docker inspect "$id" --format '{{range .NetworkSettings.Ports}}{{range .}}{{println .HostPort}}{{end}}{{end}}')
    if ! grep -qx "$port" <<< "$bindings"; then continue; fi
    owner=$(docker inspect "$id" --format '{{index .Config.Labels "com.docker.compose.project"}}')
    [[ "$owner" == company-web ]] || { echo "Port $port belongs to another container." >&2; exit 1; }
    owns_port=true
  done
  if ss -H -ltn "sport = :$port" | grep -q .; then
    [[ "$owns_port" == true ]] || { echo "Port $port is occupied by another service." >&2; exit 1; }
  fi
done
# Existing volumes are mandatory: never silently replace certificate storage.
docker volume inspect company-web_caddy_data company-web_caddy_config >/dev/null
compose() { docker compose --project-name company-web --env-file /dev/null -f "$1/compose.yaml" "${@:2}"; }
compose "$target" run --rm --no-deps --interactive=false -T --entrypoint caddy web validate --config /etc/caddy/Caddyfile --adapter caddyfile
restore() {
  status=$?
  trap - ERR HUP INT TERM
  echo 'Caddy activation failed; restoring previous configuration.' >&2
  if [[ -n "$fallback" ]]; then
    compose "$fallback" up -d --wait --wait-timeout 90 || echo 'CADDY ROLLBACK FAILED: inspect manually.' >&2
  else
    compose "$target" down || true
  fi
  if [[ -n "$old" ]]; then ln -sfn "$old" "$base/current.next"; mv -Tf "$base/current.next" "$base/current"; else rm -f "$base/current"; fi
  exit "$status"
}
trap restore ERR
trap 'false' HUP INT TERM
compose "$target" up -d --wait --wait-timeout 90
for host in "$domain" "$www"; do
  if ! actual=$(curl --noproxy '*' --fail --silent --show-error --location --retry 15 --retry-all-errors --retry-delay 2 --connect-timeout 5 --max-time 10 --resolve "$domain:443:127.0.0.1" --resolve "$www:443:127.0.0.1" "https://$host/release.json"); then false; fi
  [[ "$actual" == "$(cat "$website/current/site/release.json")" ]]
done
if [[ -n "$fallback" && "$fallback" != "$target" ]]; then
  ln -sfn "$fallback" "$base/previous.next"
  mv -Tf "$base/previous.next" "$base/previous"
fi
ln -sfn "$target" "$base/current.next"
mv -Tf "$base/current.next" "$base/current"
trap - ERR HUP INT TERM
printf 'CADDY_ACTIVE=%s\n' "$target"

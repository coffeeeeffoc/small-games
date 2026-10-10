#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
for command in node docker flock; do
  command -v "$command" >/dev/null || { echo "Missing deployment command: $command" >&2; exit 1; }
done
test -f manifest.json || { echo 'Not a completed deployment bundle.' >&2; exit 1; }
test -f .env || { echo 'Copy .env.example to .env and fill selected service variables.' >&2; exit 1; }
chmod 600 .env
# Private checkout/transport umasks must not make Nginx assets unreadable.
chmod a+r nginx.conf
if [[ -d site ]]; then chmod -R a+rX site; fi
exec 9>../small-games-bundle.deploy.lock
flock -n 9 || { echo 'Another bundle deployment is running in this release parent.' >&2; exit 1; }
node validate-env.mjs
compose() { docker compose --project-name small-games-bundle --env-file .env -f compose.yaml "$@"; }
compose config --quiet
docker_version=$(docker version --format '{{.Server.Version}}')
[[ "${docker_version%%.*}" =~ ^[0-9]+$ ]] && (( ${docker_version%%.*} >= 28 )) || {
  echo 'Docker Engine 28+ is required for loopback port isolation.' >&2; exit 1;
}
mapfile -t selected < <(node -e "process.stdout.write(JSON.parse(require('node:fs').readFileSync('manifest.json','utf8')).services.join('\\n'))")
if (( ${#selected[@]} )); then
  compose build "${selected[0]}"
fi
# Nginx resolves upstreams after application containers start; syntax is checked then.
if compose config --services | grep -qx postgres; then
  compose up -d --wait --wait-timeout 180 postgres
  mkdir -p ../backups
  release=$(node -e "process.stdout.write(JSON.parse(require('node:fs').readFileSync('manifest.json','utf8')).release)")
  backup="../backups/$release-$(date -u +%Y%m%dT%H%M%S).dump"
  compose exec -T postgres pg_dump -U platform_owner -d small_games -Fc > "$backup.tmp"
  mv -- "$backup.tmp" "$backup"
  for migration in bootstrap.sql migrations/*.sql; do
    compose exec -T postgres psql -X -U platform_owner -d small_games -v ON_ERROR_STOP=1 < "$migration"
  done
fi
if (( ${#selected[@]} )); then
  compose up -d --no-build --wait --wait-timeout 180 "${selected[@]}"
fi
compose run --rm --no-deps gateway nginx -t
compose up -d --no-deps --remove-orphans --wait --wait-timeout 120 gateway
echo 'Bundle ready at host loopback http://localhost:8080. No public listener was opened.'

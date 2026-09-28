#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
# Generated locally from validated values, never from an arbitrary shell file.
set -a
source .env
set +a
compose() { docker compose --project-name small-games --env-file .env -f compose.yaml "$@"; }
for command in docker flock curl; do
    command -v "$command" >/dev/null || { echo "Missing server command: $command" >&2; exit 1; }
done
docker compose version >/dev/null
for certificate in fullchain.pem privkey.pem; do
    test -r "$ECS_TLS_DIR/$certificate" || { echo "Missing/unreadable TLS file: $ECS_TLS_DIR/$certificate" >&2; exit 1; }
done
mkdir -p "$ECS_DEPLOY_DIR"/{backups,nginx-extra,www}
exec 9>"$ECS_DEPLOY_DIR/deploy.lock"
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
previous=$(readlink -f "$ECS_DEPLOY_DIR/current" || true)
switched=false
failed() {
    local result=$?
    trap - ERR
    echo 'Deployment failed; database/COS releases are retained.' >&2
    if $switched && [[ -n "$previous" && "$previous" != "$PWD" && -f "$previous/.env" ]]; then
        echo 'Restoring previous application containers (database migrations are not reversed).' >&2
        # Avoid current release variables overriding the previous compose env file.
        ( set -a; source "$previous/.env"; set +a
          docker compose --project-name small-games --env-file "$previous/.env" -f "$previous/compose.yaml" up -d --no-build --wait --wait-timeout 180 runtime kart nginx ) || true
    fi
    exit "$result"
}
trap failed ERR
compose config --quiet
compose build runtime
# Validate TLS, syntax and extra website configs before touching the running application.
compose run --rm --no-deps nginx nginx -t
compose up -d --wait --wait-timeout 180 postgres
backup="$ECS_DEPLOY_DIR/backups/$RELEASE_ID.dump"
compose exec -T postgres pg_dump -U platform_owner -d small_games -Fc > "$backup.tmp"
mv -- "$backup.tmp" "$backup"
for migration in bootstrap.sql migrations/*.sql; do
    compose exec -T postgres psql -X -U platform_owner -d small_games -v ON_ERROR_STOP=1 < "$migration"
done
switched=true
compose up -d --no-build --wait --wait-timeout 180 runtime kart
compose up -d --no-build --no-deps --wait --wait-timeout 180 nginx
for url in /health /health/kart "/releases/$RELEASE_ID/index.html"; do
    curl --fail --silent --show-error --max-time 30 \
        --resolve "$GAME_DOMAIN:443:127.0.0.1" "https://$GAME_DOMAIN$url" -o /dev/null
done
ln -s "$PWD" "$ECS_DEPLOY_DIR/.current-$RELEASE_ID"
mv -Tf -- "$ECS_DEPLOY_DIR/.current-$RELEASE_ID" "$ECS_DEPLOY_DIR/current"
echo "Ready: https://$GAME_DOMAIN (release $RELEASE_ID)"

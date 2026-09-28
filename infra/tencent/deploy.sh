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
DEPLOY_MODE=${DEPLOY_MODE:-public}
if [[ "$DEPLOY_MODE" == internal ]]; then
    docker_version=$(docker version --format '{{.Server.Version}}')
    [[ "${docker_version%%.*}" =~ ^[0-9]+$ ]] && (( ${docker_version%%.*} >= 28 )) || {
        echo "Internal mode requires Docker Engine 28+ for loopback port isolation; found $docker_version." >&2; exit 1;
    }
else
for certificate in fullchain.pem privkey.pem; do
    test -r "$ECS_TLS_DIR/$certificate" || { echo "Missing/unreadable TLS file: $ECS_TLS_DIR/$certificate" >&2; exit 1; }
done
fi
mkdir -p "$ECS_DEPLOY_DIR"/{backups,nginx-extra,www}
exec 9>"$ECS_DEPLOY_DIR/deploy.lock"
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
previous=$(readlink -f "$ECS_DEPLOY_DIR/current" || true)
switched=false
failed() {
    local result=$?
    trap - ERR
    echo 'Deployment failed; database/COS releases are retained.' >&2
    if [[ "$DEPLOY_MODE" == internal ]]; then
        # Never restore a previous public listener after an internal deployment fails.
        compose stop nginx || true
    elif $switched && [[ -n "$previous" && "$previous" != "$PWD" && -f "$previous/.env" ]]; then
        echo 'Restoring previous application containers (database migrations are not reversed).' >&2
        # Avoid current release variables overriding the previous compose env file.
        ( set -a; source "$previous/.env"; set +a
          docker compose --project-name small-games --env-file "$previous/.env" -f "$previous/compose.yaml" up -d --no-build --wait --wait-timeout 180 runtime kart nginx ) || true
    fi
    exit "$result"
}
trap failed ERR
# tar extraction runs under umask 077. Container node/nginx users must read code/assets,
# while .env, backups and the release directory itself remain private to the deploy user.
chmod -R a+rX backend nginx
if [[ -d site ]]; then chmod -R a+rX site; fi
compose config --quiet
if [[ "$DEPLOY_MODE" == internal ]]; then
    # Close any previous public listener before starting work on this deployment.
    compose stop nginx
fi
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
    if [[ "$DEPLOY_MODE" == internal ]]; then
        curl --fail --silent --show-error --max-time 30 "http://127.0.0.1:8080$url" -o /dev/null
    else
    curl --fail --silent --show-error --max-time 30 \
        --resolve "$GAME_DOMAIN:443:127.0.0.1" "https://$GAME_DOMAIN$url" -o /dev/null
    fi
done
ln -s "$PWD" "$ECS_DEPLOY_DIR/.current-$RELEASE_ID"
mv -Tf -- "$ECS_DEPLOY_DIR/.current-$RELEASE_ID" "$ECS_DEPLOY_DIR/current"
echo "Ready ($DEPLOY_MODE): ${APP_ORIGIN:-https://${GAME_DOMAIN:-localhost}} (release $RELEASE_ID)"

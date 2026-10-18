import assert from 'node:assert/strict';
import { isIP } from 'node:net';
import { adminBaseCsp, adminUiPaths } from './admin-csp.mjs';

export const ingressDomain = 'api.nenggongzhiren.cn';
export const adminDomain = 'admin.nenggongzhiren.cn';
export const ingressNetwork = 'small-games-competition-ingress';
export const nginxImage = 'sha256:dc73b49f5124cf2ee538dfbdfbd121f0b4ccdcb20fea30f3a81bd477c02e2bb5';
export const caddyImage = 'sha256:f77f856a30f0004200b36b322d61da17fade31e24875699d77fb968399b9eb77';

function keys(value, expected) {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'Invalid ingress object');
  assert.deepEqual(
    Object.keys(value).sort(),
    [...expected].sort(),
    'Unknown/missing ingress fields',
  );
}
const address = (value) => {
  assert(isIP(value) === 4, 'Ingress requires exact IPv4 addresses');
  return value.split('.').reduce((result, octet) => result * 256 + Number(octet), 0);
};
const privateAddress = (value) =>
  (value >= 0x0a000000 && value <= 0x0affffff) ||
  (value >= 0xac100000 && value <= 0xac1fffff) ||
  (value >= 0xc0a80000 && value <= 0xc0a8ffff);

/** Non-secret, explicit topology. Host inventory must still prove it before activation. */
export function validateIngress(value) {
  keys(value, ['version', 'domain', 'deploymentDirectory', 'network', 'nginx', 'caddyImage']);
  assert.equal(value.version, 1);
  assert.equal(value.domain, ingressDomain, 'Only the approved API domain is supported');
  assert.equal(value.deploymentDirectory, '/opt/small-games');
  assert.equal(value.caddyImage, caddyImage, 'Use the reviewed cached Caddy image');
  keys(value.network, ['name', 'subnet', 'caddyIp', 'nginxIp']);
  assert.equal(value.network.name, ingressNetwork);
  assert.equal(typeof value.network.subnet, 'string');
  const [base, prefix, extra] = value.network.subnet.split('/');
  assert(!extra && /^(?:2[4-9])$/.test(prefix), 'Use a private /24 through /29 bridge');
  const start = address(base),
    size = 2 ** (32 - Number(prefix));
  assert(start % size === 0 && privateAddress(start) && privateAddress(start + size - 1));
  const hosts = [value.network.caddyIp, value.network.nginxIp].map(address);
  assert(hosts[0] !== hosts[1]);
  // Docker reserves the first host for the bridge gateway.
  assert(hosts.every((host) => host > start + 1 && host < start + size - 1));
  keys(value.nginx, ['image', 'legacyRelease', 'backendIp']);
  assert.equal(value.nginx.image, nginxImage, 'Use the reviewed cached Nginx image');
  assert.match(value.nginx.legacyRelease, /^\/opt\/small-games\/releases\/[a-z0-9-]+$/);
  assert(privateAddress(address(value.nginx.backendIp)));
  assert(address(value.nginx.backendIp) < start || address(value.nginx.backendIp) >= start + size);
  return structuredClone(value);
}

// Keep the public surface finite; arbitrary future /api routes are not published.
// Methods are also enforced: no DELETE/PUT, no catalog/projection/internal endpoints.
const internalCompetitionPaths = [
  '/api/competition/v1/sessions/(?:guest|platform|refresh|upgrade|logout)',
  '/api/competition/v1/me',
  '/api/competition/v1/boards/[A-Za-z0-9][A-Za-z0-9-]{0,79}',
  '/api/competition/v1/rooms(?:/(?:join|[A-F0-9]{12}(?:/(?:ready|leave|rematch|actions|role|initiative))?))?',
  '/api/competition/v1/runs/cops-robbers-realtime(?:/start)?',
  '/api/competition/v1/three-choose-two/(?:board|session(?:/[a-f0-9-]{36}(?:/(?:actions|finish))?)?)',
  '/api/competition/v1/carrom/rooms(?:/(?:join|[A-F0-9]{12}(?:/(?:settings|ready|start|rematch|leave|shoot))?))?',
  '/api/competition/v1/games/[A-Za-z0-9][A-Za-z0-9-]{0,79}(?:/leaderboards/[A-Za-z0-9][A-Za-z0-9-]{0,79}|/runs(?:/[a-f0-9-]{36}(?:/(?:actions|finish))?)?|/rooms(?:/(?:join|[A-F0-9]{12}(?:/(?:ready|leave|rematch|actions|role|initiative))?))?)?',
];
export const competitionIngressPaths = internalCompetitionPaths.flatMap((route) => [
  route.replace('/api/competition/v1/', '/small-games/v1/'),
  route,
]);
export const competitionIngressPattern = `^(?:${competitionIngressPaths.join('|')})$`;
export const managementIngressPattern =
  '^/api/(?:auth/github(?:/callback)?|session|refresh|logout|control/(?:catalog|state|audit|rollback|revisions(?:/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}/publish)?|members(?:/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}(?:/delete)?)?|roles(?:/[a-z][a-z0-9-]{0,47}(?:/delete)?)?))$';

export function renderAdminCaddy(ingress) {
  const config = validateIngress(ingress);
  const html = (name, forbidden = false) => `            route {
                @${name}Write not method GET HEAD
                respond @${name}Write 405
                request_header -If-None-Match
                request_header -If-Modified-Since
                request_header -If-Match
                request_header -If-Unmodified-Since
                request_header -Range
                request_header -If-Range
                rewrite * /index.html
                templates {
                    mime text/html
                }
                file_server${forbidden ? ' {\n                    status 403\n                }' : ''}
            }`;
  return `${adminDomain} {
    root * /srv/admin
    @published file {
        root /opt/small-games/admin-console/current/site
        try_files /index.html
    }
    header Cache-Control no-store
    header Referrer-Policy no-referrer
    header X-Content-Type-Options nosniff
    header Content-Security-Policy "${adminBaseCsp}"
    route {
        root @published /opt/small-games/admin-console/current/site
        @api path /api /api/*
        handle @api {
            reverse_proxy http://${config.network.nginxIp}:8083 {
                header_up Host ${adminDomain}
                header_up X-Forwarded-Host ${adminDomain}
                header_up X-Forwarded-For {remote_host}
                header_up X-Real-IP {remote_host}
                header_up X-Forwarded-Proto https
                header_up -Forwarded
                header_up -X-Competition-Internal-Key
                header_up -X-Management-Entry
            }
        }
        @forbidden path /forbidden
        handle @forbidden {
${html('forbidden', true)}
        }
        @pages path ${adminUiPaths.filter((route) => route !== '/forbidden').join(' ')}
        handle @pages {
${html('pages')}
        }
        @assets path /assets/* /mark.svg
        handle @assets {
            file_server
        }
        respond 404
    }
}
`;
}

export function renderApiCaddy(ingress) {
  const config = validateIngress(ingress);
  return `${config.domain} {
    route {
        @api {
            path_regexp competition "${competitionIngressPattern}"
            method GET POST OPTIONS
        }
        @health {
            path /health
            method GET HEAD
        }
        reverse_proxy @api http://${config.network.nginxIp}:8082 {
            header_up Host ${config.domain}
            header_up X-Forwarded-Host ${config.domain}
            header_up X-Forwarded-For {remote_host}
            header_up X-Real-IP {remote_host}
            header_up X-Forwarded-Proto https
            header_up -Forwarded
            header_up -X-Competition-Internal-Key
            header_up -X-Management-Entry
        }
        reverse_proxy @health http://${config.network.nginxIp}:8082 {
            header_up Host ${config.domain}
            header_up X-Forwarded-Host ${config.domain}
            header_up X-Forwarded-For {remote_host}
            header_up X-Real-IP {remote_host}
            header_up X-Forwarded-Proto https
            header_up -Forwarded
            header_up -X-Competition-Internal-Key
            header_up -X-Management-Entry
        }
        respond 404
    }
}
`;
}

export function renderIngressNginx(ingress) {
  const config = validateIngress(ingress);
  return `# Only this exact private peer may supply a client address.
map $realip_remote_addr $competition_edge_peer {
    default 0;
    ${config.network.caddyIp} 1;
}
map $uri $competition_public_path {
    default 0;
    "~${competitionIngressPattern}" 1;
}
limit_req_zone $binary_remote_addr zone=competition_ingress:10m rate=60r/s;
limit_req_zone $binary_remote_addr zone=management_ingress:10m rate=20r/s;
map $uri $management_public_path {
    default 0;
    "~${managementIngressPattern}" 1;
}
log_format competition_ingress '$remote_addr peer=$realip_remote_addr $request_method $uri $status';
server {
    listen ${config.network.nginxIp}:8082;
    server_name ${config.domain};
    server_tokens off;
    client_max_body_size 1m;
    resolver 127.0.0.11 valid=30s ipv6=off;
    set_real_ip_from ${config.network.caddyIp};
    real_ip_header X-Real-IP;
    real_ip_recursive off;
    if ($competition_edge_peer = 0) { return 404; }
    if ($host != ${config.domain}) { return 404; }
    # Reject ambiguous raw encodings before different HTTP parsers normalize them.
    if ($request_uri ~ "^[^?]*(%|//|/[.][.]?(/|[?]|$))") { return 404; }
    access_log /dev/stdout competition_ingress;
    location = /health {
        limit_except GET { deny all; }
        set $competition_runtime runtime:43002;
        proxy_pass http://$competition_runtime/health/live;
        proxy_set_header Host ${config.domain};
        proxy_set_header X-Forwarded-Host ${config.domain};
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Forwarded '';
        proxy_set_header X-Competition-Internal-Key '';
        proxy_set_header X-Management-Entry '';
        proxy_connect_timeout 3s;
        proxy_read_timeout 15s;
    }
    location ~ ^/(?:small-games|api/competition)/v1/ {
        if ($competition_public_path = 0) { return 404; }
        if ($request_method !~ ^(GET|POST|OPTIONS)$) { return 404; }
        limit_req zone=competition_ingress burst=120 nodelay;
        limit_req_status 429;
        set $competition_runtime runtime:43002;
        rewrite ^/small-games/v1/(.*)$ /api/competition/v1/$1 break;
        proxy_pass http://$competition_runtime;
        proxy_http_version 1.1;
        proxy_set_header Host ${config.domain};
        proxy_set_header X-Forwarded-Host ${config.domain};
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Forwarded '';
        proxy_set_header X-Competition-Internal-Key '';
        proxy_set_header X-Management-Entry '';
        proxy_connect_timeout 3s;
        proxy_read_timeout 15s;
    }
    location / { return 404; }
}
server {
    listen ${config.network.nginxIp}:8083;
    server_name ${adminDomain};
    server_tokens off;
    client_max_body_size 16k;
    resolver 127.0.0.11 valid=30s ipv6=off;
    resolver_timeout 2s;
    set_real_ip_from ${config.network.caddyIp};
    real_ip_header X-Real-IP;
    real_ip_recursive off;
    if ($competition_edge_peer = 0) { return 404; }
    if ($host != ${adminDomain}) { return 404; }
    if ($request_uri ~ "^[^?]*(%|//|/[.][.]?(/|[?]|$))") { return 404; }
    access_log /dev/stdout competition_ingress;
    # Upstream failure messages otherwise include OAuth query values.
    error_log /dev/null crit;
    default_type application/json;
    location = /api { return 404 '{"error":"NOT_FOUND"}'; }
    location /api/ {
        if ($management_public_path = 0) { return 404 '{"error":"NOT_FOUND"}'; }
        if ($request_method !~ ^(GET|POST|OPTIONS)$) { return 404 '{"error":"NOT_FOUND"}'; }
        limit_req zone=management_ingress burst=40 nodelay;
        limit_req_status 429;
        set $management_upstream management:43001;
        proxy_pass http://$management_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host ${adminDomain};
        proxy_set_header X-Forwarded-Host ${adminDomain};
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Forwarded '';
        proxy_set_header X-Competition-Internal-Key '';
        proxy_set_header X-Management-Entry admin;
        proxy_connect_timeout 3s;
        proxy_read_timeout 25s;
        proxy_intercept_errors on;
        error_page 502 503 504 =503 @management_unavailable;
    }
    location @management_unavailable { return 503 '{"error":"temporarily_unavailable"}'; }
    location / { return 404 '{"error":"NOT_FOUND"}'; }
}
`;
}

/** The only game-project service this release is allowed to recreate. */
export function renderNginxCompose(ingress, { legacy = false } = {}) {
  const config = validateIngress(ingress);
  return `name: small-games
services:
  nginx:
    image: ${config.nginx.image}
    restart: unless-stopped
    ports: ['127.0.0.1:8080:80']
    volumes:
${legacy ? `      - ${config.nginx.legacyRelease}/nginx:/etc/nginx/conf.d:ro` : `      - ./nginx:/etc/nginx/conf.d:ro\n      - ${config.nginx.legacyRelease}/nginx:/etc/nginx/legacy:ro`}
      - ${config.nginx.legacyRelease}/site:/srv/site:ro
    networks:
      backend:
        ipv4_address: ${config.nginx.backendIp}
${legacy ? '' : `      competition_ingress:\n        ipv4_address: ${config.network.nginxIp}\n`}    healthcheck:
      test: ['CMD', 'wget', '-q', '-O', '/dev/null', 'http://127.0.0.1:8080/health']
      interval: 5s
      timeout: 3s
      retries: 12
    logging:
      driver: json-file
      options: {max-size: 10m, max-file: '3'}
networks:
  backend:
    external: true
    name: small-games_default
${legacy ? '' : `  competition_ingress:\n    external: true\n    name: ${config.network.name}\n`}`;
}

export const ingressShellGuard = `# A managed ingress owns Nginx; legacy full-stack publication must not replace it.
if [[ -e "$ECS_DEPLOY_DIR/ingress-managed" || -L "$ECS_DEPLOY_DIR/ingress-managed" ]]; then
    echo 'Managed competition ingress is active; use deploy:caddy for proxy changes.' >&2
    exit 1
fi
`;
export const ingressPreflightGuard = `if [ -e '\${config.ECS_DEPLOY_DIR}/ingress-managed' ] || [ -L '\${config.ECS_DEPLOY_DIR}/ingress-managed' ]; then
  echo 'Managed competition ingress is active; legacy full-stack deployment is disabled.' >&2
  exit 1
fi
`;

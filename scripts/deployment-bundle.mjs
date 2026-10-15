import { execFileSync, spawn } from 'node:child_process';
import { cp, lstat, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { competitionService, serviceEnvironment } from './competition-service-config.mjs';
import { reconfigureH5Service } from './competition-h5-service.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const serviceNames = {
  runtime: '@coffeeeeffoc/runtime-api',
  management: '@coffeeeeffoc/management-api',
  kart: '@coffeeeeffoc/kart-server',
  tianxia: '@coffeeeeffoc/tianxia-server',
};
const sources = {
  runtime: [
    'services/runtime-api/dist',
    'services/runtime-api/rules',
    'games/local/cage-rescue/src/core.mjs',
    'games/local/cage-rescue/src/levels.mjs',
    'games/local/tower-brake/engine.mjs',
    'games/local/tower-brake/levels.mjs',
    'games/local/flick-arena/src',
    'games/local/three-choose-two/src',
    'games/local/carrom-club/src/core.mjs',
    'games/local/carrom-club/src/content.mjs',
    'games/local/carrom-club/src/friends-core.mjs',
    'games/local/carrom-club/src/friends-content.mjs',
    'games/local/cops-robbers/src',
    'games/local/cops-robbers-realtime/src',
    'games/local/letters-words2/engine.js',
    'games/local/vibeJam-myself-history-guess/src',
    'games/local/vibeJam-myself-history-guess/public',
    'games/submodules/xiangqi-five/game.js',
  ],
  management: [
    'services/management-api/dist',
    'games/local/game-cultivation/dist-content',
    'games/local/game-cultivation/src/manifest.json',
  ],
  kart: ['services/kart-server/src', 'games/local/carding-car/assets/scripts'],
  tianxia: [
    'services/tianxia-server/src',
    'games/local/tianxia-chalu/src/core',
    'games/local/tianxia-chalu/src/content',
  ],
};
const entrypoints = {
  runtime: 'services/runtime-api/dist/main.js',
  management: 'services/management-api/dist/main.js',
  kart: 'services/kart-server/src/main.ts',
  tianxia: 'services/tianxia-server/src/main.mjs',
};

export function bundleConfig(env = {}) {
  const gameService = competitionService({ env, local: true });
  const services = [
    ...new Set((env.DEPLOY_SERVICES ?? 'runtime,kart,tianxia').split(',').filter(Boolean)),
  ];
  if (services.some((name) => !Object.hasOwn(serviceNames, name)))
    throw new Error('DEPLOY_SERVICES must contain runtime, management, kart or tianxia');
  if (services.includes('kart') && !services.includes('runtime'))
    throw new Error('DEPLOY_SERVICES: kart requires runtime for authenticated result settlement');
  if (!['0', '1'].includes(env.DEPLOY_FRONTEND ?? '1'))
    throw new Error('DEPLOY_FRONTEND must be 0 or 1');
  const adMode = env.DEPLOY_H5_AD_MODE ?? 'mock';
  if (!['mock', 'off'].includes(adMode)) throw new Error('DEPLOY_H5_AD_MODE must be mock or off');
  const frontend = (env.DEPLOY_FRONTEND ?? '1') === '1';
  if (!services.length && !frontend) throw new Error('Select a frontend or at least one service');
  const release =
    env.DEPLOY_RELEASE ?? new Date().toISOString().replace(/[-:.]/g, '').toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(release)) throw new Error('Invalid DEPLOY_RELEASE');
  return {
    services,
    frontend,
    adMode,
    gameService,
    release,
    output: path.resolve(root, env.DEPLOY_OUTPUT_DIR ?? `.scratch/deployment/${release}`),
  };
}

// Frontend tools never inherit server-only credentials, including platform app secrets.
export function buildEnvironment(env) {
  const allowed =
    /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|TEMP|TMP|TMPDIR|CI|TERM|LANG|LC_[A-Z_]+|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|NODE_EXTRA_CA_CERTS|SSL_CERT_FILE|NPM_CONFIG_CAFILE|NPM_CONFIG_REGISTRY|NPM_EXECPATH|NPM_NODE_EXECPATH|NPM_CONFIG_USER_AGENT|NPM_COMMAND|PNPM_HOME|COREPACK_HOME|COCOS_CREATOR|KART_PREBUILT_DIR|NIGHT_OVERWATCH_PREBUILT_DIR|KART_SERVER_URL|COMPETITION_SERVICE_ENABLED|COMPETITION_PUBLIC_API_URL|H5_ADS_ENABLED|TAPTAP_(?:COPS_ROBBERS|COPS_ROBBERS_REALTIME|XIANGQI_FIVE)_AD_UNIT_ID|MINIGAME_RELEASE_GATES|(?:WECHAT|BILIBILI|DOUYIN|KUAISHOU|ALIPAY|TAPTAP)_APP_ID|VITE_[A-Z0-9_]+)$/;
  return Object.fromEntries(
    Object.entries(env).filter(
      ([key]) =>
        allowed.test(key.toUpperCase()) &&
        !/(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|CREDENTIAL)/i.test(key),
    ),
  );
}

export async function prepareSelectedBackend(destination, services, workspace = root) {
  const copy = async (name) => {
    const target = path.join(destination, name);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(path.join(workspace, name), target, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
  };
  for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) await copy(file);
  const manifests = new Map();
  for (const group of [
    'apps',
    'packages',
    'platforms',
    'services',
    'tools',
    'games/local',
    'games/submodules',
  ]) {
    const entries = await readdir(path.join(workspace, group), { withFileTypes: true }).catch(
      (error) => {
        if (error.code === 'ENOENT') return [];
        throw error;
      },
    );
    for (const entry of entries.filter((item) => item.isDirectory())) {
      const directory = `${group}/${entry.name}`;
      try {
        const manifest = JSON.parse(
          await readFile(path.join(workspace, directory, 'package.json'), 'utf8'),
        );
        manifests.set(manifest.name, { directory, manifest });
        await copy(`${directory}/package.json`);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
  const seen = new Set();
  const visit = async (name) => {
    if (seen.has(name)) return;
    seen.add(name);
    const item = manifests.get(name);
    if (!item) throw new Error(`Missing workspace manifest: ${name}`);
    if (item.directory.startsWith('packages/')) {
      // Several shared packages intentionally export Node 24-readable TS source.
      // Follow their declared entry directories instead of assuming every build emits dist.
      const exported = (value) =>
        typeof value === 'string'
          ? [value]
          : value && typeof value === 'object'
            ? Object.values(value).flatMap(exported)
            : [];
      const directories = new Set(
        exported(item.manifest.exports)
          .filter((value) => value.startsWith('./'))
          .map((value) => value.slice(2).split('/')[0]),
      );
      if (!directories.size) throw new Error(`No runtime exports declared: ${name}`);
      for (const directory of directories) await copy(`${item.directory}/${directory}`);
    }
    for (const [dependency, version] of Object.entries(item.manifest.dependencies ?? {}))
      if (version.startsWith('workspace:')) await visit(dependency);
  };
  for (const service of services) await visit(serviceNames[service]);
  for (const file of new Set(services.flatMap((service) => sources[service]))) await copy(file);
  for (const service of services) await stat(path.join(destination, entrypoints[service]));
}

const variable = (name, fallback) =>
  fallback === undefined ? `\${${name}:?required}` : `\${${name}:-${fallback}}`;
const health = (port) => ({
  test: [
    'CMD',
    'node',
    '-e',
    `fetch('http://127.0.0.1:${port}/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`,
  ],
  interval: '10s',
  timeout: '6s',
  retries: 12,
  start_period: '10s',
});
export function renderBundleCompose(config) {
  const logging = { driver: 'json-file', options: { 'max-size': '10m', 'max-file': '3' } };
  const services = {};
  const volumes = {};
  const database = config.services.some((service) => ['runtime', 'management'].includes(service));
  if (database) {
    volumes['postgres-data'] = {};
    services.postgres = {
      image: 'postgres:17.6-alpine',
      restart: 'unless-stopped',
      environment: {
        POSTGRES_USER: 'platform_owner',
        POSTGRES_DB: 'small_games',
        POSTGRES_PASSWORD: variable('POSTGRES_PASSWORD'),
        RUNTIME_DB_PASSWORD: variable('RUNTIME_DB_PASSWORD'),
        MANAGEMENT_DB_PASSWORD: variable('MANAGEMENT_DB_PASSWORD'),
      },
      volumes: ['postgres-data:/var/lib/postgresql/data'],
      healthcheck: {
        test: ['CMD-SHELL', 'pg_isready -U platform_owner -d small_games'],
        interval: '5s',
        timeout: '3s',
        retries: 24,
      },
      logging,
    };
  }
  for (const service of config.services) {
    const port = { runtime: 43002, management: 43001, kart: 43003, tianxia: 43004 }[service];
    const item = {
      image: `small-games-bundle:${config.release}`,
      build: { context: '.' },
      command: ['node', entrypoints[service]],
      init: true,
      restart: 'unless-stopped',
      environment: { NODE_ENV: 'production' },
      healthcheck: health(port),
      logging,
      security_opt: ['no-new-privileges:true'],
      cap_drop: ['ALL'],
    };
    const env = item.environment;
    if (['runtime', 'management'].includes(service)) {
      item.depends_on = { postgres: { condition: 'service_healthy' } };
      Object.assign(env, { HOST: '0.0.0.0', PORT: String(port), TRUST_PROXY: '1' });
    }
    if (service === 'runtime') {
      Object.assign(env, {
        RUNTIME_DATABASE_URL: `postgres://runtime_app:${variable('RUNTIME_DB_PASSWORD')}@postgres:5432/small_games`,
        COMPETITION_ENABLED: 'true',
        COMPETITION_ORIGINS: variable('APP_ORIGIN', 'http://localhost:8080'),
        COMPETITION_INTERNAL_KEY: variable('COMPETITION_INTERNAL_KEY'),
        COMPETITION_PLATFORM_CONFIG: variable('COMPETITION_PLATFORM_CONFIG', '[]'),
      });
    }
    if (service === 'management') {
      // The authoring API stays on host loopback; it is not a public game route.
      item.ports = ['127.0.0.1:43001:43001'];
      Object.assign(env, {
        MANAGEMENT_DATABASE_URL: `postgres://management_app:${variable('MANAGEMENT_DB_PASSWORD')}@postgres:5432/small_games`,
        STUDIO_ORIGIN: variable('STUDIO_ORIGIN'),
        S3_ENDPOINT: variable('S3_ENDPOINT'),
        S3_REGION: variable('S3_REGION', 'us-east-1'),
        S3_BUCKET: variable('S3_BUCKET'),
        S3_ACCESS_KEY_ID: variable('S3_ACCESS_KEY_ID'),
        S3_SECRET_ACCESS_KEY: variable('S3_SECRET_ACCESS_KEY'),
      });
    }
    if (service === 'kart') {
      item.network_mode = 'service:runtime';
      item.depends_on = { runtime: { condition: 'service_healthy', restart: true } };
      item.volumes = ['kart-outbox:/app/outbox'];
      volumes['kart-outbox'] = {};
      Object.assign(env, {
        HOST: '0.0.0.0',
        TRUST_PROXY: '1',
        KART_SERVER_PORT: String(port),
        KART_ALLOWED_ORIGINS: variable('APP_ORIGIN', 'http://localhost:8080'),
        KART_OUTBOX_DIR: '/app/outbox',
        COMPETITION_API_URL: 'http://127.0.0.1:43002/api/competition/v1',
        COMPETITION_INTERNAL_KEY: variable('COMPETITION_INTERNAL_KEY'),
      });
    }
    if (service === 'tianxia') {
      item.volumes = ['tianxia-results:/app/results'];
      volumes['tianxia-results'] = {};
      Object.assign(env, {
        TIANXIA_SERVER_HOST: '0.0.0.0',
        TIANXIA_SERVER_PORT: String(port),
        TIANXIA_ALLOWED_ORIGINS: variable('APP_ORIGIN', 'http://localhost:8080'),
        TIANXIA_DATA_DIR: '/app/results',
      });
    }
    services[service] = item;
  }
  services.gateway = {
    image: 'nginx:1.28-alpine',
    restart: 'unless-stopped',
    ports: ['127.0.0.1:8080:80'],
    volumes: [
      './nginx.conf:/etc/nginx/conf.d/default.conf:ro',
      ...(config.frontend ? ['./site:/srv/site:ro'] : []),
    ],
    depends_on: Object.fromEntries(
      config.services
        .filter((name) => name !== 'management')
        .map((name) => [name, { condition: 'service_healthy' }]),
    ),
    healthcheck: {
      test: ['CMD', 'wget', '-q', '-O', '/dev/null', 'http://127.0.0.1/health/gateway'],
      interval: '10s',
      timeout: '3s',
      retries: 12,
    },
    logging,
  };
  return { name: 'small-games-bundle', services, volumes };
}

export function renderBundleNginx(config) {
  const proxy = (route, endpoint, extra = '') => `    location ${route} {
        proxy_pass http://${endpoint};
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Competition-Internal-Key '';
        proxy_connect_timeout 3s;
        proxy_read_timeout 30s;
        ${extra}
    }`;
  return `limit_req_zone $binary_remote_addr zone=api:10m rate=20r/s;
map $http_upgrade $connection_upgrade { default upgrade; '' close; }
server {
    listen 80;
    server_tokens off;
    client_max_body_size 1m;
    add_header X-Content-Type-Options nosniff always;
    location = /health/gateway { return 200 'ok'; }
    location = /internal { return 404; }
    location ^~ /internal/ { return 404; }
    location = /api/competition/v1/internal { return 404; }
    location ^~ /api/competition/v1/internal/ { return 404; }
${config.services.includes('runtime') ? proxy('/api/competition/v1/', 'runtime:43002', 'limit_req zone=api burst=40 nodelay;') + '\n' + proxy('= /health/runtime', 'runtime:43002/health') : ''}
${config.services.includes('kart') ? proxy('= /kart', 'runtime:43003', 'proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection $connection_upgrade; proxy_read_timeout 75s; proxy_buffering off;') : ''}
${config.services.includes('tianxia') ? proxy('/tianxia/', 'tianxia:43004/', 'limit_req zone=api burst=40 nodelay;') : ''}
    ${config.frontend ? 'location / { root /srv/site; index index.html; try_files $uri $uri/ =404; }' : 'location / { return 404; }'}
}
`;
}

export async function prepareBundleSite(source, destination, services, adMode = 'mock', env = {}) {
  competitionService({ env, local: true });
  if (!['mock', 'off'].includes(adMode)) throw new Error('DEPLOY_H5_AD_MODE must be mock or off');
  await cp(source, destination, {
    recursive: true,
    dereference: false,
    filter: async (filename) => {
      if ((await lstat(filename)).isSymbolicLink())
        throw new Error('Static release must not contain symlinks');
      return true;
    },
  });
  const code = [
    `globalThis.SmallGamesPublishingConfig=Object.assign({},globalThis.SmallGamesPublishingConfig,{adMode:${JSON.stringify(adMode)}});`,
    ...(services.includes('runtime')
      ? [
          'globalThis.__COMPETITION_CONFIG__=Object.assign({},globalThis.__COMPETITION_CONFIG__,{apiUrl:location.origin+"/api/competition/v1"});',
        ]
      : []),
    ...(services.includes('kart')
      ? [
          'globalThis.__kartServerUrl=(location.protocol==="http:"?"ws://":"wss://")+location.host+"/kart";',
        ]
      : []),
  ].join('');
  let pages = 0;
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Static release must not contain symlinks');
      if (entry.isDirectory()) await visit(filename);
      else if (entry.name.endsWith('.html')) {
        const managed = await reconfigureH5Service(filename, env, true);
        const html = await readFile(filename, 'utf8');
        const pageCode = managed
          ? code
              .replace(/globalThis\.__COMPETITION_CONFIG__=.*?;/, '')
              .replace(/globalThis\.SmallGamesPublishingConfig=.*?;/, '')
          : code;
        if (!/<head(?:\s[^>]*)?>/i.test(html)) throw new Error(`Missing HTML head: ${filename}`);
        if (code)
          await writeFile(
            filename,
            html.replace(
              /<head(?:\s[^>]*)?>/i,
              (head) => `${head}<script data-deployment-runtime>${pageCode}</script>`,
            ),
          );
        pages++;
      }
    }
  };
  await stat(path.join(destination, 'index.html'));
  await visit(destination);
  return pages;
}

async function checksums(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;
    const filename = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Bundle contains symlink: ${relative}`);
    if (entry.isDirectory()) files.push(...(await checksums(filename, `${relative}/`)));
    else
      files.push({
        path: relative,
        sha256: createHash('sha256')
          .update(await readFile(filename))
          .digest('hex'),
      });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function backendBuildCommands(services) {
  const compiled = services.filter((name) => ['runtime', 'management'].includes(name));
  return [
    ...(compiled.length
      ? [
          [
            'exec',
            'turbo',
            'run',
            'build',
            ...compiled.map((service) => `--filter=${serviceNames[service]}...`),
            '--concurrency=1',
          ],
        ]
      : []),
    ...services
      .filter((name) => ['kart', 'tianxia'].includes(name))
      .map((service) => ['--filter', serviceNames[service], 'build']),
  ];
}

async function runPnpm(args, env) {
  if (!process.env.npm_execpath) throw new Error('Run using pnpm deployment:bundle');
  await new Promise((resolve, reject) => {
    const script = /\.[cm]?js$/i.test(process.env.npm_execpath);
    const child = spawn(
      script ? process.execPath : process.env.npm_execpath,
      script ? [process.env.npm_execpath, ...args] : args,
      {
        cwd: root,
        env: buildEnvironment(env),
        stdio: 'inherit',
      },
    );
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Build failed (${code}); no completed manifest was written`)),
    );
  });
}

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  if (args.includes('--help')) {
    console.log(
      'pnpm deployment:bundle [--check]\nDEPLOY_SERVICES=runtime,kart,tianxia DEPLOY_FRONTEND=1 DEPLOY_OUTPUT_DIR=.scratch/deployment/<release>\nReads .env.deployment.local then environment. Builds locally; does not upload or deploy.',
    );
    return;
  }
  if (args.some((arg) => !['--check', '--with-service', '--without-service'].includes(arg)))
    throw new Error('Unknown deployment:bundle argument');
  const local = await readFile(path.join(root, '.env.deployment.local'), 'utf8')
    .then(parseEnv)
    .catch((error) => {
      if (error.code === 'ENOENT') return {};
      throw error;
    });
  const env = serviceEnvironment(args, { ...local, ...process.env });
  const config = bundleConfig(env);
  if (args.includes('--check')) {
    console.log(JSON.stringify(config, null, 2));
    return;
  }
  // Never overwrite a previous release, source tree, or caller-owned directory.
  await mkdir(path.dirname(config.output), { recursive: true });
  await mkdir(config.output);
  if (config.frontend) await runPnpm(['build:pages'], env);
  for (const command of backendBuildCommands(config.services)) await runPnpm(command, env);
  if (config.services.length)
    await prepareSelectedBackend(path.join(config.output, 'backend'), config.services);
  const pages = config.frontend
    ? await prepareBundleSite(
        path.join(root, 'apps/shell-web/dist'),
        path.join(config.output, 'site'),
        config.services,
        config.adMode,
        env,
      )
    : 0;
  const templateDirectory = path.join(root, 'infra/deployment');
  for (const file of [
    'deploy.sh',
    'validate-env.mjs',
    '.env.example',
    'README.md',
    'initialize-operator.mjs',
  ])
    await cp(path.join(templateDirectory, file), path.join(config.output, file));
  await cp(
    path.join(templateDirectory, 'bootstrap.sql'),
    path.join(config.output, 'bootstrap.sql'),
  );
  await mkdir(path.join(config.output, 'migrations'));
  for (const file of (await readdir(path.join(root, 'infra/migrations'))).filter(
    (name) => /^\d+.*\.sql$/.test(name) && !name.startsWith('001-'),
  ))
    await cp(
      path.join(root, 'infra/migrations', file),
      path.join(config.output, 'migrations', file),
    );
  await writeFile(
    path.join(config.output, 'compose.yaml'),
    JSON.stringify(renderBundleCompose(config), null, 2) + '\n',
  );
  await writeFile(path.join(config.output, 'nginx.conf'), renderBundleNginx(config));
  const filters = config.services
    .map((service) => `--filter ${serviceNames[service]}...`)
    .join(' ');
  await writeFile(
    path.join(config.output, 'Dockerfile'),
    `# syntax=docker/dockerfile:1\nFROM node:24.21.0-bookworm-slim\nWORKDIR /app\nARG NPM_REGISTRY=https://registry.npmjs.org\nRUN --mount=type=secret,id=proxy_ca if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; npm install -g pnpm@12.6.0 --fetch-timeout=60000 --fetch-retries=2 --registry="$NPM_REGISTRY"\nCOPY --chown=node:node backend/ ./\nCOPY --chown=node:node initialize-operator.mjs /app/initialize-operator.mjs\nRUN --mount=type=secret,id=proxy_ca --mount=type=cache,id=small-games-bundle-pnpm12,target=/pnpm/store,sharing=locked if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; pnpm ${filters} install --prod --frozen-lockfile --ignore-scripts --fetch-timeout=60000 --network-concurrency=8 --store-dir=/pnpm/store --registry="$NPM_REGISTRY" && mkdir -p /app/outbox /app/results && chown node:node /app/outbox /app/results\nENV NODE_ENV=production\nUSER node\n`,
  );
  await writeFile(
    path.join(config.output, '.dockerignore'),
    '*\n!Dockerfile\n!backend/\n!backend/**\n!initialize-operator.mjs\n',
  );
  const manifest = {
    version: 1,
    release: config.release,
    services: config.services,
    frontend: config.frontend,
    adMode: config.adMode,
    pages,
    node: process.version,
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    sourceDirty: !!execFileSync('git', ['status', '--porcelain'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    createdAt: new Date().toISOString(),
    files: await checksums(config.output),
  };
  await writeFile(
    path.join(config.output, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  console.log(
    `Prepared deployment bundle: ${config.output} (${pages} HTML entries; ${config.services.join(', ') || 'frontend only'}). No server secrets copied; no deployment performed.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });

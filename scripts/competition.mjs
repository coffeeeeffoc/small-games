import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runCommand, runProcessGroup } from './platform-process.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const compose = ['compose', '-f', 'infra/docker/compose.yaml'];
const mode = process.argv[2] || 'dev';
const psql = async (input, database = 'small_games') =>
  runCommand(
    'docker',
    [
      ...compose,
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'platform_owner',
      '-d',
      database,
      '-v',
      'ON_ERROR_STOP=1',
    ],
    { cwd: root, input },
  );
if (mode === 'stop') {
  await runCommand('docker', [...compose, 'stop', 'postgres'], { cwd: root });
} else if (mode === 'up' || mode === 'test-db') {
  await runCommand('docker', [...compose, 'up', '-d', '--wait', 'postgres'], { cwd: root });
  if (mode === 'test-db') {
    await psql(
      "SELECT 'CREATE DATABASE competition_test OWNER platform_owner' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='competition_test')\\gexec\n",
    );
    await psql(
      'CREATE SCHEMA IF NOT EXISTS runtime AUTHORIZATION platform_owner; GRANT CONNECT ON DATABASE competition_test TO runtime_app; GRANT USAGE ON SCHEMA runtime TO runtime_app; CREATE TABLE IF NOT EXISTS runtime.schema_version(version integer PRIMARY KEY); INSERT INTO runtime.schema_version VALUES(1) ON CONFLICT DO NOTHING; GRANT SELECT ON runtime.schema_version TO runtime_app;',
      'competition_test',
    );
  }
  await psql(
    await readFile(new URL('../infra/migrations/010-competition.sql', import.meta.url)),
    mode === 'test-db' ? 'competition_test' : 'small_games',
  );
  await psql(
    await readFile(new URL('../infra/migrations/011-competition-profiles.sql', import.meta.url)),
    mode === 'test-db' ? 'competition_test' : 'small_games',
  );
} else if (mode === 'dev') {
  await mkdir(new URL('../.scratch/competition/', import.meta.url), { recursive: true });
  const keyFile = new URL('../.scratch/competition/internal-key', import.meta.url);
  let key;
  try {
    key = (await readFile(keyFile, 'utf8')).trim();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    key = randomBytes(32).toString('hex');
    await writeFile(keyFile, key);
  }
  const port = process.env.COMPETITION_PORT || '43002',
    gateway = process.env.COMPETITION_GATEWAY_PORT || '43010';
  const origins = [
    `http://127.0.0.1:${gateway}`,
    `http://localhost:${gateway}`,
    ...(process.env.COMPETITION_ORIGINS || '').split(',').filter(Boolean),
  ].join(',');
  const env = {
    ...process.env,
    COMPETITION_ENABLED: 'true',
    COMPETITION_INTERNAL_KEY: key,
    COMPETITION_ORIGINS: origins,
    RUNTIME_DATABASE_URL:
      process.env.RUNTIME_DATABASE_URL ||
      'postgres://runtime_app:local-runtime-only@127.0.0.1:15432/small_games',
    PORT: port,
    COMPETITION_API_URL: `http://127.0.0.1:${port}/api/competition/v1`,
    KART_SERVER_PORT: process.env.KART_SERVER_PORT || '43003',
    KART_ALLOWED_ORIGINS: origins,
    KART_OUTBOX_DIR: fileURLToPath(new URL('../.scratch/competition/kart-outbox', import.meta.url)),
  };
  // This runner intentionally starts no Management Service or Workspace Agent.
  const abort = new AbortController();
  process.once('SIGINT', () => abort.abort());
  process.once('SIGTERM', () => abort.abort());
  await runProcessGroup(
    [
      { command: process.execPath, args: ['services/runtime-api/dist/main.js'], env },
      { command: process.execPath, args: ['services/kart-server/src/main.ts'], env },
      { command: process.execPath, args: ['scripts/competition-gateway.mjs'], env },
    ],
    { cwd: root, signal: abort.signal },
  );
} else throw new Error('Use competition.mjs up | test-db | dev | stop');

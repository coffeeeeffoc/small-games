import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { managementEnvironment, runtimeEnvironment } from './platform-config.mjs';
import { runProcessGroup, runCommand } from './platform-process.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const compose = ['compose', '-f', 'infra/docker/compose.yaml'];
const run = (command, args, input) => runCommand(command, args, { cwd: root, input });
const mode = process.argv[2] ?? 'dev';
if (!['dev', 'up', 'stop', 'test'].includes(mode)) throw new Error('Use dev, up, stop or test');
if (mode === 'stop') {
  // No -v: keep both named volumes, and touch only this Compose project.
  await run('docker', [...compose, 'stop']);
} else {
  await run('docker', [...compose, 'up', '-d', '--wait', '--wait-timeout', '120']);
  for (const migration of [
    '002-management-auth.sql',
    '003-content-drafts.sql',
    '004-release-channels.sql',
    '005-runtime-sessions.sql',
    '006-cloud-saves.sql',
    '007-managed-ad-drafts.sql',
  ])
    await run(
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
        'small_games',
        '-v',
        'ON_ERROR_STOP=1',
      ],
      await readFile(new URL(`../infra/migrations/${migration}`, import.meta.url)),
    );
  if (mode !== 'up') {
    await run(process.execPath, [
      'node_modules/turbo/bin/turbo',
      'run',
      'build',
      '--filter=@coffeeeeffoc/management-api...',
      '--filter=@coffeeeeffoc/runtime-api...',
    ]);
    const { createObjectStore } = await import('@coffeeeeffoc/management-api');
    const objects = createObjectStore({
      endpoint: managementEnvironment.S3_ENDPOINT,
      region: managementEnvironment.S3_REGION,
      bucket: managementEnvironment.S3_BUCKET,
      accessKeyId: managementEnvironment.S3_ACCESS_KEY_ID,
      secretAccessKey: managementEnvironment.S3_SECRET_ACCESS_KEY,
    });
    try {
      await objects.initialize();
    } finally {
      objects.close();
    }
    if (mode === 'test') {
      await run(process.execPath, ['scripts/platform.integration.mjs']);
      await run(process.execPath, ['scripts/auth.integration.mjs']);
      await run(process.execPath, ['scripts/artifact.integration.mjs']);
      await run(process.execPath, ['scripts/releases.integration.mjs']);
      await run(process.execPath, ['scripts/catalog.integration.mjs']);
    } else {
      const controller = new AbortController();
      const stop = () => controller.abort();
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
      const entries = [
        ['management', managementEnvironment, '53001'],
        ['runtime', runtimeEnvironment, '53002'],
      ].map(([name, env, port]) => ({
        command: process.execPath,
        args: [`services/${name}-api/dist/main.js`],
        env: { ...process.env, ...env, PORT: port },
      }));
      try {
        await runProcessGroup(entries, { cwd: root, signal: controller.signal });
      } finally {
        process.removeListener('SIGINT', stop);
        process.removeListener('SIGTERM', stop);
      }
    }
  }
}

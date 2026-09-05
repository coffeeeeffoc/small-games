import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { managementEnvironment, runtimeEnvironment } from './platform-config.mjs';
import { runProcessGroup } from './platform-process.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const compose = ['compose', '-f', 'infra/docker/compose.yaml'];
async function run(command, args) {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit' });
  const [code] = await once(child, 'exit');
  if (code !== 0) throw new Error(`${command} failed (${code})`);
}
const mode = process.argv[2] ?? 'dev';
if (!['dev', 'up', 'stop', 'test'].includes(mode)) throw new Error('Use dev, up, stop or test');
if (mode === 'stop') {
  // No -v: keep both named volumes, and touch only this Compose project.
  await run('docker', [...compose, 'stop']);
} else {
  await run('docker', [...compose, 'up', '-d', '--wait', '--wait-timeout', '120']);
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

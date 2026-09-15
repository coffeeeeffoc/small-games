import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { expect, it } from 'vitest';

function runService(code: string, port?: number, shutdownTimeout = 6000) {
  return new Promise<{
    code: number | null;
    killed: boolean;
    stderr: string;
    shutdownStarted: boolean;
    timedOut: 'startup' | 'shutdown' | undefined;
  }>((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
      env: { ...process.env, ...(port === undefined ? {} : { PORT: String(port) }) },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    let stderr = '';
    let shutdownStarted = false;
    let timedOut: 'startup' | 'shutdown' | undefined;
    const kill = (phase: 'startup' | 'shutdown') => {
      timedOut = phase;
      child.kill('SIGKILL');
    };
    // Cold imports compete with other Turbo tasks in CI. Only start the original
    // shutdown watchdog once the service actually begins its onClose hook.
    let watchdog = setTimeout(() => kill('startup'), 20_000);
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('message', (message) => {
      if (message !== 'shutdown-started' || shutdownStarted) return;
      shutdownStarted = true;
      clearTimeout(watchdog);
      watchdog = setTimeout(() => kill('shutdown'), shutdownTimeout);
    });
    child.on('error', (error) => {
      clearTimeout(watchdog);
      reject(error);
    });
    child.on('close', (exitCode) => {
      clearTimeout(watchdog);
      resolve({ code: exitCode, killed: child.killed, stderr, shutdownStarted, timedOut });
    });
  });
}

it('excludes startup from the shutdown watchdog but still kills a hung child', async () => {
  const code = `setTimeout(() => {
    process.send('shutdown-started');
    setInterval(() => {}, 1000);
  }, 150);`;
  await expect(runService(code, undefined, 100)).resolves.toMatchObject({
    killed: true,
    shutdownStarted: true,
    timedOut: 'shutdown',
  });
}, 22_000);

it('bounds cleanup after a failed listen and preserves its sanitized error', async () => {
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const address = socket.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  try {
    const code = `import {createService, listenService} from '@coffeeeeffoc/service-kit';
      const app = createService('runtime', {}, false);
      app.addHook('onClose', async () => {
        process.send('shutdown-started');
        await new Promise(() => {});
      });
      await listenService(app, ${address.port});`;
    await expect(runService(code, address.port)).resolves.toMatchObject({
      code: 1,
      killed: false,
      shutdownStarted: true,
      timedOut: undefined,
      stderr: expect.stringContaining(
        `Service failed to listen on 127.0.0.1:${address.port} (EADDRINUSE)`,
      ),
    });
  } finally {
    await new Promise<void>((resolve) => socket.close(() => resolve()));
  }
}, 28_000);

it.each(['throw new Error("close failed")', 'await new Promise(() => {})'])(
  'bounds failed shutdown in its own service process: %s',
  async (hook) => {
    // Reserve an ephemeral port for the standalone-entry test, then release it.
    const socket = createServer();
    await new Promise<void>((resolve) => socket.listen(0, '127.0.0.1', resolve));
    const address = socket.address();
    if (!address || typeof address === 'string') throw new Error('No test port');
    await new Promise<void>((resolve) => socket.close(() => resolve()));
    const code = `import {createService, listenService} from '@coffeeeeffoc/service-kit';
      const app = createService('runtime', {}, false);
      app.addHook('onClose', async () => {
        process.send('shutdown-started');
        ${hook}
      });
      await listenService(app, ${address.port});
      process.emit('SIGTERM');`;
    await expect(runService(code, address.port)).resolves.toMatchObject({
      code: 1,
      killed: false,
      shutdownStarted: true,
      timedOut: undefined,
    });
  },
  28_000,
);

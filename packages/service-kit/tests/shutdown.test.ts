import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { expect, it } from 'vitest';

const exec = promisify(execFile);
it('bounds cleanup after a failed listen and preserves its sanitized error', async () => {
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const address = socket.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  try {
    const code = `import {createService, listenService} from '@coffeeeeffoc/service-kit';
      const app = createService('runtime', {}, false);
      app.addHook('onClose', async () => { await new Promise(() => {}); });
      await listenService(app, ${address.port});`;
    await expect(
      exec(process.execPath, ['--input-type=module', '-e', code], {
        timeout: 6000,
        env: { ...process.env, PORT: String(address.port) },
      }),
    ).rejects.toMatchObject({
      code: 1,
      killed: false,
      stderr: expect.stringContaining(
        `Service failed to listen on 127.0.0.1:${address.port} (EADDRINUSE)`,
      ),
    });
  } finally {
    await new Promise<void>((resolve) => socket.close(() => resolve()));
  }
}, 8000);

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
      app.addHook('onClose', async () => {${hook}});
      await listenService(app, ${address.port});
      process.emit('SIGTERM');`;
    await expect(
      exec(process.execPath, ['--input-type=module', '-e', code], {
        timeout: 6000,
        env: { ...process.env, PORT: String(address.port) },
      }),
    ).rejects.toMatchObject({ code: 1, killed: false });
  },
  8000,
);

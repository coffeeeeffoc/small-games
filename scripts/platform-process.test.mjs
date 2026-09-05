import assert from 'node:assert/strict';
import test from 'node:test';
import { runProcessGroup, runCommand, childEnvironment } from './platform-process.mjs';

test('bootstrap secrets never reach prerequisite children and source environment stays unchanged', async () => {
  const source = { STUDIO_ADMIN_PASSWORD: 'test-only-secret', PATH: 'retained' };
  assert.deepEqual(childEnvironment(source), { PATH: 'retained' });
  assert.equal(source.STUDIO_ADMIN_PASSWORD, 'test-only-secret');
  const previous = process.env.STUDIO_ADMIN_PASSWORD;
  process.env.STUDIO_ADMIN_PASSWORD = 'test-only-secret';
  try {
    await runCommand(process.execPath, [
      '-e',
      'process.exit(process.env.STUDIO_ADMIN_PASSWORD ? 1 : 0)',
    ]);
  } finally {
    if (previous === undefined) delete process.env.STUDIO_ADMIN_PASSWORD;
    else process.env.STUDIO_ADMIN_PASSWORD = previous;
  }
});

const stubborn = {
  command: process.execPath,
  args: ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],
};
test('cancellation reaps a child that ignores graceful shutdown', { timeout: 5000 }, async () => {
  const controller = new AbortController();
  const done = runProcessGroup([stubborn], {
    signal: controller.signal,
    graceMs: 50,
    stdio: 'ignore',
  });
  const timer = setTimeout(() => controller.abort(), 300);
  try {
    await done;
  } finally {
    clearTimeout(timer);
  }
});
test('a spawn failure terminates its already started peer', { timeout: 5000 }, async () => {
  await assert.rejects(
    runProcessGroup([stubborn, { command: 'small-games-nonexistent-command', args: [] }], {
      graceMs: 50,
      stdio: 'ignore',
    }),
    /ENOENT/,
  );
});
test('unexpected peer exit rejects and terminates the rest', { timeout: 5000 }, async () => {
  await assert.rejects(
    runProcessGroup([stubborn, { command: process.execPath, args: ['-e', 'process.exit(1)'] }], {
      graceMs: 50,
      stdio: 'ignore',
    }),
    /exited unexpectedly/,
  );
});

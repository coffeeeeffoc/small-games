import assert from 'node:assert/strict';
import test from 'node:test';
import { runProcessGroup } from './platform-process.mjs';

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

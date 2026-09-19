import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { runCreator } from '../scripts/toolchain.mjs';

test('Creator preserves logs on success, failure and timeout', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'kart-creator-'));
  const log = path.join(directory, 'build.log');
  const options = { executable: process.execPath, timeoutMs: 2000 };
  try {
    const result = await runCreator(
      ['-e', "console.log('built'); console.error('diagnostic'); process.exitCode = 36"],
      log,
      options,
    );
    assert.equal(result.code, 36);
    assert.match(result.output, /built/);
    assert.match(result.output, /diagnostic/);
    assert.equal(await readFile(log, 'utf8'), result.output);
    assert.equal((await runCreator(['-e', 'process.exit(34)'], log, options)).code, 34);
    const timeout = assert.rejects(
      runCreator(['-e', "console.log('before hang'); setInterval(() => {}, 1000)"], log, options),
      /Creator timed out/,
    );
    await setTimeout(1000);
    assert.match(await readFile(log, 'utf8'), /before hang/, 'logs must exist before exit');
    await timeout;
    assert.match(await readFile(log, 'utf8'), /before hang/);
    await assert.rejects(
      runCreator([], log, { ...options, executable: path.join(directory, 'missing-editor') }),
      /ENOENT/,
    );
  } finally {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('kart-creator-'));
    await rm(directory, { recursive: true, force: true });
  }
});

test('Creator exit does not wait for workers to close inherited stdio', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'kart-creator-'));
  const spawn = childProcess.spawn;
  const delayedClose = mock.method(childProcess, 'spawn', (...args) => {
    const proc = spawn(...args);
    const emit = proc.emit;
    proc.emit = function (event, ...values) {
      if (event !== 'close') return emit.call(this, event, ...values);
      // Model a worker retaining output handles after the editor has exited.
      globalThis.setTimeout(() => emit.call(this, event, ...values), 1500);
      return true;
    };
    return proc;
  });
  syncBuiltinESMExports();
  try {
    const result = await runCreator(
      ['-e', "console.log('build complete'); process.exitCode = 36"],
      path.join(directory, 'build.log'),
      { executable: process.execPath, timeoutMs: 1000 },
    );
    assert.equal(result.code, 36);
    assert.match(result.output, /build complete/);
  } finally {
    delayedClose.mock.restore();
    syncBuiltinESMExports();
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('kart-creator-'));
    await rm(directory, { recursive: true, force: true });
  }
});

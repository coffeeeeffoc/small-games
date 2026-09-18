import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { clearOutput } from '../scripts/clear-output.mjs';

test('rebuild clears stale files while keeping an open project directory', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'kart-build-output-'));
  const previous = process.cwd();
  try {
    await mkdir(path.join(directory, 'assets'));
    await writeFile(path.join(directory, 'assets/old.js'), 'stale');
    await writeFile(path.join(directory, 'game.js'), 'stale');
    // Windows locks a process's working directory, just like an open project.
    process.chdir(directory);
    await clearOutput(directory);
    assert.deepEqual(await readdir(directory), []);
    await writeFile(path.join(directory, 'game.js'), 'new build');
    assert.deepEqual(await readdir(directory), ['game.js']);
  } finally {
    process.chdir(previous);
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('kart-build-output-'));
    await rm(directory, { recursive: true, force: true });
  }
});

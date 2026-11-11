import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { preparationInput, writePreparation } from './prepare-night-server.mjs';

test('preparation accepts only an explicit version and cannot forward deployment actions', () => {
  assert.deepEqual(preparationInput(['--version=1.0.0']), { backendVersion: '1.0.0' });
  for (const args of [
    [],
    ['--version=bad'],
    ['--version=1.0.0', '--execute'],
    ['--version=1.0.0', '--check'],
    ['--version=1.0.0', 'ssh'],
  ])
    assert.throws(() => preparationInput(args));
});
test('preparation binds both bundles to one candidate and copies exact migration bytes without claiming deployment', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'night-preparation-'));
  try {
    const sourceSHA = 'a'.repeat(40),
      control = { directory: path.join(directory, 'control'), manifest: { sourceSHA } };
    const runtime = { sourceSHA, backendVersion: '1.0.0' };
    await assert.rejects(
      writePreparation(directory, control, { ...runtime, sourceSHA: 'b'.repeat(40) }),
      /CANDIDATE_MISMATCH/,
    );
    const receipt = await writePreparation(directory, control, runtime);
    assert.equal(receipt.deployed, false);
    assert.equal(receipt.remoteInspected, false);
    assert.equal(receipt.migrationRehearsed, false);
    assert.equal(Object.keys(receipt.migrations).length, 3);
    assert.deepEqual(
      await readFile(path.join(directory, 'migrations/018-night-direct-messages.sql')),
      await readFile(new URL('../infra/migrations/018-night-direct-messages.sql', import.meta.url)),
    );
    await assert.rejects(writePreparation(directory, control, runtime), /EEXIST/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

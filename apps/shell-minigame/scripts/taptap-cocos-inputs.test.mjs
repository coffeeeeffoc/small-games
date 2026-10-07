import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyProducer, verifyPlugin, officialPluginSha256 } from './taptap-cocos-inputs.mjs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

test('transport binds repository, exact SHA, producer run/attempt and a clean candidate', () => {
  const expected = { sha: 'a'.repeat(40), repository: 'owner/repo', runId: '12', runAttempt: '2' };
  const actual = { ...expected, candidateClean: true };
  verifyProducer(actual, expected);
  for (const key of Object.keys(expected)) {
    assert.throws(
      () => verifyProducer({ ...actual, [key]: 'foreign' }, expected),
      /producer mismatch/,
    );
    assert.throws(
      () => verifyProducer(actual, { ...expected, [key]: '' }),
      /trusted producer context/,
    );
  }
  assert.throws(
    () => verifyProducer({ ...actual, candidateClean: false }, expected),
    /dirty candidate/,
  );
});

test('a forged plugin archive is rejected before any plugin code is loaded', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tap-plugin-pin-'));
  try {
    const archive = path.join(root, 'plugin.zip');
    await writeFile(archive, 'not the official plugin');
    assert.match(officialPluginSha256, /^[a-f0-9]{64}$/);
    await assert.rejects(verifyPlugin(archive, path.join(root, 'missing')), /archive changed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

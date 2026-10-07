import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareNativeAssets } from './prepare-assets.mjs';

test('remote asset classification and manifest paths work on Windows and POSIX', async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'travel-native-assets-'));
  try {
    const manifest = await prepareNativeAssets(output, { remote: true });
    assert(manifest.files.every((file) => !file.path.includes('\\')));
    assert.equal(manifest.files.find((file) => file.path === 'world/world.json').delivery, 'remote-pinned');
    assert(!manifest.files.some((file) => file.path.startsWith('draco/')));
    assert(manifest.files.some((file) => file.path === 'rapier/rapier.wasm'));
    assert(manifest.remoteBytes > 0);
    await assert.rejects(stat(path.join(output, 'world/world.json')), { code: 'ENOENT' });
  } finally { await rm(output, { recursive: true, force: true }); }
});

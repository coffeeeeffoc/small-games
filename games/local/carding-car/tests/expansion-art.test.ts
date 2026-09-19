import { artLocation } from '../assets/scripts/ArtLocation.ts';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { expansionSource, expansionFiles, prepareArt } from '../scripts/prepare-art.mjs';
import { KartConfig } from '../assets/scripts/KartConfig.ts';

test('all expansion choices have self-contained runtime art and copied build inputs', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', expansionSource), 'utf8'));
  const counts = Object.fromEntries(['scenes', 'vehicles', 'drivers', 'items'].map((category) => [
    category, manifest.models.filter((entry) => entry.file.startsWith(category + '/')).length,
  ]));
  assert.deepEqual(counts, { scenes: 7, vehicles: 10, drivers: 10, items: 12 });
  assert.equal(manifest.textures.length, 7);
  const files = await expansionFiles();
  assert.equal(files.length, new Set(files).size, 'manifest cannot alias choices to duplicate paths');
  let bytes = 0;
  for (const entry of [...manifest.models, ...manifest.textures]) {
    const raw = await readFile(new URL(entry.file, expansionSource));
    bytes += raw.length;
    assert.equal(raw.length, entry.bytes, entry.file);
    assert.equal(createHash('sha256').update(raw).digest('hex'), entry.sha256, entry.file);
    if (!entry.file.endsWith('.glb')) continue;
    assert.equal(raw.readUInt32LE(0), 0x46546c67, entry.file);
    assert.equal(raw.readUInt32LE(8), raw.length, entry.file);
    const gltf = JSON.parse(raw.subarray(20, 20 + raw.readUInt32LE(12)).toString());
    assert.ok(gltf.meshes.length > 0 && gltf.scenes.length > 0, entry.file);
    assert.ok(gltf.buffers.every((buffer) => !buffer.uri), entry.file);
    assert.ok((gltf.images || []).every((image) => image.bufferView !== undefined && !image.uri), entry.file);
    const [low, high] = entry.bounds;
    assert.ok([...low, ...high].every(Number.isFinite), entry.file);
    assert.ok(Math.abs(low[1]) < 0.001, `${entry.file} must rest on Y=0`);
    if (entry.file.startsWith('vehicles/')) {
      assert.ok(Math.max(Math.abs(low[0]), Math.abs(high[0])) <= KartConfig.collisionHalfWidth, entry.file);
      assert.ok(Math.max(Math.abs(low[2]), Math.abs(high[2])) <= KartConfig.collisionHalfLength, entry.file);
    }
  }
  assert.ok(bytes < 12 * 1024 * 1024, `expansion runtime budget: ${bytes}`);
  await prepareArt();
  for (const file of files) {
    const ext = file.slice(file.lastIndexOf('.'));
    const location = artLocation('expansion/' + file.slice(0, -ext.length));
    assert.deepEqual(
      await readFile(new URL(`../assets/art/${location.bundle}/${location.path}${ext}`, import.meta.url)),
      await readFile(new URL(file, expansionSource)),
      `build input differs from source: ${file}`,
    );
  }
});

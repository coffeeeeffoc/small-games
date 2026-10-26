import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { outline, vessels } from '../src/content.mjs';
import { vesselAssetDirectory } from '../src/vessel-contours.mjs';
import { validateContour, validateWebp, readVesselBatch } from '../scripts/vessel-batch.mjs';
import { fileURLToPath } from 'node:url';

test('100 distinct studio assets and their contours pass the shared batch checks', () => {
  const hashes = new Set();
  for (const vessel of vessels) {
    const bytes = readFileSync(
      new URL('../' + vesselAssetDirectory + '/' + vessel.id + '.webp', import.meta.url),
    );
    validateWebp(bytes);
    validateContour(outline(vessel));
    hashes.add(createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(hashes.size, 100);
});
test('active vessel batch has complete checked image hashes', async () => {
  await readVesselBatch(fileURLToPath(new URL('../', import.meta.url)), vessels);
});

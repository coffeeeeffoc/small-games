import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { outline, vessels } from '../src/content.mjs';

test('100 distinct studio assets are full resolution and their contours stay within the canvas', () => {
  const hashes = new Set();
  for (const vessel of vessels) {
    const bytes = readFileSync(
      new URL('../assets/vessels/' + vessel.id + '.webp', import.meta.url),
    );
    assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
    assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
    hashes.add(createHash('sha256').update(bytes).digest('hex'));
    const contour = outline(vessel),
      half = contour.length / 2;
    assert.ok(half > 100);
    for (let i = 0; i < half; i++) {
      const right = contour[i],
        left = contour.at(-1 - i);
      assert.equal(left.y, right.y);
      assert.ok(left.x < right.x);
      assert.ok(left.x > 0 && right.x < 240 && right.y > 0 && right.y < 300);
      if (i) assert.ok(right.y > contour[i - 1].y);
    }
  }
  assert.equal(hashes.size, 100);
});

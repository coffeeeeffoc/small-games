import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  flightFrame,
  wheelStep,
  chapterAt,
  chapters,
  settleProgress,
  needsDetail,
} from '../src/flight.ts';
test('original detail survives export, flight is smooth and distance fades are reversible', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../public/lod/manifest.json', import.meta.url), 'utf8'),
  );
  assert.equal(
    manifest.source_sha256,
    'd5e8046f769582f15cafb5a32ddaee92e07adc0be25a4b832d8654da1f31487a',
    'Scene snapshot from assets commit d1f098d; independent of later source edits',
  );
  assert.equal(
    manifest.tiles.reduce((n: number, t: { triangles: number }) => n + t.triangles, 0),
    3484074,
  );
  assert(manifest.overviewBytes < 81_815_204 * 0.3, 'First render is at least 70% smaller');
  for (const tile of manifest.tiles) {
    if (tile.id === 'terrain') continue;
    const bytes = readFileSync(new URL(`../public/lod/${tile.id}.glb`, import.meta.url));
    const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
    const triangles = gltf.nodes.reduce(
      (sum: number, node: { mesh?: number }) =>
        sum +
        (node.mesh === undefined
          ? 0
          : gltf.meshes[node.mesh].primitives.reduce(
              (n: number, p: { indices: number }) => n + gltf.accessors[p.indices].count / 3,
              0,
            )),
      0,
    );
    assert.equal(triangles, tile.triangles, `Original detail retained for ${tile.id}`);
  }
  assert.deepEqual(flightFrame(0).eye.toArray(), [-3300, 3300, 3600]);
  assert.deepEqual(flightFrame(NaN).eye, flightFrame(0).eye);
  assert.deepEqual(flightFrame(2).eye, flightFrame(1).eye);
  for (let i = 0; i < 1000; i++) {
    const a = flightFrame(i / 1000),
      b = flightFrame((i + 1) / 1000);
    assert(a.eye.y > 480);
    assert(a.eye.distanceTo(b.eye) < 50, 'Continuous camera');
    assert(a.look.distanceTo(b.look) < 30, 'Continuous look target');
    assert(Math.abs(a.bank) <= 0.045);
  }
  const speeds = Array.from({ length: 800 }, (_, i) =>
    flightFrame(0.1 + i * 0.001).eye.distanceTo(flightFrame(0.101 + i * 0.001).eye),
  );
  for (let i = 1; i < speeds.length; i++)
    assert(
      Math.abs(speeds[i] / speeds[i - 1] - 1) < 0.035,
      'Altitude-based speed changes gradually',
    );
  const firstWheel = flightFrame(wheelStep(120, 0, 900));
  assert(
    firstWheel.eye.distanceTo(flightFrame(0).eye) > 100,
    'First wheel notch visibly approaches the city',
  );
  assert.equal(wheelStep(3, 1, 900), wheelStep(48, 0, 900));
  assert.equal(wheelStep(10000, 0, 900), 0.06);
  assert.equal(chapterAt(1), chapters.length - 1);
  assert(settleProgress(0, 1, 1 / 60) <= 0.25 / 60 + 1e-10, 'Fast seeking has a speed ceiling');
  assert(needsDetail(900, false));
  assert(!needsDetail(2000, true));
  assert(!needsDetail(1400, false));
  assert(needsDetail(1400, true), 'No repeated swaps near the distance boundary');
  let at30 = 0,
    at120 = 0;
  for (let i = 0; i < 30; i++) at30 = settleProgress(at30, 1, 1 / 30);
  for (let i = 0; i < 120; i++) at120 = settleProgress(at120, 1, 1 / 120);
  assert(Math.abs(at30 - at120) < 1e-8, 'Frame-rate independent smoothing');
});

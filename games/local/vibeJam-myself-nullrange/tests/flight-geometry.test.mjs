import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AIRFRAME_SAMPLES,
  airframeFloor,
  airframeSamples,
  cameraView,
  surfaceHeight,
} from '../assets/scripts/core/flight-geometry.ts';
import { createRun, step } from '../assets/scripts/core/rules.ts';
import { readFile } from 'node:fs/promises';
import { WATER_LEVEL } from '../assets/scripts/core/terrain.ts';

test('water is a physical surface for the airframe and camera, not a decorative layer', () => {
  assert.equal(surfaceHeight(0, 0), WATER_LEVEL);
  const s = createRun();
  s.player.y = WATER_LEVEL - 2;
  step(s);
  assert.ok(s.events.includes('damage'));
  assert.ok(s.player.y >= WATER_LEVEL + 7);
  for (const p of airframeSamples(s.player)) assert.ok(p.y > WATER_LEVEL);
  assert.ok(cameraView(s.player, false, 0).position.y >= WATER_LEVEL + 6);
});
test('Falcon probes cover the current authored span, nose and underside', async () => {
  const m = JSON.parse(
    await readFile(new URL('../art/falcon-manifest.json', import.meta.url), 'utf8'),
  );
  assert.ok(Math.max(...AIRFRAME_SAMPLES.map((p) => p[0])) >= m.bounds.max[0]);
  assert.ok(Math.min(...AIRFRAME_SAMPLES.map((p) => p[2])) <= m.bounds.min[2]);
  assert.ok(Math.abs(Math.min(...AIRFRAME_SAMPLES.map((p) => p[1])) - m.bounds.min[1]) < 0.001);
});
test('review regression: a clear centre cannot hide a wing penetrating the bank', () => {
  const s = createRun();
  Object.assign(s.player, { x: 350, y: 171.883612, z: -308.466667 });
  step(s);
  assert.ok(s.events.includes('damage'));
  assert.equal(s.player.shield, 35);
  for (const p of airframeSamples(s.player)) assert.ok(p.y >= surfaceHeight(p.x, p.z) + 2.5 - 1e-7);
  assert.ok(s.player.y >= airframeFloor(s.player) - 1e-7);
});
test('banked airframe probes match independent Cocos YZX quaternion transform', () => {
  const p = { x: 20, y: 100, z: -30, yaw: 1.7, pitch: 0.4, roll: -0.65 };
  const sx = Math.sin(p.pitch / 2),
    cx = Math.cos(p.pitch / 2),
    sy = Math.sin(-p.yaw / 2),
    cy = Math.cos(-p.yaw / 2),
    sz = Math.sin(p.roll / 2),
    cz = Math.cos(p.roll / 2);
  const q = {
    x: sx * cy * cz + cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
    w: cx * cy * cz - sx * sy * sz,
  };
  const actual = airframeSamples(p);
  AIRFRAME_SAMPLES.forEach(([x, y, z], i) => {
    const ix = q.w * x + q.y * z - q.z * y,
      iy = q.w * y + q.z * x - q.x * z,
      iz = q.w * z + q.x * y - q.y * x,
      iw = -q.x * x - q.y * y - q.z * z;
    const expected = {
      x: p.x + ix * q.w - iw * q.x - iy * q.z + iz * q.y,
      y: p.y + iy * q.w - iw * q.y - iz * q.x + ix * q.z,
      z: p.z + iz * q.w - iw * q.z - ix * q.y + iy * q.x,
    };
    for (const k of ['x', 'y', 'z']) assert.ok(Math.abs(actual[i][k] - expected[k]) < 1e-10);
  });
});
test('review regression: chase camera has terrain/obstacle clearance, including a banked flight route', () => {
  const p = { x: 1723.332, y: 229.43, z: 563.187, yaw: 2.590585, pitch: 0.3, roll: 0 };
  const camera = cameraView(p, false, 1471).position;
  assert.ok(camera.y >= surfaceHeight(camera.x, camera.z) + 6);
  const s = createRun();
  for (let i = 0; i < 2000 && s.status === 'running'; i++) {
    step(s, { x: Math.sin(i * 0.008), y: 0.15 * Math.sin(i * 0.012) });
    const c = cameraView(s.player, false, s.tick).position;
    assert.ok(c.y >= surfaceHeight(c.x, c.z) + 6);
    assert.ok(Object.values(c).every(Number.isFinite));
    for (const sample of airframeSamples(s.player))
      assert.ok(sample.y >= surfaceHeight(sample.x, sample.z) + 2.5 - 1e-6);
  }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  logicalInsets,
  safeBounds,
  ZERO_INSETS,
  radarContacts,
  missionRating,
} from '../assets/scripts/core/presentation.ts';
import { createRun } from '../assets/scripts/core/rules.ts';
import { synthesize, durations } from '../scripts/sound-bank.mjs';
test('asymmetric physical safe areas rotate once into Cocos logical space', () => {
  const physical = { left: 31, top: 7, right: 13, bottom: 19 };
  assert.deepEqual(logicalInsets(physical, false, 0.5), {
    left: 62,
    top: 14,
    right: 26,
    bottom: 38,
  });
  assert.deepEqual(logicalInsets(physical, true, 0.5), {
    left: 14,
    top: 26,
    right: 38,
    bottom: 62,
  });
  for (const [width, height] of [
    [667, 375],
    [844, 390],
    [932, 430],
    [390, 844],
  ]) {
    const scale = Math.min(width, height) / 390;
    const inset = logicalInsets(physical, width < height, scale);
    const bounds = safeBounds(Math.max(width, height) / scale, 390, inset, ZERO_INSETS);
    assert.ok(bounds.left >= inset.left && bounds.top >= inset.top);
    assert.ok(
      bounds.right <= Math.max(width, height) / scale - inset.right &&
        bounds.bottom <= 390 - inset.bottom,
    );
    assert.ok(bounds.width > 570 && bounds.height > 300);
  }
  const a = safeBounds(844, 390, physical, physical),
    b = safeBounds(844, 390, physical, ZERO_INSETS);
  assert.deepEqual(a, b, 'native and Web safe areas are merged, never double-counted');
});
test('radar follows real relative enemy coordinates, heading and live targets', () => {
  const s = createRun();
  s.enemies = [
    { id: 1, x: 0, y: 95, z: -450, hp: 1 },
    { id: 2, x: 1800, y: 95, z: 0, hp: 1 },
    { id: 3, x: 0, y: 95, z: 0, hp: 0 },
  ];
  assert.deepEqual(radarContacts(s, 900), [
    { id: 1, x: 0, y: -0.5, distance: 450, outside: false },
    { id: 2, x: 1, y: -0, distance: 1800, outside: true },
  ]);
  s.player.yaw = Math.PI / 2;
  const r = radarContacts(s, 900);
  assert.ok(Math.abs(r[0].x + 0.5) < 1e-12);
  assert.ok(Math.abs(r[1].y + 1) < 1e-12);
});
test('debrief stars derive only from actual completion and remaining hull', () => {
  const s = createRun();
  assert.equal(missionRating(s), 0);
  s.status = 'won';
  for (const [h, stars] of [
    [100, 3],
    [80, 3],
    [79, 2],
    [50, 2],
    [49, 1],
  ]) {
    s.player.hull = h;
    assert.equal(missionRating(s), stars);
  }
  s.status = 'lost';
  assert.equal(missionRating(s), 0);
  assert.equal(s.score, 0);
});
test('original sound bank is deterministic, finite and normalized without clipping', () => {
  let bytes = 0;
  for (const name of Object.keys(durations)) {
    const a = synthesize(name),
      b = synthesize(name);
    assert.deepEqual(a.wav, b.wav);
    assert.ok(a.rms > 0.01 && a.rms < 0.6);
    assert.ok(a.peak <= 0.8);
    bytes += a.wav.length;
  }
  assert.equal(bytes, 427774);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneScene, presets, computePaths } from '../src/acoustics.js';
import { createLayout, createRoomLink, readRoomLink, validateLayout } from '../src/layout.js';

test('shared rooms reproduce geometry, per-wall overrides and listening settings', () => {
  const scene = cloneScene(presets.hall);
  scene.wallReflections = { 'wall-top': 0, 'wall-right': 0.95 };
  scene.panels[0].angle = 78;
  const layout = createLayout(scene, { preset: 'hall', sound: 'chime', volume: 47 });
  const link = createRoomLink(
    'https://example.com/small-games/games/echo-lab/index.html?embedded=1',
    layout,
  );
  assert.ok(link.startsWith('https://example.com/small-games/games/echo-lab/index.html#room='));
  assert.deepEqual(readRoomLink(link), layout);
  assert.deepEqual(computePaths(readRoomLink(link).scene), computePaths(scene));
  assert.equal(readRoomLink('https://example.com/#/games/echo-lab'), null);
});

test('private audio and unrecognized fields never enter a room link', () => {
  const scene = {
    ...cloneScene(presets.first),
    secret: 'private recording',
    wallReflections: { 'wall-left': 0.4, secret: 0.5 },
  };
  const layout = createLayout(scene, { sound: 'custom' });
  const restored = readRoomLink(
    createRoomLink('https://example.com/', {
      ...layout,
      audio: 'private samples',
      filename: 'personal.wav',
    }),
  );
  assert.equal(restored.sound, 'clap');
  assert.ok(!JSON.stringify(restored).includes('private'));
  assert.ok(!JSON.stringify(restored).includes('personal'));
  assert.deepEqual(restored.scene.wallReflections, { 'wall-left': 0.4 });
});

test('legacy v1 files retain uniform walls and upgrade without changing paths', () => {
  const data = { format: 'echo-lab', version: 1, scene: presets.first };
  const upgraded = validateLayout(data);
  assert.equal(upgraded.version, 2);
  assert.deepEqual(upgraded.scene.wallReflections, {});
  assert.deepEqual(computePaths(upgraded.scene), computePaths(presets.first));
});

test('malformed and oversized links and unsupported configs are rejected', () => {
  for (const payload of ['', '!!!', 'abc', 'a'.repeat(12001)]) {
    assert.throws(() => readRoomLink(`https://example.com/#room=${payload}`));
  }
  for (const patch of [
    { version: 99 },
    { volume: -1 },
    { volume: '65' },
    { sound: 'custom' },
    { scene: { ...presets.first, wallReflections: { 'wall-top': 1 } } },
  ]) {
    assert.throws(() => validateLayout({ ...createLayout(presets.first), ...patch }));
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cloneScene,
  computePaths,
  panelEndpoints,
  presets,
  validateScene,
} from '../src/acoustics.js';

const close = (actual, expected, tolerance = 1e-7) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should be close to ${expected}`);

test('each wall affects only paths that hit it, including the second-order product', () => {
  const scene = { ...cloneScene(presets.hall), panels: [], wallReflection: 0.8 };
  const before = computePaths(scene).paths;
  scene.wallReflections = { 'wall-top': 0.4 };
  const after = computePaths(scene).paths;
  for (const path of before) {
    const next = after.find((item) => item.id === path.id);
    close(next.gain, path.gain * (path.surfaces.includes('wall-top') ? 0.5 : 1));
    close(next.delay, path.delay);
  }
  scene.wallReflection = 0.2;
  const defaultChanged = computePaths(scene).paths;
  close(
    defaultChanged.find((p) => p.id === 'wall-top').gain,
    after.find((p) => p.id === 'wall-top').gain,
  );
  close(
    defaultChanged.find((p) => p.id === 'wall-left').gain /
      after.find((p) => p.id === 'wall-left').gain,
    0.25,
  );
  scene.wallReflections['wall-top'] = 0;
  assert.ok(computePaths(scene).paths.every((path) => !path.surfaces.includes('wall-top')));
  delete scene.wallReflections['wall-top'];
  assert.ok(computePaths(scene).paths.some((path) => path.id === 'wall-top'));
});

test('per-wall overrides enforce the same amplitude range as the default', () => {
  for (const value of [-0.1, 1, '0.5', Infinity, NaN]) {
    assert.throws(() =>
      validateScene({ ...presets.first, wallReflections: { 'wall-left': value } }),
    );
  }
  assert.throws(() => validateScene({ ...presets.first, wallReflections: [] }));
});

test('mirror geometry gives the exact finite-panel bounce and physical delay', () => {
  const scene = cloneScene(presets.first);
  const result = computePaths(scene);
  const reflection = result.paths.find((path) => path.id === 'reflector-1');
  assert.ok(reflection);
  close(reflection.points[1].x, 45);
  close(reflection.points[1].y, 20);
  const expectedDistance = 2 * Math.hypot(35, 2);
  close(reflection.distance, expectedDistance);
  close(reflection.delay, expectedDistance / 343);
  close(reflection.relativeDelay, (expectedDistance - 4) / 343);
  assert.ok(reflection.relativeDelay > 0.15 && reflection.relativeDelay < 0.25);
  assert.ok(reflection.gain < result.paths.find((path) => path.order === 0).gain);
  close(reflection.pan, 35 / Math.hypot(35, 2));
});

test('finite panels cannot reflect via points outside their actual endpoints', () => {
  const scene = cloneScene(presets.first);
  scene.panels[0].length = 2;
  scene.panels[0].y = 5;
  assert.equal(
    computePaths(scene).paths.some((path) => path.id === 'reflector-1'),
    false,
  );
});

test('second-order walls obey the two reflection laws and physical path length', () => {
  const scene = {
    width: 20,
    height: 14,
    source: { x: 4, y: 5 },
    listener: { x: 12, y: 9 },
    wallReflection: 0.8,
    delayScale: 1,
    panels: [],
  };
  const paths = computePaths(scene).paths;
  const path = paths.find((item) => item.id === 'wall-left>wall-right');
  assert.ok(path);
  close(path.points[1].x, 0);
  close(path.points[2].x, 20);
  // Successive mirrored sources are (-4,5), then (44,5).
  close(path.distance, Math.hypot(44 - 12, 5 - 9));
  close(path.delay, path.distance / 343);
  assert.equal(path.order, 2);
});

test('an opaque absorber blocks a direct ray, regardless of its low reflection', () => {
  const scene = cloneScene(presets.first);
  scene.panels.push({ id: 'screen', type: 'absorber', x: 10, y: 20, length: 8, angle: 0 });
  const result = computePaths(scene);
  assert.equal(result.blocked, true);
  assert.equal(
    result.paths.some((path) => path.id === 'direct'),
    false,
  );
  close(result.directDelay, 4 / 343);
});

test('moving the same absorber changes the reflected path rather than a material counter', () => {
  const scene = cloneScene(presets.first);
  scene.panels.push({ id: 'screen', type: 'absorber', x: 28, y: 8, length: 5, angle: 90 });
  assert.ok(computePaths(scene).paths.some((path) => path.id === 'reflector-1'));
  scene.panels[1].y = 20;
  const blocked = computePaths(scene);
  assert.equal(
    blocked.paths.some((path) => path.id === 'reflector-1'),
    false,
  );
  assert.ok(blocked.paths.some((path) => path.id === 'screen'));
  assert.equal(blocked.blocked, false);
});

test('absorption reduces that reflection without normalizing up other paths', () => {
  const scene = cloneScene(presets.first);
  const before = computePaths(scene);
  scene.panels[0].type = 'absorber';
  scene.panels[0].reflection = 0.08;
  const after = computePaths(scene);
  const get = (result, id) => result.paths.find((path) => path.id === id);
  close(get(after, 'reflector-1').gain / get(before, 'reflector-1').gain, 0.08 / 0.9);
  close(get(after, 'direct').gain, get(before, 'direct').gain);
  close(get(after, 'wall-left').gain, get(before, 'wall-left').gain);
  close(get(after, 'reflector-1').delay, get(before, 'reflector-1').delay);
});

test('enhancement changes every travel time by exactly four, preserving gains', () => {
  const scene = cloneScene(presets.first);
  const physical = computePaths(scene);
  scene.delayScale = 4;
  const enhanced = computePaths(scene);
  close(enhanced.directDelay, physical.directDelay * 4);
  for (const path of physical.paths) {
    const match = enhanced.paths.find((item) => item.id === path.id);
    close(match.delay, path.delay * 4);
    close(match.relativeDelay, path.relativeDelay * 4);
    close(match.gain, path.gain);
  }
});

test('stationary results are deterministic, sorted, independent and finite', () => {
  for (const preset of Object.values(presets)) {
    const snapshot = cloneScene(preset);
    const first = computePaths(preset);
    assert.deepEqual(first, computePaths(preset));
    assert.deepEqual(preset, snapshot);
    assert.ok(first.paths.length <= 145);
    first.paths.forEach((path, index) => {
      assert.ok(Number.isFinite(path.gain) && path.gain >= 0 && path.gain <= 1);
      assert.ok(Number.isFinite(path.pan) && Math.abs(path.pan) <= 1);
      assert.ok(Number.isFinite(path.delay) && path.delay >= first.directDelay - 1e-7);
      assert.ok(index === 0 || path.delay >= first.paths[index - 1].delay);
    });
  }
});

test('import rejects bad dimensions, scalars, types and excessive panel counts', () => {
  for (const [key, value] of [
    ['width', 7],
    ['height', 101],
    ['width', '72'],
    ['height', NaN],
    ['wallReflection', 1],
    ['delayScale', 2],
  ]) {
    assert.throws(() => validateScene({ ...cloneScene(presets.first), [key]: value }));
  }
  assert.throws(() => validateScene(null));
  assert.throws(() => validateScene({ ...cloneScene(presets.first), panels: {} }));
  const wrongType = cloneScene(presets.first);
  wrongType.panels[0].type = 'magic';
  assert.throws(() => validateScene(wrongType));
  const tooMany = cloneScene(presets.first);
  tooMany.panels = Array.from({ length: 9 }, (_, index) => ({
    ...tooMany.panels[0],
    id: `p${index}`,
  }));
  assert.throws(() => validateScene(tooMany));
});

test('resizing/import clamps points and both endpoints inside a smaller room', () => {
  const raw = cloneScene(presets.first);
  raw.width = 8;
  raw.height = 8;
  raw.panels[0].angle = 45;
  raw.source = { x: -30, y: 90 };
  const scene = validateScene(raw);
  assert.notEqual(scene, raw);
  for (const point of [scene.source, scene.listener, ...panelEndpoints(scene.panels[0])]) {
    assert.ok(point.x >= 0.2 - 1e-7 && point.x <= 7.8 + 1e-7);
    assert.ok(point.y >= 0.2 - 1e-7 && point.y <= 7.8 + 1e-7);
  }
  assert.equal(raw.source.x, -30);
});

test('eight panels are accepted; reserved and duplicate object IDs are rejected', () => {
  const scene = cloneScene(presets.first);
  scene.panels = Array.from({ length: 8 }, (_, index) => ({
    ...presets.first.panels[0],
    id: `p${index}`,
  }));
  assert.equal(validateScene(scene).panels.length, 8);
  for (const id of [
    'source',
    'listener',
    'direct',
    'wall-top',
    'wall-right',
    'wall-bottom',
    'wall-left',
    'p1',
  ]) {
    scene.panels[0].id = id;
    assert.throws(() => validateScene(scene));
  }
});

test('eight exactly coincident panels share one surface without amplifying its echo', () => {
  const single = cloneScene(presets.first);
  const stacked = cloneScene(single);
  stacked.panels = Array.from({ length: 8 }, (_, index) => ({
    ...single.panels[0],
    id: index === 0 ? single.panels[0].id : `duplicate-${index}`,
    // Reversed endpoint order represents the same full physical segment.
    angle: index % 2 ? 270 : 90,
  }));
  assert.deepEqual(computePaths(stacked), computePaths(single));
  assert.equal(stacked.panels.length, 8, 'editor objects must remain individually movable');
});

test('an exactly coincident absorber weakens the shared surface and keeps its first ID', () => {
  const scene = cloneScene(presets.first);
  const before = computePaths(scene);
  scene.panels.push({
    ...scene.panels[0],
    id: 'absorbing-layer',
    type: 'absorber',
    reflection: 0.08,
    angle: 270,
  });
  const after = computePaths(scene);
  const firstEcho = (result) => result.paths.find((path) => path.id === 'reflector-1');
  close(firstEcho(after).gain / firstEcho(before).gain, 0.08 / 0.9);
  close(firstEcho(after).delay, firstEcho(before).delay);
  assert.equal(
    after.paths.some((path) => path.surfaces.includes('absorbing-layer')),
    false,
  );
  close(
    after.paths.find((path) => path.id === 'direct').gain,
    before.paths.find((path) => path.id === 'direct').gain,
  );
  assert.equal(after.paths.length, before.paths.length);
});

test('rotating a panel changes its bounce point and audible path', () => {
  const scene = cloneScene(presets.first);
  const initial = computePaths(scene).paths.find((path) => path.id === 'reflector-1');
  scene.panels[0].angle = 80;
  const rotated = computePaths(scene).paths.find((path) => path.id === 'reflector-1');
  assert.ok(rotated);
  assert.notEqual(rotated.distance, initial.distance);
  assert.notEqual(rotated.points[1].y, initial.points[1].y);
  scene.panels[0].angle = 70;
  assert.equal(
    computePaths(scene).paths.some((path) => path.id === 'reflector-1'),
    false,
  );
});

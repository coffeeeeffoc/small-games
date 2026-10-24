import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEVELS,
  environmentAt,
  createEndlessLayer,
  FIRST_LAYER_Y,
  LEVEL_HEIGHT,
} from '../levels.mjs';
import {
  createGame,
  createEndlessGame,
  step,
  rotate,
  getLanding,
  sectorAt,
  BALL_ANGLE,
  normalizeAngle,
  resumeCheckpoint,
} from '../engine.mjs';
const near = (a, b, e = 1e-7) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
test('short routes hold a climate while endless blends over long, continuous local skies', () => {
  for (const level of LEVELS) {
    const first = environmentAt(level, 120),
      last = environmentAt(level, 1500);
    assert.equal(first.from, last.from);
    assert.equal(first.radius, last.radius);
    assert.equal(first.speed, last.speed);
  }
  const level = createEndlessGame().level;
  for (const boundary of [48, 72, 120, 144, 192, 216, 264, 288, 336, 360, 408, 432, 480, 504]) {
    const a = environmentAt(level, FIRST_LAYER_Y + (boundary - 0.0001) * LEVEL_HEIGHT),
      b = environmentAt(level, FIRST_LAYER_Y + (boundary + 0.0001) * LEVEL_HEIGHT);
    near(a.radius, b.radius, 0.0001);
    near(a.speed, b.speed, 0.0001);
  }
  assert.equal(environmentAt(level, FIRST_LAYER_Y + 40 * LEVEL_HEIGHT).wind, 0);
  assert.ok(environmentAt(level, FIRST_LAYER_Y + 60 * LEVEL_HEIGHT).blend > 0);
  assert.equal(environmentAt(level, FIRST_LAYER_Y + 280 * LEVEL_HEIGHT).to, 2);
  for (const depth of [0, 22, 60, 72, 204, 300, 420]) {
    const a = environmentAt(level, FIRST_LAYER_Y + depth * LEVEL_HEIGHT);
    const b = environmentAt(level, FIRST_LAYER_Y + (depth + 432) * LEVEL_HEIGHT);
    assert.equal(a.from, b.from);
    assert.equal(a.to, b.to);
    near(a.radius, b.radius);
    near(a.speed, b.speed);
  }
});
test('slow expiry splits motion exactly and pause freezes buffs, wind and the ball', () => {
  const a = createGame(LEVELS[16]),
    b = createGame(LEVELS[16]);
  a.slowLeft = b.slowLeft = 0.003;
  step(a, 1 / 120);
  step(b, 0.003);
  step(b, 1 / 120 - 0.003);
  near(a.y, b.y);
  near(a.v, b.v);
  a.paused = true;
  const frozen = structuredClone(a);
  step(a, 10);
  assert.deepEqual(a, frozen);
});
test('growing radius cannot spend a shield and kill on the same impact', () => {
  const s = createEndlessGame(0),
    floor = 132;
  s.level.layers = Array.from({ length: 24 }, (_, i) => createEndlessLayer(floor + i, 0));
  s.layerOffset = floor;
  s.totalFloors = floor;
  const l = s.level.layers[0];
  s.y = l.y - environmentAt(s.level, l.y).radius - 1;
  s.v = 200;
  s.shield = true;
  const danger = l.danger[0];
  s.rotation = normalizeAngle(
    BALL_ANGLE - danger.start - normalizeAngle(danger.end - danger.start) / 2,
  );
  step(s, 1 / 120);
  assert.equal(s.status, 'playing');
  assert.equal(s.shield, false);
  assert.ok(s.v < 0);
  assert.equal(s.events.filter((e) => e.type === 'shield-hit').length, 1);
  assert.ok(!s.events.some((e) => e.type === 'lost'));
});
test('unlock thresholds grant useful pickups once and never reward a rewind', () => {
  for (const [kind, start] of [
    ['shield', 5],
    ['brake', 13],
    ['slow', 17],
  ]) {
    assert.ok(!LEVELS[start - 2].layers.some((l) => l.pickup === kind));
    assert.ok(LEVELS[start - 1].layers.some((l) => l.pickup === kind));
    const s = createGame(LEVELS[start - 1]);
    s.charge = 0;
    for (
      let i = 0;
      i < 3000 && !s.events.some((e) => e.type === 'pickup' && e.kind === kind);
      i++
    ) {
      rotate(s, getLanding(s).rotationToGap);
      step(s, 1 / 120);
    }
    assert.equal(s.status, 'playing');
    assert.ok(s.events.some((e) => e.type === 'pickup' && e.kind === kind));
    assert.ok(kind === 'shield' ? s.shield : kind === 'slow' ? s.slowLeft > 0 : s.charge === 1);
    const points = s.score,
      floor = s.nextLayer;
    s.status = 'lost';
    assert.ok(resumeCheckpoint(s));
    for (let i = 0; i < 3000 && s.nextLayer < floor; i++) {
      rotate(s, getLanding(s).rotationToGap);
      step(s, 1 / 120);
    }
    assert.equal(s.score, points);
  }
});
test('visible forecast uses ball clearance, including the larger low-air ball', () => {
  const s = createGame(LEVELS[29]),
    l = s.level.layers[0],
    angle = l.gap.start + 0.01;
  assert.equal(sectorAt(l, angle, 0), 'gap');
  assert.notEqual(sectorAt(l, angle, s.ballRadius), 'gap');
  s.rotation = normalizeAngle(BALL_ANGLE - angle);
  assert.equal(getLanding(s).type, sectorAt(l, angle, s.ballRadius));
});

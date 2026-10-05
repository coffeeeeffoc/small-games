import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIELD,
  LEVELS,
  UPGRADES,
  createGame,
  fire,
  step,
  recall,
  applyUpgrade,
  previewAim,
  snapshot,
  triangleVertices,
  validateLevels,
  levelById,
} from '../core.mjs';

const target = (x = 195, hp = 10, kind = 'orb', r = 23) => ({ x, hp, kind, r });
const fixture = (targets = [target()], overrides = {}) => ({
  schemaVersion: 1,
  id: 'physics-fixture',
  title: 'Physics fixture',
  unlock: null,
  balls: 1,
  initialRows: 1,
  waves: [{ targets }],
  upgradeTurns: [],
  reward: 0,
  ...overrides,
});
function finishFlight(game, dt = 1 / 60) {
  for (let frame = 0; game.phase === 'flight' && frame < 1500; frame += 1) step(game, dt);
  assert.notEqual(game.phase, 'flight', 'Every volley must return within a bounded time.');
  return game;
}
function advance(game, duration, dt = 1 / 60) {
  for (let elapsed = 0; elapsed < duration; elapsed += dt)
    step(game, Math.min(dt, duration - elapsed));
}

test('the campaign has stable, unique IDs and reachable prerequisites in schema v1', () => {
  assert.equal(LEVELS.length, 8);
  assert.deepEqual(validateLevels(), []);
  assert.equal(LEVELS[0].unlock, null);
  for (let index = 1; index < LEVELS.length; index += 1)
    assert.equal(LEVELS[index].unlock, LEVELS[index - 1].id);
  assert.equal(levelById('missing'), undefined);
  assert.throws(() => createGame('missing'), /Unknown/);
  assert.equal(UPGRADES.length, 3);
});

test('schema rejects incompatible content, broken prerequisites and overlapping objects', () => {
  const incompatible = structuredClone(LEVELS);
  incompatible[0].schemaVersion = 2;
  incompatible[1].unlock = 'missing';
  incompatible[0].waves[0].targets[1].x = incompatible[0].waves[0].targets[0].x;
  const errors = validateLevels(incompatible);
  assert.ok(errors.some((error) => error.includes('schemaVersion')));
  assert.ok(errors.some((error) => error.includes('unlock')));
  assert.ok(errors.some((error) => error.includes('overlapping')));
  assert.throws(() => createGame({ ...fixture(), balls: 0 }), /Invalid/);
  assert.ok(
    validateLevels([fixture([null, target()])]).some((error) => error.includes('unknown kind')),
  );
});

test('launch input accepts only a finite downward direction and cannot fire twice', () => {
  const game = createGame(LEVELS[0].id);
  assert.equal(fire(game, 0, 0), false);
  assert.equal(fire(game, 1, -1), false);
  assert.equal(fire(game, NaN, 1), false);
  assert.equal(fire(game, 1000, 0.001), true);
  assert.ok(game.direction.y >= 0.16);
  assert.ok(Math.abs(Math.hypot(game.balls[0].vx, game.balls[0].vy) - FIELD.speed) < 0.001);
  assert.equal(fire(game, 0, 1), false);
});

test('a fast ball cannot tunnel through a small circle in a long frame', () => {
  const game = createGame(fixture([target(195, 10, 'orb', 12)]));
  game.targets[0].y = 150;
  fire(game, 0, 1);
  step(game, 0.2); // Unsplit movement would travel 140 px, entirely past the target.
  assert.equal(game.targets[0].hp, 9);
  assert.ok(game.events.some((event) => event.type === 'collision' && event.value === 1));
});

test('side and bottom wall reflections preserve speed and point inward', () => {
  const side = createGame(fixture([target(70)]));
  fire(side, 0, 1);
  Object.assign(side.balls[0], { x: 365, y: 200, vx: 700, vy: 0 });
  step(side, 1 / 240);
  assert.ok(side.balls[0].vx < 0);
  assert.ok(side.balls[0].x <= FIELD.right - FIELD.ballRadius);
  assert.ok(Math.abs(Math.hypot(side.balls[0].vx, side.balls[0].vy) - FIELD.speed) < 0.001);

  const bottom = createGame(fixture([target(70)]));
  fire(bottom, 0, 1);
  Object.assign(bottom.balls[0], { x: 195, y: 560, vx: 0, vy: 700 });
  step(bottom, 1 / 240);
  assert.ok(bottom.balls[0].vy < 0);
  assert.ok(bottom.balls[0].y <= FIELD.bottom - FIELD.ballRadius);
});

test('a prism reflects on its true sloping edge instead of a circular proxy', () => {
  const game = createGame(fixture([target(195, 10, 'prism', 26)]));
  game.targets[0].y = 400;
  fire(game, 0, 1);
  Object.assign(game.balls[0], { x: 205, y: 350 });
  step(game, 0.08);
  assert.equal(game.targets[0].hp, 9);
  assert.ok(game.balls[0].vx > 500, 'The right slope reflects the ball to the right.');
  assert.ok(
    game.balls[0].vy > 0,
    'The slope still points the ball down; a circle would point it up.',
  );
  assert.ok(Math.abs(Math.hypot(game.balls[0].vx, game.balls[0].vy) - FIELD.speed) < 0.001);
  assert.equal(triangleVertices(game.targets[0]).length, 3);

  const rotated = createGame(fixture([{ ...target(195, 10, 'prism', 26), rotation: Math.PI }]));
  rotated.targets[0].y = 400;
  fire(rotated, 0, 1);
  Object.assign(rotated.balls[0], { x: 195, y: 350 });
  step(rotated, 0.08);
  assert.equal(rotated.targets[0].hp, 9);
  assert.ok(rotated.balls[0].vy < 0, 'The upside-down prism presents a horizontal upper face.');
  assert.ok(Math.abs(rotated.balls[0].vx) < 0.01);
});

test('aim dots follow the same triangle reflection and do not change the game', () => {
  const game = createGame(fixture([target(195, 10, 'prism', 26)]));
  game.targets[0].y = 400;
  const before = snapshot(game);
  const dots = previewAim(game, 10, 300);
  assert.ok(dots.length > 10);
  const bounce = dots.findIndex((point) => point.bounce);
  assert.ok(bounce > 0);
  assert.ok(dots[bounce + 1].x > dots[bounce].x);
  assert.ok(dots[bounce + 1].y > dots[bounce].y);
  assert.deepEqual(snapshot(game), before);
});

test('burst explosions damage nearby objects and can cause a second real explosion', () => {
  const game = createGame(
    fixture([target(195, 1, 'burst'), target(265, 2, 'burst'), target(335, 3)]),
  );
  fire(game, 0, 1);
  finishFlight(game);
  assert.equal(game.destroyed, 2);
  assert.equal(game.targets.find((entry) => entry.x === 335).hp, 1);
  assert.equal(game.events.filter((event) => event.type === 'blast').length, 2);
  assert.equal(game.events.filter((event) => event.type === 'break').length, 2);
});

test('a golden pickup adds a future ball and lets the current volley pass through', () => {
  const game = createGame(fixture([target(195, 1, 'pickup', 15), target(300, 10)], { balls: 2 }));
  fire(game, 0, 1);
  advance(game, 0.64);
  assert.equal(game.ballCount, 3);
  assert.equal(game.volleyCount, 2);
  assert.equal(game.emitted, 2);
  assert.equal(game.balls.length, 2);
  assert.ok(game.balls.every((ball) => ball.vy > 0));
  assert.equal(game.destroyed, 0);
  assert.equal(game.events.filter((event) => event.type === 'pickup').length, 1);
  finishFlight(game);
  fire(game, 0, 1);
  assert.equal(game.volleyCount, 3);
});

test('manual recall abandons queued shots and causes no hits while returning', () => {
  const game = createGame(fixture([target(195, 20)], { balls: 8 }));
  fire(game, 0, 1);
  step(game, 0.1);
  assert.ok(game.emitted < game.volleyCount);
  assert.equal(recall(game), true);
  assert.equal(recall(game), false);
  finishFlight(game);
  assert.equal(game.targets[0].hp, 20);
  assert.equal(game.targets[0].y, 460, 'Recall still advances the row normally.');
  assert.equal(game.completedTurns, 1);
  assert.equal(game.collected, 8);
  assert.equal(game.balls.length, 0);
});

test('a pathological horizontal flight times out fairly and always returns', () => {
  const game = createGame(fixture([target(195, 20)]));
  fire(game, 0, 1);
  Object.assign(game.balls[0], { x: 195, y: 200, vx: 700, vy: 0 });
  finishFlight(game, 0.25);
  assert.equal(game.phase, 'aim');
  assert.equal(game.targets[0].hp, 20);
  assert.ok(game.events.some((event) => event.type === 'timeout'));
  assert.ok(game.elapsed < 9.5);
});

test('repeatedly abandoning a target loses at the actual top warning boundary', () => {
  const game = createGame(fixture());
  for (let round = 0; round < 7; round += 1) {
    assert.equal(game.phase, 'aim');
    fire(game, 0, 1);
    recall(game);
    finishFlight(game);
    if (round < 6) assert.equal(game.phase, 'aim');
  }
  assert.equal(game.phase, 'lost');
  assert.equal(game.failure, 'deadline');
  assert.ok(game.targets[0].y - game.targets[0].r <= FIELD.deadline);
  assert.equal(game.events.filter((event) => event.type === 'loss').length, 1);
  const terminal = snapshot(game);
  step(game, 0.25);
  assert.deepEqual(snapshot(game), terminal);
});

test('upgrades are meaningful, happen between rounds, and cannot be replayed', () => {
  for (const id of ['extra', 'power', 'blast']) {
    const game = createGame(fixture([target(195, 20)], { upgradeTurns: [1] }));
    assert.equal(applyUpgrade(game, id), false);
    fire(game, 0, 1);
    recall(game);
    finishFlight(game);
    assert.equal(game.phase, 'upgrade');
    assert.equal(applyUpgrade(game, 'missing'), false);
    assert.equal(game.phase, 'upgrade');
    assert.equal(applyUpgrade(game, id), true);
    assert.equal(game.phase, 'aim');
    assert.equal(applyUpgrade(game, id), false);
    assert.deepEqual(game.upgrades, [id]);
    if (id === 'extra') assert.equal(game.ballCount, 3);
    if (id === 'power') {
      assert.equal(game.damage, 2);
      fire(game, 0, 1);
      finishFlight(game);
      assert.equal(game.targets[0].hp, 18);
    }
    if (id === 'blast') {
      assert.ok(game.blastRadius > 100);
      assert.equal(game.blastDamage, 3);
    }
  }
});

test('clearing every configured wave wins once, after the last ball returns', () => {
  const game = createGame(fixture([target(195, 1)]));
  game.events.push({ type: 'consumer-marker' });
  fire(game, 0, 1);
  advance(game, 0.65);
  assert.equal(game.destroyed, 1);
  assert.equal(game.phase, 'flight', 'The return animation must finish before settlement.');
  finishFlight(game);
  assert.equal(game.phase, 'won');
  assert.equal(game.completedTurns, 1);
  assert.equal(game.events.filter((event) => event.type === 'win').length, 1);
  assert.ok(
    game.events.some((event) => event.type === 'consumer-marker'),
    'The UI owns event consumption.',
  );
  assert.equal(fire(game, 0, 1), false);
  assert.equal(recall(game), false);
  const detached = snapshot(game);
  detached.score = -1;
  assert.notEqual(game.score, -1);
});

// Independent player input fixtures: they are not present in runtime level content.
const campaignShots = [
  [-0.152, -0.85, -0.85],
  [0.132, 0.6],
  [-0.85, -0.6],
  [0.6, 0.6, -0.6],
  [0.6, -0.6, -0.6, 0.6],
  [-0.22, 0.6, -0.185],
  [0.209, -0.85, -0.85, -0.227],
  [-0.21, -0.85, -0.85, -0.6, -0.187, 0.6],
];
for (const [index, level] of LEVELS.entries()) {
  test(`${level.id}: a real finite volley sequence clears the authored campaign level`, () => {
    for (const dt of [1 / 60, 1 / 24]) {
      const game = createGame(level.id);
      for (const slope of campaignShots[index]) {
        if (game.phase === 'upgrade') assert.equal(applyUpgrade(game, 'power'), true);
        assert.equal(fire(game, slope, 1), true);
        finishFlight(game, dt);
      }
      assert.equal(game.phase, 'won');
      assert.equal(game.destroyed, game.totalTargets);
      assert.ok(game.score > 0);
      assert.equal(game.events.filter((event) => event.type === 'win').length, 1);
      assert.ok(game.completedTurns <= 6);
    }
  });
}

test('the first lesson rewards a wall angle instead of auto-clearing on a central shot', () => {
  const game = createGame(LEVELS[0].id);
  fire(game, 0, 1);
  finishFlight(game);
  assert.equal(game.phase, 'aim');
  assert.equal(game.destroyed, 0);
  assert.equal(game.ballCount, LEVELS[0].balls + 1);
});

test('the first level keeps its three-shot touch replay, pickup and power upgrade working together', () => {
  const game = createGame('first-spark');
  assert.equal(fire(game, -0.152, 1), true);
  finishFlight(game);
  assert.equal(game.phase, 'aim');
  assert.equal(game.completedTurns, 1);
  assert.equal(game.ballCount, 9);
  assert.equal(game.destroyed, 4);

  assert.equal(fire(game, -0.85, 1), true);
  finishFlight(game);
  assert.equal(game.phase, 'upgrade');
  assert.equal(game.completedTurns, 2);
  assert.equal(game.destroyed, 5);
  assert.equal(applyUpgrade(game, 'power'), true);
  assert.equal(game.damage, 2);

  assert.equal(fire(game, -0.85, 1), true);
  finishFlight(game);
  assert.equal(game.phase, 'won');
  assert.equal(game.completedTurns, 3);
  assert.equal(game.destroyed, game.totalTargets);
  assert.deepEqual(game.upgrades, ['power']);
  assert.equal(game.events.filter((event) => event.type === 'win').length, 1);
});

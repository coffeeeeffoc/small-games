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
  shotParameters,
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
  assert.ok(Math.abs(Math.hypot(game.balls[0].vx, game.balls[0].vy) - FIELD.maxSpeed) < 0.001);
  assert.equal(fire(game, 0, 440), false);
});

test('a fast ball cannot tunnel through a small circle in a long frame', () => {
  const game = createGame(fixture([target(195, 10, 'orb', 12)]));
  game.targets[0].y = 150;
  fire(game, 0, 440);
  step(game, 0.2); // Unsplit movement would travel 140 px, entirely past the target.
  assert.equal(game.targets[0].hp, 9);
  assert.ok(game.events.some((event) => event.type === 'collision' && event.value === 1));
});

test('side reflection preserves horizontal speed and first floor contact always collects', () => {
  const side = createGame(fixture([target(70)]));
  fire(side, 0, 440);
  Object.assign(side.balls[0], { x: 365, y: 200, vx: 700, vy: 0 });
  step(side, 1 / 240);
  assert.ok(side.balls[0].vx < 0);
  assert.ok(side.balls[0].x <= FIELD.right - FIELD.ballRadius);
  assert.ok(Math.abs(Math.abs(side.balls[0].vx) - 700) < 0.001);
  assert.ok(side.balls[0].vy > 0, 'Gravity continues through a side reflection.');

  const bottom = createGame(fixture([target(70)]));
  fire(bottom, 0, 440);
  Object.assign(bottom.balls[0], { x: 195, y: 560, vx: 0, vy: 700 });
  step(bottom, 1 / 240);
  assert.ok(bottom.balls[0].returning, 'The first floor contact must stop physics immediately.');
  assert.equal(bottom.balls[0].y, FIELD.bottom - FIELD.ballRadius);
  advance(bottom, 0.1);
  assert.ok(bottom.balls[0].y > FIELD.bottom, 'Collection sinks below the floor, never back up.');
  finishFlight(bottom);
  assert.equal(bottom.targets[0].hp, 10);
  assert.equal(bottom.collected, 1);
  assert.equal(bottom.events.find((event) => event.type === 'collect').y, FIELD.bottom);
});

test('a missed shot drains naturally and the aim preview ends at the floor', () => {
  const game = createGame(fixture([target(70)]));
  const dots = previewAim(game, 0, 440);
  assert.equal(dots.at(-1).y, FIELD.bottom - FIELD.ballRadius);
  assert.equal(dots.filter((point) => point.bounce).length, 0);
  fire(game, 0, 440);
  finishFlight(game);
  assert.equal(game.targets[0].hp, 10);
  assert.equal(game.collected, 1);
  assert.ok(game.elapsed < 0.8);
});

test('a target rebound crosses the launcher height but the top reflects it instead of collecting or hiding it', () => {
  const dots = previewAim(createGame(fixture([target(195, 99)])), 0, 440);
  assert.ok(dots.some(point => point.bounce && point.y < FIELD.launchY));
  assert.ok(dots.every(point => point.y >= FIELD.top + FIELD.ballRadius - 0.001));
  const game = createGame(fixture([target(195, 1)]));
  fire(game, 0, 440);
  let crossedTop = false;
  for (let tick = 0; tick < 4000 && game.phase === 'flight'; tick++) {
    step(game, 1 / 240);
    const ball = game.balls[0];
    if (ball) assert.ok(ball.y >= FIELD.top + FIELD.ballRadius - 0.001);
    if (ball && ball.y < FIELD.launchY) {
      crossedTop = true;
      assert.equal(ball.returning, null);
    }
    if (ball?.returning) assert.ok(ball.y >= FIELD.bottom - FIELD.ballRadius);
  }
  assert.ok(crossedTop);
  assert.ok(game.events.some((event) => event.type === 'wall' && event.y < FIELD.launchY));
  assert.equal(game.phase, 'won');
  assert.equal(game.events.filter((event) => event.type === 'collect').length, 1);
});

test('a prism reflects on its true sloping edge instead of a circular proxy', () => {
  const game = createGame(fixture([target(195, 10, 'prism', 26)]));
  game.targets[0].y = 400;
  fire(game, 0, 440);
  Object.assign(game.balls[0], { x: 205, y: 350 });
  step(game, 0.08);
  assert.equal(game.targets[0].hp, 9);
  assert.ok(game.balls[0].vx > 500, 'The right slope reflects the ball to the right.');
  assert.ok(
    game.balls[0].vy > 0,
    'The slope still points the ball down; a circle would point it up.',
  );
  assert.ok(Math.hypot(game.balls[0].vx, game.balls[0].vy) > FIELD.maxSpeed);
  assert.equal(triangleVertices(game.targets[0]).length, 3);

  const rotated = createGame(fixture([{ ...target(195, 10, 'prism', 26), rotation: Math.PI }]));
  rotated.targets[0].y = 400;
  fire(rotated, 0, 440);
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
  fire(game, 0, 440);
  finishFlight(game);
  assert.equal(game.destroyed, 2);
  assert.equal(game.targets.find((entry) => entry.x === 335).hp, 1);
  assert.equal(game.events.filter((event) => event.type === 'blast').length, 2);
  assert.equal(game.events.filter((event) => event.type === 'break').length, 2);
});

test('a golden pickup adds a future ball and lets the current volley pass through', () => {
  const game = createGame(fixture([target(195, 1, 'pickup', 15), target(300, 10)], { balls: 2 }));
  fire(game, 0, 440);
  advance(game, 0.44);
  assert.equal(game.ballCount, 3);
  assert.equal(game.volleyCount, 2);
  assert.equal(game.emitted, 2);
  assert.equal(game.balls.length, 2);
  assert.ok(game.balls.every((ball) => ball.vy > 0));
  assert.equal(game.destroyed, 0);
  assert.equal(game.events.filter((event) => event.type === 'pickup').length, 1);
  finishFlight(game);
  fire(game, 0, 440);
  assert.equal(game.volleyCount, 3);
});

test('manual recall abandons queued shots and causes no hits while returning', () => {
  const game = createGame(fixture([target(195, 20)], { balls: 8 }));
  fire(game, 0, 440);
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

test('gravity pulls a horizontal flight down and all balls eventually return', () => {
  const game = createGame(fixture([target(195, 20)]));
  fire(game, 0, 440);
  Object.assign(game.balls[0], { x: 195, y: 200, vx: 700, vy: 0 });
  finishFlight(game, 0.25);
  assert.equal(game.phase, 'aim');
  assert.equal(game.collected, 1, 'An initially horizontal shot also falls into the collector.');
  assert.ok(game.elapsed < 17.5);
});

test('repeatedly abandoning a target loses at the actual top warning boundary', () => {
  const game = createGame(fixture());
  for (let round = 0; round < 7; round += 1) {
    assert.equal(game.phase, 'aim');
    fire(game, 0, 440);
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
    fire(game, 0, 440);
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
      fire(game, 0, 440);
      finishFlight(game);
      const hits = game.events.filter((event) => event.type === 'collision');
      assert.ok(hits.length > 0);
      assert.ok(hits.every((event) => event.value === 2));
      assert.equal(game.targets[0]?.hp ?? 0, 20 - hits.length * 2);
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
  fire(game, 0, 440);
  advance(game, 0.6);
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
  assert.equal(fire(game, 0, 440), false);
  assert.equal(recall(game), false);
  const detached = snapshot(game);
  detached.score = -1;
  assert.notEqual(game.score, -1);
});

// Independent player input fixtures: they are not present in runtime level content.
const campaignShots = [[[130,492],[68,214],[235,230],[235,492],[275,214]],[[115,230],[68,510],[68,360],[315,230],[75,214],[195,214]],[[275,360],[115,510],[75,510],[235,360],[68,230]],[[35,214],[315,492],[355,230],[275,492],[195,214]],[[68,230],[75,214],[115,360],[275,510],[315,360],[355,214]],[[68,492],[235,510],[235,230],[130,510],[355,510],[130,214]],[[68,510],[115,360],[235,230],[275,360],[68,214],[68,492],[115,492]],[[235,492],[315,510],[315,230],[115,360],[315,510],[315,360],[130,360],[130,510]]];
for (const [index, level] of LEVELS.entries()) {
  test(`${level.id}: a real finite volley sequence clears the authored campaign level`, () => {
    for (const dt of [1 / 60, 1 / 24]) {
      const game = createGame(level.id);
      for (const [x, y] of campaignShots[index]) {
        if (game.phase === 'upgrade') assert.equal(applyUpgrade(game, 'power'), true);
        assert.equal(fire(game, x - game.launch.x, y - game.launch.y), true);
        finishFlight(game, dt);
      }
      assert.equal(game.phase, 'won');
      assert.equal(game.destroyed, game.totalTargets);
      assert.ok(game.score > 0);
      assert.equal(game.events.filter((event) => event.type === 'win').length, 1);
      assert.ok(game.completedTurns <= 10);
    }
  });
}

test('the first lesson rewards a wall angle instead of auto-clearing on a central shot', () => {
  const game = createGame(LEVELS[0].id);
  fire(game, 0, 440);
  finishFlight(game);
  assert.equal(game.phase, 'aim');
  assert.equal(game.destroyed, 0);
  assert.equal(game.ballCount, LEVELS[0].balls + 1);
});

test('the first level preserves pickup and mid-run upgrades through a five-volley touch replay', () => {
  const game = createGame('first-spark');
  for (const [index, [x, y]] of campaignShots[0].entries()) {
    if (game.phase === 'upgrade') assert.equal(applyUpgrade(game, 'power'), true);
    assert.equal(fire(game, x - 195, y - 64), true);
    finishFlight(game);
    assert.equal(game.completedTurns, index + 1);
  }
  assert.equal(game.phase, 'won');
  assert.ok(game.ballCount > LEVELS[0].balls);
  assert.deepEqual(game.upgrades, ['power']);
  assert.equal(game.events.filter((event) => event.type === 'win').length, 1);
});

test('release distance sets speed with a bounded power range, without changing the angle', () => {
  const near = shotParameters(40, 100), far = shotParameters(160, 400);
  assert.deepEqual([near.x, near.y], [far.x, far.y]);
  assert.ok(far.speed > near.speed * 1.8);
  assert.equal(shotParameters(10000, 10000).speed, FIELD.maxSpeed);
  assert.ok(shotParameters(0, 1).speed >= FIELD.minSpeed);
  assert.equal(shotParameters(Infinity, 400), null);
  assert.equal(shotParameters(Number.MAX_VALUE, Number.MAX_VALUE), null);
});

test('free flight follows gravity and preview samples match actual fixed-step flight', () => {
  const game = createGame(fixture([target(70)]));
  const dots = previewAim(game, 80, 160);
  fire(game, 80, 160);
  const { vx, vy } = game.balls[0];
  advance(game, 0.2);
  const ball = game.balls[0];
  assert.ok(Math.abs(ball.x - (195 + vx * 0.2)) < 0.001);
  assert.ok(Math.abs(ball.y - (64 + vy * 0.2 + FIELD.gravity * 0.2 ** 2 / 2)) < 0.001);
  const predicted = dots.find((point) => Math.abs(point.time - 0.2) < 0.00001);
  assert.ok(predicted);
  assert.ok(Math.hypot(ball.x - predicted.x, ball.y - predicted.y) < 0.001);
});

test('preview stops at a destroyed target instead of predicting a second hit on its ghost', () => {
  const game = createGame(fixture([target(195, 1)]));
  game.targets[0].y = 460;
  const before = snapshot(game);
  const dots = previewAim(game, 24, 440);
  assert.equal(dots.filter((point) => point.bounce).length, 1);
  assert.ok(Math.hypot(dots.at(-1).x - 195, dots.at(-1).y - 460) < 28);
  assert.deepEqual(snapshot(game), before);
  fire(game, 24, 440);
  advance(game, dots.at(-1).time);
  assert.equal(game.destroyed, 1);
});

test('one ball genuinely alternates between two targets without tunnelling or artificial extra damage', () => {
  const game = createGame(fixture([target(100, 99), target(290, 99)]));
  Object.assign(game.targets[0], { x: 195, y: 300 });
  Object.assign(game.targets[1], { x: 195, y: 370 });
  fire(game, 0, 440);
  Object.assign(game.balls[0], { x: 195, y: 335, vx: 0, vy: 700 });
  advance(game, 0.2);
  const hits = game.events.filter((event) => event.type === 'collision');
  assert.ok(hits.length >= 6);
  hits.slice(1).forEach((hit, index) => assert.notEqual(hit.targetId, hits[index].targetId));
  assert.equal(game.targets.reduce((sum, entry) => sum + 99 - entry.hp, 0), hits.length);
  assert.ok(game.events.some((event) => event.type === 'ricochet'));
  assert.ok(game.balls[0].y >= 327 && game.balls[0].y <= 343);
});

test('a resting contact cannot grind down a target once per physics tick', () => {
  const game = createGame(fixture([target(195, 99)]));
  game.targets[0].y = 400;
  fire(game, 0, 440);
  Object.assign(game.balls[0], { x: 195, y: 373, vx: 0, vy: 0 });
  advance(game, 0.5);
  assert.equal(game.targets[0].hp, 99);
});

test('irregular frame timing gives the same flight as 60 fps', () => {
  const uniform = createGame(LEVELS[0].id), irregular = createGame(LEVELS[0].id);
  for (const game of [uniform, irregular]) fire(game, -65, 428);
  for (let n = 0; n < 60; n++) step(uniform, 1 / 60);
  for (let n = 0; n < 20; n++) { step(irregular, 0.013); step(irregular, 0.037); }
  assert.deepEqual(irregular.targets, uniform.targets);
  assert.deepEqual(irregular.balls, uniform.balls);
  assert.equal(irregular.score, uniform.score);
});

test('manual recall drains downward, produces no damage, and waits for every collection', () => {
  const game = createGame(fixture([target(195, 99)], { balls: 8 }));
  fire(game, 0, 440);
  advance(game, 0.3);
  const originalX = game.balls[0].x;
  const originalY = game.balls[0].y;
  const hp = game.targets[0].hp;
  recall(game);
  step(game, 0.25);
  assert.equal(game.phase, 'flight');
  assert.equal(game.balls[0].x, originalX);
  assert.ok(game.balls[0].y > originalY, 'Manual recall also drains toward the bottom.');
  assert.equal(game.completedTurns, 0);
  assert.equal(game.targets[0].hp, hp);
  finishFlight(game);
  assert.equal(game.completedTurns, 1);
  assert.equal(game.collected, game.volleyCount);
  assert.equal(game.events.filter((event) => event.type === 'turn').length, 1);
});

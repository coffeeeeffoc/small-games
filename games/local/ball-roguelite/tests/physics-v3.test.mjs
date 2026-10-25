import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  fire,
  update,
  recall,
  checkpoint,
  restoreGame,
  drainEvents,
  FIELD,
  PHYSICS,
  LIMITS,
  chooseUpgrade,
  brickCenter,
  targetProfile,
} from '../core.mjs';
import { createStorage, STORAGE_KEY } from '../storage.mjs';
const target = (id, c, r, hp = 80, kind = 'brick') => ({ id, c, r, hp, maxHp: hp, kind });
const settle = (g) => {
  for (let i = 0; ['flight', 'recall'].includes(g.phase) && i < 27 * 60; i++) update(g, 1 / 60);
  assert.ok(!['flight', 'recall'].includes(g.phase));
};

test('absorbers damage first then consume only the colliding volley ball, even with pierce', () => {
  const g = createGame('stardust');
  g.count = 3;
  g.upgrades.pierce = 2;
  g.bricks = [target(100, 3, 6, 80, 'absorber')];
  fire(g, 0, 500);
  settle(g);
  const events = drainEvents(g),
    absorbs = events.filter((e) => e.type === 'absorb');
  assert.equal(absorbs.length, 3);
  assert.equal(g.absorbed, 3);
  assert.equal(g.count, 3);
  assert.equal(g.bricks.find((b) => b.id === 100).hp, 77);
  assert.equal(g.turn, 1);
  assert.equal(g.balls.length, 0);
  assert.ok(
    absorbs.every(
      (e) =>
        e.kind === 'absorber' &&
        e.hp > 0 &&
        e.maxHp === 80 &&
        e.profile.material === 'absorber' &&
        e.ballId,
    ),
  );
  assert.equal(fire(g, 0, 500), true);
  assert.equal(g.volley, 3);
});

test('destroying an absorber saves the current projectile and reports its material for shattering', () => {
  const g = createGame('stardust');
  g.count = 1;
  g.bricks = [target(100, 3, 6, 1, 'absorber')];
  fire(g, 0, 500);
  update(g, 0.25);
  const events = drainEvents(g);
  assert.equal(events.filter((e) => e.type === 'absorb').length, 0);
  const shattered = events.find((e) => e.type === 'break');
  assert.equal(shattered.kind, 'absorber');
  assert.equal(shattered.maxHp, 1);
  assert.equal(shattered.profile.radius, 21);
  assert.equal(g.absorbed, 0);
  assert.equal(g.count, 1);
  assert.ok(g.balls.some((b) => !b.done));
});

test('gravity produces a continuous curve before collision while preserving horizontal velocity', () => {
  const g = createGame('endless');
  g.count = 1;
  g.bricks = [];
  fire(g, 80, 400);
  const start = structuredClone(g.balls[0]),
    dt = 0.2;
  update(g, dt);
  const ball = g.balls[0];
  assert.ok(Math.abs(ball.vx - start.vx) < 1e-8);
  assert.ok(Math.abs(ball.vy - start.vy - PHYSICS.gravity * dt) < 1e-8);
  const linearY = start.y + start.vy * dt;
  assert.ok(
    ball.y > linearY + 0.1,
    'gravity visibly bends the trajectory downward without a discontinuity',
  );
});

test('manual recall retains bodies and runs a pauseable downward drop before raising the board', () => {
  const g = createGame('endless');
  g.count = 4;
  g.bricks = [target(100, 0, 0)];
  fire(g, 100, 400);
  update(g, 0.25);
  const original = g.balls.map((b) => ({ id: b.id, x: b.x, y: b.y })),
    board = structuredClone(g.bricks),
    turn = g.turn;
  assert.equal(recall(g), true);
  assert.equal(g.phase, 'recall');
  assert.equal(g.turn, turn);
  assert.equal(g.balls.length, original.length);
  assert.deepEqual(
    g.balls.map((b) => ({ id: b.id, x: b.x, y: b.y })),
    original,
  );
  assert.ok(
    g.balls.every((b) => b.returning && b.returnDuration >= 0.25 && b.returnDuration <= 0.8),
  );
  const frozen = structuredClone(g);
  update(g, 0);
  update(g, NaN);
  assert.deepEqual(g, frozen);
  update(g, 0.25);
  assert.equal(g.phase, 'recall');
  assert.equal(g.turn, turn);
  assert.deepEqual(g.bricks, board);
  assert.ok(g.balls.some((b) => Math.hypot(b.x - b.returnTo.x, b.y - b.returnTo.y) > 10));
  assert.ok(g.balls.some((b, i) => b.x !== original[i].x || b.y !== original[i].y));
  settle(g);
  assert.equal(g.turn, turn + 1);
  assert.equal(g.balls.length, 0);
  assert.equal(g.bricks.find((b) => b.id === 100).r, 1);
  const events = drainEvents(g);
  assert.equal(events.filter((e) => e.type === 'returned').length, original.length);
  assert.equal(events.find((e) => e.type === 'recall').reason, 'manual');
});

test('deadline drops remaining balls down and natural floor collection completes immediately', () => {
  const g = createGame('endless');
  g.count = 1;
  g.bricks = [];
  fire(g, 100, 400);
  g.flight = 23.99;
  update(g, 0.02);
  assert.equal(g.phase, 'recall');
  assert.equal(g.recallReason, 'timeout');
  assert.equal(g.turn, 0);
  assert.ok(g.balls.length > 0);
  settle(g);
  assert.equal(g.turn, 1);
  const natural = createGame('endless');
  natural.count = 1;
  natural.bricks = [];
  fire(natural, 0, 500);
  let first;
  for (let i = 0; i < 60 * 10 && !first; i++) {
    update(natural, 1 / 60);
    first = drainEvents(natural).find((e) => e.type === 'returned');
  }
  assert.ok(first);
  assert.equal(first.reason, 'natural');
  assert.equal(first.y, FIELD.floor);
  assert.equal(natural.balls.length, 0);
  assert.equal(natural.turn, 1);
});

test('gravity, target collisions and absorber ordering agree at 24/60/144 frames per second', () => {
  const outcomes = [24, 60, 144].map((fps) => {
    const g = createGame('endless', { seed: 123 });
    g.count = 3;
    g.bricks = [target(100, 3, 5, 80, 'absorber'), target(101, 2, 6)];
    assert.equal(fire(g, 0, 400), true);
    for (let f = 0; f < fps; f++) update(g, 1 / fps);
    assert.ok(g.collisionCount > 0 && g.absorbed > 0);
    return {
      phase: g.phase,
      bricks: g.bricks,
      balls: g.balls.map(({ id, x, y, vx, vy, returning }) => ({ id, x, y, vx, vy, returning })),
      absorbed: g.absorbed,
      seed: g.seed,
    };
  });
  assert.deepEqual(outcomes[0], outcomes[1]);
  assert.deepEqual(outcomes[1], outcomes[2]);
});

test('flight and recall never overwrite the pre-launch checkpoint, including an old schema2 run', () => {
  const values = new Map(),
    storage = createStorage({ getItem: (k) => values.get(k), setItem: (k, v) => values.set(k, v) }),
    g = createGame('stardust');
  storage.saveRun(g);
  const before = values.get(STORAGE_KEY);
  fire(g, 100, 400);
  update(g, 0.2);
  storage.saveRun(g);
  assert.equal(values.get(STORAGE_KEY), before);
  assert.equal(checkpoint(g), null);
  recall(g);
  update(g, 0.2);
  storage.saveRun(g);
  assert.equal(values.get(STORAGE_KEY), before);
  assert.equal(checkpoint(g), null);
  assert.equal(restoreGame({ ...JSON.parse(before).runs.campaign, phase: 'recall' }), null);
  const old = JSON.parse(before).runs.campaign;
  old.schemaVersion = 2;
  old.count = 36;
  old.bricks = [target(100, 2, 7, 100)];
  old.nextId = 101;
  const restored = restoreGame(old);
  assert.ok(restored);
  assert.equal(restored.count, LIMITS.balls);
  assert.equal(restored.bricks[0].hp, Math.ceil((100 * 22) / 36));
});

test('endless pickups arrive every fourth wave and large clears do not mint extra volley balls', () => {
  const g = createGame('endless');
  assert.equal(g.bricks.filter((b) => b.kind === 'pickup').length, 1);
  g.count = 1;
  g.bricks = Array.from({ length: 21 }, (_, i) =>
    target(100 + i, i % 7, 3 + Math.floor(i / 7), 1, 'bomb'),
  );
  fire(g, 0, 400);
  for (let i = 0; i < 100 && g.score < 21; i++) update(g, 1 / 60);
  assert.equal(g.score, 21);
  assert.equal(g.count, 1);
  assert.equal(drainEvents(g).filter((e) => e.type === 'combo-reward').length, 0);
});

test('8–12 degree launches sustain wall rebounds and still contact lower targets with larger marbles', () => {
  for (const degrees of [8, 10, 12]) {
    for (const withTargets of [false, true]) {
      const g = createGame('endless');
      g.count = 1;
      g.bricks = withTargets
        ? Array.from({ length: 7 }, (_, c) => target(99 + c, c, 3, 500))
        : [];
      fire(
        g,
        Math.cos((degrees * Math.PI) / 180) * 500,
        Math.sin((degrees * Math.PI) / 180) * 500,
      );
      let walls = 0;
      const hits = [],
        speeds = [];
      for (let i = 0; ['flight', 'recall'].includes(g.phase) && i < 27 * 60; i++) {
        update(g, 1 / 60);
        for (const e of drainEvents(g)) {
          if (e.type === 'hit') hits.push(e);
          if (e.type === 'bounce') {
            if (e.kind === 'wall') walls++;
            speeds.push(e.speed);
          }
        }
      }
      if (withTargets) {
        assert.ok(hits.length >= 1, `${degrees} degrees reaches the target field`);
        assert.ok(hits.every((e) => e.ballId && e.damage === 1));
      } else assert.ok(walls >= 3, `${degrees} degrees sustains side rebounds`);
      assert.ok(
        speeds.every(
          (speed) => speed >= PHYSICS.minSpeed - 1e-8 && speed <= PHYSICS.maxSpeed + 1e-8,
        ),
      );
      assert.ok(speeds.length > 0);
      assert.ok(!['flight', 'recall'].includes(g.phase));
    }
  }
});

test('gravity campaign rewards target selection while fixed vertical shots still fail expert boards', () => {
  // Re-measured with orbit-v4; see gravity-drop/campaign-report.json for all 72 runs.
  for (const [id, strategy, expected] of [
    ['stardust', 'direct', 'won'],
    ['prism', 'direct', 'won'],
    ['lattice', 'direct', 'won'],
    ['lattice', 'fixed', 'lost'],
    ['eclipse', 'direct', 'won'],
    ['eclipse', 'fixed', 'lost'],
  ])
    for (const seed of [1234, 20261006, 998811]) {
      const g = createGame(id, { seed });
      for (let turn = 0; !['won', 'lost'].includes(g.phase) && turn < 30; turn++) {
        if (g.phase === 'upgrade')
          chooseUpgrade(
            g,
            ['power', 'pierce', 'extra', 'chain', 'blast', 'critical'].find((id) =>
              g.cards.includes(id),
            ),
          );
        const target = g.bricks
          .filter((b) => b.kind !== 'pickup')
          .sort((a, b) => b.r - a.r || a.hp - b.hp)[0];
        const p = target ? brickCenter(target) : { x: g.launchX, y: 60 };
        fire(
          g,
          strategy === 'fixed' ? 0 : p.x - g.launchX,
          strategy === 'fixed' ? 500 : p.y - FIELD.launchY,
        );
        settle(g);
      }
      assert.equal(g.phase, expected, `${id} / ${strategy} / ${seed}`);
    }
});

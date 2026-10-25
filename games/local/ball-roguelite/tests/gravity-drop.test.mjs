import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, fire, update, drainEvents, recall, checkpoint, restoreGame,
  aimVelocity, previewShot, brickCenter, FIELD, PHYSICS, RHYTHM,
} from '../core.mjs';
import { createStorage, STORAGE_KEY } from '../storage.mjs';

test('release distance controls bounded initial speed, without changing angle or depending on hold time', () => {
  const near = aimVelocity(20, 80), far = aimVelocity(100, 400);
  assert.ok(near.speed < far.speed);
  assert.ok(Math.abs(near.x / near.y - far.x / far.y) < 1e-12);
  assert.equal(aimVelocity(0, 10000).speed, FIELD.speed);
  for (const [x, y] of [[NaN, 100], [0, Infinity], [0, 0], [0, -100], [0, 6]])
    assert.equal(aimVelocity(x, y), null);
  const g = createGame();
  assert.ok(fire(g, 100, 400));
  assert.equal(g.balls[0].y, FIELD.launchY);
  assert.equal(g.balls[0].vx, far.x);
  assert.equal(g.balls[0].vy, far.y);
});

test('gravity preview uses the actual solver and leaves the run untouched', () => {
  for (const [dx, dy] of [[25, 90], [150, 20], [-80, 520]]) {
    const g = createGame('endless');
    g.count = 1;
    g.bricks = [];
    const before = structuredClone(g), points = previewShot(g, dx, dy);
    assert.deepEqual(g, before);
    assert.ok(points.length > 15);
    fire(g, dx, dy);
    for (let i = 1; i < 15; i++) {
      update(g, PHYSICS.step * 4);
      assert.ok(Math.hypot(points[i].x - g.balls[0].x, points[i].y - g.balls[0].y) < 1e-9);
    }
  }
  const g = createGame('endless');
  g.bricks = [{ id: 99, c: 3, r: 6, hp: 1, maxHp: 1, kind: 'absorber' }];
  const before = structuredClone(g), points = previewShot(g, 0, 400);
  assert.deepEqual(g, before, 'preview collision cannot damage, score or consume the live ball');
  assert.ok(points.length > 2 && points.at(-1).y < brickCenter(g.bricks[0]).y);
});

test('one ball repeatedly alternates between two separated targets with real travel and contact corners', () => {
  const g = createGame('endless', { seed: 1 });
  g.count = 1;
  g.bricks = [
    { id: 99, c: 2, r: 4, hp: 100, maxHp: 100, kind: 'brick' },
    { id: 101, c: 3, r: 6, hp: 100, maxHp: 100, kind: 'brick' },
  ];
  fire(g, -80, 520);
  const impacts = [];
  for (let i = 0; i < 2 * 240; i++) {
    update(g, PHYSICS.step);
    for (const e of drainEvents(g))
      if (e.type === 'bounce' && e.kind === 'brick') {
        impacts.push(e);
        assert.ok(g.balls[0].trail.some((p) => p.contact));
      }
    assert.ok(g.balls[0].trail.length <= RHYTHM.trailLimit);
    assert.ok(g.balls[0].trail.every((p) => g.elapsed - p.t <= RHYTHM.trailSeconds + 1e-9));
  }
  assert.ok(impacts.length >= 20);
  for (let i = 1; i < impacts.length; i++) {
    assert.notEqual(impacts[i].brickId, impacts[i - 1].brickId);
    assert.ok(impacts[i].at - impacts[i - 1].at > 0.02, 'separate impacts, not overlap damage');
  }
  assert.equal(200 - g.bricks.reduce((sum, b) => sum + b.hp, 0), impacts.length);
});

test('an untouched ball disappears on its first floor contact, without a trip back to the launcher', () => {
  const g = createGame('endless');
  g.count = 1;
  g.bricks = [];
  fire(g, 30, 400);
  let y = FIELD.launchY;
  const events = [];
  for (let i = 0; i < 600 && g.turn === 0; i++) {
    update(g, PHYSICS.step);
    events.push(...drainEvents(g));
    for (const ball of g.balls) {
      assert.ok(ball.y >= y && ball.y < FIELD.floor - FIELD.radius);
      assert.equal(ball.returning, undefined);
      y = ball.y;
    }
  }
  assert.equal(g.turn, 1);
  assert.equal(g.balls.length, 0);
  assert.ok(g.elapsed < 0.7, 'no extra docking animation delays the turn');
  assert.ok(!events.some((e) => ['hit', 'return', 'bounce'].includes(e.type)));
  const collected = events.filter((e) => e.type === 'returned');
  assert.equal(collected.length, 1);
  assert.equal(collected[0].y, FIELD.floor);
  assert.equal(collected[0].reason, 'natural');
});

test('real target bounces continue until floor contact, then no later contact or top return is possible', () => {
  const g = createGame('endless');
  g.count = 1;
  g.bricks = [{ id: 99, c: 3, r: 6, hp: 2, maxHp: 2, kind: 'brick' }];
  fire(g, 0, 400);
  const events = [];
  let upward = false;
  for (let i = 0; i < 24 * 240 && g.turn === 0; i++) {
    update(g, PHYSICS.step);
    const batch = drainEvents(g);
    events.push(...batch);
    upward ||= g.balls.some((b) => b.vy < 0);
    if (batch.some((e) => e.type === 'returned')) assert.equal(g.balls.length, 0);
  }
  assert.ok(upward, 'the target reflects the falling ball upward');
  assert.equal(events.filter((e) => e.type === 'hit').length, 2);
  assert.equal(events.filter((e) => e.type === 'returned').length, 1);
  assert.ok(events.findLastIndex((e) => e.type === 'hit') < events.findIndex((e) => e.type === 'returned'));
  assert.equal(events.find((e) => e.type === 'returned').y, FIELD.floor);
  assert.equal(g.turn, 1);
});

test('manual collection only travels downward and waits for every ball to reach the floor', () => {
  const g = createGame('endless');
  g.count = 4;
  g.bricks = [];
  fire(g, 30, 400);
  update(g, 0.25);
  recall(g);
  const previous = new Map(g.balls.map((b) => [b.id, { x: b.x, y: b.y }]));
  for (let i = 0; i < 240 && g.turn === 0; i++) {
    update(g, PHYSICS.step);
    for (const ball of g.balls) {
      const last = previous.get(ball.id);
      assert.equal(ball.x, last.x);
      assert.ok(ball.y >= last.y && ball.y < FIELD.floor - FIELD.radius);
      previous.set(ball.id, { x: ball.x, y: ball.y });
    }
    if (g.balls.length) assert.equal(g.turn, 0);
  }
  assert.equal(g.turn, 1);
  const events = drainEvents(g);
  assert.ok(!events.some((e) => e.type === 'hit'));
  const collected = events.filter((e) => e.type === 'returned');
  assert.equal(collected.length, previous.size);
  assert.ok(collected.every((e) => e.y === FIELD.floor && e.x === previous.get(e.ballId).x));
  assert.ok(brickCenter({ c: 3, r: 1 }).y < brickCenter({ c: 3, r: 0 }).y);
});

test('schema3 mode slots retain progress, upgrades and consumed rewards while disabling mixed-rule sharing', () => {
  const campaign = checkpoint(createGame('stardust', { seed: 123 }));
  const endless = checkpoint(createGame('endless', { seed: 456 }));
  for (const run of [campaign, endless]) {
    run.schemaVersion = 3;
    run.launchX = 70;
    run.turn = 5;
    run.phase = 'upgrade';
    run.cards = ['power', 'extra', 'chain'];
    run.upgrades = { pierce: 1 };
    run.rewards = { resonance: 1, rescue: 0 };
  }
  const values = new Map([[STORAGE_KEY, JSON.stringify({ schemaVersion: 2, runs: { campaign, endless }, lastMode: 'endless' })]]);
  const storage = createStorage({ getItem: (k) => values.get(k), setItem: (k, v) => values.set(k, v) });
  for (const slot of ['campaign', 'endless']) {
    const run = storage.read().runs[slot];
    assert.equal(run.schemaVersion, 4);
    assert.equal(run.launchX, 195);
    assert.equal(run.initialSeed, null);
    assert.equal(run.turn, 5);
    assert.equal(run.phase, 'upgrade');
    assert.deepEqual(run.rewards, { resonance: 1, rescue: 0 });
    assert.deepEqual(run.upgrades, { pierce: 1 });
    assert.deepEqual(restoreGame(run).bricks, run.bricks);
    storage.saveRun(restoreGame(run));
  }
  assert.equal(JSON.parse(values.get(STORAGE_KEY)).runs.campaign.turn, 5);
  assert.equal(JSON.parse(values.get(STORAGE_KEY)).runs.endless.turn, 5);
});

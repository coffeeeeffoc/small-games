import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, fire, update, drainEvents, FIELD, brickCenter } from '../core.mjs';

const target = (id, c, r, hp = 170, kind = 'brick') => ({ id, c, r, hp, maxHp: hp, kind });
function runUntil(game, frames, dt = 1 / 240) {
  const events = [];
  for (let i = 0; i < frames; i++) {
    update(game, dt);
    events.push(...drainEvents(game));
  }
  return events;
}

for (const [shape, id, degrees, offset] of [
  ['circle', 99, 0, 13 + FIELD.radius],
  ['hexagon', 100, 85, -18 - FIELD.radius],
]) {
  test(`grazing pierce damages a ${shape} once until the ball leaves its surface`, () => {
    const game = createGame('endless', { seed: 123 });
    game.count = 1;
    game.upgrades.pierce = 2;
    game.bricks = [target(id, 3, 5)];
    fire(game, 0, 500);
    const center = brickCenter(game.bricks[0]);
    const angle = (degrees * Math.PI) / 180;
    Object.assign(game.balls[0], {
      x: center.x - Math.cos(angle) * 90 - Math.sin(angle) * offset,
      y: center.y - Math.sin(angle) * 90 + Math.cos(angle) * offset,
      vx: Math.cos(angle) * 690,
      vy: Math.sin(angle) * 690,
    });
    const hits = runUntil(game, 62).filter((e) => e.type === 'hit');
    assert.equal(hits.length, 1, 'one entry must not spend both pierces and hit a third time');
    assert.equal(game.bricks[0].hp, 169);
    assert.equal(game.balls[0].pierce, 1);
    assert.equal(hits[0].ballId, game.balls[0].id);
  });
}

for (const [damage, pierce] of [
  [1, 0],
  [4, 0],
  [1, 2],
  [4, 2],
]) {
  test(`22 balls at ${damage} damage and ${pierce} pierce deduct only actual contact damage`, () => {
    const game = createGame('endless', { seed: 123 });
    game.count = 22;
    game.damage = damage;
    game.upgrades.pierce = pierce;
    const brick = target(99, 3, 6);
    game.bricks = [brick];
    fire(game, 0, 500);
    const events = runUntil(game, 24 * 240);
    const hits = events.filter((e) => e.type === 'hit' && e.id === brick.id);
    assert.ok(hits.length >= 22);
    assert.ok(hits.every((e) => e.damage === damage && e.ballId));
    assert.equal(brick.hp, 170 - hits.length * damage);
    if (!pierce) {
      const repeated = hits.filter((e) => e.ballId === hits[0].ballId);
      assert.ok(repeated.length > 1, 'gravity and the ceiling allow genuine re-entry');
      const bounces = events.filter((e) => e.type === 'bounce' && e.kind === 'brick' && e.ballId === hits[0].ballId);
      assert.ok(bounces.every((e, i) => i === 0 || e.at - bounces[i - 1].at > 0.1), 'no overlap spam');
    } else assert.equal(hits.length, 22, 'piercing falls through to collection without a floor rebound');
  });
}

function firstHit(upgrade, seed = 1, bomb = false) {
  const game = createGame('endless', { seed });
  game.count = 1;
  if (upgrade) game.upgrades[upgrade] = 3;
  game.bricks = [
    target(99, 3, 6, bomb ? 1 : 170, bomb ? 'bomb' : 'brick'),
    target(101, 4, 6),
    target(102, 0, 0),
  ];
  game.seed = seed;
  fire(game, 0, 500);
  return { game, events: runUntil(game, 63) };
}

test('ordinary direct contact does not damage any neighbouring or distant target', () => {
  const { game, events } = firstHit();
  assert.deepEqual(
    game.bricks.map((b) => b.hp),
    [169, 170, 170],
  );
  assert.equal(events.filter((e) => e.type === 'hit').length, 1);
});

test('blast upgrade and shattered burst crystal affect neighbours but not a distant target', () => {
  for (const { game, events } of [firstHit('blast'), firstHit(null, 1, true)]) {
    assert.ok(events.some((e) => e.type === 'blast'));
    assert.equal(game.bricks.find((b) => b.id === 101).hp, 169);
    assert.equal(game.bricks.find((b) => b.id === 102).hp, 170);
  }
});

test('chain damage has an explicit source and destination for visible feedback', () => {
  const { game, events } = firstHit('chain', 2);
  const chain = events.find((e) => e.type === 'chain');
  assert.deepEqual(chain.from, brickCenter(game.bricks[0]));
  const secondary = events.find((e) => e.type === 'hit' && e.id !== 99);
  assert.equal(secondary.damage, 1);
  assert.deepEqual(chain.to, brickCenter(game.bricks.find((b) => b.id === secondary.id)));
});

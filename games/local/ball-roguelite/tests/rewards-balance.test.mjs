import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  fire,
  update,
  drainEvents,
  brickCenter,
  targetProfile,
  FIELD,
  LIMITS,
  upgradeAvailable,
  chooseUpgrade,
  canReward,
  grantReward,
  checkpoint,
  restoreGame,
} from '../core.mjs';
import { UPGRADES } from '../levels.mjs';
const brick = (id, c, r, hp = 100) => ({ id, c, r, kind: 'brick', hp, maxHp: hp });

test('material contours are stable across row descent and contain both sizes and shapes', () => {
  const profiles = Array.from({ length: 20 }, (_, i) => targetProfile(brick(i + 1, 3, 2)));
  assert.equal(new Set(profiles.map((p) => p.radius)).size, 3);
  assert.equal(new Set(profiles.map((p) => p.shape)).size, 2);
  assert.equal(new Set(profiles.map((p) => p.material)).size, 3);
  assert.deepEqual(targetProfile(brick(6, 2, 0)), targetProfile(brick(6, 2, 9)));
});

test('circle visual corners have no invisible rectangular hit box', () => {
  const game = createGame('endless');
  game.count = 1;
  const target = brick(99, 3, 6),
    c = brickCenter(target),
    r = targetProfile(target).radius;
  game.bricks = [target];
  game.launchX = c.x + r + FIELD.radius + 0.05;
  fire(game, 0, -500);
  update(game, 0.25);
  assert.equal(target.hp, 100);
  assert.equal(drainEvents(game).filter((e) => e.type === 'hit').length, 0);
});

test('hex face and vertex hits use the visible polygon normal and surface', () => {
  for (const offset of [0, 8]) {
    const game = createGame('endless');
    game.count = 1;
    const target = brick(100, 3, 6),
      c = brickCenter(target),
      r = targetProfile(target).radius;
    game.bricks = [target];
    game.launchX = c.x + offset;
    fire(game, 0, -500);
    update(game, 0.25);
    const hit = drainEvents(game).find((e) => e.type === 'bounce');
    assert.ok(hit);
    if (offset === 0) {
      assert.ok(Math.abs(hit.x - c.x) < 1e-6);
      assert.ok(Math.abs(hit.y - c.y - r) < 1e-6);
      assert.ok(Math.abs(hit.nx) < 1e-6);
    } else {
      assert.ok(Math.abs(hit.nx - 0.5) < 1e-6);
      assert.ok(Math.abs(hit.ny - Math.sqrt(3) / 2) < 1e-6);
      assert.ok(Math.abs(hit.y - c.y - (r - (hit.x - c.x) / Math.sqrt(3))) < 1e-6);
    }
    assert.ok(Math.abs(Math.hypot(game.balls[0].vx, game.balls[0].vy) - FIELD.speed) < 1e-6);
  }
});

test('refraction only makes a small departing correction toward a nearby forward target', () => {
  const game = createGame('endless');
  game.count = 1;
  game.bricks = [brick(99, 3, 6), brick(98, 2, 7)];
  game.launchX = 183;
  fire(game, 0, -500);
  update(game, 0.25);
  const bounces = drainEvents(game).filter((e) => e.type === 'bounce');
  assert.ok(bounces.length);
  assert.ok(bounces.every((e) => Math.abs(e.refraction) <= (8 * Math.PI) / 180 + 1e-10));
  const first = bounces[0];
  assert.equal(first.brickId, 99);
  assert.ok(Math.abs(first.refraction) <= (4 * Math.PI) / 180 + 1e-10);
  assert.ok(Math.abs(first.refraction) > 0);
  assert.ok(game.balls[0].vx * first.nx + game.balls[0].vy * first.ny > 0);
});

test('power tiers, maximum levels and maximum balls prevent unlimited growth', () => {
  const game = createGame('endless');
  for (const turn of [0, 4]) {
    game.turn = turn;
    assert.equal(upgradeAvailable(game, 'power'), false);
  }
  for (const [i, turn] of [5, 20, 40].entries()) {
    game.turn = turn - 1;
    assert.equal(upgradeAvailable(game, 'power'), false);
    game.turn = turn;
    assert.equal(upgradeAvailable(game, 'power'), true);
    game.phase = 'upgrade';
    game.cards = ['power'];
    assert.equal(chooseUpgrade(game, 'power'), true);
    assert.equal(game.damage, i + 2);
  }
  assert.equal(upgradeAvailable(game, 'power'), false);
  assert.equal(game.damage, LIMITS.damage);
  game.count = LIMITS.balls;
  assert.equal(upgradeAvailable(game, 'extra'), false);
  for (const u of UPGRADES) {
    game.upgrades[u.id] = u.max;
    assert.equal(upgradeAvailable(game, u.id), false);
  }
});

test('rewards grant once per run, persist, and never affect challenges or practice', () => {
  const game = createGame('endless');
  assert.equal(canReward(game, 'resonance'), true);
  assert.equal(grantReward(game, 'resonance'), true);
  assert.equal(grantReward(game, 'resonance'), false);
  const restored = restoreGame(checkpoint(game));
  assert.equal(restored.rewards.resonance, 1);
  assert.equal(canReward(restored, 'resonance'), false);
  for (const options of [{ practice: true }, { challenge: true }]) {
    const isolated = createGame('endless', options);
    assert.equal(canReward(isolated, 'resonance'), false);
    assert.equal(grantReward(isolated, 'rescue'), false);
  }
  fire(game, 0, -400);
  assert.equal(canReward(game, 'rescue'), false);
});

test('rescue removes the two lowest occupied rows without damage rewards or another descent', () => {
  const game = createGame('endless');
  game.bricks = [
    brick(100, 1, 10),
    brick(101, 2, 8),
    brick(102, 3, 4),
    { ...brick(103, 4, 8, 1), kind: 'pickup' },
  ];
  game.phase = 'lost';
  game.score = 17;
  game.combo = 3;
  game.turn = 9;
  game.nextId = 104;
  assert.equal(canReward(game, 'rescue'), true);
  assert.equal(grantReward(game, 'rescue'), true);
  assert.deepEqual(
    game.bricks.map((b) => b.id),
    [102],
  );
  assert.equal(game.bricks[0].r, 4);
  assert.equal(game.phase, 'aim');
  assert.equal(game.score, 17);
  assert.equal(game.combo, 3);
  assert.equal(game.count, 5);
  assert.equal(game.turn, 9);
  assert.equal(grantReward(game, 'rescue'), false);
  assert.equal(restoreGame(checkpoint(game)).rewards.rescue, 1);
});

test('resonance stays additive even with critical and has no secondary damage amplification', () => {
  let bonusHits = 0;
  for (let seed = 1; seed <= 600; seed++) {
    const plain = createGame('endless', { seed }),
      boosted = createGame('endless', { seed });
    for (const game of [plain, boosted]) {
      game.count = 1;
      game.damage = 4;
      game.upgrades.critical = 3;
      game.bricks = [brick(99, 3, 6, 1000)];
    }
    grantReward(boosted, 'resonance');
    fire(boosted, 0, -500);
    update(boosted, 0.25);
    const events = drainEvents(boosted),
      hit = events.find((e) => e.type === 'hit');
    assert.ok(hit);
    const resonant = events.some((e) => e.type === 'resonance');
    const critical = events.some((e) => e.type === 'critical');
    assert.equal(hit.damage, 4 * (critical ? 2 : 1) + (resonant ? 1 : 0));
    if (resonant) bonusHits++;
  }
  assert.ok(bonusHits > 20 && bonusHits < 80, `observed bonus hits ${bonusHits}/600`);
});

test('legacy uncapped builds migrate their existing board effort and preserve identity/settings boundary', () => {
  const old = checkpoint(createGame('endless', { seed: 1234 }));
  old.schemaVersion = 1;
  old.count = 99;
  old.damage = 20;
  old.upgrades = { power: 19, extra: 20, chain: 12 };
  delete old.rewards;
  old.bricks = [brick(100, 3, 8, 1000)];
  old.nextId = 101;
  const restored = restoreGame(old);
  assert.ok(restored);
  assert.equal(restored.count, 36);
  assert.equal(restored.damage, 4);
  assert.equal(restored.upgrades.power, 3);
  assert.equal(restored.upgrades.extra, 5);
  assert.equal(restored.bricks[0].hp, Math.ceil((1000 * 144) / 1980));
  assert.equal(restored.seed, old.seed);
  assert.equal(restored.initialSeed, 1234);
  assert.deepEqual(restored.rewards, { resonance: 0, rescue: 0 });
  assert.equal(
    restoreGame({ ...checkpoint(restored), rewards: { resonance: 2, rescue: 0 } }),
    null,
  );
});

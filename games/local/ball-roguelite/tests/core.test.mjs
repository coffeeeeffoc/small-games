import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, UPGRADES, validateLevels } from '../levels.mjs';
import { createGame, fire, update, recall, chooseUpgrade, checkpoint, restoreGame, FIELD, RHYTHM, brickRect, brickCenter, drainEvents } from '../core.mjs';
import { createStorage, STORAGE_KEY } from '../storage.mjs';
const settle = (game, fps = 60) => { for (let frame = 0; game.phase === 'flight' && frame < fps * 16; frame++) update(game, 1 / fps); assert.notEqual(game.phase, 'flight'); };
const memory = (value) => { const map = new Map(value ? [[STORAGE_KEY, JSON.stringify(value)]] : []); return { getItem: (key) => map.get(key), setItem: (key, val) => map.set(key, val) }; };

test('content validates stable IDs, reachable unlocks and exact seven-column waves', () => {
  assert.deepEqual(validateLevels(), []);
  assert.ok(validateLevels([{ ...LEVELS[0], waves: [[1, 2]] }]).length);
  assert.ok(validateLevels([{ ...LEVELS[0], unlock: 'missing' }]).length);
});
test('invalid aim cannot launch and a volley keeps its original ball count', () => {
  const game = createGame('stardust');
  assert.equal(fire(game, 0, 100), false); assert.equal(fire(game, NaN, -100), false);
  assert.equal(fire(game, 0, -400), true); assert.equal(fire(game, 20, -200), false);
  assert.equal(game.volley, 5); game.count += 2; settle(game);
  assert.equal(game.emitted, 5); assert.ok(game.launchX >= FIELD.left && game.launchX <= FIELD.right);
});
test('continuous collision damages a one-cell target at 12 fps without tunneling', () => {
  for (const fps of [12, 24, 60]) {
    const game = createGame('stardust');
    game.bricks = [{ id: 99, c: 3, r: 6, kind: 'brick', hp: 100, maxHp: 100 }];
    fire(game, 0, -400); settle(game, fps);
    assert.ok(game.bricks.find((b) => b.id === 99).hp < 100, `no hit at ${fps} fps`);
    assert.equal(game.turn, 1);
  }
});
test('pickup does not reflect or add a ball to the current volley', () => {
  const game = createGame('stardust'); game.bricks = [{ id: 99, c: 3, r: 5, kind: 'pickup', hp: 1, maxHp: 1 }];
  fire(game, 0, -400); update(game, .25); update(game, .25);
  assert.equal(game.count, 6); assert.equal(game.volley, 5);
  assert.ok(game.balls.some((ball) => ball.vy < 0));
});
test('piercing hits a target only once per contact while continuing upwards', () => {
  const game = createGame('stardust'); game.count = 1; game.upgrades.pierce = 1;
  game.bricks = [{ id: 99, c: 3, r: 5, kind: 'brick', hp: 50, maxHp: 50 }];
  fire(game, 0, -400); update(game, .25); update(game, .2);
  assert.equal(game.bricks[0].hp, 49); assert.ok(game.balls[0].vy < 0);
});
test('adjacent bombs can chain without double scoring or damaging pickups', () => {
  const game = createGame('stardust'); game.count = 1; game.damage = 20;
  game.bricks = [
    { id: 99, c: 3, r: 5, kind: 'bomb', hp: 1, maxHp: 2 },
    { id: 100, c: 4, r: 5, kind: 'bomb', hp: 1, maxHp: 2 },
    { id: 101, c: 5, r: 5, kind: 'brick', hp: 1, maxHp: 1 },
    { id: 102, c: 4, r: 4, kind: 'pickup', hp: 1, maxHp: 1 },
  ];
  fire(game, 0, -400); update(game, .25); update(game, .25);
  assert.equal(game.score, 3); assert.equal(game.bricks.find((b) => b.id === 102).hp, 1);
  const destroyed = drainEvents(game).filter((event) => event.type === 'break').map((event) => event.id);
  assert.equal(new Set(destroyed).size, 3);
});
test('recall advances a turn and remaining bricks must be cleared before victory', () => {
  const game = createGame('stardust'); game.waveIndex = game.level.waves.length;
  const last = { id: 99, c: 3, r: 3, kind: 'brick', hp: 1, maxHp: 1 }; game.bricks = [last];
  fire(game, 200, -300); recall(game); assert.equal(game.phase, 'aim'); assert.equal(game.turn, 1);
  fire(game, brickCenter(last).x - game.launchX, brickCenter(last).y - FIELD.floor); settle(game);
  assert.equal(game.phase, 'won'); assert.equal(game.score, 1);
});
test('lowest row has a chance to clear; one more descent causes loss', () => {
  const game = createGame('stardust'); game.bricks = [{ id: 99, c: 0, r: FIELD.maxRow - 1, kind: 'brick', hp: 999, maxHp: 999 }];
  fire(game, 0, -400); recall(game); assert.equal(game.phase, 'aim');
  fire(game, 0, -400); recall(game); assert.equal(game.phase, 'lost');
  assert.equal(recall(game), false);
});
test('six upgrade types stack and choices cannot be replayed', () => {
  for (const upgrade of UPGRADES) {
    const game = createGame('endless');
    for (let i = 0; i < 2; i++) { game.phase = 'upgrade'; game.cards = [upgrade.id, ...UPGRADES.filter((u) => u.id !== upgrade.id).slice(0, 2).map((u) => u.id)]; assert.equal(chooseUpgrade(game, upgrade.id), true); }
    assert.equal(game.upgrades[upgrade.id], 2); assert.equal(chooseUpgrade(game, upgrade.id), false);
    if (upgrade.id === 'extra') assert.equal(game.count, 9);
    if (upgrade.id === 'power') assert.equal(game.damage, 3);
  }
});
test('every third turn offers three distinct seeded choices; long flights recover', () => {
  const game = createGame('endless');
  for (let i = 0; i < 3; i++) { fire(game, 0, -500); recall(game); }
  assert.equal(game.phase, 'upgrade'); assert.equal(new Set(game.cards).size, 3);
  assert.equal(chooseUpgrade(game, 'unknown'), false);
  chooseUpgrade(game, game.cards[0]); fire(game, 1000, -20); game.flight = 13.99; update(game, .1);
  assert.notEqual(game.phase, 'flight');
});
test('rhythmic doublets launch all 99 balls on time and retain the flight deadline', () => {
  for (const fps of [12, 24, 60]) {
    const game = createGame('endless'); game.count = 99; game.bricks = [];
    fire(game, 1000, -20);
    const launches = drainEvents(game).filter((event) => event.type === 'launch');
    for (let frame = 0; game.phase === 'flight' && frame < fps * 15; frame++) {
      update(game, 1 / fps);
      launches.push(...drainEvents(game).filter((event) => event.type === 'launch'));
    }
    assert.equal(launches.length, 99);
    assert.equal(new Set(launches.map((event) => event.ballId)).size, 99);
    launches.forEach((event, index) => {
      const expected = Math.floor(index / 8) * RHYTHM.beat + RHYTHM.launchPattern[index % 8];
      assert.ok(Math.abs(event.at - expected) < 1e-8, `late launch ${index} at ${fps} fps`);
      assert.equal(event.accent, index % 8 === 0);
    });
    assert.equal(launches[98].at.toFixed(3), '6.125');
    assert.notEqual(game.phase, 'flight');
    assert.ok(game.flight <= 14 + 1 / 120);
  }
});
test('rebound speed stays bounded without steering the aim and agrees across frame rates', () => {
  const results = [24, 60, 144].map((fps) => {
    const game = createGame('endless'); game.count = 1; game.bricks = [];
    fire(game, 1000, -20);
    for (let frame = 0; frame < fps; frame++) {
      update(game, 1 / fps);
      const ball = game.balls[0];
      assert.ok(ball.boost >= 0 && ball.boost <= RHYTHM.reboundBoost);
      assert.ok(Math.abs(Math.hypot(ball.vx, ball.vy) - FIELD.speed) < 1e-7);
      assert.ok(Math.abs(ball.vy - game.direction.y * FIELD.speed) < 1e-7);
      assert.ok(ball.trail.length <= RHYTHM.trailLimit);
    }
    return game.balls[0];
  });
  for (const ball of results.slice(1)) {
    assert.ok(Math.abs(ball.x - results[0].x) < 1e-6);
    assert.ok(Math.abs(ball.y - results[0].y) < 1e-6);
    assert.ok(Math.abs(ball.boost - results[0].boost) < 1e-6);
  }
});
test('hit effects use the true surface contact and trails keep the reflected corner', () => {
  const game = createGame('stardust'); game.count = 1;
  const brick = { id: 99, c: 3, r: 6, kind: 'brick', hp: 100, maxHp: 100 };
  game.bricks = [brick]; fire(game, 0, -400); drainEvents(game);
  update(game, .25);
  const events = drainEvents(game), hit = events.find((event) => event.type === 'hit'), bounce = events.find((event) => event.type === 'bounce');
  const rect = brickRect(brick), ball = game.balls[0];
  assert.ok(hit && bounce);
  assert.equal(hit.x, 195); assert.equal(hit.y, rect.y + rect.h);
  assert.equal(bounce.ballId, ball.id); assert.equal(bounce.ny, 1);
  assert.ok(ball.vy > 0);
  const contact = ball.trail.find((point) => point.contact);
  assert.ok(contact); assert.equal(contact.x, hit.x); assert.equal(contact.y, hit.y + FIELD.radius);
  assert.ok(ball.trail.every((point, index) => index === 0 || point.t >= ball.trail[index - 1].t));
  assert.ok(ball.trail.some((point, index) => index > 0 && point.y < ball.trail[index - 1].y));
  assert.ok(ball.trail.some((point, index) => index > 0 && point.y > ball.trail[index - 1].y));
});
test('round balls reflect on the actual rounded brick corner without gaining energy', () => {
  const game = createGame('stardust'); game.count = 1;
  const brick = { id: 99, c: 3, r: 6, kind: 'brick', hp: 100, maxHp: 100 }, rect = brickRect(brick);
  game.bricks = [brick]; game.launchX = rect.x - FIELD.radius / 2;
  fire(game, 0, -400); update(game, .25);
  const bounce = drainEvents(game).find((event) => event.type === 'bounce');
  assert.ok(bounce); assert.ok(Math.abs(bounce.x - rect.x) < 1e-7); assert.ok(Math.abs(bounce.y - rect.y - rect.h) < 1e-7);
  assert.ok(bounce.nx < 0 && bounce.ny > 0);
  const ball = game.balls[0]; assert.ok(ball.vx < 0 && ball.vy > 0);
  assert.ok(Math.abs(Math.hypot(ball.vx, ball.vy) - FIELD.speed) < 1e-6);
});

// Evaluate candidate shots on independent copies; apply the best actual trajectory.
// This verifies that all configured levels are winnable without modifying health or rewards.
function bestShot(game, fps) {
  let best = null;
  const angles = Array.from({ length: 23 }, (_, i) => -Math.PI + .21 + i * (Math.PI - .42) / 22);
  const targets = game.bricks.filter((b) => b.hp > 0 && b.kind !== 'pickup').map(brickCenter);
  const directions = [...angles.map((a) => ({ x: Math.cos(a) * 500, y: Math.sin(a) * 500 })), ...targets.map((p) => ({ x: p.x - game.launchX, y: p.y - FIELD.floor + FIELD.radius + 1 }))];
  for (const direction of directions) {
    const trial = structuredClone(game); trial.events = [];
    if (!fire(trial, direction.x, direction.y)) continue;
    settle(trial, fps);
    const danger = trial.bricks.filter((b) => b.hp > 0 && b.kind !== 'pickup').reduce((sum, b) => sum + b.hp * (1 + b.r * b.r), 0);
    const value = trial.phase === 'lost' ? -1e9 : trial.phase === 'won' ? 1e9 : trial.score * 100 - danger + trial.count * 25;
    if (!best || value > best.value) best = { direction, value };
  }
  return best.direction;
}
for (const fps of [24, 60]) test(`six configured starfields naturally clear and unlock at ${fps} fps`, () => {
  const store = createStorage(memory());
  for (const level of LEVELS) {
    assert.equal(store.isUnlocked(level.id), true);
    const game = createGame(level.id, { seed: 20261006 });
    for (let turn = 0; !['won', 'lost'].includes(game.phase) && turn < 28; turn++) {
      if (game.phase === 'upgrade') {
        const preference = ['power', 'extra', 'pierce', 'chain', 'blast', 'critical'];
        chooseUpgrade(game, preference.find((id) => game.cards.includes(id)));
      }
      const aim = bestShot(game, fps); fire(game, aim.x, aim.y); settle(game, fps); game.events = [];
    }
    assert.equal(game.phase, 'won', `${level.id}, turn ${game.turn}, score ${game.score}`);
    assert.equal(store.finish(game), true);
  }
  assert.equal(Object.keys(store.read().completed).length, 6);
});

test('checkpoints restore exact turn state and reject corrupt or unknown saves', () => {
  const game = createGame('endless'); fire(game, 0, -400); recall(game);
  const saved = checkpoint(game), restored = restoreGame(saved);
  assert.equal(restored.turn, game.turn); assert.deepEqual(restored.bricks, game.bricks); assert.equal(restored.seed, game.seed);
  assert.equal(restoreGame({ ...saved, levelId: 'missing' }), null);
  assert.equal(restoreGame({ ...saved, count: Infinity }), null);
  assert.equal(restoreGame({ ...saved, bricks: [...saved.bricks, saved.bricks[0]] }), null);
  assert.equal(restoreGame({ ...saved, phase: 'flight' }), null);
});
test('original smaller-ball edge checkpoints restore safely with the larger round ball', () => {
  const saved = checkpoint(createGame('endless'));
  for (const launchX of [FIELD.left + 4.5, FIELD.left + 5.5, FIELD.right - 5.5, FIELD.right - 4.5]) {
    const restored = restoreGame({ ...saved, launchX });
    assert.ok(restored);
    assert.equal(restored.launchX, launchX < 195 ? FIELD.left + FIELD.radius : FIELD.right - FIELD.radius);
    assert.equal(fire(restored, launchX < 195 ? -1000 : 1000, -20), true);
    assert.ok(restored.balls[0].x - FIELD.radius >= FIELD.left);
    assert.ok(restored.balls[0].x + FIELD.radius <= FIELD.right);
    update(restored, 1 / 24);
    assert.ok(restored.balls[0].x - FIELD.radius >= FIELD.left);
    assert.ok(restored.balls[0].x + FIELD.radius <= FIELD.right);
  }
  assert.equal(restoreGame({ ...saved, launchX: FIELD.left + 4.49 }), null);
  assert.equal(restoreGame({ ...saved, launchX: FIELD.right - 4.49 }), null);
});
test('flight reload returns to the previous aim checkpoint and practice changes no progress', () => {
  const raw = memory(), store = createStorage(raw), game = createGame('stardust'); store.saveRun(game);
  fire(game, 0, -400); settle(game); store.saveRun(game);
  const saved = store.read().resume; fire(game, 100, -400); store.saveRun(game);
  const reopened = createStorage(raw); assert.equal(reopened.read().resume.turn, saved.turn); assert.equal(reopened.read().resume.phase, saved.phase);
  const before = reopened.read(), practice = createGame('orbit', { practice: true }); practice.phase = 'won'; practice.score = 500;
  reopened.finish(practice); reopened.saveRun(practice); assert.deepEqual(reopened.read(), before);
});
test('corrupt storage and blocked storage do not prevent progression; v0 migrates', () => {
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  const store = createStorage(blocked), game = createGame('stardust'); store.saveRun(game); assert.equal(store.persistent, false);
  game.phase = 'won'; game.turn = 4; game.score = 20; store.finish(game); assert.equal(store.isUnlocked('prism'), true);
  const migrated = createStorage(memory({ schemaVersion: 0, sound: false, completed: { stardust: { score: 10, turns: 8 }, orbit: { score: 999, turns: 1 } } }));
  assert.equal(migrated.read().schemaVersion, 2); assert.equal(migrated.read().sound, false); assert.equal(migrated.isUnlocked('prism'), true); assert.equal(migrated.isUnlocked('orbit'), false);
  assert.deepEqual(createStorage({ getItem: () => '{bad json', setItem() {} }).read().completed, {});
});
test('repeated settlement cannot duplicate unlocks and only improves stored results', () => {
  const store = createStorage(memory()), game = createGame('stardust'); game.phase = 'won'; game.score = 20; game.turn = 5;
  store.finish(game); const first = store.read(); store.finish(game); assert.deepEqual(store.read(), first);
  game.score = 10; game.turn = 15; store.finish(game); assert.deepEqual(store.read().completed, first.completed);
});

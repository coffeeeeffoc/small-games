import assert from 'node:assert/strict';
import test from 'node:test';
import { BALANCE_LEVELS, OLD_STREET, validateLevel } from '../src/content/levels.ts';
import { damageEnemy, projectiles, shoot } from '../src/core/combat.ts';
import { randomFor } from '../src/core/geometry.ts';
import { damageSupply, estimatedDps, settleTiers, updateFocus } from '../src/core/rewards.ts';
import { advanceClock, createGame, snapshot, step } from '../src/core/simulation.ts';
import { type Level } from '../src/core/types.ts';
import { impactDelay } from '../src/client/feedback.ts';
const fixture = (): Level => ({
  ...structuredClone(OLD_STREET),
  duration: 300,
  bossRequired: false,
  waves: [{ id: 'test-enemy', tick: 1, kind: 'walker', count: 1, z: -8, hp: 10000 }],
  supplies: [
    {
      ...structuredClone(OLD_STREET.supplies[0]),
      start: 1,
      end: 240,
      tiers: [{ damage: 360, label: '盾', reward: { kind: 'shield', amount: 30 } }],
    },
  ],
});
const ticks = (s: ReturnType<typeof createGame>, n: number, input = {}) => {
  for (let i = 0; i < n; i++) step(s, input);
};
test('feedback identifies real armor hits and preserves a single death pose without duplicate kills', () => {
  const level = fixture();
  level.waves[0].kind = 'shield';
  level.waves[0].x = 0;
  const s = createGame(level);
  step(s);
  const enemy = s.enemies[0],
    hit = s.effects.find((e) => e.kind === 'hit');
  assert.equal(hit?.entityId, enemy.id);
  assert.equal(hit?.surface, 'armor');
  assert.ok(enemy.hp < enemy.maxHp);
  damageEnemy(s, enemy, 20000, 0, 7, true, 'grenade');
  const death = s.effects.find((e) => e.kind === 'death');
  assert.equal(death?.enemyKind, 'shield');
  assert.equal(death?.entityId, enemy.id);
  assert.equal(death?.fromZ, 7);
  const count = s.effects.length;
  damageEnemy(s, enemy, 20000, 0, 7, true, 'grenade');
  assert.equal(s.effects.length, count);
  assert.equal(s.stats.kills, 1);
});
test('feedback flight delay is bounded, optional-safe and never delays grenade impact', () => {
  const e = {
    id: 1,
    tick: 1,
    kind: 'hit' as const,
    x: 0,
    z: -100,
    fromX: 0,
    fromZ: 7,
    weapon: 'rifle' as const,
  };
  assert.equal(impactDelay(e), 0.24);
  assert.equal(impactDelay({ ...e, z: 6 }), 0.08);
  assert.equal(impactDelay({ ...e, weapon: 'grenade' }), 0);
  assert.equal(impactDelay({ ...e, fromX: undefined }), 0);
});
test('identical seed / inputs reproduce full simulation and survive serialization', () => {
  const a = createGame(OLD_STREET),
    b = createGame(OLD_STREET);
  for (let i = 0; i < 2700; i++) {
    const input = { moveX: Math.sin(i / 90), skill: i === 1200 };
    step(a, input);
    step(b, input);
  }
  assert.deepEqual(a, b);
  const c = JSON.parse(JSON.stringify(a));
  assert.deepEqual(snapshot(a), snapshot(c));
});
test('30 / 60 / 144 / 12 fps produce the same logical fire rate', () => {
  const states = [12, 30, 60, 144].map((fps) => {
    const s = createGame(fixture()),
      clock = { accumulator: 0 };
    for (let i = 0; i < fps * 5; i++) advanceClock(clock, 1 / fps, () => step(s));
    return snapshot(s);
  });
  states.forEach((s) => assert.deepEqual(s, states[0]));
  assert.ok(states[0].stats.shots >= 50);
});
test('focus stops all front rifle fire and enemy movement continues', () => {
  const s = createGame(fixture());
  ticks(s, 25, { targetX: -3.5 });
  assert.equal(s.focus, 'safe-weapon');
  const before = s.stats.forwardDamage,
    z = s.enemies[0].z;
  ticks(s, 60, { targetX: -3.5 });
  assert.equal(s.stats.forwardDamage, before);
  assert.ok(s.stats.supplyDamage > 0);
  assert.ok(s.enemies[0].z > z);
});
test('switching targets does not reset member cooldowns', () => {
  const s = createGame(fixture());
  ticks(s, 1);
  s.members.forEach((m) => {
    m.nextShot = 200;
  });
  ticks(s, 160, { moveX: 1 });
  assert.equal(s.stats.shots, 1);
  assert.ok(s.members.every((m) => m.nextShot === 200));
});
test('insufficient damage grants nothing; crossing multiple tiers grants each once', () => {
  const s = createGame(BALANCE_LEVELS[2]);
  s.tick = 100;
  const box = s.supplies[0];
  box.status = 'active';
  damageSupply(s, box, 179);
  settleTiers(s, box);
  assert.equal(s.grants.length, 0);
  damageSupply(s, box, 500);
  settleTiers(s, box);
  settleTiers(s, box);
  assert.equal(s.grants.length, 3);
  assert.equal(box.damage, 660);
  assert.equal(new Set(s.grants.map((g) => g.id)).size, 3);
});
test('deadline tick resolves attacks and reward before expiry', () => {
  const level = fixture();
  level.supplies[0].end = 30;
  const s = createGame(level);
  ticks(s, 29, { targetX: -3.5 });
  s.supplies[0].damage = 355;
  s.members.forEach((m) => {
    m.nextShot = 30;
  });
  step(s, { targetX: -3.5 });
  assert.equal(s.supplies[0].status, 'claimed');
  assert.equal(s.grants.length, 1);
});
test('expired crate cannot grant and serialized reconnect cannot reset its deadline', () => {
  const s = createGame(fixture());
  ticks(s, 245);
  const reconnected = JSON.parse(JSON.stringify(s));
  damageSupply(reconnected, reconnected.supplies[0], 9999);
  settleTiers(reconnected, reconnected.supplies[0]);
  assert.equal(reconnected.supplies[0].status, 'expired');
  assert.equal(reconnected.grants.length, 0);
  assert.equal(reconnected.supplies[0].config.end, 240);
});
test('out-of-range and empty-side focus releases to front shooting', () => {
  const s = createGame(fixture());
  ticks(s, 25, { targetX: -3.5 });
  s.supplies[0].config.zStart = -100;
  s.supplies[0].config.zEnd = -80;
  updateFocus(s);
  assert.equal(s.focus, null);
  assert.equal(estimatedDps(s, s.supplies[0]), 0);
  ticks(s, 20, { targetX: 3.5 });
  assert.equal(s.focus, null);
});
test('focus confirmation and hysteresis tolerate edge wobble', () => {
  const s = createGame(fixture());
  step(s);
  s.x = -3;
  for (let i = 0; i < 4; i++) updateFocus(s);
  assert.equal(s.focus, null);
  updateFocus(s);
  assert.equal(s.focus, 'safe-weapon');
  s.x = -2.7;
  updateFocus(s);
  assert.equal(s.focus, 'safe-weapon');
  s.x = -2.4;
  updateFocus(s);
  assert.equal(s.focus, null);
});
test('rescue respects 12-member cap; overflow becomes shield; exclusive devices disable sibling', () => {
  const s = createGame(OLD_STREET);
  s.tick = 1100;
  while (s.members.length < 12)
    s.members.push({ id: s.nextMember++, hp: 20, weapon: 'rifle', nextShot: 9999 });
  const box = s.supplies[2];
  box.status = 'active';
  s.supplies[3].status = 'active';
  damageSupply(s, box, 240);
  settleTiers(s, box);
  assert.equal(s.members.length, 12);
  assert.equal(s.shield, 45);
  assert.equal(s.supplies[3].status, 'excluded');
});
test('dead members provide no firepower and equipment changes actual range / output', () => {
  const s = createGame(fixture());
  assert.equal(estimatedDps(s), 60);
  s.members[0].hp = 0;
  assert.equal(estimatedDps(s), 50);
  s.members[1].weapon = 'grenade';
  assert.ok(estimatedDps(s) > 50);
});
test('shield blocks frontal bullets but not flank or explosion; duplicate kill gives no score', () => {
  const s = createGame(fixture());
  step(s);
  const e = s.enemies[0];
  e.kind = 'shield';
  e.hp = 100;
  damageEnemy(s, e, 20, e.x, e.z + 10);
  assert.equal(e.hp, 95);
  damageEnemy(s, e, 20, e.x + 10, e.z + 1);
  assert.equal(e.hp, 75);
  damageEnemy(s, e, 100, e.x, e.z + 10, true);
  const kills = s.stats.kills;
  damageEnemy(s, e, 100, 0, 0, true);
  assert.equal(s.stats.kills, kills);
});
test('grenade damage happens on impact only, obeys area and expired targets', () => {
  const s = createGame(fixture());
  step(s);
  const e = s.enemies[0],
    hp = e.hp;
  s.projectiles.push({
    id: 'test',
    x: 0,
    z: 7,
    fromX: 0,
    fromZ: 7,
    toX: e.x,
    toZ: e.z,
    born: 1,
    land: 10,
    damage: 22,
    supplyId: null,
  });
  projectiles(s);
  assert.equal(e.hp, hp);
  s.tick = 10;
  projectiles(s);
  assert.equal(e.hp, hp - 22);
  assert.equal(s.projectiles.length, 0);
});
test('input cannot teleport or advance time with client fields', () => {
  const s = createGame(fixture());
  step(s, { targetX: Infinity });
  assert.equal(s.x, 0);
  step(s, { moveX: 9999, tick: 999999, score: 999999 } as object);
  assert.equal(s.tick, 2);
  assert.ok(Math.abs(s.x) <= 0.2);
  assert.equal(s.stats.score, 0);
});
test('event-derived random draws stay independent from reward choices', () => {
  const a = randomFor(42, 'wave-9:enemy-3:x');
  for (let i = 0; i < 100; i++) randomFor(42, `reward-${i}`);
  assert.equal(randomFor(42, 'wave-9:enemy-3:x'), a);
});
test('Boss objective is mandatory and malformed config is rejected', () => {
  const s = createGame(OLD_STREET);
  s.tick = 2699;
  step(s);
  assert.equal(s.phase, 'lost');
  const c = fixture();
  c.supplies[0].tiers.push(c.supplies[0].tiers[0]);
  assert.throws(() => validateLevel(c));
});
test('shotgun covers a real close cone while rifle selects a single target', () => {
  const state = createGame(fixture());
  step(state);
  state.members = [{ id: 0, hp: 20, weapon: 'shotgun', nextShot: 0 }];
  const base = state.enemies[0];
  state.enemies = [
    { ...base, id: 'near-a', x: -0.7, z: 1, hp: 40 },
    { ...base, id: 'near-b', x: 0.2, z: 1, hp: 40 },
    { ...base, id: 'far', x: 0, z: -12, hp: 40 },
  ];
  shoot(state);
  assert.equal(state.enemies[0].hp, 30);
  assert.equal(state.enemies[1].hp, 30);
  assert.equal(state.enemies[2].hp, 40);
  state.members[0].weapon = 'rifle';
  state.members[0].nextShot = 0;
  shoot(state);
  assert.equal(
    state.enemies.reduce((sum, e) => sum + e.hp, 0),
    95,
  );
});
test('base 60 DPS cannot finish the 660 tier in eight seconds', () => {
  const level = fixture();
  level.waves = [];
  level.supplies = [{ ...structuredClone(OLD_STREET.supplies[4]), start: 1, end: 241 }];
  const s = createGame(level);
  s.x = 3.5;
  ticks(s, 245, { targetX: 3.5 });
  assert.equal(s.supplies[0].claimed, 2);
  assert.ok(s.supplies[0].damage <= 480);
  assert.equal(s.supplies[0].status, 'expired');
});
test('flying grenade cannot finish an expired crate', () => {
  const s = createGame(fixture());
  ticks(s, 241);
  const box = s.supplies[0];
  box.damage = 350;
  s.projectiles.push({
    id: 'late',
    x: -4.65,
    z: 6,
    fromX: -3.5,
    fromZ: 7,
    toX: -4.65,
    toZ: 6,
    born: 230,
    land: 242,
    damage: 22,
    supplyId: box.config.id,
  });
  step(s);
  assert.equal(box.damage, 350);
  assert.equal(s.grants.length, 0);
});
test('Boss charge moves its authoritative hit position, then returns to its anchor', () => {
  const level = fixture();
  level.waves = [{ id: 'boss-test', tick: 1, kind: 'boss', count: 1, z: -8, hp: 10000 }];
  level.supplies = [];
  const s = createGame(level);
  ticks(s, 92);
  const e = s.enemies[0],
    anchor = e.dashZ;
  ticks(s, 11);
  assert.equal(e.z, 6);
  assert.equal(e.x, e.aimX);
  ticks(s, 12);
  assert.ok(Math.abs(e.z - anchor) < 0.001);
});
test('environment damage can finish a Boss and counts its kill once', () => {
  const s = createGame(OLD_STREET);
  s.tick = 2129;
  step(s);
  const boss = s.enemies.find((e) => e.kind === 'boss')!;
  boss.hp = 100;
  s.tick = 2350;
  const box = s.supplies.at(-1)!;
  box.status = 'active';
  damageSupply(s, box, 180);
  settleTiers(s, box);
  assert.equal(s.bossDefeated, true);
  assert.equal(s.stats.kills, 1);
  settleTiers(s, box);
  assert.equal(s.stats.kills, 1);
});

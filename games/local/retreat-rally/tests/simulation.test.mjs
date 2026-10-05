import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, validateLevels } from '../src/levels.mjs';
import { createBattle, step, setRetreat, alive, averageStamina } from '../src/simulation.mjs';
import { emptyProgress, migrateProgress, recordVictory, unlocked } from '../src/progress.mjs';

function advance(s, seconds) {
  for (let t = 0; t < seconds; t += 1 / 60) step(s, 1 / 60);
  return s;
}
function play(level, policy) {
  const s = createBattle(level);
  let recover = false;
  while (s.status === 'playing') {
    const stamina = averageStamina(s, 'blue');
    if (stamina < 35) recover = true;
    if (stamina > 93) recover = false;
    const danger = ['warning', 'gap', 'impact'].includes(s.volley.phase);
    const inZone = s.volley.zones.some((z) =>
      alive(s, 'blue').some((u) => u.x > z.x - 15 && u.x < z.x + z.width + 10),
    );
    s.retreat.blue =
      policy === 'retreat' || (policy === 'smart' && (recover || (danger && inZone)));
    step(s, 1 / 30);
  }
  return s;
}
test('catalog validates references, finite numbers and unique IDs', () => {
  assert.equal(validateLevels(), true);
  assert.throws(() => validateLevels([LEVELS[0], LEVELS[0]]));
  assert.throws(() => validateLevels([{ ...LEVELS[0], warning: NaN }]));
  assert.throws(() => validateLevels([{ ...LEVELS[0], prerequisites: ['missing'] }]));
});
for (const l of LEVELS)
  test(`${l.id}: timely retreats can win with all six survivors`, () => {
    const smart = play(l, 'smart'),
      charge = play(l, 'charge');
    assert.equal(smart.status, 'won');
    assert.equal(smart.casualties, 0);
    assert(smart.dodged > 0);
    assert(smart.time < 90);
    assert(charge.casualties > smart.casualties);
    assert.notEqual(play(l, 'retreat').status, 'won');
  });
test('retreat moves home; stamina recovers only out of contact, never health or dead units', () => {
  const s = createBattle();
  const u = s.units[0];
  u.stamina = 20;
  u.hp = 40;
  s.units[1].hp = 0;
  setRetreat(s, 'blue', true);
  const before = u.x;
  advance(s, 0.5);
  assert(u.x < before);
  assert(u.stamina > 20);
  assert.equal(u.hp, 40);
  assert.equal(s.units[1].hp, 0);
  u.x = 500;
  u.stamina = 20;
  const enemy = s.units.find((v) => v.side === 'red');
  enemy.x = 520;
  step(s, 1 / 60);
  assert.equal(u.stamina, 20);
});
test('warnings lock to a position, allow evasion, and apply damage only within the marked zone', () => {
  const s = createBattle();
  s.volley.timer = 0;
  step(s, 1 / 60);
  const x = s.volley.zones[0].x;
  setRetreat(s, 'blue', true);
  advance(s, 1);
  assert.equal(s.volley.zones[0].x, x);
  const targets = alive(s, 'blue');
  targets[0].x = x + 50;
  targets.slice(1).forEach((u) => (u.x = x - 30));
  s.volley.timer = 0;
  step(s, 1 / 60);
  assert(targets[0].hp < 100);
  assert.equal(targets[1].hp, 100);
});
test('second volley remains telegraphed until its independent impact', () => {
  const s = createBattle(LEVELS[2]);
  s.volley.timer = 0;
  step(s, 1 / 60);
  assert.equal(s.volley.remaining, 2);
  s.volley.timer = 0;
  step(s, 1 / 60);
  assert.equal(s.volley.phase, 'impact');
  assert.equal(s.volley.remaining, 1);
  s.volley.timer = 0;
  step(s, 1 / 60);
  assert.equal(s.volley.phase, 'gap');
  assert.equal(s.volley.zones.length, 1);
  s.volley.timer = 0;
  step(s, 1 / 60);
  assert.equal(s.volley.phase, 'impact');
  assert.equal(s.volley.remaining, 0);
  s.volley.timer = 0;
  step(s, 1 / 60);
  assert.equal(s.volley.phase, 'reload');
});
test('pursuers gain ground faster during a retreat', () => {
  const a = createBattle(LEVELS[1]),
    b = createBattle(LEVELS[1]);
  b.retreat.blue = true;
  advance(a, 1);
  advance(b, 1);
  assert(b.units[6].x < a.units[6].x);
});
test('flags, defeat, draw and terminal states resolve deterministically', () => {
  const s = createBattle();
  s.units.filter((u) => u.side === 'red').forEach((u) => (u.hp = 0));
  s.units.filter((u) => u.side === 'blue').forEach((u) => (u.x = 1108));
  advance(s, 2);
  assert.equal(s.status, 'won');
  const t = s.time;
  advance(s, 1);
  assert.equal(s.time, t);
  const lose = createBattle();
  lose.units.filter((u) => u.side === 'blue').forEach((u) => (u.hp = 0));
  step(lose, 0.1);
  assert.equal(lose.status, 'lost');
  const flag = createBattle();
  flag.units.filter((u) => u.side === 'red').forEach((u) => (u.x = 92));
  flag.units.filter((u) => u.side === 'blue').forEach((u) => (u.x = 600));
  advance(flag, 2);
  assert.equal(flag.status, 'lost');
  assert.equal(flag.flags.blue, 0);
  const draw = createBattle();
  draw.units.forEach((u) => (u.hp = 0));
  step(draw, 0.1);
  assert.equal(draw.status, 'draw');
});
test('friend teams have equal units and independent commands', () => {
  const s = createBattle(LEVELS[0], 'friend');
  assert(s.units.every((u) => u.hp === 100 && u.kind === 'sword'));
  setRetreat(s, 'blue', true);
  setRetreat(s, 'red', true);
  step(s, 0.1);
  assert(s.units[0].x < 190);
  assert(s.units[6].x > 1010);
  setRetreat(s, 'blue', false);
  assert.equal(s.retreat.red, true);
});
test('progress migrates defensively, unlocks in order, and never rewards dev/PVP', () => {
  assert.deepEqual(migrateProgress({ version: 1, medals: { crossbow: 3 } }), emptyProgress());
  const p = emptyProgress(),
    s = play(LEVELS[0], 'smart');
  assert(!unlocked(p, LEVELS[1]));
  assert.equal(recordVictory(p, s, true), false);
  assert.equal(recordVictory(p, s), true);
  assert.equal(recordVictory(p, s), false);
  assert(unlocked(p, LEVELS[1]));
  assert(!unlocked(p, LEVELS[2]));
  assert.equal(p.medals.valley, 3);
  const match = createBattle(LEVELS[1], 'random');
  match.status = 'won';
  assert.equal(recordVictory(p, match), false);
  assert.deepEqual(migrateProgress(p), p);
});
test('large resume deltas are clamped and invalid time is ignored', () => {
  const s = createBattle();
  step(s, 3600);
  assert(s.time <= 0.251);
  step(s, NaN);
  assert(Number.isFinite(s.time));
});

test('mirrored friend commands resolve symmetrically without first-in-array attack advantage', () => {
  const s = createBattle(LEVELS[0], 'friend');
  while (s.status === 'playing') step(s, 1 / 60);
  assert.equal(s.status, 'draw');
  assert.equal(alive(s, 'blue').length, alive(s, 'red').length);
});

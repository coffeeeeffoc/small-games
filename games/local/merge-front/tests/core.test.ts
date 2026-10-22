import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOG,
  CHAPTERS,
  LEVELS,
  validateContent,
  getSpec,
} from '../assets/scripts/core/content.ts';
import {
  createMatch,
  command,
  step,
  runAI,
  snapshot,
  restore,
  POPULATION_CAP,
  TICK_RATE,
  MAX_ROUNDS,
} from '../assets/scripts/core/engine.ts';
import type { Match, Action } from '../assets/scripts/core/engine.ts';
import {
  createProgress,
  readProgress,
  settleProgress,
  isUnlocked,
} from '../assets/scripts/core/progress.ts';

function ok(m: Match, action: Action, side: 0 | 1 = 0) {
  assert.equal(command(m, side, action).ok, true, JSON.stringify(action));
}
function invalid(m: Match, action: unknown, side: 0 | 1 = 0) {
  const before = snapshot(m);
  assert.equal(command(m, side, action as Action).ok, false);
  assert.deepEqual(m, before);
}
function auto(m: Match) {
  for (let n = 0; n < 128; n++) if (!runAI(m, 0)?.ok) break;
}
function finish(m: Match) {
  while (m.phase === 'running') {
    auto(m);
    ok(m, { type: 'startRound' });
    step(m, 640);
    restore(snapshot(m));
  }
  return m;
}

test('16 recipes, six chapters, 30 valid levels and explicit two-piece Nezha recipe', () => {
  assert.equal(CATALOG.length, 16);
  assert.equal(CHAPTERS.length, 6);
  assert.equal(LEVELS.length, 30);
  assert.deepEqual(validateContent(), []);
  assert.deepEqual(getSpec('nezha').parts, ['哪', '吒']);
  assert.throws(() => getSpec('__proto__'));
});
test('planning does not advance time or passive income; both sides spend identical resources', () => {
  const m = createMatch('level-01', 2),
    before = snapshot(m);
  step(m, 10000);
  assert.deepEqual(m, before);
  const spent = Object.values(m.sides[1].draws).reduce((a, b) => a + b, 0) * 30;
  assert.equal(m.sides[0].coins, m.sides[1].coins + spent);
  assert.equal(m.sides[0].hand.length, 3);
  assert.ok(!('slots' in m.sides[0]));
  assert.equal(m.sides[0].hand.filter((c) => c.key === 'nezha').length, 2);
});
test('drawn fragments auto assemble immediately and never deploy separately', () => {
  const m = createMatch('level-01', 3),
    s = m.sides[0],
    initial = s.hand.length;
  for (let i = 0; i < 4; i++) ok(m, { type: 'draw', kind: 'hero' });
  const complete = s.hand.length - initial;
  assert.equal(complete * 2 + Object.values(s.bag).reduce((a, b) => a + b, 0), 12);
  assert.ok(!(s.bag['nezha:0'] && s.bag['nezha:1']));
  assert.ok(s.hand.every((c) => c.level === 1));
  invalid(m, { type: 'deploy', card: 'nezha:0', x: 200, y: 50 });
  invalid(m, { type: 'deploy', card: 999999, x: 200, y: 50 });
});
test('independent placement, movement, recall and additive merge conserve levels', () => {
  const m = createMatch('level-01', 1),
    s = m.sides[0],
    [a, b] = s.hand;
  ok(m, { type: 'deploy', card: a.id, x: 220, y: 40 });
  ok(m, { type: 'deploy', card: b.id, x: 350, y: 320 });
  assert.equal(s.formation.length, 2);
  assert.equal(s.formation[0].level, 1);
  ok(m, { type: 'move', card: a.id, x: 200, y: 180 });
  ok(m, { type: 'merge', from: b.id, to: a.id });
  assert.equal(s.formation.length, 1);
  assert.equal(s.formation[0].level, 2);
  ok(m, { type: 'recall', card: a.id });
  assert.equal(s.formation.length, 0);
  assert.equal(s.hand.find((c) => c.id === a.id)!.level, 2);
  ok(m, { type: 'deploy', card: a.id, x: 200, y: 180 });
  invalid(m, { type: 'merge', from: s.hand[0].id, to: a.id });
});
test('six shared population slots reject excess deploy but permit hand-to-board merging at cap', () => {
  const m = createMatch('level-01', 1);
  auto(m);
  const s = m.sides[0];
  assert.equal(s.formation.length, POPULATION_CAP);
  const first = s.formation[0];
  s.hand.push({ id: m.nextId++, key: first.key, level: 3 });
  const card = s.hand.at(-1)!;
  invalid(m, { type: 'deploy', card: card.id, x: 280, y: 120 });
  const level = first.level;
  ok(m, { type: 'merge', from: card.id, to: first.id });
  assert.equal(first.level, level + 3);
  assert.equal(s.formation.length, 6);
  first.level = 10000;
  s.hand.push({ id: m.nextId++, key: first.key, level: 20000 });
  ok(m, { type: 'merge', from: s.hand.at(-1)!.id, to: first.id });
  assert.equal(first.level, 30000);
});
test('trust boundary rejects malformed, stale, foreign, unsafe and crowded commands atomically', () => {
  const m = createMatch('level-01', 1),
    c = m.sides[0].hand[0];
  for (const action of [
    null,
    {},
    { type: 'draw', kind: 'spell' },
    { type: '__proto__' },
    { type: 'draw', kind: 'hero', extra: 1 },
    { type: 'draw', kind: 'hero', seq: 2 },
    { type: 'draw', kind: 'hero', version: 1 },
    { type: 'draw', kind: 'hero', matchId: 'other' },
    { type: 'deploy', card: c.id, x: NaN, y: 180 },
    { type: 'deploy', card: c.id, x: 600, y: 180 },
    { type: 'deploy', card: c.id, x: 200, y: 0 },
  ])
    invalid(m, action);
  ok(m, { type: 'deploy', card: c.id, x: 200, y: 180, seq: 1, matchId: m.id, version: 2 });
  invalid(m, { type: 'deploy', card: m.sides[0].hand[0].id, x: 201, y: 181 });
  invalid(m, { type: 'recall', card: m.sides[1].formation[0].id });
  invalid(m, { type: 'merge', from: c.id, to: c.id });
  invalid(m, { type: 'draw', kind: 'hero', seq: 1 });
});
test('battle locks both armies, creates exactly one unit per formation card, no passive spawns', () => {
  const m = createMatch('level-01', 2);
  auto(m);
  const army = snapshot(m).sides.map((s) => s.formation);
  ok(m, { type: 'startRound' });
  assert.equal(m.units.length, 12);
  const ids = m.units.map((u) => u.id);
  invalid(m, { type: 'draw', kind: 'hero' });
  invalid(m, { type: 'move', card: army[0][0].id, x: 200, y: 40 });
  invalid(m, { type: 'startRound' });
  invalid(m, { type: 'draw', kind: 'hero' }, 1);
  assert.equal(runAI(m, 1), null);
  step(m, 20);
  assert.ok(m.units.every((u) => ids.includes(u.id)));
  assert.deepEqual(
    m.sides.map((s) => s.formation),
    army,
  );
});
test('pause and serialization preserve exact deterministic battle continuation', () => {
  const a = createMatch('level-01', 4);
  auto(a);
  ok(a, { type: 'startRound' });
  step(a, 37);
  ok(a, { type: 'pause', paused: true });
  const frozen = snapshot(a);
  step(a, 600);
  assert.deepEqual(a, frozen);
  invalid(a, { type: 'recall', card: a.sides[0].formation[0].id });
  const b = restore(JSON.stringify(a));
  ok(a, { type: 'pause', paused: false });
  ok(b, { type: 'pause', paused: false });
  step(a, 603);
  step(b, 603);
  assert.deepEqual(a, b);
});
test('upper and lower placement stays free in two dimensions and affects movement', () => {
  const a = createMatch('level-01', 9),
    b = restore(snapshot(a));
  ok(a, { type: 'deploy', card: a.sides[0].hand[0].id, x: 400, y: 35 });
  ok(b, { type: 'deploy', card: b.sides[0].hand[0].id, x: 400, y: 325 });
  ok(a, { type: 'startRound' });
  ok(b, { type: 'startRound' });
  step(a, 20);
  step(b, 20);
  assert.ok(a.units.find((u) => u.side === 0)!.y < 150);
  assert.ok(b.units.find((u) => u.side === 0)!.y > 220);
  assert.notDeepEqual(
    a.units.map((u) => [u.x, u.y]),
    b.units.map((u) => [u.x, u.y]),
  );
});
test('round settles once, repairs survivors next round, keeps deployed cards and awards equal supply', () => {
  const m = createMatch('level-01', 1);
  auto(m);
  const formation = snapshot(m).sides.map((s) => s.formation),
    coins = m.sides.map((s) => s.coins);
  ok(m, { type: 'startRound' });
  m.units = m.units.filter((u) => u.side === 0);
  step(m);
  assert.equal(m.roundStage, 'resolution');
  assert.equal(m.sides[1].crystalHp, 20);
  const damage = m.roundDamage;
  step(m, 40);
  assert.equal(m.roundNumber, 2);
  assert.equal(m.sides[1].crystalHp, 20 - damage);
  assert.deepEqual(m.sides[0].formation, formation[0]);
  assert.equal(m.sides[0].coins, coins[0] + 90);
  const frozen = snapshot(m);
  step(m, 1000);
  assert.deepEqual(m, frozen);
  ok(m, { type: 'startRound' });
  assert.ok(m.units.every((u) => u.hp === u.maxHp));
});
test('simultaneous elimination is a tied round and round limit terminates a repeated stalemate', () => {
  const m = createMatch('level-01', 1);
  auto(m);
  for (let n = 0; n < MAX_ROUNDS; n++) {
    ok(m, { type: 'startRound' });
    m.units = [];
    step(m, 41);
  }
  assert.equal(m.phase, 'draw');
  assert.equal(m.roundNumber, 12);
  assert.equal(m.endReason, 'round-limit');
  assert.equal(m.sides[0].crystalHp, 20);
  assert.deepEqual(restore(snapshot(m)), m);
  const p = createProgress();
  assert.equal(settleProgress(p, m).settled, true);
  assert.equal(settleProgress(p, m).settled, false);
});
test('snapshot rejects corrupt cardinality, phases, stats, fragment IDs and command history', () => {
  const m = createMatch('level-01', 2);
  auto(m);
  ok(m, { type: 'startRound' });
  step(m, 4);
  const corruptions: Array<(m: Match) => void> = [
    (s) => (s.version = 1),
    (s) => s.units[0].damage++,
    (s) => (s.units[0].hp = Infinity),
    (s) => (s.units[0].x = -1),
    (s) => (s.units[0].side = 3 as never),
    (s) => (s.sides[0].bag['bogus:0'] = 1),
    (s) => (s.sides[0].bag['nezha:0'] = -1),
    (s) => s.sides[0].formation.push(s.sides[0].formation[0]),
    (s) => s.units.push(s.units[0]),
    (s) => (s.phase = 'won'),
    (s) => (s.roundNumber = 13),
    (s) => (s.commands[0].seq = 100),
    (s) => s.sides[0].hand.push({ id: s.units[0].id, key: 'nezha', level: 1 }),
  ];
  for (const mutate of corruptions) {
    const s = snapshot(m);
    mutate(s);
    assert.throws(() => restore(s));
  }
});
test('all 30 levels finish legally without advertisements; seeded campaign has player victories', () => {
  let wins = 0;
  for (const level of LEVELS)
    for (const seed of [1, 8, 23]) {
      const m = finish(createMatch(level.id, seed, level.ai.deck));
      assert.notEqual(m.phase, 'running');
      assert.ok(m.roundNumber <= 12);
      assert.equal(m.assisted, false);
      assert.ok(
        m.commands
          .filter((c) => c.side === 1)
          .every((c) => ['draw', 'deploy', 'merge'].includes(c.action.type)),
      );
      if (m.phase === 'won') wins++;
    }
  assert.ok(wins >= 20, 'symmetric legal policy should be able to win across campaign');
});
test('progress remains v2, old preferences migrate, victory unlocks and settles only once', () => {
  const p = readProgress({ wins: 7, sound: false });
  assert.equal(p.legacyWins, 7);
  assert.equal(p.sound, false);
  assert.equal(p.version, 2);
  const m = finish(createMatch('level-01', 1));
  assert.equal(m.phase, 'won');
  assert.equal(settleProgress(p, m).settled, true);
  assert.equal(p.unlockedLevel, 2);
  assert.equal(isUnlocked(p, 'level-02'), true);
  assert.equal(settleProgress(p, m).settled, false);
  assert.deepEqual(readProgress(JSON.stringify(p)), p);
  const practice = finish(createMatch('level-01', 1, undefined, { practice: true }));
  assert.equal(settleProgress(p, practice).settled, false);
});

test('restore rejects fabricated round results and inconsistent reward flags', () => {
  const base = createMatch('level-01', 1);
  for (const mutate of [
    (m: Match) => {
      m.roundStage = 'resolution';
      m.roundWinner = 0;
      m.roundDamage = 8;
    },
    (m: Match) => {
      m.assisted = true;
    },
    (m: Match) => {
      m.sides[0].boostUsed = true;
    },
    (m: Match) => {
      m.sides[1].boostUsed = true;
    },
  ]) {
    const m = snapshot(base);
    mutate(m);
    assert.throws(() => restore(m));
  }
  auto(base);
  ok(base, { type: 'startRound' });
  base.units = [];
  step(base);
  base.roundTicks = 40;
  assert.throws(() => restore(base));
});
test('long planning sessions retain a bounded command tail with valid sequence numbers', () => {
  const m = createMatch('level-01', 1),
    c = m.sides[0].hand[0];
  ok(m, { type: 'deploy', card: c.id, x: 220, y: 180 });
  for (let i = 0; i < 4200; i++) ok(m, { type: 'move', card: c.id, x: i % 2 ? 220 : 280, y: 180 });
  assert.equal(m.commands.length, 4096);
  assert.ok(m.commandStart[0] > 0);
  assert.deepEqual(restore(snapshot(m)), m);
});

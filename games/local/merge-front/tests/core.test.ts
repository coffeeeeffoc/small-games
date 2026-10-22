import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOG,
  CHAPTERS,
  LEVELS,
  validateContent,
  getSpec,
  getTrait,
  TRAITS,
  SPELLS,
  STARTERS,
  starterChoices,
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
  RULE_VERSION,
  INVENTORY_CAP,
  inventoryCount,
  incomeForRound,
  traitCounts,
  crystalStyle,
} from '../assets/scripts/core/engine.ts';
import type { Match, Action, Card, Offer } from '../assets/scripts/core/engine.ts';
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

function card(m: Match, key: string, overrides: Partial<Card> = {}): Card {
  return {
    id: m.nextId++,
    key,
    level: 1,
    bonusHp: 0,
    bonusDamage: 0,
    entered: false,
    ward: false,
    ...overrides,
  };
}
function offer(m: Match, kind: Offer['kind'], key: string, part?: string): Offer {
  return {
    id: m.nextId++,
    kind,
    key,
    cost:
      kind === 'part'
        ? 1
        : kind === 'spell'
          ? SPELLS.find((s) => s.id === key)!.cost
          : getSpec(key).cost,
    ...(part ? { part } : {}),
  };
}
function board(m: Match, keys: string[], side: 0 | 1 = 0) {
  m.sides[side].hand = [];
  m.sides[side].formation = keys.map((key, i) => ({
    ...card(m, key),
    x: side ? 1000 - (i < 3 ? 200 : 390) : i < 3 ? 200 : 390,
    y: 70 + (i % 3) * 110,
  }));
  return m.sides[side].formation;
}
function spell(m: Match, key: string) {
  const c = { id: m.nextId++, key };
  m.sides[0].spells.push(c);
  return c.id;
}

test('16 recipes, six chapters, 30 valid levels and explicit two-piece Nezha recipe', () => {
  assert.equal(CATALOG.length, 16);
  assert.equal(CHAPTERS.length, 6);
  assert.equal(LEVELS.length, 30);
  assert.deepEqual(validateContent(), []);
  assert.deepEqual(getSpec('nezha').parts, ['哪', '吒']);
  assert.throws(() => getSpec('__proto__'));
});
test('three diverse deterministic starters, all sixteen units, explicit defaults and 6 to 16 economy', () => {
  assert.equal(STARTERS.length, 8);
  assert.equal(TRAITS.length, 4);
  assert.equal(SPELLS.length, 4);
  for (let seed = 0; seed < 100; seed++) {
    const choices = starterChoices(seed);
    assert.deepEqual(choices, starterChoices(seed));
    assert.equal(new Set(choices.map((s) => s.id)).size, 3);
    const same = choices.map((s) => getTrait(s.keys[0]).id === getTrait(s.keys[1]).id);
    assert.ok(same.includes(true) && same.includes(false));
    for (const choice of choices) {
      const m = createMatch('level-01', seed, choice.keys);
      assert.deepEqual(
        m.sides[0].hand.map((c) => c.key),
        choice.keys,
      );
      assert.equal(m.sides[0].coins, 6);
      for (const c of m.sides[0].hand)
        assert.deepEqual([c.bonusHp, c.bonusDamage, c.entered, c.ward], [0, 0, false, false]);
      assert.deepEqual(restore(snapshot(m)), m);
    }
  }
  assert.deepEqual(
    Array.from({ length: 12 }, (_, i) => incomeForRound(i + 1)),
    [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 16],
  );
  assert.throws(() => incomeForRound(0));
  assert.throws(() => starterChoices(NaN));
  assert.throws(() => createMatch('level-01', 1, ['nezha', 'bad']));
  assert.throws(() => createMatch('level-01', 1, ['fire', 'nezha']));
  assert.equal(getSpec('nezha').cost, 0);
  for (const key of ['wukong', 'tianwang', 'xuannv', 'cannon']) assert.equal(getSpec(key).cost, 4);
});

test('shop is unbiased full pool, two distinct units/parts, optional last spell, no refill on purchase', () => {
  const seen = new Set<string>();
  for (let seed = 0; seed < 100; seed++) {
    const m = createMatch('level-01', seed),
      s = m.sides[0];
    for (let i = 0; i < 5; i++) {
      assert.equal(s.shop.length, 3);
      assert.ok(s.shop.slice(0, 2).every((o) => o.kind !== 'spell'));
      assert.equal(new Set(s.shop.map((o) => o.part ?? o.key)).size, 3);
      for (const o of s.shop) {
        seen.add(o.part ?? o.key);
        assert.ok(o.kind !== 'unit' || o.key !== 'nezha');
      }
      const copy = snapshot(m);
      crystalStyle(m.seed, m.roundNumber);
      assert.deepEqual(m, copy);
      ok(m, { type: 'refresh' });
    }
  }
  assert.ok(CATALOG.filter((s) => s.cost).every((s) => seen.has(s.id)));
  assert.ok(SPELLS.every((s) => seen.has(s.id)));
  assert.ok(seen.has('nezha:0') && seen.has('nezha:1'));
  const m = createMatch('level-01', 1),
    s = m.sides[0],
    o = s.shop[0],
    coins = s.coins;
  ok(m, { type: 'buy', offer: o.id });
  assert.equal(s.coins, coins - o.cost);
  assert.equal(s.shop.length, 2);
  invalid(m, { type: 'buy', offer: o.id });
  const styles = new Set(Array.from({ length: 50 }, (_, n) => crystalStyle(7, n + 1)));
  assert.deepEqual([...styles].sort(), [0, 1, 2, 3, 4, 5]);
});

test('Nezha missing part guaranteed next refresh, pairs at full inventory use final capacity', () => {
  const m = createMatch('level-01', 3),
    s = m.sides[0];
  s.bag['nezha:0'] = 1;
  s.hand = Array.from({ length: 11 }, () => card(m, 'fire'));
  assert.equal(inventoryCount(s), 12);
  ok(m, { type: 'refresh' });
  assert.equal(s.shop[0].part, 'nezha:1');
  ok(m, { type: 'buy', offer: s.shop[0].id });
  assert.equal(inventoryCount(s), 12);
  assert.deepEqual(s.bag, {});
  assert.equal(s.hand.at(-1)!.key, 'nezha');
  for (const o of [
    offer(m, 'unit', 'fire'),
    offer(m, 'spell', 'ward'),
    offer(m, 'part', 'nezha', 'nezha:0'),
  ]) {
    s.shop = [o];
    s.coins = 5;
    invalid(m, { type: 'buy', offer: o.id });
  }
  s.hand.pop();
  s.bag['nezha:0'] = 1;
  const coins = s.coins;
  ok(m, { type: 'discard', part: 'nezha:0' });
  assert.equal(s.coins, coins);
  invalid(m, { type: 'discard', part: 'nezha:0' });
  s.shop = [offer(m, 'unit', 'cannon')];
  s.coins = 3;
  invalid(m, { type: 'buy', offer: s.shop[0].id });
});

test('sell removes first, special gifts replace gold, capped free refresh, board gift overflow is explicit', () => {
  const m = createMatch('level-01', 1),
    s = m.sides[0];
  s.hand = Array.from({ length: 12 }, () => card(m, 'fire'));
  const coins = s.coins;
  ok(m, { type: 'sell', card: s.hand[0].id });
  assert.equal(inventoryCount(s), 12);
  assert.equal(s.spells[0].key, 'sharpen');
  assert.equal(s.coins, coins);
  const c = { ...card(m, 'lantern'), x: 200, y: 180 };
  s.formation.push(c);
  const result = command(m, 0, { type: 'sell', card: c.id });
  assert.equal(result.ok, true);
  assert.match(result.message, /手牌已满.*消失/);
  assert.equal(s.spells.length, 1);
  s.hand = [card(m, 'drone'), card(m, 'drone')];
  for (const c of [...s.hand]) ok(m, { type: 'sell', card: c.id });
  assert.equal(s.coins, coins + 2);
  assert.equal(s.freeRefresh, true);
  ok(m, { type: 'refresh' });
  assert.equal(s.coins, coins + 2);
  assert.equal(s.freeRefresh, false);
  ok(m, { type: 'refresh' });
  assert.equal(s.coins, coins + 1);
  s.hand.push(card(m, 'lantern'));
  ok(m, { type: 'sell', card: s.hand[0].id });
  assert.equal(s.spells.at(-1)!.key, 'ward');
});

test('six slots, unrestricted additive levels, merges OR flags and sum bonuses, recall preserves all fields', () => {
  const m = createMatch('level-01', 1),
    s = m.sides[0];
  const c = board(m, ['nezha', 'fire', 'juling', 'erlang', 'change', 'drone'])[0];
  c.level = 10000;
  c.bonusHp = 20;
  c.bonusDamage = 4;
  c.entered = true;
  const from = card(m, 'nezha', { level: 20000, bonusHp: 35, bonusDamage: 5, ward: true });
  s.hand.push(from);
  invalid(m, { type: 'deploy', card: from.id, x: 280, y: 120 });
  ok(m, { type: 'merge', from: from.id, to: c.id });
  assert.deepEqual(
    [c.level, c.bonusHp, c.bonusDamage, c.entered, c.ward],
    [30000, 55, 9, true, true],
  );
  const { x, y, ...expected } = c;
  ok(m, { type: 'recall', card: c.id });
  assert.deepEqual(s.hand[0], expected);
  ok(m, { type: 'deploy', card: c.id, x: 200, y: 70 });
  s.hand = Array.from({ length: 12 }, () => card(m, 'fire'));
  invalid(m, { type: 'recall', card: c.id });
  ok(m, { type: 'startRound' });
  assert.equal(
    m.units.find((u) => u.id === c.id)!.maxHp,
    Math.round(getSpec('nezha').hp * (1 + 29999 * 0.45)) + 55,
  );
});

test('first participation locks targets, tie uses id, no target still consumes, merge and recall cannot retrigger', () => {
  const m = createMatch('level-01', 1),
    s = m.sides[0];
  const [j, a, b] = board(m, ['juling', 'fire', 'drone']);
  Object.assign(j, { x: 300, y: 180 });
  Object.assign(a, { x: 200, y: 180 });
  Object.assign(b, { x: 400, y: 180 });
  ok(m, { type: 'recall', card: j.id });
  ok(m, { type: 'deploy', card: j.id, x: 300, y: 180 });
  assert.equal(s.formation.find((c) => c.id === a.id)!.bonusHp, 0);
  ok(m, { type: 'startRound' });
  assert.equal(s.formation.find((c) => c.id === a.id)!.bonusHp, 20);
  assert.equal(s.formation.find((c) => c.id === b.id)!.bonusHp, 0);
  m.units = [];
  step(m, 41);
  ok(m, { type: 'recall', card: j.id });
  ok(m, { type: 'deploy', card: j.id, x: 300, y: 180 });
  const extra = card(m, 'juling');
  s.hand.push(extra);
  ok(m, { type: 'merge', from: extra.id, to: j.id });
  ok(m, { type: 'startRound' });
  assert.equal(s.formation.find((c) => c.id === a.id)!.bonusHp, 20);
  for (const key of ['juling', 'leizhen', 'xuannv']) {
    const solo = createMatch('level-01', 1);
    board(solo, [key]);
    ok(solo, { type: 'startRound' });
    assert.equal(solo.sides[0].formation[0].entered, true);
  }
  const n = createMatch('level-01', 2);
  board(n, ['leizhen', 'drone', 'xuannv', 'change', 'lantern']);
  ok(n, { type: 'startRound' });
  assert.equal(n.sides[0].formation[1].bonusDamage, 4);
  assert.equal(n.sides[0].formation[3].bonusHp, 6);
  assert.equal(n.sides[0].formation[4].bonusHp, 6);
});

test('spells require own formation, permanent effects sum, ward/inspire refuse duplicates and clear after resolution', () => {
  const m = createMatch('level-01', 1),
    s = m.sides[0];
  const [c] = board(m, ['fire']);
  for (const key of ['sharpen', 'fortify', 'ward']) {
    const id = spell(m, key);
    invalid(m, { type: 'cast', spell: id });
    invalid(m, { type: 'cast', spell: id, target: m.sides[1].formation[0].id });
    ok(m, { type: 'cast', spell: id, target: c.id });
  }
  assert.deepEqual([c.bonusDamage, c.bonusHp, c.ward], [5, 35, true]);
  invalid(m, { type: 'cast', spell: spell(m, 'ward'), target: c.id });
  const inspire = spell(m, 'inspire');
  invalid(m, { type: 'cast', spell: inspire, target: c.id });
  ok(m, { type: 'cast', spell: inspire });
  invalid(m, { type: 'cast', spell: spell(m, 'inspire') });
  ok(m, { type: 'recall', card: c.id });
  ok(m, { type: 'deploy', card: c.id, x: 200, y: 180 });
  assert.equal(s.inspired, true);
  ok(m, { type: 'startRound' });
  assert.deepEqual(restore(snapshot(m)), m);
  const unit = m.units.find((u) => u.id === c.id)!;
  assert.equal(unit.shield, Math.round(unit.maxHp * 0.3));
  assert.equal(unit.damage, Math.round((getSpec('fire').damage + 5) * 1.12));
  for (const action of [
    { type: 'refresh' },
    { type: 'sell', card: c.id },
    { type: 'cast', spell: s.spells[0].id, target: c.id },
  ] as Action[])
    invalid(m, action);
  m.units = [];
  step(m, 41);
  assert.equal(s.inspired, false);
  assert.equal(s.formation[0].ward, false);
  assert.equal(s.formation[0].bonusHp, 35);
});

test('traits count distinct names, armor and flame tiers replace, spirit checks initial distance only and adds ward', () => {
  const m = createMatch('level-01', 1);
  board(m, ['juling', 'juling', 'tianwang', 'guard', 'ram']);
  assert.equal(traitCounts(m.sides[0].formation).armor, 4);
  ok(m, { type: 'startRound' });
  for (const u of m.units.filter((u) => u.side === 0)) {
    const c = m.sides[0].formation.find((c) => c.id === u.id)!;
    assert.equal(u.maxHp, Math.round((getSpec(c.key).hp + c.bonusHp) * 1.35));
  }
  const n = createMatch('level-01', 1);
  const f = board(n, ['change', 'xuannv', 'frost', 'lantern']);
  Object.assign(f[0], { x: 130, y: 40, ward: true });
  Object.assign(f[1], { x: 200, y: 40 });
  Object.assign(f[2], { x: 270, y: 40 });
  Object.assign(f[3], { x: 440, y: 330 });
  ok(n, { type: 'startRound' });
  assert.equal(
    n.units.find((u) => u.id === f[0].id)!.shield,
    Math.round((getSpec('change').hp + 6) * 0.54),
  );
  assert.equal(
    n.units.find((u) => u.id === f[3].id)!.shield,
    Math.round((getSpec('lantern').hp + 6) * 0.12),
  );
  assert.deepEqual(restore(snapshot(n)), n);
  const flame = createMatch('level-01', 1);
  board(flame, ['nezha', 'wukong', 'fire', 'cannon']);
  ok(flame, { type: 'startRound' });
  for (const u of flame.units.filter((u) => u.side === 0))
    assert.equal(u.damage, Math.round(getSpec(u.key).damage * 1.12));
});

test('trust boundary rejects removed draw, malformed, stale, foreign, unsafe and crowded commands atomically', () => {
  const m = createMatch('level-01', 1),
    c = m.sides[0].hand[0];
  for (const a of [
    null,
    {},
    { type: 'draw', kind: 'hero' },
    { type: '__proto__' },
    { type: 'refresh', extra: 1 },
    { type: 'buy', offer: NaN },
    { type: 'cast', spell: 1, target: '1' },
    { type: 'discard', part: 'fire:0' },
    { type: 'refresh', seq: 2 },
    { type: 'refresh', version: 2 },
    { type: 'refresh', matchId: 'other' },
    { type: 'deploy', card: c.id, x: NaN, y: 180 },
    { type: 'deploy', card: c.id, x: 600, y: 180 },
  ])
    invalid(m, a);
  ok(m, {
    type: 'deploy',
    card: c.id,
    x: 200,
    y: 180,
    seq: 1,
    matchId: m.id,
    version: RULE_VERSION,
  });
  invalid(m, { type: 'deploy', card: m.sides[0].hand[0].id, x: 201, y: 181 });
  invalid(m, { type: 'recall', card: m.sides[1].formation[0].id });
  invalid(m, { type: 'merge', from: c.id, to: c.id });
  invalid(m, { type: 'refresh', seq: 1 });
  const before = snapshot(m);
  step(m, 10000);
  assert.deepEqual(m, before);
  ok(m, { type: 'startRound' });
  invalid(m, { type: 'refresh' }, 1);
  assert.equal(runAI(m, 1), null);
  const ids = m.units.map((u) => u.id);
  step(m, 20);
  assert.ok(m.units.every((u) => ids.includes(u.id)));
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
  assert.equal(m.sides[1].crystalHp, 30);
  const damage = m.roundDamage;
  step(m, 40);
  assert.equal(m.roundNumber, 2);
  assert.equal(m.sides[1].crystalHp, 30 - damage);
  assert.deepEqual(
    m.sides[0].formation.map((c) => ({ ...c, entered: false })),
    formation[0],
  );
  assert.equal(m.sides[0].coins, coins[0] + 7);
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
  assert.equal(m.sides[0].crystalHp, 30);
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
    (s) => s.sides[0].hand.push(card(s, 'nezha', { id: s.units[0].id })),
  ];
  for (const mutate of corruptions) {
    const s = snapshot(m);
    mutate(s);
    assert.throws(() => restore(s));
  }
});
test('three seeds across thirty levels terminate with legal AI economy and recorded campaign statistics', (t) => {
  const stats = {
    matches: 0,
    won: 0,
    lost: 0,
    draw: 0,
    minRound: 12,
    maxRound: 0,
    rounds: 0,
    actions: {} as Record<string, number>,
  };
  for (const level of LEVELS)
    for (const seed of [1, 8, 23]) {
      const keys = ['hero', 'weapon'].map(
        (kind) => level.ai.deck.find((key) => getSpec(key).kind === kind)!,
      );
      const m = finish(createMatch(level.id, seed, keys));
      assert.notEqual(m.phase, 'running');
      assert.ok(m.roundNumber >= 5 && m.roundNumber <= 12);
      assert.equal(m.assisted, false);
      stats.matches++;
      stats[m.phase as 'won' | 'lost' | 'draw']++;
      stats.rounds += m.roundNumber;
      stats.minRound = Math.min(stats.minRound, m.roundNumber);
      stats.maxRound = Math.max(stats.maxRound, m.roundNumber);
      for (const c of m.commands.filter((c) => c.side === 1))
        stats.actions[c.action.type] = (stats.actions[c.action.type] || 0) + 1;
      assert.ok(
        m.sides.every((s) => s.coins >= 0 && inventoryCount(s) <= 12 && s.formation.length <= 6),
      );
    }
  assert.equal(stats.matches, 90);
  assert.ok(stats.won > 0 && stats.lost > 0);
  for (const action of ['buy', 'refresh', 'deploy', 'merge', 'sell', 'cast'])
    assert.ok(stats.actions[action] > 0, action);
  // Saved baseline for this exact policy and seeds; this is simulation evidence, not human win-rate.
  assert.deepEqual(stats, {
    matches: 90,
    won: 50,
    lost: 40,
    draw: 0,
    minRound: 6,
    maxRound: 12,
    rounds: 837,
    actions: { deploy: 665, buy: 3499, merge: 1428, cast: 858, refresh: 1234, sell: 239 },
  });
  t.diagnostic('CAMPAIGN_STATS ' + JSON.stringify(stats));
});

test('progress remains v2, old preferences migrate, victory unlocks and settles only once', () => {
  const p = readProgress({ wins: 7, sound: false });
  assert.equal(p.legacyWins, 7);
  assert.equal(p.sound, false);
  assert.equal(p.version, 2);
  const m = [1, 8, 23, 42]
    .map((seed) => finish(createMatch('level-01', seed)))
    .find((m) => m.phase === 'won')!;
  assert.ok(m);
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

test('snapshot validates every new field and shop price/type/identity, rejects partial pairs and excess inventory', () => {
  const base = createMatch('level-01', 1);
  base.sides[0].spells.push({ id: base.nextId++, key: 'ward' });
  for (const mutate of [
    (m: Match) => {
      delete (m.sides[0].hand[0] as Partial<Card>).entered;
    },
    (m: Match) => {
      m.sides[0].hand[0].bonusHp = -1;
    },
    (m: Match) => {
      m.sides[0].hand[0].bonusDamage = Infinity;
    },
    (m: Match) => {
      m.sides[0].hand[0].ward = 1 as never;
    },
    (m: Match) => {
      m.sides[0].freeRefresh = 1 as never;
    },
    (m: Match) => {
      m.sides[0].inspired = 'yes' as never;
    },
    (m: Match) => {
      m.sides[0].spells[0].key = '__proto__';
    },
    (m: Match) => {
      m.sides[0].spells[0].id = m.sides[0].hand[0].id;
    },
    (m: Match) => {
      m.sides[0].shop[0].cost = 0;
    },
    (m: Match) => {
      m.sides[0].shop[0].kind = 'bad' as never;
    },
    (m: Match) => {
      m.sides[0].shop[0] = offer(m, 'unit', 'nezha');
    },
    (m: Match) => {
      m.sides[0].shop[0] = offer(m, 'part', 'nezha', 'fire:0');
    },
    (m: Match) => {
      m.sides[0].shop[1] = { ...m.sides[0].shop[0], id: m.nextId++ };
    },
    (m: Match) => {
      m.sides[0].shop = [offer(m, 'spell', 'ward'), offer(m, 'spell', 'fortify')];
    },
    (m: Match) => {
      m.sides[0].bag = { 'nezha:0': 1, 'nezha:1': 1 };
    },
    (m: Match) => {
      m.sides[0].hand = Array.from({ length: 13 }, () => card(m, 'fire'));
    },
    (m: Match) => {
      m.sides[0].maxCrystalHp = 20;
    },
    (m: Match) => {
      m.maxLevels.unknown = 2;
    },
    (m: Match) => {
      Object.assign(m.sides[0], { draws: { hero: 0, weapon: 0 } });
    },
    (m: Match) => {
      Object.assign(m, { extra: 1 });
    },
    (m: Match) => {
      Object.assign(m.sides[0].hand[0], { extra: 1 });
    },
  ]) {
    const m = snapshot(base);
    mutate(m);
    assert.throws(() => restore(m));
  }
});

test('crystal damage uses surviving total levels, caps base at five and adds at most one surviving ram', () => {
  for (const [keys, levels, damage] of [
    [['fire'], [1], 3],
    [['fire'], [8], 5],
    [['ram'], [1], 4],
    [['ram', 'ram'], [9, 9], 6],
  ] as [string[], number[], number][]) {
    const m = createMatch('level-01', 1);
    const f = board(m, keys);
    f.forEach((c, i) => (c.level = levels[i]));
    ok(m, { type: 'startRound' });
    m.units = m.units.filter((u) => u.side === 0);
    step(m);
    assert.equal(m.roundDamage, damage);
    assert.equal(m.sides[1].crystalHp, 30);
    restore(snapshot(m));
    ok(m, { type: 'pause', paused: true });
    const paused = snapshot(m);
    step(m, 40);
    assert.deepEqual(m, paused);
    const restored = restore(snapshot(m));
    ok(restored, { type: 'pause', paused: false });
    step(restored, 40);
    assert.equal(restored.sides[1].crystalHp, 30 - damage);
    assert.equal(restored.sides[0].coins, 13);
    const hp = restored.sides[1].crystalHp;
    step(restored, 1000);
    assert.equal(restored.sides[1].crystalHp, hp);
  }
});

test('legacy progress keeps level/settings/medals/history and accepts all sixteen unit statistics', () => {
  const p = readProgress({
    version: 2,
    unlockedLevel: 2,
    unlockedIds: ['nezha', 'fire'],
    medals: { 'level-01': 2 },
    sound: false,
    vibration: false,
    tutorialStep: 4,
    settledMatchIds: ['mf-old-1'],
    assistedMatchIds: ['mf-old-1'],
    uses: { xuannv: 5, unknown: 8 },
    maxLevels: { xuannv: 10, unknown: 10 },
  });
  assert.equal(p.version, 2);
  assert.equal(p.unlockedLevel, 2);
  assert.equal(p.unlockedIds.length, 16);
  assert.equal(p.uses.xuannv, 5);
  assert.equal(p.maxLevels.xuannv, 10);
  assert.equal(p.uses.unknown, undefined);
  assert.equal(p.sound, false);
  assert.equal(p.vibration, false);
  assert.equal(p.medals['level-01'], 2);
  assert.deepEqual(readProgress(JSON.stringify(p)), p);
});

test('thunder attack interval and flame splash use two/four-name tiers in actual combat', () => {
  for (const [keys, rate] of [
    [['erlang'], 1],
    [['erlang', 'drone'], 1.12],
    [['erlang', 'drone', 'leizhen', 'crossbow'], 1.25],
  ] as [string[], number][]) {
    const m = createMatch('level-01', 1);
    board(m, keys);
    board(m, ['fire'], 1);
    ok(m, { type: 'startRound' });
    const a = m.units.find((u) => u.side === 0)!;
    const enemy = m.units.find((u) => u.side === 1)!;
    Object.assign(a, { x: 490, y: 180 });
    Object.assign(enemy, { x: 510, y: 180, attackTimer: getSpec(enemy.key).interval });
    step(m);
    assert.equal(a.attackTimer, Math.round((getSpec(a.key).interval / rate) * 1000) / 1000);
    restore(snapshot(m));
  }
  for (const [keys, rate] of [
    [['fire', 'nezha'], 0.55],
    [['fire', 'nezha', 'wukong', 'cannon'], 0.75],
  ] as [string[], number][]) {
    const m = createMatch('level-01', 1);
    board(m, keys);
    board(m, ['fire', 'fire'], 1);
    ok(m, { type: 'startRound' });
    const a = m.units.find((u) => u.side === 0 && u.key === 'fire')!;
    const enemies = m.units.filter((u) => u.side === 1);
    for (const u of m.units) u.attackTimer = 1;
    Object.assign(a, { x: 490, y: 180, attackTimer: 0 });
    Object.assign(enemies[0], { x: 510, y: 180 });
    Object.assign(enemies[1], { x: 520, y: 180 });
    const hp = enemies[1].hp;
    step(m);
    assert.equal(hp - enemies[1].hp, Math.round(a.damage * rate));
  }
});

test('AI performs each purchase/refresh/sale through the same priced commands and can replace a full formation', () => {
  const m = createMatch('level-01', 12);
  const s = m.sides[0];
  board(m, ['nezha', 'fire', 'wukong', 'erlang', 'juling', 'change']);
  s.hand = [card(m, 'cannon')];
  const before = snapshot(m);
  assert.equal(runAI(m, 0)?.ok, true);
  assert.equal(m.commands.at(-1)!.action.type, 'sell');
  assert.equal(s.formation.length, 5);
  assert.equal(s.coins, before.sides[0].coins + 1);
  assert.equal(runAI(m, 0)?.ok, true);
  assert.ok(s.formation.some((c) => c.key === 'cannon'));
  for (let i = 0; i < 128; i++) {
    const before = snapshot(m);
    const result = runAI(m, 0);
    if (!result) break;
    assert.equal(result.ok, true);
    const a = m.commands.at(-1)!.action;
    if (a.type === 'buy')
      assert.equal(
        s.coins,
        before.sides[0].coins - before.sides[0].shop.find((o) => o.id === a.offer)!.cost,
      );
    if (a.type === 'refresh')
      assert.equal(s.coins, before.sides[0].coins - (before.sides[0].freeRefresh ? 0 : 1));
  }
});

test('unaffordable refresh, missing sell, enemy targets and malformed input remain atomic on both sides', () => {
  const m = createMatch('level-01', 1);
  m.sides[0].coins = 0;
  invalid(m, { type: 'refresh' });
  invalid(m, { type: 'buy', offer: m.sides[1].shop[0].id });
  invalid(m, { type: 'sell', card: m.sides[1].formation[0].id });
  invalid(m, { type: 'discard', part: 'nezha:1' });
  invalid(m, { type: 'cast', spell: 999999 });
  invalid(m, { type: 'sell', card: -1 });
  invalid(m, { type: 'refresh' }, 2 as never);
});

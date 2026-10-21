import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOG,
  CHAPTERS,
  LEVELS,
  getSpec,
  validateContent,
} from '../assets/scripts/core/content.ts';
import {
  createMatch,
  command,
  step,
  runAI,
  snapshot,
  restore,
  TICK_RATE,
} from '../assets/scripts/core/engine.ts';
import type { Match, Unit } from '../assets/scripts/core/engine.ts';
import {
  createProgress,
  readProgress,
  settleProgress,
  isUnlocked,
} from '../assets/scripts/core/progress.ts';

function army(state: Match, side: 0 | 1, key = 'nezha', x = 500, y = 180): Unit {
  const spec = getSpec(key);
  const unit: Unit = {
    id: state.nextId++,
    key,
    side,
    level: 1,
    x,
    y,
    hp: spec.hp,
    maxHp: spec.hp,
    damage: spec.damage,
    range: spec.range,
    speed: spec.speed,
    attackTimer: 0,
    targetId: null,
    anim: 'move',
    skillTimer: 0,
    slowTicks: 0,
    shield: 0,
  };
  state.units.push(unit);
  return unit;
}

test('content has 16 recipes, six chapters and 30 independent, valid levels', () => {
  assert.equal(CATALOG.length, 16);
  assert.equal(CATALOG.filter((s) => s.kind === 'hero').length, 8);
  assert.equal(CHAPTERS.length, 6);
  assert.equal(LEVELS.length, 30);
  assert.deepEqual(validateContent(), []);
  assert.ok(CATALOG.some((s) => s.parts.length === 4));
  assert.throws(() => getSpec('__proto__'));
});

test('equal starting economy, fixed slot categories and atomic invalid commands', () => {
  const state = createMatch(LEVELS[0].id, 12);
  assert.equal(state.sides[0].coins, state.sides[1].coins);
  assert.deepEqual(state.sides[0].bag, state.sides[1].bag);
  assert.deepEqual(
    state.sides[0].slots.map((s) => getSpec(s.key).kind),
    ['hero', 'hero', 'hero', 'weapon', 'weapon'],
  );
  for (const action of [
    { type: 'fill', slot: 0, part: 'fire:0' },
    { type: 'recipe', slot: 0, key: 'fire' },
    { type: 'exchange', key: 'nezha', index: 99 },
    { type: 'draw', kind: 'other' },
    { type: 'merge', from: 0, to: 0 },
  ]) {
    const before = snapshot(state);
    assert.equal(command(state, 0, action as never).ok, false);
    assert.deepEqual(snapshot(state), before);
  }
  assert.equal(command(state, 0, { type: 'fillAll', slot: 0 }).ok, true);
  assert.equal(command(state, 0, { type: 'fillAll', slot: 3 }).ok, true);
  assert.equal(state.sides[0].slots[0].level, 1);
  assert.equal(state.units.length, 0);
  step(state, 180);
  assert.ok(state.units.some((u) => u.key === 'nezha'));
});

test('level addition, returned partials, conservative production and existing units', () => {
  const state = createMatch(LEVELS[0].id, 1);
  const side = state.sides[0];
  side.slots[0] = { key: 'nezha', level: 3, parts: [true, false], progress: 6 };
  side.slots[1] = { key: 'nezha', level: 5, parts: [false, true], progress: 2 };
  const existing = army(state, 0);
  existing.hp -= 20;
  const beforeUnit = { ...existing };
  const beforeBag = { ...side.bag };
  assert.ok(command(state, 0, { type: 'merge', from: 0, to: 1 }).ok);
  assert.equal(side.slots[1].level, 8);
  assert.equal(side.slots[1].progress, 2);
  assert.equal(side.slots[0].level, 0);
  assert.equal(side.bag['nezha:0'], beforeBag['nezha:0'] + 1);
  assert.equal(side.bag['nezha:1'], beforeBag['nezha:1'] + 1);
  assert.deepEqual(existing, beforeUnit);
  side.slots[0].level = 1_000_000;
  assert.ok(command(state, 0, { type: 'merge', from: 0, to: 1 }).ok);
  assert.equal(restore(snapshot(state)).sides[0].slots[1].level, 1_000_008);
  side.slots[0].level = Number.MAX_SAFE_INTEGER;
  const before = snapshot(state);
  assert.equal(command(state, 0, { type: 'merge', from: 0, to: 1 }).ok, false);
  assert.deepEqual(snapshot(state), before);
});

test('withdraw and recipe changes preserve unfinished materials; exchange uses only surplus', () => {
  const state = createMatch(LEVELS[5].id, 2, ['nezha', 'juling', 'fire']);
  const side = state.sides[0];
  assert.ok(command(state, 0, { type: 'fill', slot: 0, part: 'nezha:0' }).ok);
  assert.ok(command(state, 0, { type: 'recipe', slot: 0, key: 'juling' }).ok);
  assert.equal(side.bag['nezha:0'], 1);
  side.bag['juling:0'] = 1;
  assert.ok(command(state, 0, { type: 'fill', slot: 0, part: 'juling:0' }).ok);
  assert.ok(command(state, 0, { type: 'withdraw', slot: 0 }).ok);
  assert.equal(side.bag['juling:0'], 1);
  side.bag['nezha:0'] = 9;
  const total = Object.values(side.bag).reduce((a, b) => a + b, 0);
  assert.ok(command(state, 0, { type: 'exchange', key: 'juling', index: 2 }).ok);
  assert.equal(
    Object.values(side.bag).reduce((a, b) => a + b, 0),
    total - 2,
  );
  assert.equal(side.bag['juling:2'], 1);
});

test('independent random streams, pity, sequence replay guard and pause freeze', () => {
  const a = createMatch(LEVELS[0].id, 42);
  const b = createMatch(LEVELS[0].id, 42);
  command(a, 1, { type: 'draw', kind: 'hero' });
  for (let i = 0; i < 3; i++) {
    command(a, 0, { type: 'draw', kind: 'hero' });
    command(b, 0, { type: 'draw', kind: 'hero' });
  }
  assert.deepEqual(a.sides[0].bag, b.sides[0].bag);
  assert.equal(a.rng[0], b.rng[0]);
  const c = createMatch(LEVELS[0].id, 17);
  c.sides[0].bag = {};
  c.sides[0].slots[0].parts[0] = true;
  c.sides[0].draws.hero = 2;
  command(c, 0, { type: 'draw', kind: 'hero', seq: 1 });
  assert.ok(c.sides[0].bag['nezha:1'] >= 1);
  const before = snapshot(c);
  assert.equal(command(c, 0, { type: 'draw', kind: 'hero', seq: 1 }).ok, false);
  assert.deepEqual(snapshot(c), before);
  command(c, 0, { type: 'pause', paused: true });
  const frozen = snapshot(c);
  step(c, 1000);
  assert.deepEqual(snapshot(c), frozen);
});

test('2D nearest targeting, stable ties, ranged advance and crystal interruption', () => {
  const state = createMatch(LEVELS[0].id, 3);
  const a = army(state, 0, 'nezha', 420, 80);
  const b = army(state, 1, 'nezha', 470, 280);
  step(state);
  assert.ok(a.y > 80 && a.x > 420);
  assert.equal(a.targetId, b.id);
  const ranged = army(state, 0, 'drone', 100, 40);
  step(state);
  assert.ok(ranged.x > 100);
  a.x = 910;
  a.y = 180;
  a.targetId = null;
  a.attackTimer = 0;
  b.x = 900;
  b.y = 185;
  const hp = state.sides[1].crystalHp;
  step(state);
  assert.equal(a.targetId, b.id);
  assert.equal(state.sides[1].crystalHp, hp);
});

test('same-tick crystal destruction draws, terminal states freeze', () => {
  const state = createMatch(LEVELS[0].id, 4);
  state.sides.forEach((s) => {
    s.crystalHp = 1;
  });
  army(state, 0, 'nezha', 930, 180);
  army(state, 1, 'nezha', 70, 180);
  step(state);
  assert.equal(state.phase, 'draw');
  assert.equal(state.winner, null);
  const before = snapshot(state);
  step(state, 200);
  assert.deepEqual(snapshot(state), before);
});

test('population cap retains ready production and death does not remove recipe', () => {
  const state = createMatch(LEVELS[0].id, 5);
  command(state, 0, { type: 'fillAll', slot: 0 });
  const slot = state.sides[0].slots[0];
  slot.progress = getSpec(slot.key).production;
  for (let i = 0; i < 40; i++) army(state, 0, 'nezha', 90, 20 + i * 8);
  step(state);
  assert.equal(state.units.filter((u) => u.side === 0).length, 40);
  assert.equal(slot.progress, getSpec(slot.key).production);
  state.units[0].hp = 0;
  step(state, 2);
  assert.equal(state.units.filter((u) => u.side === 0).length, 40);
  assert.equal(slot.level, 1);
  assert.ok(slot.progress < 1);
});

test('AI uses commands and obeys frequency; snapshots continue deterministic state', () => {
  const state = createMatch(LEVELS[15].id, 123);
  step(state, 1000);
  assert.ok(state.commands.some((c) => c.side === 1 && c.action.type === 'fillAll'));
  const count = state.commands.length;
  for (let i = 0; i < 100; i++) runAI(state, 1);
  assert.ok(state.commands.length <= count + 1);
  const copy = restore(JSON.stringify(snapshot(state)));
  step(state, 1500);
  step(copy, 1500);
  assert.deepEqual(snapshot(copy), snapshot(state));
  for (const mutate of [
    (s: Match) => {
      s.units[0].x = NaN;
    },
    (s: Match) => {
      s.sides[0].slots[0].level = -1;
    },
    (s: Match) => {
      s.rng[0] = 0.5;
    },
    (s: Match) => {
      s.sides[0].deck.push('unknown');
    },
  ]) {
    const invalid = snapshot(state);
    mutate(invalid);
    assert.throws(() => restore(invalid));
  }
});

test('progress migration, tutorial persistence, practice isolation and idempotent rewards', () => {
  const progress = readProgress({ sound: false, wins: 12 });
  assert.equal(progress.sound, false);
  assert.equal(progress.legacyWins, 12);
  const legacy = readProgress({
    sound: false,
    wins: { defense: 4, attack: 7, invalid: -1, fractional: 0.5, string: '9', huge: Infinity },
  });
  assert.equal(legacy.legacyWins, 11);
  assert.equal(legacy.sound, false);
  assert.equal(progress.unlockedLevel, 1);
  assert.equal(isUnlocked(progress, LEVELS[1].id), false);
  const state = createMatch(LEVELS[0].id, 7, undefined, { tutorial: true });
  command(state, 0, { type: 'draw', kind: 'hero' });
  command(state, 0, { type: 'fillAll', slot: 0 });
  step(state, 180);
  command(state, 0, { type: 'fillAll', slot: 3 });
  command(state, 0, { type: 'fillAll', slot: 0 });
  step(state);
  assert.equal(state.tutorialStep, 6);
  assert.equal(restore(snapshot(state)).tutorialStep, 6);
  state.phase = 'won';
  state.winner = 0;
  state.sides[1].crystalHp = 0;
  const result = settleProgress(progress, state);
  assert.equal(result.settled, true);
  assert.equal(progress.unlockedLevel, 2);
  assert.equal(progress.tutorialStep, 6);
  assert.equal(settleProgress(progress, state).settled, false);
  assert.deepEqual(readProgress(JSON.stringify(progress)), progress);
  const practice = createMatch(LEVELS[3].id, 1, undefined, { practice: true });
  practice.phase = 'won';
  practice.winner = 0;
  practice.sides[1].crystalHp = 0;
  assert.equal(settleProgress(progress, practice).settled, false);
  assert.deepEqual(readProgress('{bad'), createProgress());
  assert.equal(readProgress({ ...progress, unlockedLevel: Infinity }).unlockedLevel, 1);
  assert.notEqual(createMatch(LEVELS[0].id, 7).id, createMatch(LEVELS[0].id, 7).id);
});

test('seed and timestamped player commands replay the same battle including automatic enemy AI', () => {
  const original = createMatch('level-15', 1234, ['wukong', 'cannon']);
  for (let tick = 0; tick < 900; tick++) {
    if (tick % 10 === 0) play(original);
    step(original);
  }
  const replay = createMatch(original.levelId, original.seed, original.sides[0].deck);
  const inputs = original.commands.filter((c) => c.side === 0);
  let index = 0;
  while (replay.tick < original.tick) {
    while (inputs[index]?.tick === replay.tick) {
      assert.ok(command(replay, 0, inputs[index++].action).ok);
    }
    step(replay);
  }
  const expected = snapshot(original),
    actual = snapshot(replay);
  actual.id = expected.id;
  assert.deepEqual(actual, expected);
});

test('same-distance targeting keeps a stable ID, symmetric attacks kill both participants', () => {
  const state = createMatch('level-01', 1);
  const a = army(state, 0, 'nezha', 400, 180);
  const b = army(state, 1, 'nezha', 440, 150);
  const c = army(state, 1, 'nezha', 440, 210);
  step(state);
  assert.equal(a.targetId, b.id);
  c.y = 205;
  step(state);
  assert.equal(a.targetId, b.id);
  const duel = createMatch('level-01', 2);
  army(duel, 0, 'nezha', 490, 180).hp = 1;
  army(duel, 1, 'nezha', 510, 180).hp = 1;
  step(duel);
  assert.equal(duel.units.length, 0);
  assert.equal(duel.sides[0].coins, duel.sides[1].coins);
});

test('every recipe can be legally assembled, four-part recipes work, upgrades only affect future spawns', () => {
  for (const spec of CATALOG) {
    const state = createMatch(
      'level-30',
      1,
      spec.kind === 'hero' ? [spec.id, 'fire'] : ['nezha', spec.id],
    );
    const index = spec.kind === 'hero' ? 0 : 3;
    assert.ok(command(state, 0, { type: 'fillAll', slot: index }).ok, spec.id);
    step(state, Math.round(spec.production * TICK_RATE));
    const unit = state.units.find((u) => u.side === 0 && u.key === spec.id)!;
    assert.ok(unit, spec.id);
    assert.equal(unit.maxHp, spec.hp);
    assert.equal(unit.damage, spec.damage);
    assert.ok(restore(snapshot(state)));
  }
  const state = createMatch('level-01', 9, undefined, { tutorial: true });
  command(state, 0, { type: 'fillAll', slot: 0 });
  step(state, 160);
  const first = state.units.find((u) => u.side === 0)!;
  first.hp -= 10;
  command(state, 0, { type: 'fillAll', slot: 0 });
  assert.equal(first.level, 1);
  assert.equal(first.hp, getSpec('nezha').hp - 10);
  step(state, 160);
  const second = state.units.find((u) => u.side === 0 && u.level === 2)!;
  assert.ok(second.damage > first.damage);
});

test('specials actually affect combat: piercing, chain, slow, guard, siege, healing and shielding', () => {
  for (const key of [
    'erlang',
    'crossbow',
    'leizhen',
    'change',
    'frost',
    'juling',
    'guard',
    'ram',
    'lantern',
    'tianwang',
    'xuannv',
  ]) {
    const state = createMatch('level-30', 6);
    const unit = army(state, 0, key, 450, 180);
    const front = army(state, 1, 'nezha', 478, 180);
    const back = army(state, 1, 'nezha', 498, 180);
    const ally = army(state, 0, 'nezha', 360, 180);
    ally.hp -= 50;
    const before = front.hp,
      beforeBack = back.hp,
      beforeSelf = unit.hp;
    if (key === 'ram') {
      state.units = [unit];
      unit.x = 930;
    }
    step(state);
    const special = getSpec(key).special;
    if (special === 'pierce' || special === 'chain') assert.ok(back.hp < beforeBack, key);
    if (special === 'slow') assert.equal(front.slowTicks, 30, key);
    if (special === 'guard') assert.ok(unit.hp > beforeSelf - 2 * getSpec('nezha').damage, key);
    if (special === 'siege')
      assert.equal(state.sides[1].crystalHp, state.sides[1].maxCrystalHp - unit.damage * 2);
    if (special === 'heal') assert.ok(ally.hp > ally.maxHp - 50, key);
    if (special === 'shield') assert.ok(ally.shield > 0, key);
    if (key !== 'ram') assert.ok(front.hp < before, key);
  }
});

// The proof policy only reads its own workshop and submits ordinary player actions.
function play(state: Match): void {
  const side = state.sides[0];
  const slots = side.slots
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.level - b.s.level || a.i - b.i);
  for (const { s, i } of slots) {
    if (s.parts.some((filled, index) => !filled && side.bag[`${s.key}:${index}`] > 0)) {
      assert.ok(command(state, 0, { type: 'fillAll', slot: i }).ok);
      return;
    }
  }
  for (const { s } of slots) {
    for (let index = 0; index < s.parts.length; index++) {
      if (
        !s.parts[index] &&
        !side.bag[`${s.key}:${index}`] &&
        command(state, 0, { type: 'exchange', key: s.key, index }).ok
      )
        return;
    }
  }
  if (side.coins >= 30) {
    const hero = side.slots.slice(0, 3).reduce((n, s) => n + s.level, 0) / 3;
    const weapon = side.slots.slice(3).reduce((n, s) => n + s.level, 0) / 2;
    assert.ok(command(state, 0, { type: 'draw', kind: hero <= weapon ? 'hero' : 'weapon' }).ok);
  }
}

test(
  'all 30 levels have a no-ad legal-command win for three seeds, including slow first-level onboarding',
  { timeout: 120000 },
  () => {
    const results: string[] = [];
    for (const seed of [1, 42, 20261022]) {
      const progress = createProgress();
      for (const level of LEVELS) {
        assert.ok(isUnlocked(progress, level.id));
        const deck =
          level.number >= 23
            ? ['tianwang', 'erlang', 'cannon']
            : level.number >= 14
              ? ['wukong', 'cannon']
              : level.number >= 11
                ? ['juling', 'erlang', 'cannon']
                : ['nezha', 'fire'];
        assert.ok(deck.every((id) => progress.unlockedIds.includes(id)));
        const state = createMatch(level.id, seed, deck);
        for (let tick = 0; tick < 20 * 600 && state.phase === 'running'; tick++) {
          if (tick % 10 === 0 && (level.number !== 1 || tick >= 12 * TICK_RATE)) play(state);
          step(state);
        }
        assert.equal(
          state.phase,
          'won',
          `${level.id} seed=${seed} hp=${state.sides.map((s) => s.crystalHp)}`,
        );
        assert.equal(state.assisted, false);
        assert.equal(state.sides[0].boostUsed, false);
        assert.ok(settleProgress(progress, state).settled);
        results.push(`${level.number}:${seed}:${state.tick / TICK_RATE}`);
      }
      assert.equal(progress.unlockedIds.length, 16);
    }
    console.log('legal no-ad wins level:seed:seconds', results.join(' '));
  },
);

test('rounded range boundary never strands a unit beside the crystal', () => {
  const state = createMatch('level-01', 1);
  army(state, 0, 'nezha', 888, 180.001);
  step(state);
  assert.ok(state.sides[1].crystalHp < state.sides[1].maxCrystalHp);
});

test('heroes and weapons are born beside their own crystal, then move freely', () => {
  const state=createMatch('level-01',42);
  command(state,0,{type:'fillAll',slot:0});
  command(state,0,{type:'fillAll',slot:3});
  step(state,160);
  const hero=state.units.find(u=>u.side===0&&u.key==='nezha')!;
  assert.ok(Math.hypot(hero.x-50,hero.y-180)<65);
  step(state,20);
  const weapon=state.units.find(u=>u.side===0&&u.key==='fire')!;
  assert.ok(Math.hypot(weapon.x-50,weapon.y-180)<65);
});

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  BUFFS,
  MAX_LEVEL,
  SUMMON_COST,
  beginWave,
  castSkill,
  chooseBuff,
  createGame,
  moveUnit,
  revive,
  sellUnit,
  summon,
  tick,
} from '../src/game.ts';
import type { Enemy, Location, State, Unit } from '../src/game.ts';

const board = (index: number): Location => ({ area: 'board', index });
const field = (index: number): Location => ({ area: 'field', index });
function unit(s: State, kind: Unit['kind'] = 'archer', level = 1): Unit {
  return { id: s.nextId++, kind, level, cooldown: 0 };
}
function enemy(s: State, overrides: Partial<Enemy> = {}): Enemy {
  return {
    id: s.nextId++,
    kind: 'crawler',
    x: 0.125,
    y: 0.4,
    hp: 100,
    maxHp: 100,
    speed: 0.05,
    damage: 5,
    attackTimer: 0,
    slow: 0,
    boss: false,
    ...overrides,
  };
}
function battle(): State {
  const s = createGame(0, () => 0.25);
  moveUnit(s, board(0), field(0));
  beginWave(s);
  s.spawnTimer = 999;
  return s;
}
function seedRandom(seed: number) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}

test('starter, input validation, paid summons and full-board failures preserve resources', () => {
  const s = createGame();
  assert.equal(s.board.length, 12);
  assert.equal(s.field.length, 4);
  assert.equal(s.board.filter(Boolean).length, 2);
  assert.equal(beginWave(s).ok, false);
  assert.equal(moveUnit(s, board(-1), field(0)).ok, false);
  assert.equal(moveUnit(s, board(0.5), field(0)).ok, false);
  assert.equal(moveUnit(s, board(0), board(0)).ok, false);
  assert.equal(moveUnit(s, board(11), field(0)).ok, false);
  assert.equal(chooseBuff(s, 'quickshot').ok, false);
  assert.equal(castSkill(s).ok, false);
  assert.equal(revive(s).ok, false);
  assert.equal(summon(s).ok, true);
  assert.equal(s.gold, SUMMON_COST * 2);
  assert.equal(summon(s).ok, true);
  assert.equal(summon(s).ok, true);
  assert.equal(summon(s).ok, false);
  while (s.board.includes(null)) assert.equal(summon(s, true).ok, true);
  const before = structuredClone(s);
  assert.equal(summon(s).ok, false);
  assert.deepEqual(s, before);
  assert.equal(s.stats.highestBoard, 12);
  assert.equal(
    s.events.some((e) => e.type === 'board_occupancy' && e.full === true),
    true,
  );
  assert.equal(createGame(-20).maxHp, 100);
  assert.equal(createGame(Infinity).maxHp, 100);
  assert.equal(createGame(1).maxHp, 110);
  assert.equal(createGame(5).maxHp, 150);
  assert.equal(createGame(99).maxHp, 150);
});

test('merge, deploy, swap and sell preserve units; max-level merging loses nothing', () => {
  const s = createGame();
  assert.equal(moveUnit(s, board(0), board(1)).ok, true);
  assert.equal(s.board[0], null);
  assert.equal(s.board[1]?.level, 2);
  assert.equal(moveUnit(s, board(1), field(2)).ok, true);
  s.board[0] = unit(s, 'shield');
  const shieldId = s.board[0].id;
  assert.equal(moveUnit(s, board(0), field(2)).ok, true);
  assert.equal(s.field[2]?.id, shieldId);
  assert.equal(s.board[0]?.level, 2);
  s.field[0] = unit(s, 'archer', 2);
  assert.equal(moveUnit(s, board(0), field(0)).ok, true);
  assert.equal(s.field[0]?.level, MAX_LEVEL);
  s.board[0] = unit(s, 'archer', MAX_LEVEL);
  const before = structuredClone(s);
  assert.equal(moveUnit(s, board(0), field(0)).ok, false);
  assert.deepEqual(s, before);
  const gold = s.gold;
  assert.equal(sellUnit(s, board(0)).ok, true);
  assert.equal(s.gold, gold + 24);
  assert.equal(sellUnit(s, board(0)).ok, false);
  assert.equal(s.highestLevel, 3);
  assert.equal(s.stats.mergeLevels[3], 1);
});

test('merge blessings heal once and lucky upgrade is capped at three', () => {
  const s = createGame(0, () => 0.1);
  s.buffs = ['renewal', 'lucky'];
  s.hp = 95;
  assert.equal(moveUnit(s, board(0), board(1)).ok, true);
  assert.equal(s.board[1]?.level, 3);
  assert.equal(s.hp, 100);
  assert.equal(s.events.filter((e) => e.type === 'merge').length, 1);
});

test('only deployed units attack; archer speed/piercing and mage area blessings work', () => {
  const baseline = battle();
  baseline.enemies = [enemy(baseline)];
  tick(baseline, 0.36);
  assert.equal(baseline.enemies[0].hp, 93);
  const upgraded = battle();
  upgraded.buffs = ['quickshot', 'pierce'];
  upgraded.enemies = [enemy(upgraded), enemy(upgraded, { y: 0.3 })];
  tick(upgraded, 0.36);
  assert.equal(upgraded.enemies[0].hp, 93);
  assert.equal(upgraded.enemies[1].hp, 95.1);
  assert.ok(upgraded.field[0]!.cooldown < baseline.field[0]!.cooldown);
  const mage = battle();
  mage.field[0]!.kind = 'mage';
  mage.buffs = ['arcane'];
  mage.enemies = [enemy(mage), enemy(mage, { x: 0.32, y: 0.39 })];
  tick(mage, 0.52);
  assert.equal(mage.enemies[0].hp, 85);
  assert.equal(mage.enemies[1].hp, 88.75);
});

test('frost slows, shields block one nearby enemy and thorns reflects damage', () => {
  const frost = battle();
  frost.field[0]!.kind = 'frost';
  frost.buffs = ['frostbite'];
  frost.enemies = [enemy(frost)];
  tick(frost, 0.01);
  assert.equal(frost.enemies[0].slow, 0);
  assert.equal(frost.enemies[0].hp, 100);
  tick(frost, 0.38);
  assert.ok(frost.enemies[0].slow > 2);
  assert.equal(frost.enemies[0].hp, 91.6);
  const y = frost.enemies[0].y;
  tick(frost, 0.01);
  assert.ok(frost.enemies[0].y - y < 0.0003);
  const shield = battle();
  shield.field[0]!.kind = 'shield';
  shield.buffs = ['thorns'];
  shield.enemies = [enemy(shield, { y: 0.7 })];
  tick(shield, 0.01);
  assert.equal(shield.enemies[0].y, 0.7);
  assert.equal(shield.enemies[0].hp, 82.5);
  tick(shield, 0.22);
  assert.equal(shield.enemies[0].hp, 72.5);
  assert.equal(shield.hp, 99.25);
});

test('ranged guards wait for enemies to enter the visible field; shields keep their melee reach', () => {
  for (const kind of ['archer', 'mage', 'frost', 'shield'] as const) {
    const s = battle();
    s.field[0]!.kind = kind;
    s.enemies = [enemy(s, { y: 0.24, speed: 0 })];
    tick(s, 0.01);
    assert.equal(s.shots.length, 0);
    s.enemies[0].y = 0.25;
    tick(s, 0.01);
    assert.equal(s.shots.length, kind === 'shield' ? 0 : 1);
    if (kind === 'shield') {
      s.enemies[0].y = 0.48;
      tick(s, 0.01);
      assert.equal(s.shots.length, 1);
    }
  }
  for (const kind of ['archer', 'mage'] as const) {
    const s = battle();
    s.field[0]!.kind = kind;
    s.buffs = ['pierce'];
    s.enemies = [enemy(s, { y: 0.3, speed: 0 }), enemy(s, { y: 0.24, speed: 0 })];
    tick(s, 0.52);
    assert.ok(s.enemies[0].hp < 100);
    assert.equal(s.enemies[1].hp, 100);
  }
});

test('attacks wind up, release once, track targets and damage only when the projectile arrives', () => {
  const s = battle();
  const target = enemy(s, { hp: 7, speed: 0 });
  s.enemies = [target];
  const gold = s.gold;
  tick(s, 0.01);
  assert.equal(target.hp, 7);
  assert.equal(s.field[0]!.cooldown, 0.7);
  assert.equal(s.events.filter((e) => e.type === 'attack_start').length, 1);
  assert.equal(s.events.filter((e) => e.type === 'attack_release').length, 0);
  assert.equal(s.impacts.length, 0);
  target.x = 0.2;
  target.y = 0.5;
  tick(s, 0.09);
  assert.equal(s.shots[0].tx, 0.2);
  assert.equal(s.shots[0].ty, 0.5);
  assert.equal(s.shots[0].released, false);
  tick(s, 0.01);
  assert.equal(s.shots[0].released, true);
  assert.equal(s.events.filter((e) => e.type === 'attack_release').length, 1);
  tick(s, 0.21);
  assert.equal(target.hp, 7);
  assert.equal(s.gold, gold);
  tick(s, 0.01);
  assert.equal(target.hp, 0);
  assert.equal(s.shots.length, 0);
  assert.equal(s.enemies.length, 0);
  assert.equal(s.gold, gold + 3);
  assert.equal(s.kills, 1);
  assert.equal(s.impacts[0].enemyId, target.id);
  assert.equal(s.impacts[0].enemyKind, 'crawler');
  assert.equal(s.impacts[0].killed, true);
  assert.equal(s.impacts[0].damage, 7);
  assert.equal(s.impacts[0].duration, 0.9);
  tick(s, 0.9);
  assert.equal(s.impacts.length, 0);
  assert.equal(s.events.filter((e) => e.type === 'hit').length, 1);
  assert.equal(s.events.filter((e) => e.type === 'attack_release').length, 1);
});

test('projectiles aimed at a killed target cannot damage or reward it twice', () => {
  for (const useSkill of [false, true]) {
    const s = battle();
    s.field[1] = unit(s);
    s.enemies = [enemy(s, { hp: 7, speed: 0 })];
    const gold = s.gold;
    tick(s, 0.01);
    assert.equal(s.shots.length, 2);
    if (useSkill) assert.equal(castSkill(s).ok, true);
    tick(s, 0.4);
    assert.equal(s.kills, 1);
    assert.equal(s.gold, gold + 3);
    assert.equal(s.shots.length, 0);
    assert.equal(s.events.filter((e) => e.type === 'hit').length, 1);
    assert.equal(s.events.find((e) => e.type === 'hit')?.kind, useSkill ? 'bell' : 'archer');
  }
});

test('splash and piercing use the alive enemies at impact, and effects have a bounded lifetime', () => {
  for (const kind of ['archer', 'mage'] as const) {
    const s = battle();
    s.field[0]!.kind = kind;
    s.buffs = ['pierce'];
    const target = enemy(s, { speed: 0 });
    const leaving = enemy(s, { y: 0.39, speed: 0 });
    const entering = enemy(s, { x: 0.8, y: 0.39, speed: 0 });
    s.enemies = [target, leaving, entering];
    tick(s, 0.01);
    leaving.x = 0.8;
    entering.x = 0.125;
    tick(s, 0.5);
    assert.equal(leaving.hp, 100);
    assert.equal(entering.hp, kind === 'mage' ? 91 : 95.1);
  }
  const s = battle();
  s.field[0] = null;
  s.enemies = Array.from({ length: 110 }, () => enemy(s));
  castSkill(s);
  assert.equal(s.impacts.length, 96);
  assert.equal(s.events.filter((e) => e.type === 'hit').length, 110);
  tick(s, 0.71);
  assert.equal(s.impacts.length, 0);
});

test('supplies queue without charging or losing units and unlock all four kinds', () => {
  const s = battle();
  while (s.board.includes(null)) summon(s, true);
  const beforeGold = s.gold,
    beforeSummons = s.summons;
  tick(s, 28.1);
  assert.equal(s.pendingSupply, 2);
  assert.equal(s.summons, beforeSummons);
  assert.equal(s.gold, beforeGold);
  sellUnit(s, board(11));
  tick(s, 0.1);
  assert.equal(s.pendingSupply, 1);
  assert.equal(s.board.every(Boolean), true);
  const unlocked = createGame(0, () => 0.999);
  summon(unlocked);
  assert.equal(unlocked.board[2]?.kind, 'shield');
  unlocked.wave = 3;
  summon(unlocked);
  assert.equal(unlocked.board[3]?.kind, 'mage');
  unlocked.wave = 6;
  summon(unlocked);
  assert.equal(unlocked.board[4]?.kind, 'frost');
});

test('ready, paused, blessings and terminal phases freeze every clock; long frames retain elapsed time', () => {
  const s = createGame();
  const initial = structuredClone(s);
  tick(s, 10);
  assert.deepEqual(s, initial);
  moveUnit(s, board(0), field(0));
  beginWave(s);
  s.spawnTimer = 999;
  s.skillCooldown = 24;
  tick(s, 5);
  assert.ok(Math.abs(s.elapsed - 5) < 1e-8);
  assert.ok(Math.abs(s.skillCooldown - 19) < 1e-8);
  s.enemies = [enemy(s, { hp: 1000 })];
  tick(s, 0.01);
  s.skillCooldown = 0;
  castSkill(s);
  assert.equal(s.shots.length, 1);
  assert.equal(s.impacts.length, 1);
  for (const phase of ['playing', 'buff', 'won', 'lost'] as const) {
    s.phase = phase;
    s.paused = phase === 'playing';
    const before = structuredClone(s);
    tick(s, 30);
    assert.deepEqual(s, before);
  }
  s.phase = 'playing';
  s.paused = false;
  const before = structuredClone(s);
  tick(s, Infinity);
  tick(s, NaN);
  tick(s, -1);
  assert.deepEqual(s, before);
});

test('skill, death and one free revive enforce cooldown and report terminal outcomes', () => {
  const s = battle();
  s.enemies = [enemy(s, { hp: 10 })];
  const gold = s.gold;
  assert.equal(castSkill(s).ok, true);
  assert.equal(s.kills, 1);
  assert.equal(s.gold, gold + 3);
  assert.equal(castSkill(s).ok, false);
  s.enemies = [enemy(s, { y: 0.82, damage: 200 })];
  tick(s, 0.01);
  assert.equal(s.phase, 'lost');
  assert.equal(s.hp, 0);
  assert.equal(s.stats.failureWave, 1);
  assert.equal(revive(s).ok, true);
  assert.equal(s.hp, 60);
  assert.equal(s.phase, 'playing');
  assert.equal(s.enemies[0].y, 0.3);
  assert.equal(s.events.find((e) => e.type === 'revive')?.source, 'free');
  s.enemies[0].y = 0.82;
  s.enemies[0].attackTimer = 0;
  tick(s, 0.01);
  assert.equal(s.phase, 'lost');
  assert.equal(revive(s).ok, false);
});

test('last kills finish their death beat before blessing or victory overlays, even with a stray shot', () => {
  for (const wave of [4, 10]) {
    const s = battle();
    s.wave = wave;
    s.waveTime = 20;
    s.spawned = s.spawnTotal;
    s.enemies = [enemy(s, { hp: 7, speed: 0 })];
    tick(s, 0.01);
    // A projectile whose target dies cannot keep the wave open beyond the death beat.
    s.shots[0].life = s.shots[0].duration = 5;
    castSkill(s);
    tick(s, 0.54);
    assert.equal(s.enemies.length, 0);
    assert.equal(s.phase, 'playing');
    assert.equal(s.kills, 1);
    s.paused = true;
    const before = structuredClone(s);
    tick(s, 2);
    assert.deepEqual(s, before);
    s.paused = false;
    tick(s, 0.02);
    assert.equal(s.phase, wave === 4 ? 'buff' : 'won');
    assert.ok(s.impacts[0].life > 0);
    assert.equal(s.shots.length, 1);
  }
});

test('a cleared wave waits twenty seconds; blessings appear before both bosses, with three valid choices', () => {
  const s = battle();
  s.spawned = s.spawnTotal;
  tick(s, 19.9);
  assert.equal(s.phase, 'playing');
  tick(s, 0.1);
  assert.equal(s.phase, 'intermission');
  for (const wave of [4, 9]) {
    s.wave = wave;
    s.phase = 'playing';
    s.waveTime = 20;
    s.spawned = s.spawnTotal;
    tick(s, 0.01);
    assert.equal(s.phase, 'buff');
    assert.equal(s.choices.length, 3);
    assert.equal(new Set(s.choices).size, 3);
    assert.ok(s.choices.every((id) => BUFFS[id] && !s.buffs.includes(id)));
    assert.equal(chooseBuff(s, 'invented').ok, false);
    assert.equal(chooseBuff(s, s.choices[0]).ok, true);
    tick(s, 3.1);
    assert.equal(s.wave, wave + 1);
    assert.equal(s.phase, 'playing');
  }
  assert.deepEqual(s.stats.bossReached, [5, 10]);
  s.revived = true;
  s.stats.failureWave = 8;
  s.waveTime = 20;
  s.spawned = s.spawnTotal;
  s.enemies = [];
  tick(s, 0.01);
  assert.equal(s.phase, 'won');
  assert.equal(s.stats.failureWave, null);
  assert.equal(s.events.at(-1)?.successAfterRevive, true);
  assert.equal(s.events.at(-1)?.type, 'run_end');
});

function manage(s: State) {
  const locations = (): Location[] => [
    ...s.board.map((_, index) => board(index)),
    ...s.field.map((_, index) => field(index)),
  ];
  for (let moves = 0; moves < 30; moves++) {
    const slots = locations();
    let merged = false;
    for (let i = 0; i < slots.length && !merged; i++) {
      const a = s[slots[i].area][slots[i].index];
      if (!a || a.level >= 3) continue;
      for (let j = i + 1; j < slots.length; j++) {
        const b = s[slots[j].area][slots[j].index];
        if (b?.kind === a.kind && b.level === a.level) {
          merged = moveUnit(s, slots[i], slots[j]).ok;
          if (merged) break;
        }
      }
    }
    if (!merged) break;
  }
  const strength = (u: Unit | null) =>
    u ? 2.5 ** u.level * { archer: 1.1, mage: 1.15, frost: 0.85, shield: 0.5 }[u.kind] : 0;
  for (let i = 0; i < s.field.length; i++) {
    let best = -1;
    for (let j = 0; j < s.board.length; j++)
      if (
        strength(s.board[j]) > strength(s.field[i]) &&
        (best < 0 || strength(s.board[j]) > strength(s.board[best]))
      )
        best = j;
    if (best >= 0) moveUnit(s, board(best), field(i));
  }
  while (s.gold >= SUMMON_COST && s.board.includes(null)) summon(s);
}
test('deterministic simple player completes ten real waves in three to five minutes without talents or revive', (t) => {
  for (const seed of [7, 42, 2026]) {
    const s = createGame(0, seedRandom(seed));
    manage(s);
    manage(s);
    assert.equal(beginWave(s).ok, true);
    for (let seconds = 0; seconds < 350 && !['lost', 'won'].includes(s.phase); seconds += 0.25) {
      if (s.phase === 'buff') {
        const choice = [
          'pierce',
          'quickshot',
          'arcane',
          'bounty',
          'renewal',
          'lucky',
          'frostbite',
          'thorns',
        ].find((id) => s.choices.includes(id))!;
        chooseBuff(s, choice);
      }
      manage(s);
      if (
        s.enemies.filter((e) => e.hp > 0).length >= 4 ||
        s.enemies.some((e) => e.boss && e.hp > 0)
      )
        castSkill(s);
      tick(s, 0.25);
    }
    assert.equal(s.phase, 'won', `seed ${seed}: wave ${s.wave}, hp ${s.hp}, elapsed ${s.elapsed}`);
    assert.ok(s.elapsed >= 180 && s.elapsed <= 300, `seed ${seed}: ${s.elapsed}s`);
    assert.equal(s.buffs.length, 2);
    assert.equal(s.revived, false);
    assert.equal(s.highestLevel, 3);
    assert.deepEqual(s.stats.bossReached, [5, 10]);
    assert.equal(s.events.filter((e) => e.type === 'buff_choice').length, 2);
    t.diagnostic(
      `seed ${seed}: ${s.elapsed.toFixed(1)}s, ${s.hp.toFixed(1)} HP, ${s.merges} merges, ${s.field.map((u) => (u ? `${u.kind}${u.level}` : 'empty')).join('/')}`,
    );
  }
});

test('initial deployment without further merging or skills fails: continued player decisions are necessary', (t) => {
  for (const seed of [7, 42, 2026]) {
    const s = createGame(0, seedRandom(seed));
    manage(s);
    manage(s);
    beginWave(s);
    for (let seconds = 0; seconds < 350 && !['lost', 'won'].includes(s.phase); seconds++) {
      if (s.phase === 'buff') chooseBuff(s, s.choices[0]);
      tick(s, 1);
    }
    assert.equal(s.phase, 'lost', `seed ${seed}: unattended squad should not win`);
    t.diagnostic(`idle seed ${seed}: failed wave ${s.wave}, board peak ${s.stats.highestBoard}/12`);
  }
});

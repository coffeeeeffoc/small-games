import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, SKILLS } from '../src/config.mjs';
import {
  createGame,
  startGame,
  step,
  castSkill,
  chooseUpgrade,
  pauseGame,
  resumeGame,
} from '../src/simulation.mjs';

const idle = { autoFire: false };
const advance = (state, seconds) => {
  for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += 0.1)
    step(state, Math.min(0.1, seconds - elapsed), idle);
};
const battle = (levelId = 'ruins') => {
  const state = startGame(createGame(levelId));
  state.spawnTimer = 1e6;
  return state;
};
const victim = (state, overrides = {}) => {
  const enemy = {
    id: ++state.nextId,
    kind: 'sprout',
    x: state.player.x + 220,
    y: state.player.y,
    hp: 1,
    maxHp: 1,
    radius: 16,
    angle: 0,
    age: 0,
    hit: 0,
    slow: 1,
    attackCooldown: 1,
    biteCooldown: 0,
    stuck: 0,
    ...overrides,
  };
  state.enemies.push(enemy);
  return enemy;
};

test('every campaign run and retry starts with no map terrain or acquired plants', () => {
  for (const level of Object.values(LEVELS)) {
    const state = battle(level.id);
    assert.deepEqual(state.terrain, []);
    assert.deepEqual(state.plants, []);
    assert.deepEqual(state.boons, []);
    state.terrain.push({ kind: 'wall' });
    state.boons.push('shrub');
    startGame(state);
    assert.deepEqual(state.terrain, []);
    assert.deepEqual(state.boons, []);
  }
});

test('time ends spawning but combat, upgrades, pause and damage continue until the last enemy dies', () => {
  const state = battle();
  state.time = state.duration - 0.001;
  state.spawnTimer = 0;
  const enemy = victim(state);
  advance(state, 0.1);
  assert.equal(state.phase, 'playing');
  assert.equal(state.enemies.length, 1, 'no ordinary enemy spawns after the deadline');
  assert.ok(state.time > state.duration);
  assert.equal(state.events.filter((event) => event.type === 'clear-ready').length, 1);
  pauseGame(state);
  const paused = structuredClone(state);
  advance(state, 1);
  assert.deepEqual(state, paused);
  resumeGame(state);
  state.progression.pending = 1;
  state.progression.queue = [2];
  advance(state, 0.1);
  assert.equal(state.phase, 'upgrade', 'clear phase still permits earned upgrades');
  chooseUpgrade(
    state,
    state.upgradeChoices.find((id) => !id.startsWith('boon-')),
  );
  state.skillSlots[0].energy = 100;
  assert.equal(castSkill(state, enemy, 0), true);
  advance(state, 0.7);
  assert.equal(state.phase, 'won');
  assert.equal(state.enemies.filter((entry) => entry.hp > 0).length, 0);
  assert.equal(state.events.filter((event) => event.type === 'win').length, 1);
});

test('death during clear phase loses instead of awarding a time-only victory', () => {
  const state = battle();
  state.time = state.duration;
  state.player.hp = 1;
  victim(state, { x: state.player.x, attackCooldown: 0, hp: 1000 });
  advance(state, 0.1);
  assert.equal(state.phase, 'lost');
});

test('energy just below one charge cannot cast or change either slot', () => {
  const state = battle();
  state.skillSlots[0].energy = 99.9;
  state.skillSlots[1].energy = 173.2;
  const before = structuredClone(state);
  assert.equal(castSkill(state, { x: state.player.x + 100, y: state.player.y }, 0), false);
  assert.deepEqual(state, before);
});

for (const [energy, remainder, charges] of [
  [100, 0, 0],
  [118.4, 18.4, 0],
  [199.9, 99.9, 0],
  [200, 100, 1],
  [300, 200, 2],
]) {
  test(`casting from ${energy} energy spends one charge and preserves the remainder`, () => {
    const state = battle();
    state.skillSlots[0].energy = energy;
    state.skillSlots[1].energy = 173.2;
    const otherSlot = structuredClone(state.skillSlots[1]);
    const target = { x: state.player.x + 100, y: state.player.y };
    assert.equal(castSkill(state, target, 0), true);
    assert.ok(Math.abs(state.skillSlots[0].energy - remainder) < 1e-9);
    assert.equal(Math.floor(state.skillSlots[0].energy / 100), charges);
    assert.deepEqual(state.skillSlots[1], otherSlot);
    assert.equal(state.stats.skillCasts, 1);
    const after = structuredClone(state);
    assert.equal(castSkill(state, target, 0), false, 'an immediate repeat cannot spend another charge');
    assert.deepEqual(state, after);
  });
}

test('three stored casts consume one charge each and retain partial energy and the other slot', () => {
  const state = battle();
  advance(state, 55);
  assert.deepEqual(
    state.skillSlots.map((slot) => slot.energy),
    [300, 300],
  );
  const target = { x: state.player.x + 100, y: state.player.y };
  for (let remaining = 2; remaining >= 0; remaining--) {
    const before = state.skillSlots[0].energy;
    assert.equal(castSkill(state, target), true);
    assert.equal(state.skillSlots[0].energy, before - SKILLS.blast.energyMax);
    assert.equal(state.skillSlots[1].energy, 300);
    assert.equal(castSkill(state, target), false, 'short release cooldown is respected');
    advance(state, 0.31);
    assert.equal(Math.floor(state.skillSlots[0].energy / 100), remaining);
  }
  assert.equal(state.stats.skillCasts, 3);
  assert.equal(castSkill(state, target), false, 'fourth cast requires more energy');
  assert.ok(state.skillSlots[0].energy > 0, 'partial next charge survives all releases');
  advance(state, 60);
  assert.equal(state.skillSlots[0].energy, 300);
});

test('energy upgrade respects the three-charge cap without discarding excess stored energy', () => {
  const state = battle();
  state.skillSlots[0].energy = 290;
  state.skillSlots[1].energy = 180;
  state.phase = 'upgrade';
  state.upgradeChoices = ['energy-cycle'];
  state.progression.pending = 1;
  assert.equal(chooseUpgrade(state, 'energy-cycle'), true);
  assert.deepEqual(
    state.skillSlots.map((slot) => slot.energy),
    [300, 205],
  );
});

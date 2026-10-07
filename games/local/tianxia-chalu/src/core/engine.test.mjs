import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEVELS,
  RULES,
  createMatch,
  tick,
  switchRoute,
  getScore,
  validateLevels,
  getUnlockedLevels,
  applyResult,
  migrateProgress,
} from './index.mjs';

const fresh = () => createMatch({ seed: 'test', aiEnabled: false });
const clone = (value) => JSON.parse(JSON.stringify(value));
const freezeProduction = (state) => {
  for (const city of state.cities) {
    city.production = 0;
    city.dispatchProgress = -1000;
  }
};

function packet(
  state,
  {
    owner = 0,
    troops = 8,
    targetCityId,
    phase = 'road',
    junctionId = 'redgate-switch',
    duration = 0.1,
  },
) {
  const junction = state.junctions.find((entry) => entry.id === junctionId);
  const target = state.cities.find((entry) => entry.id === targetCityId) ?? junction;
  const item = {
    id: state.nextPacketId++,
    owner,
    troops,
    fromCityId: junction.cityId,
    junctionId,
    phase,
    from: { x: junction.x, y: junction.y },
    to: { x: target.x, y: target.y },
    elapsed: 0,
    duration,
    targetCityId: targetCityId ?? null,
  };
  state.packets.push(item);
  return item;
}

test('the Game-owned campaign validates all references and normal unlock order', () => {
  assert.deepEqual(validateLevels(), { valid: true, errors: [] });
  assert.deepEqual(getUnlockedLevels(), ['crossroads']);
  const progress = {};
  applyResult(progress, { levelId: 'crossroads', outcome: 'defeat', score: 10 });
  assert.deepEqual(getUnlockedLevels(progress), ['crossroads']);
  const result = { levelId: 'crossroads', outcome: 'victory', stars: 2, score: 4100 };
  applyResult(progress, result);
  const afterFirst = clone(progress);
  applyResult(progress, result);
  assert.deepEqual(progress, afterFirst, 'settling the same result must not duplicate rewards');
  assert.deepEqual(getUnlockedLevels(progress), ['crossroads', 'riverfork']);
  applyResult(progress, { levelId: 'riverfork', outcome: 'victory', stars: 3 });
  assert.deepEqual(
    getUnlockedLevels(progress),
    LEVELS.map((level) => level.id),
  );
});

test('invalid content is rejected, including cyclic unlocks and unreachable roads', () => {
  const bad = clone(LEVELS);
  bad[0].requires = ['four-kingdoms'];
  bad[0].cities[0].junction.exits = ['missing', 'redgate'];
  bad[1].reward.unlock = 'missing';
  bad[2].cities[0].owner = 99;
  const validation = validateLevels(bad);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((message) => message.includes('unreachable level')));
  assert.ok(validation.errors.some((message) => message.includes('Invalid exits')));
  assert.ok(validation.errors.some((message) => message.includes('Unknown reward')));
  assert.ok(validation.errors.some((message) => message.includes('Unknown city owner')));
  assert.throws(() => createMatch({ levelId: 'missing' }), /Unknown level/);
  assert.throws(() => createMatch({ difficulty: 'missing' }), /Unknown difficulty/);
  assert.throws(() => createMatch({ seed: NaN }), /Seed/);
  for (const malformed of [
    null,
    {},
    [null],
    [{ id: 'bad', requires: {} }],
    [{ id: 'bad', requires: [], factions: [0, 1], cities: [null, {}] }],
  ])
    assert.equal(validateLevels(malformed).valid, false);
});

test('progress migration drops unknown content and bounds old or corrupt values', () => {
  assert.deepEqual(migrateProgress(null), { version: 1, completed: [], stars: {}, best: {} });
  assert.deepEqual(
    migrateProgress({
      version: 0,
      completed: ['crossroads', 'crossroads', 'unknown'],
      stars: { crossroads: 99, unknown: 2 },
      best: { crossroads: -5 },
    }),
    { version: 1, completed: ['crossroads'], stars: { crossroads: 3 }, best: { crossroads: 0 } },
  );
});

test('only the owner controls a junction and quick repeated taps are rejected', () => {
  const state = fresh();
  assert.equal(switchRoute(state, 0, 'bluegate-switch').reason, 'not-owner');
  assert.equal(switchRoute(state, 0, 'unknown').reason, 'unknown-junction');
  assert.equal(switchRoute(state, 0, 'redgate-switch', 2).reason, 'invalid-route');
  assert.equal(switchRoute(state, 0, 'redgate-switch').ok, true);
  assert.equal(switchRoute(state, 0, 'redgate-switch').reason, 'cooldown');
  tick(state, RULES.switchCooldown);
  assert.equal(switchRoute(state, 0, 'redgate-switch').ok, true);
});

test('a switch affects troops still approaching the fork', () => {
  const state = fresh();
  freezeProduction(state);
  const group = packet(state, { phase: 'approach' });
  switchRoute(state, 0, 'redgate-switch', 1);
  tick(state, 0.1);
  assert.equal(group.phase, 'road');
  assert.equal(group.targetCityId, 'eastford');
  assert.deepEqual(group.to, { x: 300, y: 365 });
});

test('after the fork, changing a switch never redirects or speeds up a travelling packet', () => {
  const state = fresh();
  freezeProduction(state);
  const group = packet(state, { phase: 'approach' });
  tick(state, 0.1);
  const destination = group.targetCityId;
  const duration = group.duration;
  const to = clone(group.to);
  assert.equal(switchRoute(state, 0, 'redgate-switch', 1).ok, true);
  tick(state, 0.3);
  assert.equal(group.targetCityId, destination);
  assert.equal(group.duration, duration);
  assert.deepEqual(group.to, to);
  assert.equal(group.elapsed, 0.30000000000000004);
});

test('production is automatic and dispatch keeps the same fixed garrison reserve', () => {
  const state = fresh();
  const city = state.cities[0];
  city.troops = RULES.reserve;
  tick(state, 2);
  const groups = state.packets.filter((entry) => entry.owner === 0);
  assert.equal(city.troops, RULES.reserve);
  assert.equal(
    groups.reduce((sum, entry) => sum + entry.troops, 0),
    2,
  );
  assert.ok(city.productionProgress >= 0 && city.productionProgress < 1);
  assert.equal(
    state.cities.find((entry) => entry.owner === null).troops,
    10,
    'neutral cities do not produce',
  );
});

test('combat is exactly 1:1; neutral capture transfers the city and its switch', () => {
  const state = fresh();
  freezeProduction(state);
  const city = state.cities.find((entry) => entry.id === 'westford');
  packet(state, { troops: 6, targetCityId: city.id });
  tick(state, 0.1);
  assert.equal(city.troops, 4);
  assert.equal(city.owner, null);
  packet(state, { troops: 4, targetCityId: city.id });
  tick(state, 0.1);
  assert.equal(city.troops, 0);
  assert.equal(city.owner, null, 'equal numbers leave no surviving capturing soldier');
  packet(state, { troops: 3, targetCityId: city.id });
  tick(state, 0.1);
  assert.equal(city.owner, 0);
  assert.equal(city.troops, 3);
  assert.equal(state.junctions.find((entry) => entry.cityId === city.id).owner, 0);
  assert.equal(switchRoute(state, 0, city.junctionId).ok, true);
  assert.equal(state.stats.captured, 1);
});

test('friendly arrivals join the garrison before any later automatic dispatch', () => {
  const state = fresh();
  freezeProduction(state);
  const city = state.cities[0];
  city.troops = 8;
  packet(state, { troops: 7, targetCityId: city.id });
  tick(state, 0.1);
  assert.equal(city.troops, 15);
  assert.equal(state.packets.length, 0);
  city.dispatchProgress = 0;
  tick(state, 2);
  assert.equal(city.troops, 8);
  assert.equal(state.packets[0].troops, 7);
});

test('the same seed, player input, and elapsed time reproduce across chunk sizes and JSON saves', () => {
  const first = createMatch({ levelId: 'four-kingdoms', seed: 'replay' });
  const second = createMatch({ levelId: 'four-kingdoms', seed: 'replay' });
  tick(first, 23);
  for (let i = 0; i < 230; i++) tick(second, 0.1);
  assert.deepEqual(second, first);
  const resumed = clone(first);
  switchRoute(first, 0, 'redgate-switch');
  switchRoute(resumed, 0, 'redgate-switch');
  tick(first, 11);
  tick(resumed, 11);
  assert.deepEqual(resumed, first);
  const otherSeed = createMatch({ levelId: 'four-kingdoms', seed: 'different' });
  tick(otherSeed, 23);
  assert.notDeepEqual(otherSeed.ai, second.ai, 'AI decisions use the recorded seed');
});

test('difficulty changes reaction times without changing city or army statistics', () => {
  const easy = createMatch({ difficulty: 'easy', seed: 7 });
  const hard = createMatch({ difficulty: 'hard', seed: 7 });
  assert.deepEqual(easy.cities, hard.cities);
  assert.deepEqual(easy.junctions, hard.junctions);
  assert.ok(easy.ai[0].nextDecision > hard.ai[0].nextDecision);
});

test('elimination waits for armies on the road and lets them recapture a lost city', () => {
  const state = fresh();
  freezeProduction(state);
  for (const city of state.cities) if (city.owner === 0) city.owner = 1;
  packet(state, { troops: 12, targetCityId: 'westford', duration: 0.5 });
  tick(state, 0.2);
  assert.equal(state.status, 'playing');
  tick(state, 0.3);
  assert.equal(state.cities.find((entry) => entry.id === 'westford').owner, 0);
  assert.equal(state.status, 'playing');
});

test('victory, defeat and finished-state input handling are explicit', () => {
  for (const winnerId of [0, 1]) {
    const state = fresh();
    freezeProduction(state);
    for (const city of state.cities) if (city.owner !== null) city.owner = winnerId;
    tick(state, 0.1);
    assert.equal(state.status, 'finished');
    assert.equal(state.result.outcome, winnerId === 0 ? 'victory' : 'defeat');
    assert.equal(state.result.reason, 'elimination');
    assert.equal(state.result.winnerId, winnerId);
    const ended = clone(state);
    tick(state, 10);
    assert.deepEqual(state, ended);
    assert.equal(switchRoute(state, 0, 'redgate-switch').reason, 'match-finished');
  }
});

test('180-second timeout compares territory, then surviving army, and allows a draw', () => {
  const state = fresh();
  freezeProduction(state);
  state.cities.find((entry) => entry.owner === 0).troops = 20;
  state.cities.find((entry) => entry.owner === 1).troops = 20;
  tick(state, 300);
  assert.equal(state.time, 180);
  assert.equal(state.result.reason, 'timeout');
  assert.equal(state.result.outcome, 'draw');
  assert.equal(state.result.winnerId, null);
  const leader = fresh();
  freezeProduction(leader);
  leader.cities.find((entry) => entry.id === 'westford').owner = 0;
  leader.cities.find((entry) => entry.owner === 1).troops = 99;
  tick(leader, 180);
  assert.equal(
    leader.result.outcome,
    'victory',
    'more territory wins even against a larger remaining army',
  );
  assert.equal(leader.result.stars, 1);
});

test('tied AI leaders do not award a draw to a player who trails them', () => {
  for (const playerTroops of [5, 20]) {
    const state = createMatch({ levelId: 'four-kingdoms', seed: 1, aiEnabled: false });
    freezeProduction(state);
    for (const city of state.cities) {
      if (city.owner === 0) city.troops = playerTroops;
      else if (city.owner !== null) city.troops = city.owner === 3 ? 5 : 20;
    }
    tick(state, 180);
    assert.equal(state.result.reason, 'timeout');
    assert.equal(state.result.winnerId, null);
    assert.equal(state.result.outcome, playerTroops === 20 ? 'draw' : 'defeat');
    assert.equal(state.result.stars, 0);
  }
});

test('finite ticks are required and sub-step time does not prematurely advance rules', () => {
  const state = fresh();
  assert.throws(() => tick(state, NaN), /duration/);
  assert.throws(() => tick(state, -1), /duration/);
  assert.throws(() => tick(state, Infinity), /duration/);
  tick(state, 0.04);
  assert.equal(state.time, 0);
  tick(state, 0.06);
  assert.equal(state.time, 0.1);
});

test('all campaigns finish with valid bounded state and each is winnable by route decisions', () => {
  for (const level of LEVELS) {
    let wins = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const state = createMatch({ levelId: level.id, seed });
      // The pilot uses exactly the same junction controls and unit rules as a human.
      state.ai.push({ factionId: 0, style: 'aggressive', nextDecision: 0 });
      tick(state, 180);
      assert.equal(state.status, 'finished');
      assert.ok(state.time <= 180);
      assert.ok(
        state.cities.every(
          (entry) =>
            Number.isInteger(entry.troops) && entry.troops >= 0 && entry.troops <= entry.capacity,
        ),
      );
      assert.ok(
        state.packets.every((entry) => entry.troops > 0 && entry.troops <= RULES.packetSize),
      );
      assert.ok(
        state.junctions.every(
          (entry) => entry.owner === state.cities.find((city) => city.id === entry.cityId).owner,
        ),
      );
      assert.equal(getScore(state).length, level.factions.length);
      if (state.result.outcome === 'victory') wins++;
    }
    assert.ok(
      wins > 0,
      `${level.id} should be winnable without changing combat or production stats`,
    );
  }
});

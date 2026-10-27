import test from 'node:test';
import assert from 'node:assert/strict';
import { createDuel, advanceDuel, commandDuel, viewDuel } from '../assets/scripts/core/Duel.ts';
test('duel has equal forces and ammunition, reproducible maps and player-relative views', () => {
  const state = createDuel(41), second = createDuel(41);
  assert.deepEqual(state, second);
  for (const kind of ['light', 'turret', 'heavy']) for (const side of [0, 1])
    assert.equal(state.simulation.units.filter(unit => unit.group === side && unit.kind === kind).length, kind === 'light' ? 4 : 2);
  assert.deepEqual(state.pilots[0].guns, state.pilots[1].guns);
  assert.equal(viewDuel(state, 1).simulation.units.filter(unit => unit.friendly).length, 8);
  assert.notDeepEqual(createDuel(42).simulation.units, state.simulation.units);
  advanceDuel(state, 1000); advanceDuel(second, 500); advanceDuel(second, 1000);
  assert.deepEqual(state, second);
});
test('server commands reject untrusted scores, ammo, targets and seats; firing leases expire', () => {
  const state = createDuel(12);
  for (const command of [{ command: 'grantAmmoSupply', args: [] }, { command: 'choose', args: [4] }, { command: 'setAim', args: [{ x: Infinity, z: 0 }] }])
    assert.throws(() => commandDuel(state, 0, [command]));
  assert.throws(() => commandDuel(state, 2, []));
  commandDuel(state, 0, [{ command: 'choose', args: [0] }, { command: 'setFire', args: ['mouse', true] }]);
  advanceDuel(state, 1500); assert.deepEqual(state.pilots[0].held, []);
  assert.throws(() => commandDuel(createDuel(4, true), 1, []));
});
test('eliminating the opposing ground team decides victory; timeout is a draw', () => {
  const state = createDuel(4);
  state.simulation.units.filter(unit => unit.group === 1).forEach(unit => unit.hp = 0);
  advanceDuel(state, 100); assert.equal(state.winner, 0); assert(state.finished);
  assert.equal(viewDuel(state, 0).simulation.phase, 'success');
  assert.equal(viewDuel(state, 1).simulation.phase, 'failure');
});

test('rejected command batches and views cannot mutate the authoritative state', () => {
  const state = createDuel(17), before = structuredClone(state);
  assert.throws(() => commandDuel(state, 0, [{ command: 'fire', args: [] }, { command: 'grantAmmoSupply', args: [] }]));
  assert.deepEqual(state, before);
  viewDuel(state, 1); assert.deepEqual(state, before);
});

test('outside-map aiming is valid input but cannot shoot, and fire sources release independently', () => {
  const state = createDuel(17);
  commandDuel(state, 0, [{ command: 'setAim', args: [{ x: 800, z: 800 }] }, { command: 'fire', args: [] }]);
  assert.equal(viewDuel(state).simulation.fired, 0);
  commandDuel(state, 0, [{ command: 'setFire', args: ['mouse', true] }, { command: 'setFire', args: ['space', true] }, { command: 'setFire', args: ['mouse', false] }]);
  assert.deepEqual(state.pilots[0].held, ['space']);
  commandDuel(state, 0, [{ command: 'clearInput', args: [] }]); assert.deepEqual(state.pilots[0].held, []);
});

test('ground attack colors and sounds use the observing player side', () => {
  const state = createDuel(17);
  for (const unit of state.simulation.units) { unit.attack = 0; unit.born = -100; }
  Object.assign(state.simulation.units[4], { x: -80, z: -50 });
  Object.assign(state.simulation.units[12], { x: -75, z: -50 });
  advanceDuel(state, 10000);
  const first = viewDuel(state, 0).simulation.events.filter(event => event.type === 'attack');
  const second = viewDuel(state, 1).simulation.events.filter(event => event.type === 'attack');
  assert(first.length > 0); assert.equal(first.length, second.length);
  first.forEach((event, i) => { assert.equal(event.side, second[i].side); assert.equal(event.friendly, !second[i].friendly); });
});
test('both maps complete a bot match through real firing, and an untouched match reaches a draw', () => {
  for (const seed of [41, 42]) {
    const state = createDuel(seed, true); advanceDuel(state, 180000);
    assert(state.finished); assert.equal(state.winner, 1); assert(state.ticks < 10800);
    const bot = viewDuel(state, 1).simulation, player = viewDuel(state, 0).simulation;
    assert(bot.fired > 0); assert(bot.hits > 0); assert.equal(bot.friendlyDamage, 0);
    assert.equal(player.fired, 0); assert.equal(player.friendlyDamage, 0);
    assert(bot.units.filter(u => !u.friendly).every(u => u.hp === 0));
  }
  const state = createDuel(41);
  state.simulation.units.forEach(unit => unit.attack = 10000);
  advanceDuel(state, 180000); assert(state.finished); assert.equal(state.winner, null); assert.equal(state.ticks, 10800);
});

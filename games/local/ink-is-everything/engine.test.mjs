import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createGame, getIntent, getOptions, getRoom } from './engine.mjs';
import { LEVELS } from './levels.mjs';

function run(state, type, target) {
  const result = act(state, { type, ...(target ? { target } : {}) });
  assert.equal(result.ok, true, `${type} ${target ?? ''}: ${result.message}`);
  return result.state;
}

function travel(state, id, method = 'draw') {
  return run(state, getRoom(state, id).revealed ? 'move' : method, id);
}

function fight(state, strategy = 'balanced') {
  let budget = 100;
  while (state.status === 'playing' && getRoom(state).enemy?.hp > 0) {
    assert.ok(budget-- > 0, 'Every fight must make finite progress.');
    const enemy = getRoom(state).enemy;
    const attack = getOptions(state).find((option) => option.type === 'attack');
    const damage = state.contracts.includes('fine-nib') ? 6 : 4;
    let type = 'dry';
    if (strategy !== 'dry' && attack.enabled && (enemy.hp > 1 + state.focus || enemy.hp <= damage))
      type = 'attack';
    if (
      getIntent(state).damage > 0 &&
      (type === 'dry' ? enemy.hp > 1 + state.focus : enemy.hp > damage)
    )
      type = 'guard';
    state = run(state, type);
  }
  assert.notEqual(state.status, 'lost', 'Readable intentions should support a no-damage strategy.');
  return state;
}

function directClear(initial, method, strategy) {
  let state = initial;
  state = travel(state, 'crossing', method);
  state = travel(state, 'sentinel', method);
  state = fight(state, strategy);
  state = run(state, 'claim');
  state = travel(state, 'causeway', method);
  state = travel(state, 'warden', method);
  state = fight(state, strategy);
  state = run(state, 'claim');
  state = travel(state, 'threshold', method);
  state = run(state, 'unlock');
  state = travel(state, 'gate', method);
  return fight(state, strategy);
}

test('a direct ink-first route finishes safely with two seals', () => {
  const state = directClear(createGame(), 'draw', 'balanced');
  assert.equal(state.status, 'won');
  assert.equal(state.seals, 2);
  assert.equal(state.hp, 5);
  assert.ok(state.stats.spent.attack > 0);
  assert.equal(state.stats.spent.explore, 36);
  assert.ok(state.ink >= 0);
  assert.equal(state.summary.explored, 7);
  assert.ok(state.turn < 45);
  assert.equal(state.summary.efficiency, '行云流水');
});

test('an exploration and trade route is independently viable', () => {
  let state = createGame();
  state = travel(state, 'crossing');
  state = travel(state, 'market');
  state = run(state, 'buy', 'fine-nib');
  state = run(state, 'buy', 'wayfinder');
  state = travel(state, 'reliquary');
  state = fight(state);
  state = run(state, 'claim');
  state = travel(state, 'market');
  state = travel(state, 'crossing');
  state = travel(state, 'archive');
  state = run(state, 'claim');
  state = travel(state, 'spring');
  state = travel(state, 'sentinel');
  state = fight(state);
  state = run(state, 'claim');
  state = travel(state, 'garden');
  state = run(state, 'claim');
  state = travel(state, 'warden');
  state = fight(state);
  state = run(state, 'claim');
  state = travel(state, 'causeway');
  state = travel(state, 'lookout');
  state = run(state, 'claim');
  state = travel(state, 'threshold');
  state = run(state, 'unlock');
  state = travel(state, 'gate');
  state = fight(state);
  assert.equal(state.status, 'won');
  assert.equal(state.stats.roomsRevealed, 13);
  assert.deepEqual(state.contracts, ['fine-nib', 'wayfinder']);
  assert.equal(state.stats.spent.trade, 22);
  assert.ok(state.ink > 0);
});

test('zero initial ink has a complete path despite nonlethal exploration scrapes', () => {
  const initial = createGame();
  initial.ink = 0;
  const state = directClear(initial, 'trace', 'dry');
  assert.equal(state.status, 'won');
  assert.equal(state.hp, 1);
  assert.equal(state.stats.damageTaken, 4, 'Only exploration scrapes cause damage.');
  assert.deepEqual(state.stats.spent, { explore: 0, attack: 0, heal: 0, trade: 0 });
  assert.equal(state.stats.tracedRooms, 6);
  assert.ok(state.stats.freeAttacks > 0);
  assert.ok(state.stats.guards > 0);
  assert.ok(state.turn < 75, 'The fallback must not require unbounded stalling.');
  assert.ok(
    state.turn > directClear(createGame(), 'draw', 'balanced').turn,
    'Spending ink offers visible turn efficiency.',
  );
  assert.equal(state.summary.efficiency, '从容有度');
});

test('zero ink and one starting life can still complete the entire chapter', () => {
  const initial = createGame();
  initial.ink = 0;
  initial.hp = 1;
  const state = directClear(initial, 'trace', 'dry');
  assert.equal(state.status, 'won');
  assert.equal(state.hp, 1);
  assert.equal(state.stats.damageTaken, 0);
  assert.equal(state.stats.spent.explore, 0);
  assert.equal(state.stats.spent.attack, 0);
});

test('tracing trades life and two turns for ink, while drawn and known paths avoid scrapes', () => {
  const initial = createGame();
  const traceOption = getOptions(initial).find((option) => option.type === 'trace');
  assert.match(traceOption.description, /2 回合/);
  assert.match(traceOption.description, /擦伤不会致死/);
  const drawn = travel(initial, 'crossing');
  assert.equal(drawn.hp, 5);
  assert.equal(drawn.turn, 1);
  assert.equal(drawn.ink, 66);
  let traced = travel(initial, 'crossing', 'trace');
  assert.equal(traced.hp, 4);
  assert.equal(traced.turn, 2);
  assert.equal(traced.ink, 72);
  assert.equal(traced.stats.damageTaken, 1);
  traced = travel(traced, 'arrival');
  assert.equal(traced.hp, 4);
  assert.equal(traced.turn, 3);
  traced = travel(traced, 'crossing');
  assert.equal(traced.hp, 4);
  assert.equal(traced.turn, 4);
  assert.equal(traced.stats.tracedRooms, 1);
  assert.equal(act(traced, { type: 'trace', target: 'arrival' }).ok, false);
  traced.hp = 1;
  traced = travel(traced, 'archive', 'trace');
  assert.equal(traced.hp, 1);
  assert.equal(traced.status, 'playing');
  assert.equal(traced.turn, 6);
  assert.equal(traced.stats.damageTaken, 1);
});

test('zero ink inside a boss fight still permits a complete victory', () => {
  let state = createGame();
  state.roomId = 'gate';
  state.rooms.gate.revealed = true;
  state.ink = 0;
  state.hp = 1;
  state = fight(state, 'dry');
  assert.equal(state.status, 'won');
  assert.equal(state.hp, 1);
});

test('ignoring intent can cause defeat, terminal actions are locked, and restart is clean', () => {
  let state = createGame();
  state = travel(state, 'crossing', 'trace');
  state = travel(state, 'sentinel', 'trace');
  while (state.status === 'playing') state = run(state, 'dry');
  assert.equal(state.status, 'lost');
  assert.equal(state.hp, 0);
  const snapshot = structuredClone(state);
  const rejected = act(state, { type: 'heal' });
  assert.equal(rejected.ok, false);
  assert.deepEqual(state, snapshot);
  assert.strictEqual(rejected.state, state);
  const restarted = run(state, 'restart');
  assert.deepEqual(restarted, createGame());
});

test('insufficient ink and invalid destinations are rejected without mutation', () => {
  let state = createGame();
  state.ink = 5;
  const snapshot = structuredClone(state);
  const draw = act(state, { type: 'draw', target: 'crossing' });
  assert.equal(draw.ok, false);
  assert.match(draw.message, /墨水不足/);
  assert.strictEqual(draw.state, state);
  assert.deepEqual(state, snapshot);
  assert.equal(act(state, { type: 'trace', target: 'gate' }).ok, false);
  state = travel(state, 'crossing', 'trace');
  state = travel(state, 'sentinel', 'trace');
  state.ink = 4;
  assert.equal(act(state, { type: 'attack' }).ok, false);
  assert.equal(
    act(state, { type: 'move', target: 'crossing' }).ok,
    false,
    'Cannot escape an active encounter.',
  );
  state.hp = 4;
  assert.equal(act(state, { type: 'heal' }).ok, false);
});

test('all mutations are isolated from earlier snapshots and chapter configuration', () => {
  const initial = createGame();
  const initialSnapshot = structuredClone(initial);
  const configSnapshot = structuredClone(LEVELS);
  let state = travel(initial, 'crossing', 'trace');
  state = travel(state, 'sentinel', 'trace');
  state = run(state, 'dry');
  assert.deepEqual(initial, initialSnapshot);
  assert.deepEqual(LEVELS, configSnapshot);
  assert.equal(getRoom(state).enemy.maxHp, 9);
  assert.equal(createGame().rooms.sentinel.enemy.maxHp, 7);
});

test('rewards and contracts cannot be purchased or collected twice', () => {
  let state = travel(createGame(), 'crossing');
  state = travel(state, 'archive');
  state = run(state, 'claim');
  const afterClaim = state.ink;
  assert.equal(act(state, { type: 'claim' }).ok, false);
  state = travel(state, 'crossing');
  state = travel(state, 'archive');
  assert.equal(state.ink, afterClaim);
  assert.equal(act(state, { type: 'claim' }).ok, false);
  state = travel(state, 'crossing');
  state = travel(state, 'market');
  state = run(state, 'buy', 'fine-nib');
  const bought = structuredClone(state);
  assert.equal(act(state, { type: 'buy', target: 'fine-nib' }).ok, false);
  assert.deepEqual(state, bought);
  state = run(state, 'buy', 'binding');
  assert.equal(state.maxHp, 6);
  assert.equal(state.hp, 6);
  state.hp = 2;
  state = run(state, 'heal');
  assert.equal(state.hp, 5, 'Binding increases subsequent heal amount to three.');
});

test('the gate requires both claimed seals and explicit unlock', () => {
  let state = createGame();
  for (const id of ['crossing', 'market', 'causeway', 'lookout', 'threshold'])
    state = travel(state, id, 'trace');
  assert.equal(act(state, { type: 'unlock' }).ok, false);
  assert.equal(act(state, { type: 'trace', target: 'gate' }).ok, false);
  state.seals = 1;
  assert.equal(act(state, { type: 'unlock' }).ok, false);
  state.seals = 2;
  assert.equal(act(state, { type: 'trace', target: 'gate' }).ok, false);
  state = run(state, 'unlock');
  assert.equal(state.seals, 2);
  state = travel(state, 'gate', 'trace');
  assert.equal(state.roomId, 'gate');
});

test('winning locks movement, purchases and loot, while restart remains available', () => {
  const state = directClear(createGame(), 'draw', 'balanced');
  for (const action of [
    { type: 'attack' },
    { type: 'claim' },
    { type: 'buy', target: 'binding' },
    { type: 'move', target: 'threshold' },
  ]) {
    const result = act(state, action);
    assert.equal(result.ok, false);
    assert.strictEqual(result.state, state);
  }
  assert.deepEqual(
    getOptions(state).map((option) => option.type),
    ['restart'],
  );
  assert.deepEqual(run(state, 'restart'), createGame());
});

test('healing advances enemy intent and defense only grants focus on a real attack', () => {
  let state = travel(travel(createGame(), 'crossing'), 'sentinel');
  assert.equal(
    state.rooms.sentinel.enemy.intentIndex,
    0,
    'Entering combat gives time to read the first intent.',
  );
  state = run(state, 'guard');
  assert.equal(state.focus, 0);
  state = run(state, 'guard');
  assert.equal(state.focus, 2);
  assert.equal(state.hp, 5);
  const before = getRoom(state).enemy.hp;
  state = run(state, 'dry');
  assert.equal(getRoom(state).enemy.hp, before - 3);
  assert.equal(state.focus, 0);
  state.hp = 2;
  const turnBefore = getRoom(state).enemy.intentIndex;
  state = run(state, 'heal');
  assert.equal(state.hp, 4);
  assert.equal(getRoom(state).enemy.intentIndex, turnBefore + 1);
  state = run(state, 'heal');
  assert.equal(state.hp, 3, 'Healing into a telegraphed attack still takes enemy damage.');
});

test('full fountains can be saved and rewards respect resource caps', () => {
  let state = createGame();
  for (const id of ['crossing', 'archive', 'spring']) state = travel(state, id);
  assert.equal(act(state, { type: 'claim' }).ok, false);
  assert.equal(getRoom(state).claimed, false);
  state.hp = 4;
  state = run(state, 'claim');
  assert.equal(state.hp, 5);
  assert.equal(getRoom(state).claimed, true);
  state = travel(state, 'archive');
  state.ink = 98;
  state = run(state, 'claim');
  assert.equal(state.ink, 100);
  assert.equal(state.stats.inkRecovered, 2);
});

test('chapter links are symmetric and every room is reachable', () => {
  const level = LEVELS['chapter-1'];
  const visited = new Set([level.start]);
  const queue = [level.start];
  while (queue.length) {
    const roomId = queue.shift();
    const room = level.rooms.find((candidate) => candidate.id === roomId);
    for (const id of room.exits) {
      const next = level.rooms.find((candidate) => candidate.id === id);
      assert.ok(next.exits.includes(room.id));
      if (!visited.has(id)) {
        visited.add(id);
        queue.push(id);
      }
    }
  }
  assert.equal(visited.size, level.rooms.length);
  assert.throws(() => createGame('missing'), /未知章节/);
});

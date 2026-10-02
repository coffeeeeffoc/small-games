import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPACITY,
  SCALE,
  createState,
  getObjectives,
  isGateLocked,
  previewGate,
  solve,
  toggleGate,
} from '../engine.mjs';
import { LEVELS } from '../levels.mjs';

const total = (state) => state.volumes.reduce((sum, value) => sum + Math.round(value * SCALE), 0);
const simpleLevel = () => ({
  id: 'test',
  maxMoves: 100,
  par: 2,
  tanks: [
    { id: 'A', kind: 'reservoir', volume: 10 },
    { id: 'B', kind: 'reservoir', volume: 0 },
    { id: 'C', kind: 'boat', volume: 0, exitAt: 10 },
  ],
  gates: [
    { id: 'AB', a: 'A', b: 'B' },
    { id: 'BC', a: 'B', b: 'C' },
  ],
});
const freeze = (value) => {
  Object.freeze(value);
  for (const entry of Object.values(value))
    if (entry && typeof entry === 'object' && !Object.isFrozen(entry)) freeze(entry);
  return value;
};

for (const level of LEVELS) {
  test(level.title + ': closed start has a shortest solution at par', () => {
    let state = createState(level);
    assert.equal(state.won, false);
    assert.ok(
      getObjectives(level, state).every((objective) => !objective.done),
      'Every authored objective must require player action.',
    );
    assert.equal(
      state.gates.every((gate) => !gate),
      true,
    );
    const initialTotal = total(state);
    const path = solve(level, state);
    assert.ok(path, 'A solution must exist.');
    assert.equal(path.length, level.par);
    assert.deepEqual(
      path,
      level.solution,
      'Published walkthroughs must match the shortest solver path.',
    );
    let closes = 0;
    for (const gateId of path) {
      assert.equal(
        solve(level, state)?.length,
        level.par - state.moves,
        'Hints must find the shortest remaining solution at each step.',
      );
      const index = level.gates.findIndex((gate) => gate.id === gateId);
      if (state.gates[index]) closes++;
      state = toggleGate(level, state, gateId);
      assert.equal(
        total(state),
        initialTotal,
        'Integer water volume must be conserved at every step.',
      );
      assert.ok(state.volumes.every((volume) => volume >= 0 && volume <= CAPACITY));
    }
    assert.equal(state.won, true);
    assert.equal(state.lost, false);
    assert.ok(getObjectives(level, state).every((objective) => objective.done));
    assert.deepEqual(solve(level, state), []);
    if (level.requiresIsolation) assert.ok(closes > 0, 'Advanced solutions must isolate a tank.');
  });
}

test('campaign has fifty distinct stations in five ten-level chapters', () => {
  assert.equal(LEVELS.length, 50);
  assert.equal(new Set(LEVELS.map((level) => level.id)).size, 50);
  assert.equal(new Set(LEVELS.map((level) => level.title)).size, 50);
  const chapters = Map.groupBy(LEVELS, (level) => level.chapter);
  assert.equal(chapters.size, 5);
  for (const chapter of chapters.values()) assert.equal(chapter.length, 10);
  for (const level of LEVELS) {
    assert.ok(level.design && level.intro);
    assert.ok(level.maxMoves >= level.par + 1 && level.maxMoves <= level.par + 2);
    for (const tank of level.tanks) {
      assert.ok(['crate', 'boat', 'wheel', 'reservoir'].includes(tank.kind));
      if (tank.kind === 'crate') assert.ok(tank.switchAt >= 0 && tank.switchAt < tank.volume);
      if (tank.kind === 'boat') assert.ok(tank.exitAt > tank.volume && tank.exitAt <= CAPACITY);
    }
    for (const outlet of level.overflow ?? [])
      assert.ok(outlet.powerNeeded > 0, 'Each outlet contributes to the shared wheel objective.');
  }
  assert.equal(LEVELS.at(-1).par, 9);
  assert.ok(LEVELS.filter((level) => level.par >= 6).length >= 18);
  assert.ok(LEVELS.filter((level) => (level.overflow?.length ?? 0) > 1).length >= 4);
  assert.ok(
    LEVELS.filter((level) =>
      level.gates.some((gate) => Array.isArray(gate.requires) && gate.requires.length > 1),
    ).length >= 6,
  );
});

test('integer remainders conserve water across repeated unequal divisions', () => {
  const level = simpleLevel();
  let state = createState(level);
  state = toggleGate(level, state, 'AB');
  state = toggleGate(level, state, 'BC');
  assert.deepEqual(state.volumes, [3.334, 3.333, 3.333]);
  for (let step = 0; step < 70; step++) {
    state = toggleGate(level, state, step % 3 === 0 ? 'AB' : 'BC');
    assert.equal(total(state), 10000);
    for (let index = 0; index < level.gates.length; index++) {
      if (!state.gates[index]) continue;
      const gate = level.gates[index];
      const left = state.volumes[level.tanks.findIndex((tank) => tank.id === gate.a)];
      const right = state.volumes[level.tanks.findIndex((tank) => tank.id === gate.b)];
      assert.ok(Math.abs(Math.round(left * SCALE) - Math.round(right * SCALE)) <= 1);
    }
  }
});

test('closing a gate preserves isolation while the other component rises', () => {
  const level = LEVELS[3];
  let state = createState(level);
  for (const gate of ['AB', 'AB', 'BC']) state = toggleGate(level, state, gate);
  assert.deepEqual(state.volumes, [4, 7, 7]);
  assert.deepEqual(state.gates, [false, true]);
});

test('a single gate can change three rooms at the same time', () => {
  const level = LEVELS[1];
  const before = toggleGate(level, createState(level), 'AB');
  const after = toggleGate(level, before, 'BC');
  assert.deepEqual(before.volumes, [5, 5, 2]);
  assert.deepEqual(after.volumes, [4, 4, 4]);
  assert.deepEqual(after.events.find((event) => event.type === 'equalize').tanks, ['A', 'B', 'C']);
});

test('locked and unknown valves do not spend moves or change volumes', () => {
  const level = LEVELS[1];
  const state = createState(level);
  assert.equal(isGateLocked(level, state, 'BC'), true);
  const locked = toggleGate(level, state, 'BC');
  assert.equal(locked.moves, 0);
  assert.deepEqual(locked.volumes, state.volumes);
  assert.equal(locked.events[0].type, 'locked');
  const opened = toggleGate(level, state, 'AB');
  assert.equal(isGateLocked(level, opened, 'BC'), false);
  const unknown = toggleGate(level, state, 'missing');
  assert.equal(unknown.moves, 0);
  assert.deepEqual(unknown.gates, state.gates);
});

test('a double-switch lock remains closed until both independent crates have latched', () => {
  const level = LEVELS.find((entry) => entry.id === 'path-double-middle');
  let state = toggleGate(level, createState(level), 'AB');
  assert.deepEqual(state.latched, ['A']);
  assert.equal(isGateLocked(level, state, 'DE'), true);
  const blocked = toggleGate(level, state, 'DE');
  assert.equal(blocked.moves, state.moves);
  assert.deepEqual(blocked.volumes, state.volumes);
  for (const gate of ['BC', 'BC', 'CD']) state = toggleGate(level, state, gate);
  assert.deepEqual(state.latched, ['A', 'C']);
  assert.equal(isGateLocked(level, state, 'DE'), false);
});

test('two authored overflow outlets form a finite cascade during one operation', () => {
  const level = LEVELS.find((entry) => entry.id === 'cascade-reserve');
  const initial = createState(level);
  const state = toggleGate(level, initial, 'AB');
  assert.deepEqual(state.volumes, [2.5, 2.5, 4, 1, 10]);
  assert.equal(total(state), total(initial));
  assert.deepEqual(
    state.events
      .filter((event) => event.type === 'overflow')
      .map(({ from, to, amount }) => ({ from, to, amount })),
    [
      { from: 'B', to: 'C', amount: 5 },
      { from: 'C', to: 'D', amount: 1 },
    ],
  );
  assert.equal(state.wheelPower, 6);
  assert.equal(
    state.won,
    false,
    'Completed wheel power cannot substitute for reaching the boat exit.',
  );
});

test('switches latch permanently even when the crate rises later', () => {
  const level = LEVELS[3];
  let state = toggleGate(level, createState(level), 'AB');
  state = toggleGate(level, state, 'BC');
  assert.equal(state.volumes[0], 6);
  assert.deepEqual(state.latched, ['A']);
  assert.equal(
    getObjectives(level, state).find((objective) => objective.id === 'switch-A').done,
    true,
  );
  assert.equal(state.won, false);
});

test('one spill conserves volume and triggers crate, wheel and boat together', () => {
  const level = LEVELS[2];
  const initial = createState(level);
  const state = toggleGate(level, initial, 'AB');
  assert.deepEqual(state.volumes, [4, 4, 3]);
  assert.equal(state.wheelPower, 2);
  assert.deepEqual(state.latched, ['A']);
  assert.equal(total(state), total(initial));
  assert.equal(state.won, true);
  for (const type of ['overflow', 'switch', 'win'])
    assert.ok(state.events.some((event) => event.type === type));
});

test('a connected downstream tank disables the overflow drop', () => {
  const level = LEVELS[2];
  let state = toggleGate(level, createState(level), 'BC');
  state = toggleGate(level, state, 'AB');
  assert.equal(state.wheelPower, 0);
  assert.equal(state.won, false);
  assert.equal(total(state), 11000);
});

test('a full downstream tank retains excess upstream without deleting water', () => {
  const level = simpleLevel();
  level.tanks[2].volume = 9;
  level.overflow = [{ from: 'B', to: 'C', at: 4, powerNeeded: 2 }];
  const state = toggleGate(level, createState(level), 'AB');
  assert.deepEqual(state.volumes, [4.5, 4.5, 10]);
  assert.equal(state.wheelPower, 1);
  assert.equal(total(state), 19000);
  assert.equal(state.won, false, 'The boat alone is insufficient without wheel power.');
});

test('cyclic custom outlets terminate after one finite authored spill pass', () => {
  const level = simpleLevel();
  level.tanks[0].volume = 8;
  level.overflow = [
    { from: 'A', to: 'B', at: 1, powerNeeded: 100 },
    { from: 'B', to: 'A', at: 1 },
  ];
  const initial = createState(level);
  const state = toggleGate(level, initial, 'BC');
  assert.equal(total(initial), 8000);
  assert.equal(total(state), 8000);
  assert.ok(state.events.filter((event) => event.type === 'overflow').length <= 2);
  assert.ok(state.volumes.every((volume) => volume >= 0 && volume <= CAPACITY));
});

test('preview and solver are pure, including when input objects are frozen', () => {
  const level = freeze(structuredClone(LEVELS[7]));
  const state = freeze(createState(level));
  const snapshot = JSON.stringify(state);
  const preview = previewGate(level, state, 'AB');
  assert.deepEqual(preview, toggleGate(level, state, 'AB'));
  assert.equal(JSON.stringify(state), snapshot);
  assert.notEqual(preview.volumes, state.volumes);
  assert.equal(solve(level, state).length, level.par);
  assert.equal(JSON.stringify(state), snapshot);
});

test('loss blocks operations and an extra move allows a final-turn win', () => {
  const level = { ...LEVELS[3], maxMoves: 2 };
  let state = createState(level);
  assert.equal(solve(level, state), null);
  state = toggleGate(level, state, 'AB');
  state = toggleGate(level, state, 'AB');
  assert.equal(state.lost, true);
  assert.equal(toggleGate(level, state, 'BC').moves, 2);
  assert.equal(solve(level, state), null);
  const bonus = { ...state, bonusMoves: 1, lost: false };
  assert.deepEqual(solve(level, bonus), ['BC']);
  const won = toggleGate(level, bonus, 'BC');
  assert.equal(won.moves, 3);
  assert.equal(won.won, true);
  assert.equal(won.lost, false);
  assert.equal(toggleGate(level, won, 'AB').moves, 3);
});

test('stations authored around isolation cannot be won by only opening gates', () => {
  for (const level of LEVELS.filter((level) => level.requiresIsolation)) {
    const explore = (state) => {
      assert.equal(state.won, false, 'A closing operation is required in ' + level.title);
      level.gates.forEach((gate, index) => {
        if (!state.gates[index] && !isGateLocked(level, state, gate))
          explore(toggleGate(level, state, gate.id));
      });
    };
    explore(createState(level));
  }
});

test('invalid level layouts fail before play begins', () => {
  const level = simpleLevel();
  level.tanks[0].volume = 11;
  assert.throws(() => createState(level), /capacity/);
  level.tanks[0].volume = 10;
  level.gates[0].b = 'Z';
  assert.throws(() => createState(level), /Invalid gate/);
});

test('every reachable authored state conserves volume, with a bounded hint search space', () => {
  for (const level of LEVELS) {
    // Include the optional rewarded move, so mistakes and IAA retries are covered too.
    const initial = { ...createState(level), bonusMoves: 1 };
    const conserved = total(initial);
    const wheelTarget = (level.overflow ?? []).reduce((sum, outlet) => sum + outlet.powerNeeded, 0);
    const queue = [initial];
    const seen = new Set();
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const state = queue[cursor];
      if (state.won || state.lost) continue;
      for (const gate of level.gates) {
        const next = toggleGate(level, state, gate.id);
        if (next.moves === state.moves) continue;
        assert.equal(total(next), conserved, level.id + ' lost water');
        assert.ok(next.volumes.every((volume) => volume >= 0 && volume <= CAPACITY));
        const identity = JSON.stringify([
          next.volumes,
          next.gates,
          [...next.latched].sort(),
          Math.min(next.wheelPower, wheelTarget),
        ]);
        if (!seen.has(identity)) {
          seen.add(identity);
          queue.push(next);
        }
      }
    }
    // BFS reaches each physical state at its earliest move. Revisiting it later only
    // shrinks the remaining budget, so it cannot add a new reachable transition.
    assert.ok(seen.size < 12000, `${level.id}: keep arbitrary-state hints inexpensive`);
  }
});

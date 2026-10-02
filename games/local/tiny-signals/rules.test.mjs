import test from 'node:test';
import assert from 'node:assert/strict';
import { DIRECTIONS, createState, step, stateKey, solve, validateLevel } from './rules.mjs';

const config = (overrides = {}) => ({ size: 3, start: 3, home: 8, walls: [], ...overrides });
const solo = (board) => ({
  id: 'test',
  name: 'Rules fixture',
  boards: [board, ...Array.from({ length: 3 }, () => config({ start: 0, home: 0 }))],
});
const advance = (level, inputs, state = createState(level)) =>
  inputs.reduce((current, direction) => step(level, current, direction), state);
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

test('one input can move, block, turn, and leave a completed board frozen', () => {
  const level = {
    boards: [
      config({ start: 4, home: 5 }),
      config({ start: 4, walls: [5] }),
      config({ start: 1 }),
      config({ start: 0, home: 0 }),
    ],
  };
  const state = createState(level);
  state.boards[2].charged = true;
  const next = step(level, freeze(state), 'right');
  assert.deepEqual(
    next.boards.map((board) => board.pos),
    [5, 4, 4, 0],
  );
  assert.deepEqual(
    next.boards.map((board) => board.done),
    [true, false, false, true],
  );
  assert.equal(next.boards[3], state.boards[3]);
  assert.equal(next.boards[2].charged, false);
  assert.equal(next.turn, 1);
  assert.equal(next.status, 'playing');
});

test('edges never wrap around and walls/voids block all ordinary movement', () => {
  for (const board of [
    config({ start: 2 }),
    config({ start: 3, walls: [4] }),
    config({ start: 3, voids: [4] }),
  ]) {
    const level = solo(board);
    const next = step(level, createState(level), 'right');
    assert.equal(next.boards[0].pos, board.start);
    assert.equal(next.turn, 1);
  }
});

test('single-direction edges permit forward passage and forbid reverse passage', () => {
  const forward = solo(config({ start: 4, oneWays: [{ from: 4, to: 5 }] }));
  assert.equal(step(forward, createState(forward), 'right').boards[0].pos, 5);
  const reverse = solo(config({ start: 5, oneWays: [{ from: 4, to: 5 }] }));
  assert.equal(step(reverse, createState(reverse), 'left').boards[0].pos, 5);
});

test('compass charges on entering, rotates the next input, and is consumed by a blocked move', () => {
  const level = solo(config({ compasses: [4], walls: [5] }));
  const entered = step(level, createState(level), 'right');
  assert.equal(entered.boards[0].charged, true);
  const blocked = step(level, entered, 'up');
  assert.equal(blocked.boards[0].pos, 4);
  assert.equal(blocked.boards[0].charged, false);
  assert.equal(step(level, blocked, 'down').boards[0].pos, 7);
  assert.equal(createState(solo(config({ start: 4, compasses: [4] }))).boards[0].charged, false);
});

test('a box replaced by the messenger keeps a bridge supported until the messenger leaves', () => {
  const level = solo(config({ boxes: [4], bridges: [4, 5] }));
  const pushed = step(level, createState(level), 'right');
  assert.equal(pushed.boards[0].pos, 4);
  assert.deepEqual(pushed.boards[0].boxes, [5]);
  assert.deepEqual(pushed.boards[0].collapsed, []);
  const left = step(level, pushed, 'down');
  assert.deepEqual(left.boards[0].collapsed, [4]);
  assert.equal(step(level, left, 'up').boards[0].pos, 7);
});

test('bridge collapse is resolved between the main movement and wind movement', () => {
  const level = solo(config({ start: 4, bridges: [4], winds: [{ cell: 5, dir: 'left' }] }));
  const next = step(level, createState(level), 'right');
  assert.equal(next.boards[0].pos, 5, 'wind cannot return to the just-collapsed bridge');
  assert.deepEqual(next.boards[0].collapsed, [4]);
});

test('wind moves at most once per turn and rotates every nonfrozen wind', () => {
  const level = solo(
    config({
      winds: [
        { cell: 4, dir: 'right' },
        { cell: 5, dir: 'down' },
      ],
    }),
  );
  const next = step(level, createState(level), 'right');
  assert.equal(next.boards[0].pos, 5);
  assert.deepEqual(next.boards[0].windDirs, ['down', 'left']);
});

test('wind events preserve the intermediate square instead of a diagonal animation shortcut', () => {
  const level = solo(config({ winds: [{ cell: 4, dir: 'up' }] }));
  const initial = createState(level);
  assert.deepEqual(initial.events, []);
  const next = step(level, initial, 'right');
  assert.equal(next.boards[0].pos, 1);
  assert.deepEqual(next.events, [
    { board: 0, kind: 'move', from: 3, to: 4 },
    { board: 0, kind: 'wind', from: 4, to: 1 },
  ]);
  assert.deepEqual(initial.events, [], 'recording transitions never changes the undo snapshot');
});

test('blocked movement emits no movement event; push and echo events report their own trajectories', () => {
  const blocked = solo(config({ start: 0, walls: [1], winds: [{ cell: 0, dir: 'up' }] }));
  assert.deepEqual(step(blocked, createState(blocked), 'right').events, []);
  const pushing = solo(config({ boxes: [4], echo: { start: 0 } }));
  const state = createState(pushing);
  state.previousInput = 'right';
  assert.deepEqual(step(pushing, state, 'right').events, [
    { board: 0, kind: 'push', from: 4, to: 5 },
    { board: 0, kind: 'move', from: 3, to: 4 },
    { board: 0, kind: 'echo', from: 0, to: 1 },
  ]);
});

test('wind cannot push boxes, but a blocked main movement still activates wind', () => {
  const level = solo(
    config({ size: 4, start: 4, home: 15, boxes: [6], winds: [{ cell: 5, dir: 'right' }] }),
  );
  const next = step(level, createState(level), 'right');
  assert.equal(next.boards[0].pos, 5);
  assert.deepEqual(next.boards[0].boxes, [6]);
  const waiting = solo(config({ start: 0, walls: [1], winds: [{ cell: 0, dir: 'down' }] }));
  assert.equal(step(waiting, createState(waiting), 'right').boards[0].pos, 3);
});

test('all-blocked turns still rotate wind and advance the previous input', () => {
  const level = solo(config({ start: 0, walls: [1], winds: [{ cell: 2, dir: 'up' }] }));
  const next = step(level, createState(level), 'right');
  assert.equal(next.boards[0].pos, 0);
  assert.deepEqual(next.boards[0].windDirs, ['right']);
  assert.equal(next.previousInput, 'right');
  assert.equal(next.turn, 1);
});

test('home arrival freezes the board immediately, before echo, gate, or wind phases', () => {
  const level = solo(config({ home: 5, winds: [{ cell: 4, dir: 'right' }], echo: { start: 0 } }));
  const initial = createState(level);
  initial.previousInput = 'down';
  const next = step(level, initial, 'right');
  assert.equal(next.status, 'won');
  assert.equal(next.turn, 1);
  assert.equal(next.boards[0].pos, 5);
  assert.equal(next.boards[0].echo, 0);
  assert.deepEqual(next.boards[0].windDirs, ['right']);
  assert.equal(step(level, next, 'left'), next);
});

test('boxes cannot be pushed in chains, into home, into echoes, or through reversed edges', () => {
  const cases = [
    config({ boxes: [4, 5] }),
    config({ boxes: [4], home: 5 }),
    config({ boxes: [4], echo: { start: 5 } }),
    config({ boxes: [4], oneWays: [{ from: 5, to: 4 }] }),
  ];
  for (const board of cases) {
    const level = solo(board);
    const initial = createState(level);
    const next = step(level, initial, 'right');
    assert.equal(next.boards[0].pos, 3);
    assert.deepEqual(next.boards[0].boxes, initial.boards[0].boxes);
  }
});

test('new pressure opens gates only after wind, using the gates frozen at turn start', () => {
  const level = solo(
    config({
      size: 4,
      start: 9,
      home: 15,
      boxes: [5],
      winds: [{ cell: 5, dir: 'right' }],
      shutters: [{ cell: 6, plate: 1 }],
    }),
  );
  const initial = createState(level);
  assert.deepEqual(initial.boards[0].gateOpen, [false]);
  const next = step(level, initial, 'up');
  assert.deepEqual(next.boards[0].boxes, [1]);
  assert.equal(next.boards[0].pos, 5);
  assert.deepEqual(next.boards[0].gateOpen, [true]);
  assert.equal(step(level, next, 'right').boards[0].pos, 6);
});

test('a gate stays open for an occupying messenger and closes after departure', () => {
  const level = solo(config({ size: 4, start: 4, home: 15, shutters: [{ cell: 5, plate: 4 }] }));
  const initial = createState(level);
  assert.deepEqual(initial.boards[0].gateOpen, [true]);
  const inGate = step(level, initial, 'right');
  assert.equal(inGate.boards[0].pos, 5);
  assert.deepEqual(inGate.boards[0].gateOpen, [true]);
  assert.deepEqual(step(level, inGate, 'down').boards[0].gateOpen, [false]);
});

test('boxes and echoes hold gates open, but echoes do not press plates', () => {
  const boxLevel = solo(
    config({ size: 4, start: 0, home: 15, boxes: [5], shutters: [{ cell: 5, plate: 4 }] }),
  );
  assert.deepEqual(createState(boxLevel).boards[0].gateOpen, [true]);
  const echoLevel = solo(
    config({ size: 4, start: 4, home: 15, echo: { start: 6 }, shutters: [{ cell: 5, plate: 4 }] }),
  );
  const initial = createState(echoLevel);
  initial.previousInput = 'left';
  const occupied = step(echoLevel, initial, 'down');
  assert.equal(occupied.boards[0].echo, 5);
  assert.deepEqual(occupied.boards[0].gateOpen, [true]);
  assert.deepEqual(step(echoLevel, occupied, 'down').boards[0].gateOpen, [false]);
  const plateLevel = solo(
    config({ size: 4, start: 0, home: 15, echo: { start: 4 }, shutters: [{ cell: 5, plate: 4 }] }),
  );
  assert.deepEqual(createState(plateLevel).boards[0].gateOpen, [false]);
});

test('echo waits on the first turn and later copies the original input, not local compass direction', () => {
  const level = solo(config({ start: 4, echo: { start: 0 } }));
  const first = step(level, createState(level), 'down');
  assert.equal(first.boards[0].echo, 0);
  first.boards[0].charged = true;
  const next = step(level, first, 'up');
  assert.equal(next.boards[0].pos, 8);
  // Reaching home freezes the echo, so use a non-home fixture for its phase.
  const moving = solo(config({ start: 4, home: 7, echo: { start: 0 } }));
  const state = createState(moving);
  state.previousInput = 'down';
  state.boards[0].charged = true;
  const result = step(moving, state, 'up');
  assert.equal(result.boards[0].pos, 5);
  assert.equal(result.boards[0].echo, 3);
  assert.equal(result.previousInput, 'up');
});

test('entering an echo is fatal even if it moves away later, preventing swaps', () => {
  const level = solo(config({ start: 4, echo: { start: 5 } }));
  const initial = createState(level);
  initial.previousInput = 'left';
  const result = step(level, initial, 'right');
  assert.equal(result.status, 'lost');
  assert.equal(result.failedBoard, 0);
  assert.equal(result.boards[0].pos, 5);
  assert.equal(result.boards[0].echo, 4);
  assert.equal(result.turn, 1);
  assert.match(result.reason, /残影/);
  assert.equal(step(level, result, 'down'), result);
});

test('wind collisions and echo movement into the messenger also fail the whole turn', () => {
  const windy = solo(config({ winds: [{ cell: 4, dir: 'right' }], echo: { start: 5 } }));
  assert.equal(step(windy, createState(windy), 'right').status, 'lost');
  const echo = solo(config({ start: 4, walls: [5], echo: { start: 3 } }));
  const state = createState(echo);
  state.previousInput = 'right';
  assert.equal(step(echo, state, 'right').status, 'lost');
});

test('echo obeys gates, one-way edges, boxes and home restrictions without triggering floors', () => {
  const cases = [
    config({ start: 6, echo: { start: 0 }, boxes: [1] }),
    config({ start: 6, echo: { start: 0 }, home: 1 }),
    config({ start: 6, echo: { start: 0 }, oneWays: [{ from: 1, to: 0 }] }),
    config({ start: 6, echo: { start: 0 }, shutters: [{ cell: 1, plate: 2 }] }),
  ];
  for (const board of cases) {
    const level = solo(board);
    const state = createState(level);
    state.previousInput = 'right';
    assert.equal(step(level, state, 'left').boards[0].echo, 0);
  }
  const level = solo(config({ start: 6, echo: { start: 0 }, bridges: [0], compasses: [1] }));
  const state = createState(level);
  state.previousInput = 'right';
  const next = step(level, state, 'left');
  assert.equal(next.boards[0].echo, 1);
  assert.deepEqual(next.boards[0].collapsed, []);
  assert.equal(next.boards[0].charged, false);
});

test('immutable snapshots implement complete undo, including a failed turn and a new branch', () => {
  const level = freeze(
    solo(
      config({
        size: 4,
        start: 4,
        home: 15,
        bridges: [4],
        winds: [{ cell: 5, dir: 'right' }],
        echo: { start: 6 },
      }),
    ),
  );
  const before = freeze(createState(level));
  const serialized = JSON.stringify(before);
  const failed = step(level, before, 'right');
  assert.equal(failed.status, 'lost');
  assert.notDeepEqual(failed.boards[0].collapsed, before.boards[0].collapsed);
  assert.equal(JSON.stringify(before), serialized, 'all snapshot fields survive the failed move');
  const restored = before;
  const branched = step(level, restored, 'down');
  assert.equal(branched.status, 'playing');
  assert.equal(branched.previousInput, 'down');
  assert.equal(branched.turn, 1);
  assert.deepEqual(step(level, restored, 'down'), branched, 'replay is deterministic');
  assert.deepEqual(createState(level), restored, 'restart returns exactly the initial phase');
});

test('state keys retain all dynamic phases and omit the move counter', () => {
  const level = solo(
    config({
      winds: [{ cell: 4, dir: 'up' }],
      echo: { start: 0 },
      shutters: [{ cell: 5, plate: 7 }],
    }),
  );
  const state = createState(level);
  const key = stateKey(state);
  assert.equal(stateKey({ ...state, turn: 1000 }), key);
  assert.equal(stateKey({ ...state, events: [{ board: 0, kind: 'move', from: 0, to: 3 }] }), key);
  assert.notEqual(stateKey({ ...state, previousInput: 'left' }), key);
  for (const change of [
    { pos: 4 },
    { done: true },
    { charged: true },
    { boxes: [1] },
    { collapsed: [2] },
    { windDirs: ['right'] },
    { gateOpen: [true] },
    { echo: 1 },
  ]) {
    const boards = [...state.boards];
    boards[0] = { ...boards[0], ...change };
    assert.notEqual(stateKey({ ...state, boards }), key);
  }
});

test('joint BFS returns a replayable shortest solution, and distinguishes caps from proven dead ends', () => {
  const level = { boards: Array.from({ length: 4 }, () => config({ start: 0, home: 2 })) };
  const result = solve(level);
  assert.deepEqual(result.solution, ['right', 'right']);
  assert.equal(result.optimal, true);
  assert.equal(result.exhausted, false);
  assert.equal(advance(level, result.solution).status, 'won');
  assert.deepEqual(solve(level, { maxStates: 1 }), {
    solution: null,
    explored: 1,
    optimal: false,
    exhausted: true,
  });
  const impossible = solo(config({ start: 0, walls: [1, 3] }));
  const deadEnd = solve(impossible);
  assert.equal(deadEnd.solution, null);
  assert.equal(deadEnd.optimal, true);
  assert.equal(deadEnd.exhausted, false);
  const completed = { boards: Array.from({ length: 4 }, () => config({ start: 0, home: 0 })) };
  assert.deepEqual(solve(completed), {
    solution: [],
    explored: 1,
    optimal: true,
    exhausted: false,
  });
});

test('invalid inputs fail explicitly; completed states stay untouched', () => {
  const level = solo(config());
  assert.deepEqual(DIRECTIONS, ['up', 'right', 'down', 'left']);
  assert.throws(() => step(level, createState(level), 'diagonal'), RangeError);
  assert.throws(() => solve(level, { maxStates: 0 }), RangeError);
});

test('level validation catches overlap, malformed fixtures and nonadjacent directed edges', () => {
  assert.deepEqual(
    validateLevel(solo(config({ compasses: [4], oneWays: [{ from: 3, to: 4 }] }))),
    [],
  );
  assert.deepEqual(validateLevel(null), ['关卡必须包含四块棋盘']);
  for (const bad of [
    { size: 0 },
    { start: -1 },
    { home: 9 },
    { walls: [3] },
    { boxes: [3] },
    { echo: { start: 8 } },
    { echo: null },
    { compasses: [8] },
    { winds: [{ cell: 4, dir: 'diagonal' }] },
    { shutters: [{ cell: 4, plate: 4 }] },
    { oneWays: [{ from: 2, to: 3 }] },
    {
      oneWays: [
        { from: 3, to: 4 },
        { from: 4, to: 3 },
      ],
    },
    { walls: 'wrong type' },
    { boxes: [4, 4] },
    { winds: [null] },
    { shutters: [null] },
  ])
    assert.ok(validateLevel(solo(config(bad))).length > 0, JSON.stringify(bad));
});

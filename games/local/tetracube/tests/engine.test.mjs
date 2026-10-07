import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  SHAPES,
  DIRECTIONS,
  validateConfig,
  migrateConfig,
} from '../src/config.mjs';
import {
  Game,
  rotateCells,
  compactBoard,
  fullPlanes,
  resolveBoard,
  transformPoint,
  transformContainer,
} from '../src/engine.mjs';

const DOWN = { axis: 2, sign: -1 };
const IDENTITY = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const key = (cell) => cell.join(',');
const coordinates = (cell) => [cell.x, cell.y, cell.z];
const sorted = (cells) => cells.map(key).sort();
const configFor = (shapes = SHAPES) => ({ ...DEFAULT_CONFIG, shapes });
const cube = (id, point, color = '#63e7ff') => ({
  id,
  x: point[0],
  y: point[1],
  z: point[2],
  color,
});
function plane(dims, axis, at, startId = 1) {
  const other = [0, 1, 2].filter((a) => a !== axis);
  const cells = [];
  for (let a = 0; a < dims[other[0]]; a++)
    for (let b = 0; b < dims[other[1]]; b++) {
      const point = [0, 0, 0];
      point[axis] = at;
      point[other[0]] = a;
      point[other[1]] = b;
      cells.push(cube(startId + cells.length, point));
    }
  return cells;
}
function assertSupported(board) {
  const occupied = new Set(board.map((cell) => key(coordinates(cell))));
  for (const cell of board)
    assert.ok(
      cell.z === 0 || occupied.has(key([cell.x, cell.y, cell.z - 1])),
      `cube ${cell.id} has no support after settling`,
    );
}
function legacySnapshot(gravity = DOWN) {
  const snapshot = new Game({ seed: 79 }).getSnapshot();
  snapshot.version = 1;
  snapshot.dims = [5, 5, 10];
  snapshot.gravity = { ...gravity };
  snapshot.gravityChanges = 3;
  delete snapshot.orientation;
  delete snapshot.flipCount;
  snapshot.board = [cube(1, [0, 0, 0]), cube(2, [4, 3, 8]), cube(3, [1, 4, 3])];
  snapshot.serial = 3;
  snapshot.active = { ...structuredClone(SHAPES[1]), pos: [1, 1, 4] };
  snapshot.score = 725;
  snapshot.lines = 2;
  snapshot.combo = 1;
  snapshot.bestCombo = 2;
  snapshot.placed = 7;
  return snapshot;
}

const TURNS = {
  invert: { point: [1, 3, 8], dims: [6, 6, 12], axis: 0, angle: Math.PI },
  left: { point: [8, 2, 1], dims: [12, 6, 6], axis: 1, angle: -Math.PI / 2 },
  right: { point: [3, 2, 4], dims: [12, 6, 6], axis: 1, angle: Math.PI / 2 },
  forward: { point: [1, 8, 2], dims: [6, 12, 6], axis: 0, angle: Math.PI / 2 },
  back: { point: [1, 3, 3], dims: [6, 12, 6], axis: 0, angle: -Math.PI / 2 },
};

test('content schema expands the movement floor to 8×8 with eighteen layers of headroom', () => {
  assert.deepEqual(DEFAULT_CONFIG.dims, [8, 8, 18]);
  assert.equal(
    DEFAULT_CONFIG.dims.reduce((volume, size) => volume * size),
    1152,
  );
  assert.deepEqual(validateConfig(DEFAULT_CONFIG), []);
  assert.notEqual(migrateConfig(DEFAULT_CONFIG), DEFAULT_CONFIG);
  assert.ok(validateConfig({ ...DEFAULT_CONFIG, dims: [0, 6, 12] }).length);
  assert.ok(validateConfig({ ...DEFAULT_CONFIG, initialGravity: { axis: 0, sign: -1 } }).length);
  assert.ok(validateConfig({ ...DEFAULT_CONFIG, shapes: [SHAPES[0], SHAPES[0]] }).length);
  assert.ok(
    validateConfig({
      ...DEFAULT_CONFIG,
      shapes: [
        {
          ...SHAPES[0],
          cells: [
            [0, 0, 0],
            [1, 0, 0],
            [3, 3, 3],
            [3, 3, 2],
          ],
        },
      ],
    }).length,
  );
  assert.throws(() => migrateConfig({ ...DEFAULT_CONFIG, version: 2 }));
});

test('every tetracube returns to its exact coordinates after four quarter rotations', () => {
  for (const shape of SHAPES)
    for (const rotation of ['XY', 'XZ', 'YZ']) {
      let cells = shape.cells;
      for (let i = 0; i < 4; i++) cells = rotateCells(cells, rotation);
      assert.deepEqual(cells, shape.cells, `${shape.id}/${rotation}`);
      assert.deepEqual(
        rotateCells(rotateCells(shape.cells, rotation), rotation, -1),
        shape.cells,
        `${shape.id}/${rotation}: reverse turn undoes the default quarter turn`,
      );
      for (let i = 0; i < 4; i++) cells = rotateCells(cells, rotation, -1);
      assert.deepEqual(cells, shape.cells, `${shape.id}/${rotation}: four reverse turns`);
    }
  assert.throws(() => rotateCells(SHAPES[0].cells, 'unknown'));
  for (const direction of [0, 2, NaN, '1'])
    assert.throws(() => rotateCells(SHAPES[0].cells, 'XY', direction));
});

test('bag generation is deterministic, contains each shape once and stays previewed', () => {
  const game = new Game({ seed: 19 });
  const other = new Game({ seed: 19 });
  const seen = [game.active.id, ...game.next.map((shape) => shape.id)];
  while (seen.length < SHAPES.length) seen.push(game.drawShape().id);
  assert.equal(new Set(seen).size, SHAPES.length);
  assert.deepEqual(game.active, other.active);
  assert.equal(game.next.length, DEFAULT_CONFIG.previewCount);
  const injected = new Game({ rng: () => 0 });
  assert.equal(injected.active.id, SHAPES[1].id);
});

test('world-down spawn, lateral moves, obstacle ghost and hard drop agree', () => {
  const game = new Game({ seed: 27 });
  assert.deepEqual(game.gravity, DOWN);
  assert.equal(Math.max(...game.cells().map((cell) => cell[2])), game.dims[2] - 1);
  assert.equal(game.move(2, 1), false, 'movement never substitutes for falling');
  assert.equal(game.move(0, 1), true);
  const floorCell = game.ghost().reduce((chosen, cell) => (cell[2] < chosen[2] ? cell : chosen));
  game.board = [cube(1, floorCell)];
  game.serial = 1;
  const ghost = game.ghost();
  assert.equal(
    ghost.some((cell) => key(cell) === key(floorCell)),
    false,
  );
  assert.ok(ghost.every((cell) => cell.every((v, a) => v >= 0 && v < game.dims[a])));
  assert.equal(game.hardDrop(), true);
  assert.deepEqual(
    sorted(game.board.filter((cell) => cell.id !== 1).map(coordinates)),
    sorted(ghost),
  );
  assert.equal(game.board.length, 5);
  assert.equal(game.placed, 1);
  assert.equal(game.status, 'playing');
  assert.equal(new Set(game.board.map((cell) => key(coordinates(cell)))).size, game.board.length);
  assert.equal(game.fits(game.active), true);
});

test('8×8 floor allows movement to both new outer edges and rejects crossing either wall', () => {
  const game = new Game({ config: configFor([SHAPES[1]]), seed: 8 });
  for (const axis of [0, 1]) {
    while (game.move(axis, -1)) {}
    assert.equal(Math.min(...game.cells().map((cell) => cell[axis])), 0);
    const atNearWall = game.getSnapshot();
    assert.equal(game.move(axis, -1), false);
    assert.deepEqual(game.getSnapshot(), atNearWall);
    while (game.move(axis, 1)) {}
    const positions = game.cells().map((cell) => cell[axis]);
    assert.equal(Math.max(...positions), 7);
    assert.ok(positions.includes(6), 'both extra columns can contain the active shape');
    const atFarWall = game.getSnapshot();
    assert.equal(game.move(axis, 1), false);
    assert.deepEqual(game.getSnapshot(), atFarWall);
    assert.equal(game.fits(game.active), true);
  }
});

test('36 occupied floor cells stay in play and only a complete 64-cell layer clears', () => {
  const game = new Game({ seed: 8 });
  const previousFloor = plane([6, 6, 18], 2, 0);
  assert.equal(previousFloor.length, 36);
  assert.deepEqual(fullPlanes(previousFloor, game.dims, DOWN), []);
  const incomplete = resolveBoard(previousFloor, game.dims, DOWN);
  assert.deepEqual(incomplete.board, previousFloor);
  assert.equal(incomplete.lines, 0);
  assert.equal(incomplete.points, 0);
  assert.deepEqual(incomplete.events, []);
  const completeFloor = plane(game.dims, 2, 0);
  assert.equal(completeFloor.length, 64);
  assert.deepEqual(fullPlanes(completeFloor, game.dims, DOWN), [0]);
  const complete = resolveBoard(completeFloor, game.dims, DOWN);
  assert.equal(complete.lines, 1);
  assert.equal(complete.points, 250);
  assert.equal(complete.events[0].removed.length, 64);
  assert.deepEqual(complete.board, []);
});

test('hold grants one exchange per placement, resets orientation and preserves score', () => {
  const game = new Game({ seed: 448 });
  const first = game.active.id;
  const queued = structuredClone(game.next);
  game.rotate('XZ');
  game.move(0, 1);
  const before = structuredClone(game.active);
  const state = { score: game.score, placed: game.placed, serial: game.serial };
  game.drainEvents();
  assert.equal(game.hold(), true);
  assert.deepEqual(
    game.held,
    SHAPES.find((shape) => shape.id === first),
  );
  assert.equal(game.active.id, queued[0].id);
  assert.deepEqual(game.next.slice(0, 2), queued.slice(1));
  assert.equal(game.next.length, DEFAULT_CONFIG.previewCount);
  assert.equal(game.holdUsed, true);
  assert.deepEqual({ score: game.score, placed: game.placed, serial: game.serial }, state);
  const event = game.drainEvents().find((item) => item.type === 'hold');
  assert.deepEqual(event.before, before);
  assert.deepEqual(event.after, game.active);
  assert.deepEqual(event.from, game.cells(before));
  assert.deepEqual(event.to, game.cells());
  const snapshot = game.getSnapshot();
  assert.equal(game.hold(), false);
  assert.deepEqual(
    game.getSnapshot(),
    snapshot,
    'repeat hold cannot consume queue or replace shapes',
  );
  assert.deepEqual(game.drainEvents(), []);
  game.hardDrop();
  assert.equal(game.holdUsed, false);
  const displaced = game.active.id;
  const queue = structuredClone(game.next);
  const bag = [...game.bag];
  const rngState = game.rngState;
  assert.equal(game.hold(), true);
  assert.equal(game.active.id, first);
  assert.deepEqual(game.active.cells, SHAPES.find((shape) => shape.id === first).cells);
  assert.equal(game.held.id, displaced);
  assert.deepEqual(game.next, queue, 'swapping an occupied slot leaves future pieces untouched');
  assert.deepEqual(game.bag, bag);
  assert.equal(game.rngState, rngState);
  assert.equal(game.fits(game.active), true);
});

test('container turn restores hold permission and danger cannot exchange pending pieces', () => {
  const game = new Game({ seed: 2 });
  game.hold();
  const held = structuredClone(game.held);
  game.flipContainer('left');
  assert.equal(game.holdUsed, false);
  assert.deepEqual(game.held, held);
  assert.equal(game.hold(), true);
  game.board = plane(game.dims, 2, game.dims[2] - 1);
  game.serial = game.board.length;
  game.spawn(game.active);
  const danger = game.getSnapshot();
  assert.equal(game.status, 'danger');
  assert.equal(game.hold(), false);
  assert.deepEqual(game.getSnapshot(), danger);
});

test('motion events preserve ordered piece cells and hard-drop to lock continuity', () => {
  const game = new Game({ config: configFor([SHAPES[0]]), seed: 8 });
  game.drainEvents();
  assert.equal(game.move(1, 1), true);
  assert.equal(game.rotate('XZ'), true);
  assert.equal(game.tick(), true);
  assert.equal(game.hardDrop(), true);
  const events = game.drainEvents();
  assert.deepEqual(
    events.map((event) => event.type),
    ['move', 'rotate', 'fall', 'drop', 'lock', 'spawn'],
  );
  for (const event of events.slice(0, 4)) {
    assert.deepEqual(event.from, game.cells(event.before));
    assert.deepEqual(event.to, game.cells(event.after));
    assert.equal(event.from.length, 4);
    assert.equal(event.to.length, 4);
  }
  const [move, rotate, fall, drop, lock] = events;
  assert.deepEqual(move.to, rotate.from);
  assert.deepEqual(rotate.to, fall.from);
  assert.deepEqual(fall.to, drop.from);
  assert.deepEqual(drop.to, lock.from);
  assert.deepEqual(lock.from, lock.added.map(coordinates));
  assert.deepEqual(lock.piece, drop.after);
  assert.deepEqual(rotate.after.cells, rotateCells(rotate.before.cells, rotate.plane));
  assert.equal(rotate.sign, 1);
  assert.equal(fall.distance, 1);
  assert.deepEqual(fall.gravity, DOWN);
  const saved = structuredClone(events);
  game.active.pos[0] = 0;
  game.board[0].z = 7;
  assert.deepEqual(events, saved, 'renderer snapshots do not alias the live simulation');
});

test('automatic collision locks the final airborne pose for the landing animation', () => {
  const game = new Game({ config: configFor([SHAPES[1]]), seed: 8 });
  game.active.pos[2] = 0;
  const before = structuredClone(game.active);
  game.drainEvents();
  assert.equal(game.tick(), true);
  const events = game.drainEvents();
  assert.deepEqual(
    events.map((event) => event.type),
    ['lock', 'spawn'],
  );
  assert.deepEqual(events[0].piece, before);
  assert.deepEqual(events[0].from, game.cells(before));
});

for (const gravity of DIRECTIONS) {
  const { axis, sign, short } = gravity;
  test(`${short}: pure compaction preserves cubes, column order and transverse coordinates`, () => {
    const dims = [6, 6, 12];
    const positions = [0, 2, dims[axis] - 1];
    const board = positions.map((at, index) => {
      const point = [1, 1, 1];
      point[axis] = at;
      return cube(index + 1, point);
    });
    const untouched = structuredClone(board);
    const compacted = compactBoard(board, dims, { axis, sign });
    assert.deepEqual(board, untouched, 'helper is pure');
    assert.deepEqual(
      compacted.map((cell) => cell.id),
      board.map((cell) => cell.id),
    );
    assert.deepEqual(
      compacted.map((cell) => coordinates(cell)[axis]),
      sign < 0 ? [0, 1, 2] : [dims[axis] - 3, dims[axis] - 2, dims[axis] - 1],
    );
    assert.deepEqual(
      compactBoard(compacted, dims, { axis, sign }),
      compacted,
      'compaction is idempotent',
    );
    compacted.forEach((cell, index) => {
      coordinates(cell).forEach((value, a) => {
        if (a !== axis) assert.equal(value, coordinates(board[index])[a]);
      });
    });
  });

  test(`${short}: pure resolution only removes the complete perpendicular plane`, () => {
    const dims = [6, 6, 12];
    const floor = sign < 0 ? 0 : dims[axis] - 1;
    const board = plane(dims, axis, floor);
    const point = [0, 0, 0];
    point[axis] = sign < 0 ? 3 : dims[axis] - 4;
    board.push(cube(board.length + 1, point));
    assert.deepEqual(fullPlanes(board, dims, { axis, sign }), [floor]);
    const result = resolveBoard(board, dims, { axis, sign });
    assert.equal(result.lines, 1);
    assert.equal(result.points, 250);
    assert.equal(result.board.length, 1);
    assert.equal(coordinates(result.board[0])[axis], floor);
    assert.equal(
      result.events[0].removed.length,
      dims.reduce((a, size, aIndex) => (aIndex === axis ? a : a * size), 1),
    );
  });
}

for (const [turn, expected] of Object.entries(TURNS)) {
  test(`${turn}: container transform preserves IDs, color, volume and exact geometry`, () => {
    const dims = [6, 6, 12];
    const board = [cube(19, [1, 2, 3], '#abcdef'), cube(20, [0, 0, 0]), cube(21, [5, 5, 11])];
    const before = structuredClone(board);
    assert.deepEqual(transformPoint([1, 2, 3], dims, turn), expected.point);
    const result = transformContainer(board, dims, turn);
    assert.deepEqual(Object.keys(result).sort(), ['angle', 'axis', 'board', 'dims']);
    assert.deepEqual(result.dims, expected.dims);
    assert.equal(result.axis, expected.axis);
    assert.equal(result.angle, expected.angle);
    assert.deepEqual(result.board[0], cube(19, expected.point, '#abcdef'));
    assert.deepEqual(board, before);
    assert.deepEqual(dims, [6, 6, 12]);
    assert.deepEqual(
      result.board.map(({ id, color }) => ({ id, color })),
      board.map(({ id, color }) => ({ id, color })),
    );
    assert.equal(
      result.dims.reduce((a, b) => a * b),
      432,
    );
    for (const cell of result.board)
      assert.ok(
        coordinates(cell).every((v, a) => Number.isInteger(v) && v >= 0 && v < result.dims[a]),
      );
    result.board[0].x = 100;
    assert.deepEqual(board, before, 'transformed board does not alias input');
  });

  test(`${turn}: repeated physical rotations return all 432 cells and dimensions exactly`, () => {
    const dims = [6, 6, 12];
    const board = Array.from({ length: 12 }, (_, z) => plane(dims, 2, z, 1 + z * 36)).flat();
    let current = { board, dims };
    for (let i = 0; i < (turn === 'invert' ? 2 : 4); i++)
      current = transformContainer(current.board, current.dims, turn);
    assert.deepEqual(current.board, board);
    assert.deepEqual(current.dims, dims);
  });

  test(`${turn}: gameplay commits the current pose once, rotates then settles downward`, () => {
    const game = new Game({ seed: 303 });
    game.board = [cube(1, [3, 1, 1]), cube(2, [4, 1, 1]), cube(3, [4, 3, 6])];
    game.serial = 3;
    game.active.pos[2] -= 2;
    const before = structuredClone(game.board);
    const activeCells = game.cells();
    const activeColor = game.active.color;
    const next = structuredClone(game.next);
    const score = game.score;
    game.drainEvents();
    assert.equal(game.flipContainer(turn), true);
    const events = game.drainEvents();
    const flip = events.find((event) => event.type === 'flip');
    const committed = activeCells.map((point, index) => cube(index + 4, point, activeColor));
    assert.deepEqual(
      flip.before,
      [...before, ...committed],
      'active pose is committed before rotation',
    );
    const expectedDims = transformContainer([], DEFAULT_CONFIG.dims, turn).dims;
    assert.deepEqual(flip.beforeDims, DEFAULT_CONFIG.dims);
    assert.deepEqual(flip.afterDims, expectedDims);
    assert.equal(flip.turn, turn);
    assert.equal(flip.axis, expected.axis);
    assert.equal(flip.angle, expected.angle);
    assert.deepEqual(flip.orientation, game.orientation);
    const transformed = transformContainer([...before, ...committed], DEFAULT_CONFIG.dims, turn);
    assert.deepEqual(flip.after, transformed.board);
    assert.deepEqual(game.board, compactBoard(transformed.board, transformed.dims, DOWN));
    assert.deepEqual(game.dims, expectedDims);
    assert.deepEqual(game.gravity, DOWN);
    assert.equal(game.placed, 1);
    assert.equal(game.flipCount, 1);
    assert.equal(game.serial, 7);
    assert.equal(
      game.score,
      score + 4 * game.config.points.cell,
      'flip does not earn hard-drop distance',
    );
    assert.equal(game.board.length, 7);
    assert.deepEqual(
      game.board.map((cell) => cell.id),
      [1, 2, 3, 4, 5, 6, 7],
    );
    assertSupported(game.board);
    assert.equal(game.active.id, next[0].id, 'next queued tetracube replaces committed active');
    assert.deepEqual(game.next.slice(0, 2), next.slice(1));
    assert.equal(game.next.length, DEFAULT_CONFIG.previewCount);
    assert.equal(
      Math.max(...game.cells().map((cell) => cell[2])),
      game.dims[2] - 1,
      'next piece spawns at world top after every rotation',
    );
    assert.equal(game.fits(game.active), true);
    assert.ok(
      events.findIndex((event) => event.type === 'flip') <
        events.findIndex((event) => event.type === 'compact'),
    );
    assert.equal(events.filter((event) => event.type === 'spawn').length, 1);
    const snapshot = structuredClone(flip);
    game.board[0].z = 3;
    assert.deepEqual(flip, snapshot, 'animation events retain detached snapshots');
  });
}

test('invalid container turns leave every field and queued event unchanged', () => {
  const game = new Game({ seed: 5 });
  const before = game.getSnapshot();
  const events = structuredClone(game.events);
  assert.equal(game.flipContainer('diagonal'), false);
  assert.deepEqual(game.getSnapshot(), before);
  assert.deepEqual(game.events, events);
  assert.throws(() => transformPoint([0, 0, 0], [6, 6, 12], 'diagonal'));
  assert.throws(() => transformContainer([], [6, 6, 12], 'diagonal'));
});

test('default flip inverts the container and subsequent pieces still fall from top', () => {
  const game = new Game({ seed: 9 });
  assert.equal(game.flipContainer(), true);
  const flip = game.drainEvents().find((event) => event.type === 'flip');
  assert.equal(flip.turn, 'invert');
  const top = game.active.pos[2];
  assert.equal(game.tick(), true);
  assert.equal(game.active.pos[2], top - 1);
  const landing = game.ghost();
  const serial = game.serial;
  assert.equal(game.hardDrop(), true);
  assert.deepEqual(
    sorted(game.board.filter((cell) => cell.id > serial).map(coordinates)),
    sorted(landing),
  );
  assert.deepEqual(game.gravity, DOWN);
});

test('tick falls one cell then locks on collision without duplicate blocks', () => {
  const game = new Game({ seed: 2 });
  const before = game.active.pos[2];
  game.tick();
  assert.equal(game.active.pos[2], before - 1);
  for (let i = 0; i < 20 && !game.placed; i++) game.tick();
  assert.equal(game.placed, 1);
  assert.equal(game.board.length, 4);
  assert.equal(game.status, 'playing');
});

test('rotation is atomic when every rotated placement collides', () => {
  const game = new Game({ seed: 1 });
  game.active = { ...structuredClone(SHAPES.find((shape) => shape.id === 'tee')), pos: [2, 2, 4] };
  const empty = new Set(game.cells().map(key));
  let id = 0;
  for (let x = 0; x < game.dims[0]; x++)
    for (let y = 0; y < game.dims[1]; y++)
      for (let z = 0; z < game.dims[2]; z++)
        if (!empty.has(key([x, y, z]))) game.board.push(cube(++id, [x, y, z]));
  const active = structuredClone(game.active);
  assert.equal(game.rotate('XY'), false);
  assert.deepEqual(game.active, active);
  assert.equal(game.move(0, 1), false);
});

test('rotations kick away from walls and the spawn face without overlapping', () => {
  const game = new Game({ config: configFor([SHAPES[0]]), seed: 8 });
  for (const rotation of ['XZ', 'YZ', 'XY', 'XZ']) {
    assert.equal(game.rotate(rotation), true);
    assert.equal(game.fits(game.active), true);
    assert.equal(new Set(game.cells().map(key)).size, 4);
  }
});

test('a long bridge at the spawn ceiling rotates with the necessary three-cell correction', () => {
  const shape = {
    ...SHAPES[0],
    cells: [
      [-3, 0, 0],
      [-2, 0, 0],
      [-1, 0, 0],
      [0, 0, 0],
    ],
  };
  const config = configFor([shape]);
  const game = new Game({ config, seed: 8 });
  const before = structuredClone(game.active);
  game.drainEvents();
  assert.equal(game.rotate('xz'), true);
  assert.deepEqual(game.active.pos, [before.pos[0], before.pos[1], before.pos[2] - 3]);
  assert.deepEqual(game.active.cells, rotateCells(before.cells, 'XZ'));
  assert.deepEqual(game.drainEvents(), [
    {
      type: 'rotate',
      plane: 'XZ',
      direction: 1,
      sign: 1,
      kick: [0, 0, -3],
      before,
      after: structuredClone(game.active),
      from: game.cells(before),
      to: game.cells(),
    },
  ]);
  assert.equal(Math.max(...game.cells().map((cell) => cell[2])), game.dims[2] - 1);
  assert.equal(game.fits(game.active), true);
  const restored = new Game({ config }).restore(game.getSnapshot());
  assert.deepEqual(restored.getSnapshot(), game.getSnapshot());
  for (const instance of [game, restored]) assert.equal(instance.rotate('XZ', -1), true);
  assert.deepEqual(game.active.cells, before.cells);
  assert.deepEqual(restored.getSnapshot(), game.getSnapshot());
  const reverse = game.drainEvents()[0];
  assert.equal(reverse.direction, -1);
  assert.equal(reverse.sign, -1);
  assert.deepEqual(
    reverse.after.cells,
    rotateCells(reverse.before.cells, reverse.plane, reverse.sign),
  );
  assert.deepEqual(reverse.from, game.cells(reverse.before));
  assert.deepEqual(reverse.to, game.cells(reverse.after));
});

test('a turn near a corner can combine two local offsets without changing depth', () => {
  const game = new Game({ seed: 8 });
  game.active = { ...structuredClone(SHAPES.find((shape) => shape.id === 'tee')), pos: [1, 0, 4] };
  game.board = [cube(1, [1, 2, 4]), cube(2, [0, 2, 4])];
  const board = structuredClone(game.board);
  const cells = rotateCells(game.active.cells, 'XY');
  assert.equal(game.fits(game.active), true);
  game.drainEvents();
  assert.equal(game.rotate('XY'), true);
  assert.deepEqual(game.active.pos, [2, 1, 4]);
  assert.deepEqual(game.active.cells, cells);
  assert.deepEqual(game.drainEvents()[0].kick, [1, 1, 0]);
  assert.equal(game.fits(game.active), true);
  assert.deepEqual(game.board, board);
});

test('every shape orientation at an empty-container corner can turn both ways in each plane', () => {
  const game = new Game({ seed: 8 });
  for (const shape of SHAPES) {
    const orientations = [shape.cells];
    const seen = new Set();
    for (let i = 0; i < orientations.length; i++) {
      const cells = orientations[i];
      const orientation = sorted(cells).join(';');
      if (seen.has(orientation)) continue;
      seen.add(orientation);
      for (const plane of ['XY', 'XZ', 'YZ']) orientations.push(rotateCells(cells, plane));
      const edges = [0, 1, 2].map((axis) => [
        -Math.min(...cells.map((cell) => cell[axis])) || 0,
        game.dims[axis] - 1 - Math.max(...cells.map((cell) => cell[axis])),
      ]);
      for (const x of edges[0])
        for (const y of edges[1])
          for (const z of edges[2])
            for (const plane of ['XY', 'XZ', 'YZ'])
              for (const direction of [-1, 1]) {
                const pos = [x, y, z];
                game.active = { ...structuredClone(shape), cells, pos };
                game.drainEvents();
                assert.equal(game.fits(game.active), true);
                assert.equal(
                  game.rotate(plane, direction),
                  true,
                  `${shape.id}/${orientation}/${pos}/${plane}/${direction}`,
                );
                assert.deepEqual(game.active.cells, rotateCells(cells, plane, direction));
                assert.equal(game.fits(game.active), true);
                const event = game.drainEvents()[0];
                assert.ok(event.kick.reduce((sum, value) => sum + Math.abs(value), 0) <= 3);
                const untouched = { XY: 2, XZ: 1, YZ: 0 }[plane];
                assert.equal(game.active.pos[untouched], pos[untouched]);
              }
    }
  }
});

test('blocked turns do not jump to a distant vacancy or to another depth layer', () => {
  const game = new Game({ config: { ...DEFAULT_CONFIG, dims: [12, 12, 12] }, seed: 8 });
  game.active = { ...structuredClone(SHAPES.find((shape) => shape.id === 'tee')), pos: [2, 2, 4] };
  const rotated = rotateCells(game.active.cells, 'XY');
  const farPiece = { ...structuredClone(game.active), cells: rotated, pos: [6, 2, 4] };
  const otherLayer = { ...structuredClone(game.active), cells: rotated, pos: [2, 2, 5] };
  const vacancies = new Set([...game.cells(), ...game.cells(farPiece)].map(key));
  game.board = plane(game.dims, 2, 4).filter((cell) => !vacancies.has(key(coordinates(cell))));
  assert.equal(game.fits(game.active), true);
  assert.equal(game.fits(farPiece), true, 'a valid destination exists four cells away');
  assert.equal(
    game.fits(otherLayer),
    true,
    'a valid destination exists outside the rotation plane',
  );
  const active = structuredClone(game.active);
  const board = structuredClone(game.board);
  game.drainEvents();
  assert.equal(game.rotate('XY'), false);
  assert.deepEqual(game.active, active);
  assert.deepEqual(game.board, board);
  assert.deepEqual(game.drainEvents(), []);
});

test('clear-collapse-clear emits distinct snapshots and increasing combo rewards', () => {
  const dims = [6, 6, 12];
  const board = [...plane(dims, 2, 1), ...plane(dims, 2, 3, 37), cube(73, [1, 1, 9])];
  const result = resolveBoard(board, dims, DOWN);
  assert.equal(result.lines, 2);
  assert.equal(result.combo, 2);
  assert.equal(result.points, 750);
  assert.equal(result.board.length, 1);
  assert.equal(result.board[0].z, 0);
  const clears = result.events.filter((event) => event.type === 'clear');
  assert.deepEqual(
    clears.map((event) => event.combo),
    [1, 2],
  );
  assert.deepEqual(
    clears.map((event) => event.points),
    [250, 500],
  );
  assert.equal(result.events[1].type, 'compact');
  assert.equal(clears[0].before.length, 73);
  assert.equal(clears[1].before.length, 37);
  result.board[0].z = 11;
  assert.equal(
    clears[0].before.find((cell) => cell.id === 73).z,
    9,
    'animation snapshots do not alias live board',
  );
});

test('blocked spawn enters danger and inversion recovers the pending piece without consuming queue', () => {
  const game = new Game({ config: configFor([SHAPES[1]]), seed: 7 });
  const retained = structuredClone(game.active);
  let id = 0;
  game.board = [];
  for (let x = 0; x < game.dims[0]; x++)
    for (let y = 0; y < game.dims[1]; y++)
      if ((x + y) % 2 === 0) game.board.push(cube(++id, [x, y, game.dims[2] - 1]));
  game.serial = id;
  assert.equal(game.spawn(retained), false);
  assert.equal(game.status, 'danger');
  assert.equal(game.active, null);
  assert.equal(game.pending.id, retained.id);
  assert.equal(game.hardDrop(), false);
  const queue = structuredClone(game.next);
  const bag = [...game.bag];
  const rngState = game.rngState;
  assert.equal(game.flipContainer('invert'), true);
  assert.equal(game.status, 'playing');
  assert.equal(game.active.id, retained.id);
  assert.deepEqual(game.active.cells, retained.cells);
  assert.equal(game.pending, null);
  assert.equal(game.placed, 0, 'danger rescue never commits a nonexistent active piece');
  assert.equal(game.board.length, id);
  assert.deepEqual(game.next, queue);
  assert.deepEqual(game.bag, bag);
  assert.equal(game.rngState, rngState);
  assert.equal(game.fits(game.active), true);
  assertSupported(game.board);
});

test('a full 8×8×18 container clears all 1152 cubes in eighteen waves after inversion', () => {
  const game = new Game({ seed: 33 });
  game.board = Array.from({ length: 18 }, (_, z) => plane(game.dims, 2, z, 1 + z * 64)).flat();
  game.serial = 1152;
  assert.equal(game.spawn(game.active), false);
  assert.equal(game.status, 'danger');
  assert.equal(game.flipContainer('invert'), true);
  assert.equal(game.lines, 18);
  assert.equal(game.bestCombo, 18);
  assert.equal(game.score, 250 * 171);
  assert.equal(game.status, 'playing');
  assert.equal(game.board.length, 0);
  const events = game.drainEvents();
  const flipIndex = events.findIndex((event) => event.type === 'flip');
  assert.ok(events.findIndex((event) => event.type === 'clear') > flipIndex);
  assert.deepEqual(
    events.filter((event) => event.type === 'clear').map((event) => event.combo),
    Array.from({ length: 18 }, (_, i) => i + 1),
  );
});

test('quarter turn changes vertical walls into 144-cell 18×8 planes before a two-wave cascade', () => {
  const game = new Game({ seed: 33 });
  game.board = [...plane(game.dims, 0, 0), ...plane(game.dims, 0, 2, 145)];
  game.serial = 288;
  game.active = { ...structuredClone(SHAPES[1]), pos: [3, 2, 9] };
  assert.deepEqual(fullPlanes(game.board, game.dims, DOWN), []);
  assert.equal(game.fits(game.active), true);
  game.drainEvents();
  assert.equal(game.flipContainer('left'), true);
  assert.deepEqual(game.dims, [18, 8, 8]);
  assert.equal(game.lines, 2);
  assert.equal(game.combo, 2);
  assert.equal(game.score, 750 + 4 * game.config.points.cell);
  assert.equal(game.board.length, 4);
  assert.deepEqual(
    game.board.map((cell) => cell.id),
    [289, 290, 291, 292],
  );
  assertSupported(game.board);
  const events = game.drainEvents();
  assert.equal(events[0].type, 'flip');
  assert.deepEqual(
    events
      .filter((event) => event.type === 'clear')
      .map((event) => ({
        axis: event.axis,
        area: event.removed.length,
        combo: event.combo,
      })),
    [
      { axis: 2, area: 144, combo: 1 },
      { axis: 2, area: 144, combo: 2 },
    ],
  );
});

test('combo continues on consecutive clears, resets on an empty placement, and best survives', () => {
  const game = new Game({ seed: 8 });
  for (let i = 0; i < 2; i++) {
    game.board = plane(game.dims, 2, 0);
    game.resolve();
  }
  assert.equal(game.combo, 2);
  assert.equal(game.bestCombo, 2);
  assert.equal(game.score, 750);
  game.resolve();
  assert.equal(game.combo, 0);
  assert.equal(game.bestCombo, 2);
});

for (const gravity of DIRECTIONS) {
  const turn =
    gravity.axis === 2
      ? gravity.sign === 1
        ? 'invert'
        : null
      : gravity.axis === 0
        ? gravity.sign === -1
          ? 'left'
          : 'right'
        : gravity.sign === -1
          ? 'forward'
          : 'back';
  test(`legacy ${gravity.short}: migration rotates into world-down, grows dimensions and preserves state`, () => {
    const legacy = legacySnapshot({ axis: gravity.axis, sign: gravity.sign });
    const source = structuredClone(legacy);
    const restored = new Game({ seed: 0 }).restore(legacy);
    const oldCells = legacy.active.cells.map((cell) =>
      cell.map((v, a) => v + legacy.active.pos[a]),
    );
    const geometry = turn
      ? transformContainer(legacy.board, legacy.dims, turn)
      : { board: legacy.board, dims: legacy.dims };
    assert.deepEqual(restored.board, geometry.board);
    assert.deepEqual(
      restored.dims,
      geometry.dims.map((d) => (d === 5 ? 8 : 18)),
    );
    assert.deepEqual(
      sorted(restored.cells()),
      sorted(turn ? oldCells.map((cell) => transformPoint(cell, legacy.dims, turn)) : oldCells),
    );
    assert.deepEqual(restored.gravity, DOWN);
    assert.equal(restored.fits(restored.active), true);
    assert.equal(restored.flipCount, 3);
    assert.equal(restored.getSnapshot().version, 4);
    assert.equal(restored.events.length, 0);
    for (const field of [
      'score',
      'lines',
      'combo',
      'bestCombo',
      'placed',
      'serial',
      'rngState',
      'initialSeed',
      'status',
      'bag',
      'next',
      'pending',
    ])
      assert.deepEqual(restored[field], legacy[field], `${field} survives migration unchanged`);
    assert.deepEqual(legacy, source, 'migration does not mutate supplied save');
    const roundtrip = new Game().restore(restored.getSnapshot());
    assert.deepEqual(roundtrip.getSnapshot(), restored.getSnapshot());
    const sameSequence = new Game().restore(source);
    for (let i = 0; i < 30; i++) assert.deepEqual(restored.drawShape(), sameSequence.drawShape());
  });
}

test('legacy danger retains pending shape until a physical flip rescues it', () => {
  const legacy = legacySnapshot({ axis: 0, sign: 1 });
  legacy.pending = structuredClone(SHAPES[1]);
  legacy.active = null;
  legacy.status = 'danger';
  const restored = new Game().restore(legacy);
  assert.equal(restored.status, 'danger');
  assert.deepEqual(restored.pending, {
    ...legacy.pending,
    cells: rotateCells(legacy.pending.cells, 'XZ'),
  });
  assert.equal(restored.active, null);
  const next = structuredClone(restored.next);
  assert.equal(restored.flipContainer('invert'), true);
  assert.equal(restored.active.id, legacy.pending.id);
  assert.deepEqual(restored.next, next);
  assert.equal(restored.placed, legacy.placed);
});

for (const turn of [null, ...Object.keys(TURNS)]) {
  test(`v2 ${turn ?? 'upright'} save expands without moving cubes or changing future pieces`, () => {
    const game = new Game({ config: { ...DEFAULT_CONFIG, dims: [6, 6, 12] }, seed: 448 });
    game.hardDrop();
    game.move(1, 1);
    game.rotate('XZ');
    if (turn) game.flipContainer(turn);
    const snapshot = game.getSnapshot();
    snapshot.version = 2;
    delete snapshot.held;
    delete snapshot.holdUsed;
    const before = structuredClone(snapshot);
    const restored = new Game().restore(snapshot);
    const expectedDims = turn
      ? transformContainer([], DEFAULT_CONFIG.dims, turn).dims
      : DEFAULT_CONFIG.dims;
    assert.deepEqual(restored.dims, expectedDims);
    assert.equal(
      restored.dims.reduce((volume, size) => volume * size),
      1152,
    );
    for (const field of [
      'board',
      'active',
      'pending',
      'orientation',
      'score',
      'lines',
      'combo',
      'bestCombo',
      'placed',
      'serial',
      'rngState',
      'initialSeed',
      'status',
      'bag',
      'next',
      'flipCount',
    ])
      assert.deepEqual(restored[field], snapshot[field], `${field} survives expansion unchanged`);
    assert.equal(restored.held, null);
    assert.equal(restored.holdUsed, false);
    assert.equal(restored.getSnapshot().version, 4);
    assert.equal(restored.fits(restored.active), true);
    assert.deepEqual(snapshot, before, 'migration does not mutate the supplied save');
    for (let i = 0; i < 30; i++) assert.deepEqual(restored.drawShape(), game.drawShape());
    const roundtrip = new Game().restore(restored.getSnapshot());
    assert.deepEqual(roundtrip.getSnapshot(), restored.getSnapshot());
  });
}

test('v2 danger migration retains its blocked piece and resumes after inversion', () => {
  const game = new Game({ config: { ...DEFAULT_CONFIG, dims: [6, 6, 12] }, seed: 4 });
  game.board = plane(game.dims, 2, 11);
  game.serial = 36;
  game.spawn(game.active);
  const snapshot = game.getSnapshot();
  snapshot.version = 2;
  delete snapshot.held;
  delete snapshot.holdUsed;
  const restored = new Game().restore(snapshot);
  assert.equal(restored.status, 'danger');
  assert.deepEqual(restored.pending, snapshot.pending);
  assert.deepEqual(restored.board, snapshot.board);
  assert.deepEqual(restored.next, snapshot.next);
  assert.deepEqual(restored.dims, [8, 8, 18]);
  assert.equal(restored.flipContainer('invert'), true);
  assert.equal(restored.status, 'playing');
  assert.equal(restored.active.id, snapshot.pending.id);
});

for (const turn of [null, ...Object.keys(TURNS)]) {
  test(`v3 ${turn ?? 'upright'} save widens while preserving held piece, cooldown and all state`, () => {
    const game = new Game({ config: { ...DEFAULT_CONFIG, dims: [6, 6, 18] }, seed: 448 });
    game.hold();
    game.hardDrop();
    game.move(1, 1);
    game.rotate('XZ');
    if (turn) game.flipContainer(turn);
    assert.equal(game.hold(), true);
    const snapshot = game.getSnapshot();
    snapshot.version = 3;
    const before = structuredClone(snapshot);
    const restored = new Game().restore(snapshot);
    const expectedDims = turn
      ? transformContainer([], DEFAULT_CONFIG.dims, turn).dims
      : DEFAULT_CONFIG.dims;
    assert.deepEqual(restored.dims, expectedDims);
    assert.equal(
      restored.dims.reduce((volume, size) => volume * size),
      1152,
    );
    for (const [field, expected] of Object.entries(snapshot)) {
      if (['version', 'configId', 'dims'].includes(field)) continue;
      assert.deepEqual(restored[field], expected, `${field} survives widening unchanged`);
    }
    assert.equal(restored.holdUsed, true);
    assert.equal(restored.hold(), false, 'migration does not grant an extra exchange');
    assert.equal(restored.getSnapshot().version, 4);
    assert.equal(restored.fits(restored.active), true);
    assert.deepEqual(snapshot, before, 'migration leaves the supplied save untouched');
    assert.deepEqual(restored.events, []);
    for (let i = 0; i < 30; i++) assert.deepEqual(restored.drawShape(), game.drawShape());
    const roundtrip = new Game().restore(restored.getSnapshot());
    assert.deepEqual(roundtrip.getSnapshot(), restored.getSnapshot());
  });
}

test('v3 danger save preserves held shape and pending queue when widening', () => {
  const game = new Game({ config: { ...DEFAULT_CONFIG, dims: [6, 6, 18] }, seed: 4 });
  game.hold();
  game.board = plane(game.dims, 2, 17);
  game.serial = 36;
  game.spawn(game.active);
  const snapshot = game.getSnapshot();
  snapshot.version = 3;
  const restored = new Game().restore(snapshot);
  assert.equal(restored.status, 'danger');
  assert.equal(restored.active, null);
  for (const field of ['held', 'holdUsed', 'pending', 'next', 'board', 'bag', 'rngState', 'score'])
    assert.deepEqual(restored[field], snapshot[field]);
  assert.deepEqual(restored.dims, [8, 8, 18]);
  assert.equal(restored.flipContainer('invert'), true);
  assert.equal(restored.status, 'playing');
  assert.equal(restored.active.id, snapshot.pending.id);
  assert.deepEqual(restored.held, snapshot.held);
});

for (const version of [2, 3]) {
  for (const turn of [null, ...Object.keys(TURNS)]) {
    test(`v${version} ${turn ?? 'upright'} malformed saves cannot use expanded dimensions to evade validation`, () => {
      const game = new Game({
        config: { ...DEFAULT_CONFIG, dims: version === 2 ? [6, 6, 12] : [6, 6, 18] },
        seed: 4,
      });
      if (turn) game.flipContainer(turn);
      const snapshot = game.getSnapshot();
      snapshot.version = version;
      if (version === 2) {
        delete snapshot.held;
        delete snapshot.holdUsed;
      }
      const target = new Game({ seed: 27 });
      const before = target.getSnapshot();
      const expandedDims = turn
        ? transformContainer([], DEFAULT_CONFIG.dims, turn).dims
        : DEFAULT_CONFIG.dims;
      const grownAxis = snapshot.dims.findIndex((size, axis) => size < expandedDims[axis]);
      const mutations = [
        (value) => {
          value.dims = expandedDims;
        },
        (value) => {
          const point = [0, 0, 0];
          point[grownAxis] = value.dims[grownAxis];
          value.board.push(cube(++value.serial, point));
        },
        (value) => {
          value.active.pos[grownAxis] = value.dims[grownAxis] + 3;
        },
        (value) => {
          value.next = [];
        },
        (value) => {
          value.score = -1;
        },
        ...(version === 3
          ? [
              (value) => {
                value.held = { ...structuredClone(SHAPES[0]), id: 'unknown' };
              },
            ]
          : []),
      ];
      for (const mutate of mutations) {
        const malformed = structuredClone(snapshot);
        mutate(malformed);
        assert.throws(() => target.restore(malformed));
        assert.deepEqual(target.getSnapshot(), before, 'rejected migration is atomic');
      }
    });
  }
}

test('v4 save persists held shape and exchange cooldown through deterministic continuation', () => {
  const game = new Game({ seed: 448 });
  game.hold();
  const restored = new Game().restore(game.getSnapshot());
  assert.deepEqual(restored.getSnapshot(), game.getSnapshot());
  assert.equal(restored.hold(), false);
  for (const instance of [game, restored]) {
    instance.hardDrop();
    instance.hold();
    instance.rotate('YZ');
    instance.flipContainer('left');
    instance.hold();
  }
  assert.deepEqual(restored.getSnapshot(), game.getSnapshot());
});

test('v4 save/restore preserves rotated dimensions, orientation, queue, RNG and future commands', () => {
  const game = new Game({ seed: 448 });
  game.hardDrop();
  game.move(1, 1);
  game.rotate('XZ');
  game.flipContainer('right');
  assert.deepEqual(game.dims, [18, 8, 8]);
  assert.notDeepEqual(game.orientation, IDENTITY);
  const restored = new Game({ seed: 0 }).restore(game.getSnapshot());
  assert.deepEqual(restored.getSnapshot(), game.getSnapshot());
  assert.equal(restored.events.length, 0);
  for (let i = 0; i < 30; i++) assert.deepEqual(restored.drawShape(), game.drawShape());
  for (const instance of [game, restored]) {
    instance.hardDrop();
    instance.flipContainer('forward');
    instance.move(1, 1);
    instance.rotate('YZ');
  }
  assert.deepEqual(restored.getSnapshot(), game.getSnapshot());
});

test('reset restores original container geometry, orientation, flip count and seeded sequence', () => {
  const game = new Game({ seed: 448 });
  const fresh = game.getSnapshot();
  assert.deepEqual(game.orientation, IDENTITY);
  game.flipContainer('left');
  game.flipContainer('back');
  game.hardDrop();
  game.reset();
  assert.deepEqual(game.dims, [8, 8, 18]);
  assert.deepEqual(game.orientation, IDENTITY);
  assert.equal(game.flipCount, 0);
  assert.deepEqual(game.getSnapshot(), fresh);
});

test('malformed saves reject invalid dimensions, orientation, pieces and numeric state atomically', () => {
  const game = new Game({ seed: 12 });
  game.hardDrop();
  game.flipContainer('left');
  const snapshot = game.getSnapshot();
  const mutations = [
    (value) => {
      value.version = 7;
    },
    (value) => {
      value.score = -2;
    },
    (value) => {
      value.flipCount = -1;
    },
    (value) => {
      value.dims = [6, 6, 12];
    },
    (value) => {
      value.orientation = structuredClone(IDENTITY);
    },
    (value) => {
      value.orientation = [
        [1, 0, 0],
        [1, 0, 0],
        [0, 0, 1],
      ];
    },
    (value) => {
      value.orientation = [
        [-1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ];
    },
    (value) => {
      value.orientation[0][0] = 0.5;
    },
    (value) => {
      value.gravity = { axis: 0, sign: -1 };
    },
    (value) => {
      value.board.push({ ...value.board[0], id: 999 });
    },
    (value) => {
      value.board[0].x = value.dims[0];
    },
    (value) => {
      value.serial = 0;
    },
    (value) => {
      value.active.pos[2] = -100;
    },
    (value) => {
      value.active.cells[1] = [...value.active.cells[0]];
    },
    (value) => {
      value.next = [];
    },
    (value) => {
      value.bag.push('nonexistent-shape');
    },
    (value) => {
      value.holdUsed = 'yes';
    },
    (value) => {
      value.held = { ...structuredClone(SHAPES[1]), pos: [0, 0, 0] };
    },
    (value) => {
      value.held = { ...structuredClone(SHAPES[1]), id: 'unknown' };
    },
  ];
  for (const mutate of mutations) {
    const malformed = structuredClone(snapshot);
    mutate(malformed);
    assert.throws(() => game.restore(malformed));
    assert.deepEqual(game.getSnapshot(), snapshot, 'failed restore leaves current game untouched');
  }
  const badLegacy = legacySnapshot();
  badLegacy.dims = [5, 6, 10];
  assert.throws(() => game.restore(badLegacy));
});

test('danger state survives v4 save and final game over disables all gameplay commands', () => {
  const game = new Game({ seed: 4 });
  game.board = plane(game.dims, 2, game.dims[2] - 1);
  game.serial = game.dims[0] * game.dims[1];
  game.spawn(game.active);
  const restored = new Game().restore(game.getSnapshot());
  assert.equal(restored.status, 'danger');
  assert.equal(restored.pending.id, game.pending.id);
  restored.end();
  assert.equal(restored.status, 'over');
  assert.equal(restored.flipContainer('left'), false);
  assert.equal(restored.rotate('XY'), false);
  assert.equal(restored.tick(), false);
  assert.equal(restored.move(0, 1), false);
  assert.equal(restored.hardDrop(), false);
  assert.equal(restored.hold(), false);
  assert.ok(restored.drainEvents().some((event) => event.type === 'over'));
  assert.deepEqual(restored.drainEvents(), []);
});

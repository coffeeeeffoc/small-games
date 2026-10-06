import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  SHAPES,
  DIRECTIONS,
  validateConfig,
  migrateConfig,
} from '../src/config.mjs';
import { Game, rotateCells, compactBoard, fullPlanes, resolveBoard } from '../src/engine.mjs';

const key = (cell) => cell.join(',');
const coordinates = (cell) => [cell.x, cell.y, cell.z];
const sorted = (cells) => cells.map(key).sort();
const configFor = (gravity = { axis: 2, sign: -1 }, shapes = SHAPES) => ({
  ...DEFAULT_CONFIG,
  shapes,
  initialGravity: gravity,
});
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

test('content schema validates connectivity, unique shape IDs and bounds', () => {
  assert.deepEqual(validateConfig(DEFAULT_CONFIG), []);
  assert.notEqual(migrateConfig(DEFAULT_CONFIG), DEFAULT_CONFIG);
  assert.ok(validateConfig({ ...DEFAULT_CONFIG, dims: [0, 5, 10] }).length);
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
    }
  assert.throws(() => rotateCells(SHAPES[0].cells, 'unknown'));
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

for (const gravity of DIRECTIONS) {
  const { axis, sign, short } = gravity;
  test(`${short}: spawn face, legal moves, obstacle ghost and hard drop agree`, () => {
    const game = new Game({ config: configFor({ axis, sign }), seed: 27 });
    const spawnCoords = game.cells().map((cell) => cell[axis]);
    assert.equal(
      sign < 0 ? Math.max(...spawnCoords) : Math.min(...spawnCoords),
      sign < 0 ? game.dims[axis] - 1 : 0,
    );
    assert.equal(game.move(axis, 1), false, 'movement never substitutes for falling');
    const free = [0, 1, 2].filter((a) => a !== axis);
    assert.equal(game.move(free[0], 1), true);
    const firstGhost = game.ghost();
    const floorCell = firstGhost.reduce((chosen, cell) =>
      (cell[axis] - chosen[axis]) * sign > 0 ? cell : chosen,
    );
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

  test(`${short}: compaction preserves cubes, column order and transverse coordinates`, () => {
    const dims = [5, 5, 10];
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
    const positionsAfter = compacted.map((cell) => coordinates(cell)[axis]);
    assert.deepEqual(
      positionsAfter,
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

  test(`${short}: only the complete plane perpendicular to gravity is removed`, () => {
    const dims = [5, 5, 10];
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
  const game = new Game({ config: configFor(undefined, [SHAPES[0]]), seed: 8 });
  for (const rotation of ['XZ', 'YZ', 'XY', 'XZ']) {
    assert.equal(game.rotate(rotation), true);
    assert.equal(game.fits(game.active), true);
    assert.equal(new Set(game.cells().map(key)).size, 4);
  }
});

test('clear-collapse-clear emits distinct snapshots and increasing combo rewards', () => {
  const dims = [5, 5, 10];
  const board = [...plane(dims, 2, 1), ...plane(dims, 2, 3, 26), cube(51, [1, 1, 7])];
  const result = resolveBoard(board, dims, { axis: 2, sign: -1 });
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
  assert.equal(clears[0].before.length, 51);
  assert.equal(clears[1].before.length, 26);
  result.board[0].z = 9;
  assert.equal(
    clears[0].before.find((cell) => cell.id === 51).z,
    7,
    'animation snapshots do not alias live board',
  );
});

test('gravity change compacts the actual board and retains the same active shape and queue', () => {
  const game = new Game({ seed: 303 });
  game.board = [cube(1, [3, 1, 1]), cube(2, [4, 1, 1]), cube(3, [4, 3, 6])];
  game.serial = 3;
  const shape = structuredClone(game.active.cells);
  const shapeName = game.active.name;
  const queue = structuredClone(game.next);
  assert.equal(game.changeGravity(0, -1), true);
  assert.deepEqual(
    game.board.map((cell) => cell.x),
    [0, 1, 0],
  );
  assert.deepEqual(game.active.cells, shape);
  assert.equal(game.active.name, shapeName);
  assert.deepEqual(game.next, queue);
  assert.equal(game.fits(game.active), true);
  assert.equal(game.changeGravity(0, -1), false);
  assert.equal(game.changeGravity(9, -1), false);
});

test('a blocked spawn enters danger and a real gravity intervention recovers the pending piece', () => {
  const game = new Game({ config: configFor(undefined, [SHAPES[1]]), seed: 7 });
  const retained = structuredClone(game.active);
  // A checkerboard on the spawn face prevents a 2×2 square but is not a full plane.
  let id = 0;
  game.board = [];
  for (let x = 0; x < 5; x++)
    for (let y = 0; y < 5; y++) if ((x + y) % 2 === 0) game.board.push(cube(++id, [x, y, 9]));
  game.serial = id;
  assert.equal(game.spawn(retained), false);
  assert.equal(game.status, 'danger');
  assert.equal(game.active, null);
  assert.equal(game.pending.id, retained.id);
  assert.equal(game.hardDrop(), false);
  assert.equal(game.changeGravity(2, 1), true);
  assert.equal(game.status, 'playing');
  assert.equal(game.active.id, retained.id);
  assert.equal(game.pending, null);
  assert.equal(game.fits(game.active), true);
});

test('a full container resolves by gravity and danger is not silently treated as game over', () => {
  const game = new Game({ seed: 33 });
  game.board = Array.from({ length: 10 }, (_, z) => plane(game.dims, 2, z, 1 + z * 25)).flat();
  game.serial = 250;
  assert.equal(game.spawn(game.active), false);
  assert.equal(game.status, 'danger');
  assert.equal(game.changeGravity(2, 1), true);
  assert.equal(game.lines, 10);
  assert.equal(game.bestCombo, 10);
  assert.equal(game.score, 250 * 55);
  assert.equal(game.status, 'playing');
  assert.equal(game.board.length, 0);
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

test('save/restore preserves queue, PRNG sequence, scores and future commands', () => {
  const game = new Game({ seed: 448 });
  game.hardDrop();
  game.move(1, 1);
  game.rotate('XZ');
  game.changeGravity(0, 1);
  const restored = new Game({ seed: 0 }).restore(game.getSnapshot());
  assert.deepEqual(restored.getSnapshot(), game.getSnapshot());
  assert.equal(restored.events.length, 0);
  for (let i = 0; i < 30; i++) assert.deepEqual(restored.drawShape(), game.drawShape());
  game.hardDrop();
  restored.hardDrop();
  assert.deepEqual(restored.getSnapshot(), game.getSnapshot());
  const snapshot = game.getSnapshot();
  snapshot.score = -2;
  assert.throws(() => restored.restore(snapshot));
  const overlap = game.getSnapshot();
  overlap.board.push({ ...overlap.board[0], id: 999 });
  assert.throws(() => restored.restore(overlap));
  assert.throws(() => restored.restore({ version: 7 }));
});

test('danger state survives a save and final game over disables gameplay', () => {
  const game = new Game({ seed: 4 });
  game.board = plane(game.dims, 2, 9);
  game.serial = 25;
  game.spawn(game.active);
  const restored = new Game().restore(game.getSnapshot());
  assert.equal(restored.status, 'danger');
  assert.equal(restored.pending.id, game.pending.id);
  restored.end();
  assert.equal(restored.status, 'over');
  assert.equal(restored.changeGravity(0, -1), false);
  assert.equal(restored.rotate('XY'), false);
  assert.equal(restored.tick(), false);
  assert.equal(restored.move(0, 1), false);
  assert.ok(restored.drainEvents().some((event) => event.type === 'over'));
  assert.deepEqual(restored.drainEvents(), []);
});

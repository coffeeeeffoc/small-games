import { DEFAULT_CONFIG, migrateConfig } from './config.mjs';

const AXES = ['x', 'y', 'z'];
const copy = (value) => structuredClone(value);
const boardCopy = (board) => board.map((cell) => ({ ...cell }));
const cellKey = (cell) => cell.join(',');
const validGravity = (gravity) =>
  [0, 1, 2].includes(gravity?.axis) && [-1, 1].includes(gravity?.sign);
const coord = (cell) => [cell.x, cell.y, cell.z];
const WORLD_DOWN = Object.freeze({ axis: 2, sign: -1 });
const IDENTITY = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const TURNS = {
  invert: { axis: 0, angle: Math.PI },
  left: { axis: 1, angle: -Math.PI / 2 },
  right: { axis: 1, angle: Math.PI / 2 },
  forward: { axis: 0, angle: Math.PI / 2 },
  back: { axis: 0, angle: -Math.PI / 2 },
};

/** Integer cell origins after a rigid rotation about the container's center. */
export function transformPoint([x, y, z], [width, depth, height], turn = 'invert') {
  switch (turn) {
    case 'invert':
      return [x, depth - 1 - y, height - 1 - z];
    case 'left':
      return [height - 1 - z, y, x];
    case 'right':
      return [z, y, width - 1 - x];
    case 'forward':
      return [x, height - 1 - z, y];
    case 'back':
      return [x, z, depth - 1 - y];
    default:
      throw new Error(`Unknown container turn: ${turn}`);
  }
}

function transformVector(vector, turn) {
  // Unit dimensions remove the affine offset, leaving the proper rotation matrix.
  return transformPoint(vector, [1, 1, 1], turn).map((value) => value || 0);
}

export function transformContainer(board, dims, turn = 'invert') {
  if (!Object.hasOwn(TURNS, turn)) throw new Error(`Unknown container turn: ${turn}`);
  const afterDims =
    turn === 'invert'
      ? [...dims]
      : turn === 'left' || turn === 'right'
        ? [dims[2], dims[1], dims[0]]
        : [dims[0], dims[2], dims[1]];
  return {
    board: board.map((cell) => {
      const [x, y, z] = transformPoint(coord(cell), dims, turn);
      return { ...cell, x, y, z };
    }),
    dims: afterDims,
    ...TURNS[turn],
  };
}

function transformPiece(piece, dims, turn) {
  if (!piece) return null;
  return {
    ...copy(piece),
    cells: piece.cells.map((cell) => transformVector(cell, turn)),
    ...(piece.pos ? { pos: transformPoint(piece.pos, dims, turn) } : {}),
  };
}

function orientedDimensions(orientation, baseDims) {
  return [0, 1, 2].map((axis) =>
    orientation.reduce((size, vector, local) => size + Math.abs(vector[axis]) * baseDims[local], 0),
  );
}

function validOrientation(orientation) {
  if (
    !Array.isArray(orientation) ||
    orientation.length !== 3 ||
    orientation.some(
      (v) =>
        !Array.isArray(v) ||
        v.length !== 3 ||
        !v.every((n) => [-1, 0, 1].includes(n)) ||
        v.reduce((sum, n) => sum + Math.abs(n), 0) !== 1,
    )
  )
    return false;
  const [a, b, c] = orientation;
  const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return cross.every((n, axis) => n === c[axis]);
}

function shapeKey(cells) {
  const min = [0, 1, 2].map((axis) => Math.min(...cells.map((cell) => cell[axis])));
  return cells
    .map((cell) => cell.map((v, axis) => v - min[axis]).join(','))
    .sort()
    .join(';');
}

function shapeOrientations(cells) {
  const queue = [cells],
    seen = new Set();
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i],
      key = shapeKey(current);
    if (seen.has(key)) continue;
    seen.add(key);
    for (const plane of ['XY', 'XZ', 'YZ']) queue.push(rotateCells(current, plane));
  }
  return seen;
}

function validateSnapshot(value, config) {
  const legacy = value?.version === 1;
  if (
    (!legacy && value?.version !== 2) ||
    value.configId !== config.id ||
    !validGravity(value.gravity) ||
    !['playing', 'danger', 'over'].includes(value.status)
  )
    throw new Error('Incompatible tetracube save.');
  if (legacy) {
    if (JSON.stringify(value.dims) !== '[5,5,10]') throw new Error('Invalid legacy container.');
  } else if (
    value.gravity.axis !== 2 ||
    value.gravity.sign !== -1 ||
    !validOrientation(value.orientation) ||
    JSON.stringify(value.dims) !==
      JSON.stringify(orientedDimensions(value.orientation, config.dims))
  ) {
    throw new Error('Invalid saved container orientation.');
  }
  const { dims } = value;
  if (
    !Array.isArray(value.board) ||
    value.board.length > dims.reduce((a, b) => a * b, 1) ||
    value.board.some(
      (cell) =>
        !cell ||
        !Number.isSafeInteger(cell.id) ||
        cell.id < 1 ||
        !/^#[a-f0-9]{6}$/i.test(cell.color ?? '') ||
        coord(cell).some((v, axis) => !Number.isInteger(v) || v < 0 || v >= dims[axis]),
    ) ||
    new Set(value.board.map((cell) => cellKey(coord(cell)))).size !== value.board.length ||
    new Set(value.board.map((cell) => cell.id)).size !== value.board.length
  )
    throw new Error('Invalid saved board.');
  const orientations = new Map(
    config.shapes.map((shape) => [shape.id, shapeOrientations(shape.cells)]),
  );
  const validPiece = (piece) =>
    piece &&
    orientations.has(piece.id) &&
    typeof piece.name === 'string' &&
    /^#[a-f0-9]{6}$/i.test(piece.color ?? '') &&
    Array.isArray(piece.cells) &&
    piece.cells.length === 4 &&
    piece.cells.every(
      (cell) =>
        Array.isArray(cell) &&
        cell.length === 3 &&
        cell.every((v) => Number.isInteger(v) && Math.abs(v) <= 3),
    ) &&
    new Set(piece.cells.map(cellKey)).size === 4 &&
    orientations.get(piece.id).has(shapeKey(piece.cells));
  if (
    !Array.isArray(value.next) ||
    value.next.length !== config.previewCount ||
    !value.next.every(validPiece) ||
    !Array.isArray(value.bag) ||
    new Set(value.bag).size !== value.bag.length ||
    value.bag.some((id) => !orientations.has(id))
  )
    throw new Error('Invalid saved piece queue.');
  for (const field of [
    'score',
    'lines',
    'combo',
    'bestCombo',
    'placed',
    'serial',
    'rngState',
    'initialSeed',
    legacy ? 'gravityChanges' : 'flipCount',
  ]) {
    if (!Number.isSafeInteger(value[field]) || value[field] < 0)
      throw new Error(`Invalid saved ${field}.`);
  }
  if (
    value.rngState > 0xffffffff ||
    value.initialSeed > 0xffffffff ||
    value.combo > value.bestCombo ||
    value.bestCombo > value.lines ||
    value.board.some((cell) => cell.id > value.serial) ||
    (value.active &&
      (!validPiece(value.active) ||
        !Array.isArray(value.active.pos) ||
        value.active.pos.length !== 3 ||
        !value.active.pos.every(Number.isInteger))) ||
    (value.pending && !validPiece(value.pending)) ||
    (value.active && value.pending) ||
    (value.status === 'playing' && !value.active) ||
    (value.status === 'danger' && (!value.pending || value.active))
  )
    throw new Error('Invalid saved active piece or counters.');
  if (value.active) {
    const occupied = new Set(value.board.map((cell) => cellKey(coord(cell))));
    const cells = value.active.cells.map((cell) =>
      cell.map((v, axis) => v + value.active.pos[axis]),
    );
    if (
      cells.some(
        (cell) => cell.some((v, axis) => v < 0 || v >= dims[axis]) || occupied.has(cellKey(cell)),
      )
    )
      throw new Error('Saved active piece collides with the board.');
  }
}

function migrateSnapshot(snapshot, config) {
  const value = copy(snapshot);
  validateSnapshot(value, config);
  if (value.version === 1) {
    const { axis, sign } = value.gravity;
    const turn =
      axis === 2
        ? sign > 0
          ? 'invert'
          : null
        : axis === 0
          ? sign < 0
            ? 'left'
            : 'right'
          : sign < 0
            ? 'forward'
            : 'back';
    value.orientation = copy(IDENTITY);
    if (turn) {
      const beforeDims = value.dims;
      value.board = transformContainer(value.board, beforeDims, turn).board;
      value.active = transformPiece(value.active, beforeDims, turn);
      value.pending = transformPiece(value.pending, beforeDims, turn);
      value.orientation = value.orientation.map((vector) => transformVector(vector, turn));
    }
    // Add room at each positive face. Existing cubes and the airborne piece retain
    // their exact normalized positions; migration cannot score or discard a cube.
    value.dims = orientedDimensions(value.orientation, config.dims);
    value.gravity = { ...WORLD_DOWN };
    value.flipCount = value.gravityChanges;
    delete value.gravityChanges;
    value.version = 2;
    validateSnapshot(value, config);
  }
  return value;
}

export function rotateCells(cells, plane) {
  const axes = { XY: [0, 1], XZ: [0, 2], YZ: [1, 2] }[String(plane).toUpperCase()];
  if (!axes) throw new Error(`Unknown rotation plane: ${plane}`);
  const [a, b] = axes;
  return cells.map((cell) => {
    const rotated = [...cell];
    rotated[a] = cell[b];
    rotated[b] = -cell[a] || 0;
    return rotated;
  });
}

/** Stable column compaction. Cubes move independently; IDs and relative ordering survive. */
export function compactBoard(board, dims, gravity) {
  const { axis, sign } = gravity;
  if (!validGravity(gravity)) throw new Error('Invalid gravity.');
  const key = AXES[axis];
  const perpendicular = AXES.filter((_, i) => i !== axis);
  const columns = new Map();
  for (const cell of board) {
    const columnKey = perpendicular.map((a) => cell[a]).join(',');
    if (!columns.has(columnKey)) columns.set(columnKey, []);
    columns.get(columnKey).push(cell);
  }
  const positions = new Map();
  for (const column of columns.values()) {
    column.sort((a, b) => (a[key] - b[key]) * -sign);
    column.forEach((cell, i) => positions.set(cell.id, sign < 0 ? i : dims[axis] - 1 - i));
  }
  return board.map((cell) => ({ ...cell, [key]: positions.get(cell.id) }));
}

export function fullPlanes(board, dims, gravity) {
  const counts = Array(dims[gravity.axis]).fill(0);
  for (const cell of board) counts[cell[AXES[gravity.axis]]]++;
  const area = dims.reduce(
    (total, size, axis) => (axis === gravity.axis ? total : total * size),
    1,
  );
  return counts
    .flatMap((count, layer) => (count === area ? [layer] : []))
    .sort((a, b) => (a - b) * -gravity.sign);
}

/** Return each collapse/clear wave so a renderer can animate the already-resolved result. */
export function resolveBoard(
  board,
  dims,
  gravity,
  { compactFirst = false, planePoints = 250, startCombo = 0 } = {},
) {
  let current = boardCopy(board);
  const events = [];
  let lines = 0;
  let combo = startCombo;
  let points = 0;
  const compact = () => {
    const after = compactBoard(current, dims, gravity);
    if (current.some((cell, i) => AXES.some((axis) => cell[axis] !== after[i][axis]))) {
      events.push({
        type: 'compact',
        before: boardCopy(current),
        after: boardCopy(after),
        gravity: { ...gravity },
      });
      current = after;
    }
  };
  if (compactFirst) compact();
  // Clear from the gravity floor one plane at a time. A stack of complete planes
  // therefore has a readable clear → collapse → clear cadence and combo reward.
  while (true) {
    const plane = fullPlanes(current, dims, gravity)[0];
    if (plane === undefined) break;
    const before = boardCopy(current);
    const removed = current.filter((cell) => cell[AXES[gravity.axis]] === plane);
    current = current.filter((cell) => cell[AXES[gravity.axis]] !== plane);
    combo++;
    lines++;
    const earned = planePoints * combo;
    points += earned;
    events.push({
      type: 'clear',
      before,
      after: boardCopy(current),
      removed: boardCopy(removed),
      plane,
      planes: [plane],
      axis: gravity.axis,
      combo,
      points: earned,
    });
    compact();
  }
  return { board: current, events, lines, combo, points };
}

/** DOM-free integer grid simulation. Commands resolve synchronously and append events. */
export class Game {
  constructor({
    config = DEFAULT_CONFIG,
    rng,
    seed = Math.floor(Math.random() * 0x100000000),
  } = {}) {
    this.config = migrateConfig(config);
    this.dims = [...this.config.dims];
    this.externalRng = rng;
    this.initialSeed = seed >>> 0;
    this.reset();
  }

  random() {
    if (this.externalRng) return Math.min(1 - Number.EPSILON, Math.max(0, this.externalRng()));
    // Mulberry32 state is persisted, so a reload preserves future bag order too.
    this.rngState = (this.rngState + 0x6d2b79f5) >>> 0;
    let value = this.rngState;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  }

  reset() {
    this.dims = [...this.config.dims];
    this.orientation = copy(IDENTITY);
    this.board = [];
    this.active = null;
    this.pending = null;
    this.next = [];
    this.bag = [];
    this.gravity = WORLD_DOWN;
    this.rngState = this.initialSeed;
    this.score = this.lines = this.combo = this.bestCombo = this.placed = 0;
    this.flipCount = 0;
    this.serial = 0;
    this.status = 'playing';
    this.events = [];
    this.refillQueue();
    this.spawn();
    return this;
  }

  get fallInterval() {
    return Math.max(
      this.config.minFallInterval,
      this.config.fallInterval -
        Math.floor(this.placed / this.config.speedEvery) * this.config.speedStep,
    );
  }

  drawShape() {
    if (!this.bag.length) {
      this.bag = this.config.shapes.map((shape) => shape.id);
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    const id = this.bag.shift();
    return copy(this.config.shapes.find((shape) => shape.id === id));
  }

  refillQueue() {
    while (this.next.length < this.config.previewCount) this.next.push(this.drawShape());
  }

  cells(piece = this.active) {
    if (!piece) return [];
    return piece.cells.map((cell) => cell.map((value, axis) => value + piece.pos[axis]));
  }

  fits(piece) {
    const occupied = new Set(this.board.map((cell) => cellKey(coord(cell))));
    const cells = this.cells(piece);
    return (
      cells.length > 0 &&
      new Set(cells.map(cellKey)).size === cells.length &&
      cells.every(
        (cell) =>
          cell.every((v, axis) => Number.isInteger(v) && v >= 0 && v < this.dims[axis]) &&
          !occupied.has(cellKey(cell)),
      )
    );
  }

  spawn(shape = null) {
    if (!shape) {
      shape = this.pending ?? this.next.shift();
      this.refillQueue();
    }
    this.pending = copy(shape);
    delete this.pending.pos;
    const min = [0, 1, 2].map((axis) => Math.min(...shape.cells.map((cell) => cell[axis])));
    const max = [0, 1, 2].map((axis) => Math.max(...shape.cells.map((cell) => cell[axis])));
    const { axis, sign } = this.gravity;
    const free = [0, 1, 2].filter((a) => a !== axis);
    const middle = this.dims.map((size, a) => Math.floor((size - 1 - min[a] - max[a]) / 2));
    const positions = [];
    for (let a = -min[free[0]]; a < this.dims[free[0]] - max[free[0]]; a++) {
      for (let b = -min[free[1]]; b < this.dims[free[1]] - max[free[1]]; b++) {
        const pos = [...middle];
        pos[axis] = sign < 0 ? this.dims[axis] - 1 - max[axis] : -min[axis];
        pos[free[0]] = a;
        pos[free[1]] = b;
        positions.push(pos);
      }
    }
    positions.sort((a, b) =>
      free.reduce(
        (sum, ax) => sum + Math.abs(a[ax] - middle[ax]) - Math.abs(b[ax] - middle[ax]),
        0,
      ),
    );
    for (const pos of positions) {
      const piece = { ...copy(shape), pos };
      if (this.fits(piece)) {
        this.active = piece;
        this.pending = null;
        this.status = 'playing';
        this.events.push({ type: 'spawn', piece: copy(piece), gravity: { ...this.gravity } });
        return true;
      }
    }
    this.active = null;
    this.status = 'danger';
    this.events.push({ type: 'danger', piece: copy(this.pending) });
    return false;
  }

  ghost() {
    if (!this.active) return [];
    const piece = copy(this.active);
    const { axis, sign } = this.gravity;
    while (true) {
      piece.pos[axis] += sign;
      if (!this.fits(piece)) {
        piece.pos[axis] -= sign;
        break;
      }
    }
    return this.cells(piece);
  }

  move(axis, delta) {
    if (
      this.status !== 'playing' ||
      !this.active ||
      ![0, 1, 2].includes(axis) ||
      axis === this.gravity.axis ||
      ![-1, 1].includes(delta)
    )
      return false;
    const piece = copy(this.active);
    piece.pos[axis] += delta;
    if (!this.fits(piece)) return false;
    this.active = piece;
    this.events.push({ type: 'move', axis, delta });
    return true;
  }

  rotate(plane) {
    if (this.status !== 'playing' || !this.active) return false;
    const piece = { ...copy(this.active), cells: rotateCells(this.active.cells, plane) };
    const axes = [0, 1, 2].filter((axis) => axis !== this.gravity.axis).concat(this.gravity.axis);
    const kicks = [[0, 0, 0]];
    for (const distance of [1, -1, 2, -2])
      for (const axis of axes) {
        const kick = [0, 0, 0];
        kick[axis] = distance;
        kicks.push(kick);
      }
    for (const kick of kicks) {
      piece.pos = this.active.pos.map((value, axis) => value + kick[axis]);
      if (this.fits(piece)) {
        this.active = piece;
        this.events.push({ type: 'rotate', plane: String(plane).toUpperCase(), kick });
        return true;
      }
    }
    return false;
  }

  tick() {
    if (this.status !== 'playing' || !this.active) return false;
    const piece = copy(this.active);
    piece.pos[this.gravity.axis] += this.gravity.sign;
    if (this.fits(piece)) {
      this.active = piece;
      return true;
    }
    this.lock();
    return true;
  }

  hardDrop() {
    if (this.status !== 'playing' || !this.active) return false;
    const landing = this.ghost();
    const distance = Math.abs(landing[0][this.gravity.axis] - this.cells()[0][this.gravity.axis]);
    const from = this.cells();
    this.active.pos[this.gravity.axis] += distance * this.gravity.sign;
    this.score += distance * this.config.points.drop;
    this.events.push({ type: 'drop', from, to: landing, distance });
    this.lock();
    return true;
  }

  lock() {
    if (this.status !== 'playing' || !this.active || !this.fits(this.active)) return false;
    const before = boardCopy(this.board);
    const added = this.cells().map(([x, y, z]) => ({
      id: ++this.serial,
      x,
      y,
      z,
      color: this.active.color,
    }));
    this.board.push(...added);
    this.active = null;
    this.placed++;
    this.score += added.length * this.config.points.cell;
    this.events.push({
      type: 'lock',
      before,
      after: boardCopy(this.board),
      added: boardCopy(added),
    });
    this.resolve();
    this.spawn();
    return true;
  }

  resolve({ compactFirst = false } = {}) {
    const result = resolveBoard(this.board, this.dims, this.gravity, {
      compactFirst,
      planePoints: this.config.points.plane,
      startCombo: this.combo,
    });
    this.board = result.board;
    this.score += result.points;
    this.lines += result.lines;
    // Consecutive successful placements or container turns continue a combo.
    this.combo = result.lines ? result.combo : 0;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.events.push(...result.events);
    return result;
  }

  flipContainer(turn = 'invert') {
    if (this.status === 'over' || !Object.hasOwn(TURNS, turn)) return false;
    if (this.active) {
      if (!this.fits(this.active)) return false;
      // The airborne tetracube is inside the box too. Commit its current pose,
      // then rotate it with every settled cube before world-down settling starts.
      const added = this.cells().map(([x, y, z]) => ({
        id: ++this.serial,
        x,
        y,
        z,
        color: this.active.color,
      }));
      this.board.push(...added);
      this.active = null;
      this.placed++;
      this.score += added.length * this.config.points.cell;
    }
    const before = boardCopy(this.board);
    const beforeDims = [...this.dims];
    const beforeOrientation = copy(this.orientation);
    const transformed = transformContainer(before, beforeDims, turn);
    this.board = transformed.board;
    this.dims = transformed.dims;
    this.orientation = this.orientation.map((vector) => transformVector(vector, turn));
    this.gravity = WORLD_DOWN;
    this.flipCount++;
    this.events.push({
      type: 'flip',
      turn,
      axis: transformed.axis,
      angle: transformed.angle,
      before,
      after: boardCopy(this.board),
      beforeDims,
      beforeOrientation,
      afterDims: [...this.dims],
      orientation: copy(this.orientation),
    });
    this.resolve({ compactFirst: true });
    // spawn() reuses a blocked pending piece; otherwise it consumes the next one.
    this.spawn();
    return true;
  }

  end() {
    this.status = 'over';
    this.events.push({
      type: 'over',
      score: this.score,
      lines: this.lines,
      bestCombo: this.bestCombo,
    });
  }

  drainEvents() {
    return this.events.splice(0);
  }

  getSnapshot() {
    return copy({
      version: 2,
      configId: this.config.id,
      dims: this.dims,
      board: this.board,
      active: this.active,
      pending: this.pending,
      next: this.next,
      bag: this.bag,
      gravity: this.gravity,
      score: this.score,
      lines: this.lines,
      combo: this.combo,
      bestCombo: this.bestCombo,
      placed: this.placed,
      flipCount: this.flipCount,
      orientation: this.orientation,
      serial: this.serial,
      rngState: this.rngState,
      initialSeed: this.initialSeed,
      status: this.status,
    });
  }

  restore(snapshot) {
    const value = migrateSnapshot(snapshot, this.config);
    for (const field of [
      'dims',
      'orientation',
      'board',
      'active',
      'pending',
      'next',
      'bag',
      'score',
      'lines',
      'combo',
      'bestCombo',
      'placed',
      'flipCount',
      'serial',
      'rngState',
      'initialSeed',
      'status',
    ])
      this[field] = value[field];
    this.gravity = WORLD_DOWN;
    this.events = [];
    return this;
  }
}

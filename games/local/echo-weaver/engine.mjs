/**
 * A deterministic, discrete acoustic grid. One orthogonal cell costs one tick;
 * Web Audio and animation only replay this trace, never decide the outcome.
 * Splitters subtract splitterLoss, then send half the remaining energy straight
 * and half around the reflected corner (no additional reflectionLoss).
 */

const DIRECTIONS = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
};
const REFLECTION = {
  '/': { N: 'E', E: 'N', S: 'W', W: 'S' },
  '\\': { N: 'W', E: 'S', S: 'E', W: 'N' },
};
const TYPES = new Set(['mirror', 'splitter', 'delay']);
const MAX_BRANCHES = 24;
const key = ({ x, y }) => `${x},${y}`;
const point = ({ x, y }) => ({ x, y });
const inBounds = (level, x, y) =>
  Number.isInteger(x) &&
  Number.isInteger(y) &&
  x >= 0 &&
  x < level.cols &&
  y >= 0 &&
  y < level.rows;
const sameCell = (a, b) => a?.x === b?.x && a?.y === b?.y;
const inTray = (piece) => piece.x === null && piece.y === null;
const arrayOf = (value) => (Array.isArray(value) ? value : []);

/** Schema/geometry diagnostics for authors. Solutions are not part of physics. */
export function validateLevel(level) {
  if (!level || typeof level !== 'object') return ['Level must be an object.'];
  const errors = [];
  if (typeof level.id !== 'string' || !level.id) errors.push('Level requires a string id.');
  for (const field of ['cols', 'rows', 'ticksPerBeat', 'maxTicks']) {
    if (!Number.isInteger(level[field]) || level[field] <= 0)
      errors.push(`${field} must be a positive integer.`);
  }
  for (const field of ['beatMs', 'sourceEnergy', 'minEnergy']) {
    if (!Number.isFinite(level[field]) || level[field] <= 0)
      errors.push(`${field} must be positive.`);
  }
  for (const field of ['travelLoss', 'reflectionLoss', 'splitterLoss', 'delayLoss']) {
    if (!Number.isFinite(level[field]) || level[field] < 0)
      errors.push(`${field} must be nonnegative.`);
  }
  if (level.sourceEnergy < level.minEnergy) errors.push('sourceEnergy must reach minEnergy.');
  if (
    !Array.isArray(level.targets) ||
    level.targets.length < 1 ||
    level.targets.some(
      (tick, i, targets) =>
        !Number.isInteger(tick) ||
        tick <= 0 ||
        tick > level.maxTicks ||
        (i > 0 && tick <= targets[i - 1]),
    )
  ) {
    errors.push('Targets must be increasing positive integer ticks within maxTicks.');
  }
  const occupied = new Map();
  const occupy = (item, label) => {
    if (!item || !inBounds(level, item.x, item.y)) {
      errors.push(`${label} must be inside the grid.`);
      return;
    }
    const cell = key(item);
    if (occupied.has(cell)) errors.push(`${label} overlaps ${occupied.get(cell)} at ${cell}.`);
    else occupied.set(cell, label);
  };
  occupy(level.source, 'Source');
  occupy(level.receiver, 'Receiver');
  if (!Object.hasOwn(DIRECTIONS, level.source?.dir))
    errors.push('Source requires N, E, S, or W direction.');
  for (const name of ['walls', 'absorbers', 'fixed', 'inventory']) {
    if (!Array.isArray(level[name])) errors.push(`${name} must be an array.`);
  }
  for (const [i, wall] of arrayOf(level.walls).entries()) occupy(wall, `Wall ${i}`);
  // Absorption is a floor property: a movable or fixed piece can sit on it.
  const absorberCells = new Set();
  for (const [i, absorber] of arrayOf(level.absorbers).entries()) {
    if (!absorber || !inBounds(level, absorber.x, absorber.y))
      errors.push(`Absorber ${i} must be inside the grid.`);
    else {
      const cell = key(absorber);
      if (absorberCells.has(cell) || occupied.has(cell))
        errors.push(`Absorber ${i} overlaps another terrain feature at ${cell}.`);
      absorberCells.add(cell);
    }
    if (!Number.isFinite(absorber?.loss) || absorber.loss < 0)
      errors.push(`Absorber ${i} requires nonnegative loss.`);
  }
  const ids = new Set();
  for (const [kind, pieces] of [
    ['fixed', arrayOf(level.fixed)],
    ['inventory', arrayOf(level.inventory)],
  ]) {
    for (const piece of pieces) {
      if (!piece || typeof piece.id !== 'string' || !piece.id || ids.has(piece.id))
        errors.push('Piece ids must be present and unique.');
      ids.add(piece?.id);
      if (!TYPES.has(piece?.type)) errors.push(`${piece?.id || 'Piece'} has an invalid type.`);
      if (piece?.type === 'delay') {
        if (!Number.isInteger(piece.delayTicks) || piece.delayTicks <= 0)
          errors.push(`${piece.id} delayTicks must be a positive integer.`);
      } else if (!Object.hasOwn(REFLECTION, piece?.orientation))
        errors.push(`${piece?.id || 'Piece'} requires / or \\ orientation.`);
      if (kind === 'inventory' && piece && inTray(piece)) continue;
      occupy(piece, `Piece ${piece?.id}`);
    }
  }
  return errors;
}

function assertLevel(level) {
  const errors = validateLevel(level);
  if (errors.length) throw new TypeError(`Invalid Echo Weaver level: ${errors.join(' ')}`);
}

/** A fresh, serializable setup, independent of the authored inventory. */
export function createState(level) {
  assertLevel(level);
  return { pieces: level.inventory.map((piece) => ({ ...piece })) };
}

/** Occupancy is checked for the selected piece, so dragging it to itself is safe. */
export function canPlace(level, state, id, x, y) {
  if (
    !inBounds(level, x, y) ||
    !state?.pieces?.some((piece) => piece.id === id) ||
    !level.inventory.some((piece) => piece.id === id)
  )
    return false;
  const target = { x, y };
  return ![
    level.source,
    level.receiver,
    ...level.walls,
    ...level.fixed,
    ...state.pieces.filter((piece) => piece.id !== id),
  ].some((item) => sameCell(item, target));
}

export function placePiece(level, state, id, x, y) {
  if (!canPlace(level, state, id, x, y)) return state;
  if (state.pieces.some((piece) => piece.id === id && piece.x === x && piece.y === y)) return state;
  return {
    ...state,
    pieces: state.pieces.map((piece) => (piece.id === id ? { ...piece, x, y } : piece)),
  };
}

export function rotatePiece(level, state, id) {
  const piece = state.pieces.find((item) => item.id === id);
  if (!level.inventory.some((item) => item.id === id) || !piece || piece.type === 'delay')
    return state;
  return {
    ...state,
    pieces: state.pieces.map((item) =>
      item.id === id ? { ...item, orientation: item.orientation === '/' ? '\\' : '/' } : item,
    ),
  };
}

export function removePiece(level, state, id) {
  const piece = state.pieces.find((item) => item.id === id);
  if (!level.inventory.some((item) => item.id === id) || !piece || inTray(piece)) return state;
  return {
    ...state,
    pieces: state.pieces.map((item) => (item.id === id ? { ...item, x: null, y: null } : item)),
  };
}

function assertState(level, state) {
  if (!Array.isArray(state?.pieces) || state.pieces.length !== level.inventory.length)
    throw new TypeError('State must contain every inventory piece.');
  const seen = new Set();
  for (const piece of state.pieces) {
    const authored = level.inventory.find((item) => item.id === piece?.id);
    if (
      !authored ||
      seen.has(piece.id) ||
      authored.type !== piece.type ||
      authored.delayTicks !== piece.delayTicks
    )
      throw new TypeError('State has unknown, duplicate, or modified inventory pieces.');
    seen.add(piece.id);
    if (piece.type !== 'delay' && !Object.hasOwn(REFLECTION, piece.orientation))
      throw new TypeError(`Invalid orientation for ${piece.id}.`);
    if (!inTray(piece) && !canPlace(level, state, piece.id, piece.x, piece.y))
      throw new TypeError(`Invalid placement for ${piece.id}.`);
  }
}

/**
 * Return the whole trace in simulation ticks. A branch keeps its identity when
 * transmitted through a splitter; the reflected child receives the next id.
 * Every emitted branch must arrive at its own exact target. Lost branches and
 * unsolicited arrivals cannot be hidden to pass a puzzle.
 */
export function simulate(level, state) {
  assertLevel(level);
  assertState(level, state);
  const pieces = new Map(
    [...level.fixed, ...state.pieces.filter((piece) => !inTray(piece))].map((piece) => [
      key(piece),
      piece,
    ]),
  );
  const walls = new Set(level.walls.map(key));
  const absorbers = new Map(level.absorbers.map((absorber) => [key(absorber), absorber.loss]));
  const segments = [];
  const arrivals = [];
  const failures = [];
  let emittedBranches = 1;
  const active = [
    {
      ...point(level.source),
      dir: level.source.dir,
      tick: 0,
      energy: level.sourceEnergy,
      branchId: 0,
      colorIndex: 0,
      visited: new Set(),
    },
  ];
  const fail = (packet, reason) =>
    failures.push({
      reason,
      energy: Math.max(0, packet.energy),
      ...point(packet),
      tick: packet.tick,
      branchId: packet.branchId,
      colorIndex: packet.colorIndex,
    });
  while (active.length) {
    active.sort((a, b) => a.tick - b.tick || a.branchId - b.branchId);
    const packet = active.shift();
    if (packet.tick >= level.maxTicks) {
      fail(packet, 'overload');
      continue;
    }
    const delta = DIRECTIONS[packet.dir];
    const next = {
      ...packet,
      x: packet.x + delta.x,
      y: packet.y + delta.y,
      tick: packet.tick + 1,
      energy: packet.energy - level.travelLoss,
    };
    segments.push({
      branchId: packet.branchId,
      colorIndex: packet.colorIndex,
      from: point(packet),
      to: point(next),
      start: packet.tick,
      end: next.tick,
      energy: Math.max(0, next.energy),
      kind: 'travel',
    });
    if (!inBounds(level, next.x, next.y)) {
      fail(next, 'escaped');
      continue;
    }
    if (walls.has(key(next))) {
      fail(next, 'wall');
      continue;
    }
    if (sameCell(next, level.source)) {
      fail(next, 'source');
      continue;
    }
    next.energy -= absorbers.get(key(next)) || 0;
    if (next.energy < level.minEnergy) {
      fail(next, 'weak');
      continue;
    }
    if (sameCell(next, level.receiver)) {
      arrivals.push({
        tick: next.tick,
        energy: next.energy,
        branchId: next.branchId,
        colorIndex: next.colorIndex,
        matched: false,
        targetIndex: -1,
      });
      continue;
    }
    const visitKey = `${key(next)},${next.dir}`;
    if (next.visited.has(visitKey)) {
      fail(next, 'loop');
      continue;
    }
    next.visited.add(visitKey);
    const piece = pieces.get(key(next));
    if (!piece) {
      active.push(next);
      continue;
    }
    if (piece.type === 'mirror') {
      next.energy -= level.reflectionLoss;
      next.dir = REFLECTION[piece.orientation][next.dir];
      if (next.energy < level.minEnergy) fail(next, 'weak');
      else active.push(next);
    } else if (piece.type === 'delay') {
      const end = Math.min(level.maxTicks, next.tick + piece.delayTicks);
      const held = end - next.tick;
      segments.push({
        branchId: next.branchId,
        colorIndex: next.colorIndex,
        from: point(next),
        to: point(next),
        start: next.tick,
        end,
        energy: next.energy,
        kind: 'hold',
        pieceId: piece.id,
      });
      next.tick = end;
      next.energy -= held * level.delayLoss;
      if (next.energy < level.minEnergy) fail(next, 'weak');
      else if (next.tick >= level.maxTicks) fail(next, 'overload');
      else active.push(next);
    } else {
      if (emittedBranches >= MAX_BRANCHES) {
        fail(next, 'overload');
        continue;
      }
      const child = {
        ...next,
        dir: REFLECTION[piece.orientation][next.dir],
        branchId: emittedBranches,
        colorIndex: emittedBranches % 3,
        visited: new Set(next.visited),
      };
      emittedBranches += 1;
      next.energy = (next.energy - level.splitterLoss) / 2;
      child.energy = next.energy;
      for (const outgoing of [next, child]) {
        if (outgoing.energy < level.minEnergy) fail(outgoing, 'weak');
        else active.push(outgoing);
      }
    }
  }
  arrivals.sort((a, b) => a.tick - b.tick || a.branchId - b.branchId);
  failures.sort((a, b) => a.tick - b.tick || a.branchId - b.branchId);
  segments.sort((a, b) => a.start - b.start || a.branchId - b.branchId);
  const targetResults = level.targets.map((target, targetIndex) => {
    const arrival = arrivals.find((item) => !item.matched && item.tick === target);
    if (arrival) {
      arrival.matched = true;
      arrival.targetIndex = targetIndex;
    }
    return { target, arrival: arrival || null, status: arrival ? 'hit' : 'miss' };
  });
  const won =
    failures.length === 0 &&
    arrivals.length === level.targets.length &&
    targetResults.every((target) => target.status === 'hit');
  const duration = Math.max(
    1,
    level.targets.at(-1) + 1,
    ...segments.map((segment) => segment.end),
    ...failures.map((failure) => failure.tick),
  );
  return { won, duration, segments, arrivals, failures, targetResults, emittedBranches };
}

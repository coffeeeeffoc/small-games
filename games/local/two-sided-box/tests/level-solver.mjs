/**
 * Independent exhaustive state search. It does not import the engine or the
 * authored walkthrough. Visibility only limits which controls can be operated;
 * choosing among allowed faces is free. Re-engaging a latch cannot help any
 * condition in this rule set, so we retain only its dominating unlocked state.
 * Likewise, passing an open gate never prevents later operations: each state
 * is advanced to its furthest currently reachable checkpoint before expansion.
 */
export function solveIndependently(
  level,
  { allowedFaces = ['front', 'back', 'top', 'bottom', 'left', 'right'] } = {},
) {
  const shaftIndices = new Map(level.shafts.map((shaft, index) => [shaft.id, index]));
  const powers = level.shafts.map((_, index) => 3 ** index);
  const positionCount = 3 ** level.shafts.length;
  const lockCount = 2 ** level.latches.length;
  const checkpointCount = level.checkpoints.length + 1;
  const stateCount = positionCount * lockCount * checkpointCount;
  const visited = new Uint8Array(stateCount);
  const parents = new Int32Array(stateCount).fill(-1);
  const operations = new Int16Array(stateCount).fill(-1);
  const queue = new Uint32Array(stateCount);
  const gates = new Map(level.gates.map((gate) => [gate.id, gate]));
  const locksFor = level.shafts.map((shaft) =>
    level.latches.reduce(
      (mask, latch, index) => (latch.shaft === shaft.id ? mask | (1 << index) : mask),
      0,
    ),
  );
  const allowedShafts = level.shafts.map((shaft) => allowedFaces.includes(shaft.face));
  const allowedLocks = level.latches.map((latch) => allowedFaces.includes(latch.face));
  const valueAt = (code, index) => Math.floor(code / powers[index]) % 3;
  const isOpen = (gate, positionCode) => {
    const shaftIndex = shaftIndices.get(gate.shaft);
    const shaft = level.shafts[shaftIndex];
    const position = valueAt(positionCode, shaftIndex);
    const point = level.path[gate.pathIndex];
    // Independently measure the sphere's distance from every actual aperture.
    return gate.aperture.offsets.some((offset) => {
      const delta = point.map(
        (coordinate, axis) =>
          coordinate -
          gate.center[axis] -
          shaft.slideAxis[axis] * (position * gate.travel - offset),
      );
      const normalDistance = delta.reduce(
        (sum, component, axis) => sum + component * gate.normal[axis],
        0,
      );
      const inPlane = delta.map(
        (component, axis) => component - normalDistance * gate.normal[axis],
      );
      return Math.hypot(...inPlane) + 8 <= gate.aperture.radius + 1e-7;
    });
  };
  const advance = (positionCode, checkpoint) => {
    while (
      checkpoint < level.checkpoints.length &&
      level.checkpoints[checkpoint].gateIds.every((id) => isOpen(gates.get(id), positionCode))
    )
      checkpoint += 1;
    return checkpoint;
  };
  const encode = (positionCode, locks, checkpoint) =>
    (checkpoint * lockCount + locks) * positionCount + positionCode;
  const decode = (key) => ({
    positions: key % positionCount,
    locks: Math.floor(key / positionCount) % lockCount,
    checkpoint: Math.floor(key / (positionCount * lockCount)),
  });
  const initialPositions = level.shafts.reduce(
    (sum, shaft, index) => sum + shaft.initial * powers[index],
    0,
  );
  const initialLocks = level.latches.reduce(
    (mask, latch, index) => (latch.initial ? mask | (1 << index) : mask),
    0,
  );
  const initial = encode(initialPositions, initialLocks, advance(initialPositions, 0));
  visited[initial] = 1;
  queue[0] = initial;
  let length = 1;
  const enqueue = (positions, locks, checkpoint, parent, operation) => {
    const next = encode(positions, locks, advance(positions, checkpoint));
    if (visited[next]) return;
    visited[next] = 1;
    parents[next] = parent;
    operations[next] = operation;
    queue[length++] = next;
  };
  for (let cursor = 0; cursor < length; cursor += 1) {
    const key = queue[cursor];
    const state = decode(key);
    if (state.checkpoint === level.checkpoints.length) {
      const chain = [];
      for (let current = key; parents[current] !== -1; current = parents[current])
        chain.push(current);
      chain.reverse();
      const actions = [{ type: 'release' }];
      let lastCheckpoint = 0;
      for (let count = decode(initial).checkpoint; count > 0; count -= 1) {
        actions.push({ type: 'advance' });
        lastCheckpoint += 1;
      }
      for (const next of chain) {
        const op = operations[next];
        if (op < level.shafts.length * 3) {
          const index = Math.floor(op / 3);
          actions.push({ type: 'shaft', id: level.shafts[index].id, value: op % 3 });
        } else actions.push({ type: 'latch', id: level.latches[op - level.shafts.length * 3].id });
        const nextCheckpoint = decode(next).checkpoint;
        while (lastCheckpoint < nextCheckpoint) {
          actions.push({ type: 'advance' });
          lastCheckpoint += 1;
        }
      }
      return { solvable: true, explored: length, actions };
    }
    for (let index = 0; index < level.shafts.length; index += 1) {
      if (!allowedShafts[index] || state.locks & locksFor[index]) continue;
      const current = valueAt(state.positions, index);
      for (let value = 0; value <= 2; value += 1) {
        if (value === current) continue;
        enqueue(
          state.positions + (value - current) * powers[index],
          state.locks,
          state.checkpoint,
          key,
          index * 3 + value,
        );
      }
    }
    for (let index = 0; index < level.latches.length; index += 1) {
      if (!allowedLocks[index] || !(state.locks & (1 << index))) continue;
      const latch = level.latches[index];
      if (
        !latch.releaseWhen.every((condition) =>
          condition.positions.includes(valueAt(state.positions, shaftIndices.get(condition.shaft))),
        )
      )
        continue;
      enqueue(
        state.positions,
        state.locks & ~(1 << index),
        state.checkpoint,
        key,
        level.shafts.length * 3 + index,
      );
    }
  }
  return { solvable: false, explored: length, actions: [] };
}

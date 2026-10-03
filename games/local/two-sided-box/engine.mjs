/**
 * Pure, renderer-independent rules for Two-Sided Box.
 *
 * The front and back never own separate copies of a mechanism. A shaft's one
 * integer position drives every gate linked to it. `checkpoint` counts passed
 * gate groups; animations call advanceBall only after reaching the next stop.
 */

const SIDES = ['front', 'back'];
const sideName = (side) => (side === 'back' ? '背面' : '正面');
const failure = (message, extra = {}) => ({ ok: false, message, ...extra });
const success = (message, extra = {}) => ({ ok: true, message, ...extra });
const shaftById = (level, id) => level.shafts.find((shaft) => shaft.id === id);
const latchById = (level, id) => level.latches.find((latch) => latch.id === id);

function positionName(shaft, value) {
  return shaft.notches?.[value - shaft.min] ?? ['低', '中', '高'][value] ?? String(value);
}

function latchAlignment(level, state, latch) {
  const failed = (latch.releaseWhen ?? []).filter(
    (condition) => !condition.positions.includes(state.shafts[condition.shaft]),
  );
  const instructions = failed.map((condition) => {
    const shaft = shaftById(level, condition.shaft);
    const positions = condition.positions
      .map((value) => `${positionName(shaft, value)}位`)
      .join('或');
    return `${shaft.label}移到${positions}`;
  });
  return {
    aligned: failed.length === 0,
    message: failed.length
      ? `先把${instructions.join('，并把')}，锁扣才能松开。`
      : '解锁窗已对齐。',
  };
}

/** Returns all schema errors without partially creating a playable state. */
export function validateLevel(level) {
  const errors = [];
  if (!level || typeof level !== 'object') return { valid: false, errors: ['关卡必须是对象。'] };
  if (typeof level.id !== 'string' || !level.id) errors.push('关卡需要稳定的 id。');
  const shafts = Array.isArray(level.shafts) ? level.shafts : [];
  const latches = Array.isArray(level.latches) ? level.latches : [];
  const gates = Array.isArray(level.gates) ? level.gates : [];
  const path = Array.isArray(level.path) ? level.path : [];
  const checkpoints = Array.isArray(level.checkpoints) ? level.checkpoints : [];
  if (!shafts.length) errors.push('至少需要一根滑轴。');
  if (!Array.isArray(level.latches)) errors.push('latches 必须是数组。');
  if (!Array.isArray(level.gates)) errors.push('gates 必须是数组。');
  if (path.length < 2) errors.push('球道至少需要两个路径点。');
  path.forEach((point, index) => {
    if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) {
      errors.push(`路径点 ${index} 无效。`);
    }
  });

  const ids = new Set();
  for (const mechanism of [...shafts, ...latches, ...gates]) {
    if (typeof mechanism.id !== 'string' || !mechanism.id || ids.has(mechanism.id)) {
      errors.push(`机关 id 缺失或重复：${mechanism.id ?? ''}。`);
    }
    ids.add(mechanism.id);
    if (!Number.isFinite(mechanism.x)) errors.push(`${mechanism.id} 缺少 x 坐标。`);
  }
  for (const shaft of shafts) {
    if (
      ![shaft.min, shaft.max, shaft.initial].every(Number.isInteger) ||
      shaft.min > shaft.max ||
      shaft.initial < shaft.min ||
      shaft.initial > shaft.max
    ) {
      errors.push(`${shaft.id} 的挡位范围或初始挡位无效。`);
    }
  }
  const shaftMap = new Map(shafts.map((shaft) => [shaft.id, shaft]));
  const checkPositions = (positions, shaft, description) => {
    if (
      !Array.isArray(positions) ||
      !positions.length ||
      positions.some((value) => !Number.isInteger(value) || value < shaft.min || value > shaft.max)
    ) {
      errors.push(`${description} 的挡位条件无效。`);
    }
  };
  for (const latch of latches) {
    if (!shaftMap.has(latch.shaft)) errors.push(`${latch.id} 引用了不存在的滑轴。`);
    if (!SIDES.includes(latch.side)) errors.push(`${latch.id} 的视图无效。`);
    if (typeof latch.initial !== 'boolean') errors.push(`${latch.id} 的锁定初态必须是布尔值。`);
    if (!Number.isFinite(latch.y)) errors.push(`${latch.id} 缺少 y 坐标。`);
    if (latch.releaseWhen !== undefined && !Array.isArray(latch.releaseWhen)) {
      errors.push(`${latch.id} 的解锁条件必须是数组。`);
    }
    for (const condition of Array.isArray(latch.releaseWhen) ? latch.releaseWhen : []) {
      const shaft = shaftMap.get(condition.shaft);
      if (!shaft) errors.push(`${latch.id} 的解锁条件引用了不存在的滑轴。`);
      else checkPositions(condition.positions, shaft, latch.id);
    }
  }
  for (const gate of gates) {
    const shaft = shaftMap.get(gate.shaft);
    if (!shaft) errors.push(`${gate.id} 引用了不存在的滑轴。`);
    else checkPositions(gate.positions, shaft, gate.id);
    if (!SIDES.includes(gate.side)) errors.push(`${gate.id} 的视图无效。`);
    if (!Number.isFinite(gate.y)) errors.push(`${gate.id} 缺少 y 坐标。`);
  }
  const gateIds = new Set(gates.map((gate) => gate.id));
  let lastPathIndex = 0;
  for (const [index, checkpoint] of checkpoints.entries()) {
    if (
      !Number.isInteger(checkpoint.pathIndex) ||
      checkpoint.pathIndex <= lastPathIndex ||
      checkpoint.pathIndex >= path.length
    )
      errors.push(`检查点 ${index} 的路径顺序无效。`);
    lastPathIndex = checkpoint.pathIndex;
    if (!Array.isArray(checkpoint.gateIds) || checkpoint.gateIds.some((id) => !gateIds.has(id))) {
      errors.push(`检查点 ${index} 的挡板引用无效。`);
    }
  }
  const finalCheckpoint = checkpoints.at(-1);
  if (
    !finalCheckpoint ||
    finalCheckpoint.pathIndex !== path.length - 1 ||
    finalCheckpoint.gateIds?.length !== 0
  ) {
    errors.push('最后一个检查点必须是终点，且不含挡板。');
  }
  for (const gate of gates) {
    if (!checkpoints.some((checkpoint) => checkpoint.gateIds?.includes(gate.id))) {
      errors.push(`${gate.id} 未接入球道。`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function createState(level) {
  const validation = validateLevel(level);
  if (!validation.valid) throw new Error(`无效关卡：${validation.errors.join(' ')}`);
  return {
    side: 'front',
    shafts: Object.fromEntries(level.shafts.map((shaft) => [shaft.id, shaft.initial])),
    latches: Object.fromEntries(level.latches.map((latch) => [latch.id, latch.initial])),
    released: false,
    checkpoint: 0,
    completed: false,
    moves: 0,
    flips: 0,
  };
}

export function moveShaft(level, state, id, value) {
  const shaft = shaftById(level, id);
  if (!shaft) return failure('找不到这根滑轴。');
  if (state.completed) return failure('小球已经抵达终点。');
  if (!Number.isInteger(value) || value < shaft.min || value > shaft.max)
    return failure('滑轴只能停在标记的挡位。');
  const heldBy = level.latches.filter((latch) => latch.shaft === id && state.latches[latch.id]);
  if (heldBy.length) {
    const latch = heldBy[0];
    return failure(`${shaft.label}被「${latch.label}」固定。到${sideName(latch.side)}松开锁扣。`, {
      lockedBy: heldBy.map((item) => item.id),
    });
  }
  if (state.shafts[id] === value)
    return success(`${shaft.label}已在${positionName(shaft, value)}位。`, { changed: false });
  state.shafts[id] = value;
  state.moves += 1;
  return success(`${shaft.label}移到${positionName(shaft, value)}位，两面机关同步变化。`, {
    changed: true,
  });
}

export function toggleLatch(level, state, id) {
  const latch = latchById(level, id);
  if (!latch) return failure('找不到这个锁扣。');
  if (state.completed) return failure('小球已经抵达终点。');
  if (state.side !== latch.side) return failure(`这个锁扣在${sideName(latch.side)}，先翻面。`);
  if (state.latches[id]) {
    const alignment = latchAlignment(level, state, latch);
    if (!alignment.aligned) return failure(alignment.message);
  }
  state.latches[id] = !state.latches[id];
  state.moves += 1;
  return success(
    state.latches[id]
      ? `${latch.label}已扣紧，${latch.shaft} 轴被固定。`
      : `${latch.label}已松开，${latch.shaft} 轴可以滑动。`,
    {
      engaged: state.latches[id],
    },
  );
}

export function flipView(state) {
  state.side = state.side === 'front' ? 'back' : 'front';
  if (!state.completed) {
    state.flips += 1;
    state.moves += 1;
  }
  return success(`已转到${sideName(state.side)}。同一根轴的位置保持不变。`);
}

export function getGateStatus(level, state, gateId) {
  const gate = level.gates.find((item) => item.id === gateId);
  if (!gate) throw new Error(`未知挡板：${gateId}`);
  return {
    ...gate,
    position: state.shafts[gate.shaft],
    open: gate.positions.includes(state.shafts[gate.shaft]),
  };
}

/** The current ball stop, including opposite-side barriers. Empty means clear. */
export function getBlockingReason(level, state) {
  if (state.completed) return '';
  const checkpoint = level.checkpoints[state.checkpoint];
  if (!checkpoint) return '';
  const blocked = checkpoint.gateIds
    .map((id) => getGateStatus(level, state, id))
    .filter((gate) => !gate.open);
  if (!blocked.length) return '';
  return blocked
    .map((gate) => {
      const shaft = shaftById(level, gate.shaft);
      const positions = gate.positions.map((value) => `${positionName(shaft, value)}位`).join('或');
      return `${sideName(gate.side)}「${gate.label}」挡住球道，${shaft.label}需在${positions}。`;
    })
    .join(' ');
}

export function releaseBall(level, state) {
  if (state.completed) return failure('小球已经抵达终点。');
  if (state.released) return failure('小球已在球道里，可以继续调整机关。');
  if (state.side !== 'front') return failure('放球口在正面，翻到正面再放球。');
  state.released = true;
  state.moves += 1;
  return success('小球出发！遇到挡板会停住，仍可翻面调整机关。');
}

/**
 * Called on animation arrival, never by shaft/latch actions. A blocked ball is
 * recoverable: mechanisms remain operable while released and there is no reset.
 */
export function advanceBall(level, state) {
  if (state.completed) return failure('小球已经抵达终点。');
  if (!state.released) return failure('先从正面放球。');
  const checkpoint = level.checkpoints[state.checkpoint];
  if (!checkpoint) return failure('球道检查点不存在。');
  const blockedGateIds = checkpoint.gateIds.filter((id) => !getGateStatus(level, state, id).open);
  if (blockedGateIds.length) return failure(getBlockingReason(level, state), { blockedGateIds });
  state.checkpoint += 1;
  if (state.checkpoint === level.checkpoints.length) {
    state.completed = true;
    return success('小球已进入终点槽！', { completed: true });
  }
  return success('球道已打开，小球继续前进。', { completed: false });
}

export function getSnapshot(level, state) {
  const gates = level.gates.map((gate) => getGateStatus(level, state, gate.id));
  const shafts = level.shafts.map((shaft) => {
    const heldBy = level.latches
      .filter((latch) => latch.shaft === shaft.id && state.latches[latch.id])
      .map((latch) => latch.id);
    return { ...shaft, value: state.shafts[shaft.id], locked: heldBy.length > 0, heldBy };
  });
  const latches = level.latches.map((latch) => {
    const alignment = latchAlignment(level, state, latch);
    return {
      ...latch,
      engaged: state.latches[latch.id],
      canRelease: alignment.aligned,
      reason: alignment.message,
    };
  });
  const nextCheckpoint = state.completed ? null : level.checkpoints[state.checkpoint];
  return {
    side: state.side,
    released: state.released,
    checkpoint: state.checkpoint,
    completed: state.completed,
    moves: state.moves,
    flips: state.flips,
    shafts,
    latches,
    gates,
    lockedShafts: shafts.filter((shaft) => shaft.locked).map((shaft) => shaft.id),
    blockedGateIds: (nextCheckpoint?.gateIds ?? []).filter(
      (id) => !gates.find((gate) => gate.id === id).open,
    ),
    nextCheckpoint: nextCheckpoint
      ? { ...nextCheckpoint, gateIds: [...nextCheckpoint.gateIds] }
      : null,
    ballPathIndex: !state.released
      ? 0
      : state.completed
        ? level.path.length - 1
        : nextCheckpoint.pathIndex,
    blockingReason: getBlockingReason(level, state),
  };
}

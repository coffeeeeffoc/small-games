/** Pure six-face rules. Face views, the 3D viewer and collisions share one model. */
import { BOX_HALF, FACE_IDS, FACE_DEFS } from './faces.mjs';
import {
  BALL_RADIUS,
  SHAFT_TRAVEL,
  PLATE_THICKNESS,
  GEOMETRY_EPSILON,
  dot,
  subtract,
  magnitude,
  cross,
  getGateGeometry,
  getShaftGeometry,
} from './geometry.mjs';
export { FACE_IDS, FACE_DEFS, BOX_HALF, BALL_RADIUS, getGateGeometry, getShaftGeometry };
const failure = (message, extra = {}) => ({ ok: false, message, ...extra });
const success = (message, extra = {}) => ({ ok: true, message, ...extra });
const shaftById = (level, id) => level.shafts.find((shaft) => shaft.id === id);
const latchById = (level, id) => level.latches.find((latch) => latch.id === id);
const faceLabel = (face) => FACE_DEFS[face]?.label ?? face;
const vector = (value) =>
  Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const unitVector = (value) => vector(value) && Math.abs(magnitude(value) - 1) < GEOMETRY_EPSILON;
const near = (a, b) => Math.abs(a - b) <= GEOMETRY_EPSILON;
const inBox = (point) =>
  vector(point) && point.every((value) => Math.abs(value) <= BOX_HALF + GEOMETRY_EPSILON);
const validPair = (pair) =>
  Array.isArray(pair) &&
  pair.length === 2 &&
  pair[0] !== pair[1] &&
  pair.every((face) => FACE_IDS.includes(face));
function positionName(shaft, value) {
  return shaft.notches?.[value - shaft.min] ?? `${value + 1}挡`;
}

function latchAlignment(level, state, latch) {
  const failed = (latch.releaseWhen ?? []).filter(
    (condition) => !condition.positions.includes(state.shafts[condition.shaft]),
  );
  return {
    aligned: failed.length === 0,
    message: failed.length
      ? `先把${failed
          .map((condition) => {
            const shaft = shaftById(level, condition.shaft);
            return `${shaft.label}移到${condition.positions.map((value) => positionName(shaft, value)).join('或')}`;
          })
          .join('，并把')}，锁扣才能松开。`
      : '解锁窗已对齐。',
  };
}

/** Invalid spatial models are rejected before they can become playable. */
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
  if (!gates.length) errors.push('至少需要一块挡板。');
  if (path.length < 3) errors.push('球道至少需要三个路径点。');
  path.forEach((point, index) => {
    if (!inBox(point)) errors.push(`路径点 ${index} 必须是盒内有限三维坐标。`);
    if (
      vector(point) &&
      vector(path[index - 1]) &&
      magnitude(subtract(point, path[index - 1])) < GEOMETRY_EPSILON
    )
      errors.push(`路径段 ${index - 1} 的长度不能为零。`);
  });
  const ids = new Set();
  for (const mechanism of [...shafts, ...latches, ...gates]) {
    if (!mechanism || typeof mechanism.id !== 'string' || !mechanism.id || ids.has(mechanism.id))
      errors.push(`机关 id 缺失或重复：${mechanism?.id ?? ''}。`);
    ids.add(mechanism?.id);
  }
  const validAnchor = (mechanism) => {
    if (!FACE_IDS.includes(mechanism.face)) errors.push(`${mechanism.id} 的观察面无效。`);
    if (
      !Array.isArray(mechanism.anchor) ||
      mechanism.anchor.length !== 2 ||
      !mechanism.anchor.every((value) => Number.isFinite(value) && Math.abs(value) <= BOX_HALF)
    )
      errors.push(`${mechanism.id} 的面内坐标无效。`);
  };
  for (const shaft of shafts) {
    if (!shaft) continue;
    validAnchor(shaft);
    if (
      ![shaft.min, shaft.max, shaft.initial].every(Number.isInteger) ||
      shaft.min > shaft.max ||
      shaft.initial < shaft.min ||
      shaft.initial > shaft.max
    )
      errors.push(`${shaft.id} 的挡位范围或初始挡位无效。`);
    const face = FACE_DEFS[shaft.face];
    if (!unitVector(shaft.slideAxis) || (face && !near(dot(face.normal, shaft.slideAxis), 0)))
      errors.push(`${shaft.id} 的滑动轴必须是所属面的单位切向量。`);
    if (
      face &&
      unitVector(shaft.slideAxis) &&
      Array.isArray(shaft.anchor) &&
      shaft.anchor.length === 2 &&
      shaft.anchor.every(Number.isFinite)
    ) {
      for (const position of [shaft.min, shaft.max]) {
        const point = getShaftGeometry(
          { shafts },
          { shafts: { [shaft.id]: position } },
          shaft,
        ).handle;
        if (!inBox(point)) errors.push(`${shaft.id} 的行程超出了所属面。`);
      }
    }
  }
  const shaftMap = new Map(shafts.filter(Boolean).map((shaft) => [shaft.id, shaft]));
  for (const latch of latches) {
    if (!latch) continue;
    validAnchor(latch);
    if (!shaftMap.has(latch.shaft)) errors.push(`${latch.id} 引用了不存在的滑轴。`);
    if (typeof latch.initial !== 'boolean') errors.push(`${latch.id} 的锁定初态必须是布尔值。`);
    if (latch.releaseWhen !== undefined && !Array.isArray(latch.releaseWhen))
      errors.push(`${latch.id} 的解锁条件必须是数组。`);
    for (const condition of Array.isArray(latch.releaseWhen) ? latch.releaseWhen : []) {
      const shaft = shaftMap.get(condition?.shaft);
      if (!shaft) errors.push(`${latch.id} 的解锁条件引用了不存在的滑轴。`);
      else if (
        !Array.isArray(condition.positions) ||
        !condition.positions.length ||
        condition.positions.some(
          (value) => !Number.isInteger(value) || value < shaft.min || value > shaft.max,
        )
      )
        errors.push(`${latch.id} 的解锁挡位无效。`);
    }
  }
  for (const gate of gates) {
    if (!gate) continue;
    const shaft = shaftMap.get(gate.shaft);
    if (!shaft) errors.push(`${gate.id} 引用了不存在的滑轴。`);
    if (!inBox(gate.center)) errors.push(`${gate.id} 的中心必须是盒内三维坐标。`);
    if (!unitVector(gate.normal)) errors.push(`${gate.id} 的法线必须是单位向量。`);
    if (
      shaft &&
      vector(shaft.slideAxis) &&
      vector(gate.normal) &&
      !near(dot(gate.normal, shaft.slideAxis), 0)
    )
      errors.push(`${gate.id} 的滑动方向必须在板面内。`);
    const aperture = gate.aperture;
    if (
      !aperture ||
      !Array.isArray(aperture.offsets) ||
      !aperture.offsets.length ||
      aperture.offsets.some((offset) => !Number.isFinite(offset)) ||
      !Number.isFinite(aperture.radius) ||
      aperture.radius < BALL_RADIUS
    )
      errors.push(`${gate.id} 的孔位或孔径无效。`);
    if (
      Array.isArray(aperture?.offsets) &&
      Number.isFinite(aperture.radius) &&
      aperture.offsets.some((offset, index) =>
        aperture.offsets
          .slice(index + 1)
          .some((other) => Math.abs(other - offset) < aperture.radius * 2),
      )
    )
      errors.push(`${gate.id} 的独立圆孔不能相互重叠。`);
    if (!Number.isFinite(gate.travel) || gate.travel !== SHAFT_TRAVEL)
      errors.push(`${gate.id} 的滑动行程必须与滑轴的 ${SHAFT_TRAVEL} 单位挡距一致。`);
    const index = gate.pathIndex;
    if (!Number.isInteger(index) || index < 1 || index >= path.length - 1) {
      errors.push(`${gate.id} 必须接入球道内部路径点。`);
      continue;
    }
    if (
      vector(path[index]) &&
      vector(gate.center) &&
      magnitude(subtract(path[index], gate.center)) > GEOMETRY_EPSILON
    )
      errors.push(`${gate.id} 的中心必须位于对应的球道路径点。`);
    if (vector(gate.normal) && [path[index - 1], path[index], path[index + 1]].every(vector)) {
      const entry = subtract(path[index], path[index - 1]);
      const exit = subtract(path[index + 1], path[index]);
      if (
        magnitude(cross(entry, gate.normal)) > GEOMETRY_EPSILON ||
        magnitude(cross(exit, gate.normal)) > GEOMETRY_EPSILON ||
        dot(entry, exit) <= 0
      )
        errors.push(`${gate.id} 附近的球道必须沿板面法线直线穿孔。`);
      const stoppingClearance = BALL_RADIUS + PLATE_THICKNESS / 2 + 0.5;
      if (magnitude(entry) < stoppingClearance || magnitude(exit) < stoppingClearance)
        errors.push(`${gate.id} 前后的直线段必须留出球半径和板厚的停球净空。`);
    }
    if (
      shaft &&
      unitVector(shaft.slideAxis) &&
      unitVector(gate.normal) &&
      vector(gate.center) &&
      vector(path[index]) &&
      Array.isArray(aperture?.offsets) &&
      aperture.offsets.length &&
      aperture.offsets.every(Number.isFinite) &&
      Number.isFinite(aperture.radius) &&
      Number.isFinite(gate.travel) &&
      Number.isInteger(shaft.min) &&
      Number.isInteger(shaft.max)
    ) {
      for (const position of [shaft.min, shaft.max]) {
        const geometry = getGateGeometry(level, { shafts: { [shaft.id]: position } }, gate);
        if (
          geometry.corners.some((corner) =>
            [-1, 1].some(
              (direction) =>
                !inBox(
                  corner.map(
                    (value, axis) => value + (direction * gate.normal[axis] * PLATE_THICKNESS) / 2,
                  ),
                ),
            ),
          )
        )
          errors.push(`${gate.id} 的板面行程超出盒体边界。`);
      }
    }
  }
  const gateMap = new Map(gates.filter(Boolean).map((gate) => [gate.id, gate]));
  const assigned = new Set();
  let lastPathIndex = 0;
  for (const [index, checkpoint] of checkpoints.entries()) {
    if (
      !checkpoint ||
      !Number.isInteger(checkpoint.pathIndex) ||
      checkpoint.pathIndex <= lastPathIndex ||
      checkpoint.pathIndex >= path.length
    )
      errors.push(`检查点 ${index} 的路径顺序无效。`);
    lastPathIndex = checkpoint?.pathIndex;
    if (!Array.isArray(checkpoint?.gateIds)) {
      errors.push(`检查点 ${index} 的挡板引用无效。`);
      continue;
    }
    for (const id of checkpoint.gateIds) {
      const gate = gateMap.get(id);
      if (!gate || gate.pathIndex !== checkpoint.pathIndex || assigned.has(id))
        errors.push(`检查点 ${index} 的挡板引用或路径位置无效。`);
      assigned.add(id);
    }
  }
  const finalCheckpoint = checkpoints.at(-1);
  if (
    !finalCheckpoint ||
    finalCheckpoint.pathIndex !== path.length - 1 ||
    finalCheckpoint.gateIds?.length !== 0
  )
    errors.push('最后一个检查点必须是终点，且不含挡板。');
  for (const gate of gates)
    if (gate && !assigned.has(gate.id)) errors.push(`${gate.id} 未接入球道。`);
  if (
    level.initialViews?.eligiblePairs !== undefined &&
    (!Array.isArray(level.initialViews.eligiblePairs) ||
      !level.initialViews.eligiblePairs.length ||
      !level.initialViews.eligiblePairs.every(validPair))
  )
    errors.push('初始观察面必须是非空且无重复面的双面组合。');
  return { valid: errors.length === 0, errors };
}

export function createState(level, { initialFaces, random = Math.random } = {}) {
  const validation = validateLevel(level);
  if (!validation.valid) throw new Error(`无效关卡：${validation.errors.join(' ')}`);
  let faces = initialFaces;
  if (faces === undefined) {
    const pairs =
      level.initialViews?.eligiblePairs ??
      FACE_IDS.flatMap((face, index) => FACE_IDS.slice(index + 1).map((other) => [face, other]));
    const sample = () => {
      const value = random();
      if (!Number.isFinite(value) || value < 0 || value >= 1)
        throw new Error('随机源必须返回 [0, 1) 范围内的有限值。');
      return value;
    };
    faces = [...pairs[Math.floor(sample() * pairs.length)]];
    if (sample() >= 0.5) faces.reverse();
  }
  if (!validPair(faces)) throw new Error('初始必须指定两个不同的有效观察面。');
  return {
    side: faces[0],
    initialFaces: [...faces],
    revealedFaces: [...faces],
    structureViewed: false,
    shafts: Object.fromEntries(level.shafts.map((shaft) => [shaft.id, shaft.initial])),
    latches: Object.fromEntries(level.latches.map((latch) => [latch.id, latch.initial])),
    released: false,
    checkpoint: 0,
    completed: false,
    moves: 0,
    flips: 0,
  };
}

export function viewFace(state, face) {
  if (!FACE_IDS.includes(face)) return failure('不存在这个观察面。');
  if (!state.revealedFaces.includes(face))
    return failure(`${faceLabel(face)}尚未揭示，先获取这一面的提示。`);
  const changed = state.side !== face;
  state.side = face;
  if (changed) state.flips += 1;
  return success(`已转到${faceLabel(face)}。`, { changed });
}

export function revealFace(state, face) {
  if (!FACE_IDS.includes(face)) return failure('不存在这个观察面。');
  const changed = !state.revealedFaces.includes(face);
  if (changed) state.revealedFaces.push(face);
  return success(`已揭示${faceLabel(face)}，所有已知面同时保留在观察台。`, { changed });
}

export function revealStructure(state) {
  if (!state.completed && state.revealedFaces.length !== FACE_IDS.length)
    return failure('揭示全部六面后，可以查看最后的 3D 结构提示。');
  state.structureViewed = true;
  return success('完整 3D 结构已打开，可旋转观察或切换透视。');
}

export function moveShaft(level, state, id, value, face = state.side) {
  const shaft = shaftById(level, id);
  if (!shaft) return failure('找不到这根滑轴。');
  if (state.completed) return failure('小球已经抵达终点。');
  if (face !== shaft.face || !state.revealedFaces.includes(shaft.face))
    return failure(`${shaft.label}的操作柄在${faceLabel(shaft.face)}。`);
  if (!Number.isInteger(value) || value < shaft.min || value > shaft.max)
    return failure('滑轴只能停在标记的挡位。');
  const heldBy = level.latches.filter((latch) => latch.shaft === id && state.latches[latch.id]);
  if (heldBy.length)
    return failure(
      `${shaft.label}被「${heldBy[0].label}」固定，到${faceLabel(heldBy[0].face)}松开锁扣。`,
      { lockedBy: heldBy.map((latch) => latch.id) },
    );
  if (state.shafts[id] === value)
    return success(`${shaft.label}已在${positionName(shaft, value)}。`, { changed: false });
  state.shafts[id] = value;
  state.moves += 1;
  return success(`${shaft.label}移到${positionName(shaft, value)}，相连的挡板同步移动。`, {
    changed: true,
  });
}

export function toggleLatch(level, state, id, face = state.side) {
  const latch = latchById(level, id);
  if (!latch) return failure('找不到这个锁扣。');
  if (state.completed) return failure('小球已经抵达终点。');
  if (face !== latch.face || !state.revealedFaces.includes(latch.face))
    return failure(`这个锁扣在${faceLabel(latch.face)}，请在该面的观察窗操作。`);
  if (state.latches[id]) {
    const alignment = latchAlignment(level, state, latch);
    if (!alignment.aligned) return failure(alignment.message);
  }
  state.latches[id] = !state.latches[id];
  state.moves += 1;
  return success(`${latch.label}已${state.latches[id] ? '扣紧' : '松开'}。`, {
    engaged: state.latches[id],
  });
}

export function getGateStatus(level, state, gateId) {
  const gate = level.gates.find((item) => item.id === gateId);
  if (!gate) throw new Error(`未知挡板：${gateId}`);
  const geometry = getGateGeometry(level, state, gate);
  return { ...gate, position: state.shafts[gate.shaft], open: geometry.open, geometry };
}

export function getBlockingReason(level, state) {
  if (state.completed) return '';
  const checkpoint = level.checkpoints[state.checkpoint];
  return (checkpoint?.gateIds ?? [])
    .map((id) => getGateStatus(level, state, id))
    .filter((gate) => !gate.open)
    .map(
      (gate) =>
        `「${gate.label}」的孔尚未对齐球道，可调整${faceLabel(shaftById(level, gate.shaft).face)}的${shaftById(level, gate.shaft).label}。`,
    )
    .join(' ');
}

export function releaseBall(level, state) {
  if (state.completed) return failure('小球已经抵达终点。');
  if (state.released) return failure('小球已在球道里，可以继续调整机关。');
  state.released = true;
  state.moves += 1;
  return success('小球出发！遇到挡板会停住，仍可调整机关。');
}

/** Called after animation arrival; blocked balls remain recoverable. */
export function advanceBall(level, state) {
  if (state.completed) return failure('小球已经抵达终点。');
  if (!state.released) return failure('先放球，再让小球沿球道前进。');
  const checkpoint = level.checkpoints[state.checkpoint];
  if (!checkpoint) return failure('球道检查点不存在。');
  const blockedGateIds = checkpoint.gateIds.filter((id) => !getGateStatus(level, state, id).open);
  if (blockedGateIds.length) return failure(getBlockingReason(level, state), { blockedGateIds });
  state.checkpoint += 1;
  state.completed = state.checkpoint === level.checkpoints.length;
  return success(state.completed ? '小球已进入终点槽！' : '球道已打开，小球继续前进。', {
    completed: state.completed,
  });
}

export function getSnapshot(level, state) {
  const gates = level.gates.map((gate) => getGateStatus(level, state, gate.id));
  const shafts = level.shafts.map((shaft) => {
    const heldBy = level.latches
      .filter((latch) => latch.shaft === shaft.id && state.latches[latch.id])
      .map((latch) => latch.id);
    return {
      ...shaft,
      value: state.shafts[shaft.id],
      locked: heldBy.length > 0,
      heldBy,
      geometry: getShaftGeometry(level, state, shaft),
    };
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
    initialFaces: [...state.initialFaces],
    revealedFaces: [...state.revealedFaces],
    structureViewed: state.structureViewed,
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

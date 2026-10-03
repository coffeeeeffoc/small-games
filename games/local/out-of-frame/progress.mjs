import { CONSTANTS, createState } from './engine.mjs';

// Keep this key so the original six-room saves migrate without losing records.
export const STORAGE_KEY = 'out-of-frame-progress-v1';
const HISTORY_LIMIT = 33;
const numberIn = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;

/** Rebuild only mutable simulation fields; stored data can never replace level geometry. */
function readState(saved, level) {
  if (!saved || saved.levelId !== level.id || saved.status !== 'playing') return null;
  if (!numberIn(saved.time, 0, 86400) || !Number.isInteger(saved.ticks) || saved.ticks < 0)
    return null;
  const state = createState(level);
  if (
    !numberIn(saved.frame?.x, 0, CONSTANTS.width - state.frame.w) ||
    !numberIn(saved.frame?.y, 0, CONSTANTS.height - state.frame.h)
  )
    return null;
  const player = saved.player;
  if (!player || !numberIn(player.x, -1000, 1960) || !numberIn(player.y, -1000, 580)) return null;
  for (const field of ['vx', 'vy']) if (!numberIn(player[field], -10000, 10000)) return null;
  for (const field of ['coyote', 'jumpBuffer']) if (!numberIn(player[field], 0, 1)) return null;
  if (typeof player.grounded !== 'boolean' || ![-1, 1].includes(player.facing)) return null;
  const supports = [
    ...level.solids.map((solid, index) => solid.id ?? `solid-${index}`),
    ...state.objects.map((object) => object.id),
    ...state.gates.map((gate) => gate.id),
  ];
  if (player.supportId !== null && !supports.includes(player.supportId)) return null;
  if (!Array.isArray(saved.objects) || saved.objects.length !== state.objects.length) return null;
  for (let index = 0; index < state.objects.length; index += 1) {
    const object = state.objects[index];
    const stored = saved.objects[index];
    if (!stored || stored.id !== object.id) return null;
    if (!numberIn(stored.x, -1000, 1960) || !numberIn(stored.y, -1000, 1540)) return null;
    if (
      !Number.isInteger(stored.pathIndex) ||
      stored.pathIndex < 0 ||
      stored.pathIndex >= object.path.length
    )
      return null;
    if (![-1, 1].includes(stored.direction) || typeof stored.active !== 'boolean') return null;
    if (!numberIn(stored.dx, -1000, 1000) || !numberIn(stored.dy, -1000, 1000)) return null;
    Object.assign(object, {
      x: stored.x,
      y: stored.y,
      pathIndex: stored.pathIndex,
      direction: stored.direction,
      active: stored.active,
      dx: stored.dx,
      dy: stored.dy,
    });
    if ([-1, 1].includes(stored.facing)) object.facing = stored.facing;
  }
  for (const field of ['switches', 'gates']) {
    if (!Array.isArray(saved[field]) || saved[field].length !== state[field].length) return null;
    for (let index = 0; index < state[field].length; index += 1) {
      const item = saved[field][index];
      const property = field === 'switches' ? 'pressed' : 'open';
      if (!item || item.id !== state[field][index].id || typeof item[property] !== 'boolean')
        return null;
      state[field][index][property] = item[property];
    }
  }
  Object.assign(state.frame, { x: saved.frame.x, y: saved.frame.y });
  Object.assign(state.player, {
    x: player.x,
    y: player.y,
    vx: player.vx,
    vy: player.vy,
    grounded: player.grounded,
    supportId: player.supportId,
    facing: player.facing,
    coyote: player.coyote,
    jumpBuffer: player.jumpBuffer,
  });
  state.time = saved.time;
  state.ticks = saved.ticks;
  // Input is intentionally released when returning to a room.
  state.jumpHeld = false;
  return state;
}

export function readProgress(storage, levels) {
  const empty = {
    completed: {},
    sound: false,
    lastLevelId: levels[0]?.id ?? null,
    checkpoint: null,
  };
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY));
    if (!value || typeof value !== 'object') return empty;
    const completed = {};
    for (const level of levels) {
      const time = value.completed?.[level.id];
      if (Number.isFinite(time) && time > 0) completed[level.id] = time;
    }
    const level = levels.find((item) => item.id === value.lastLevelId) ?? levels[0];
    let checkpoint = null;
    if (level && value.checkpoint?.version === 1 && value.checkpoint.levelId === level.id) {
      const state = readState(value.checkpoint.state, level);
      if (state) {
        const history = Array.isArray(value.checkpoint.history)
          ? value.checkpoint.history
              .slice(-HISTORY_LIMIT)
              .map((item) => readState(item, level))
              .filter((item) => item && item.time <= state.time)
          : [];
        checkpoint = { version: 1, levelId: level.id, state, history };
      }
    }
    return {
      completed,
      sound: value.sound === true,
      lastLevelId: level?.id ?? null,
      checkpoint,
    };
  } catch {
    return empty;
  }
}

export function createCheckpoint(state, history = []) {
  if (state.status !== 'playing') return null;
  return {
    version: 1,
    levelId: state.levelId,
    state: structuredClone(state),
    history: structuredClone(history.slice(-HISTORY_LIMIT)),
  };
}

export function writeProgress(storage, progress) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

import { SHAPES, SHAPE_BY_ID, shapeWeight, SHAPES_VERSION, DIFFICULTY_VERSION } from './shapes.mjs';
import { getLevel } from './levels.mjs';
import { RANDOM_VERSION, createCounterRng, nextCounterRandom } from './random.mjs';

export { SHAPES_VERSION, DIFFICULTY_VERSION, RANDOM_VERSION };
export const RULE_VERSION = 'three-choose-two-v1';
export const SCORING_VERSION = 'score-v1';
export const VERSION = Object.freeze({ rule: RULE_VERSION, shapes: SHAPES_VERSION, difficulty: DIFFICULTY_VERSION, scoring: SCORING_VERSION, random: RANDOM_VERSION });
export const BOARD_SIZE = 8;
const clone = (value) => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const cellIndex = (x, y) => y * BOARD_SIZE + x;

function initialStats() {
  return { lines: 0, multiClears: 0, crossClears: 0, stars: 0, discardedBlocks: 0, discardedCells: 0, placements: 0, maxLines: 0, maxCombo: 0 };
}
function normalizeSeed(seed) {
  if (Number.isFinite(seed)) return (Math.trunc(seed) >>> 0) || 0x9e3779b9;
  let result = 2166136261;
  for (const character of String(seed)) result = Math.imul(result ^ character.charCodeAt(0), 16777619) >>> 0;
  return result || 0x9e3779b9;
}
function random(rng) {
  if (typeof rng === 'object' && rng.algorithm === RANDOM_VERSION) return nextCounterRandom(rng);
  let next = rng >>> 0;
  next ^= next << 13; next ^= next >>> 17; next ^= next << 5;
  next >>>= 0;
  return { rng: next, value: next / 4294967296 };
}
function drawCandidates(rng, group) {
  const candidates = [];
  for (let slot = 0; slot < 3; slot++) {
    // The constraint depends only on the sequence, never on the board or user.
    const pool = slot === 2 && candidates.every(({ shapeId }) => SHAPE_BY_ID[shapeId].size === 9)
      ? SHAPES.filter((shape) => shape.size !== 9) : SHAPES;
    const total = pool.reduce((sum, shape) => sum + shapeWeight(shape, group), 0);
    const next = random(rng); rng = next.rng;
    let ticket = next.value * total;
    let selected = pool[pool.length - 1];
    for (const shape of pool) { ticket -= shapeWeight(shape, group); if (ticket < 0) { selected = shape; break; } }
    candidates.push({ shapeId: selected.id, color: 1 + ((SHAPES.indexOf(selected) + slot + group) % 5) });
  }
  return { rng, candidates };
}
function baseState(mode) {
  return {
    version: RULE_VERSION, mode, board: Array(64).fill(0), starBoard: Array(64).fill(false),
    candidates: [], used: [], placedInGroup: 0, group: 1, completedGroups: 0,
    score: 0, combo: 0, stats: initialStats(), status: 'playing', reason: null,
    undoRemaining: mode === 'level' ? 3 : 0, canUndo: false, stars: 0,
    continued: false, lastEvent: null,
  };
}
function levelCandidates(state, group) {
  return clone(state.config.candidates[group - 1]);
}
function ensurePlayable(state) {
  if (state.status === 'playing' && !hasPlacement(state)) { state.status = 'lost'; state.reason = 'no-placement'; }
  return state;
}
export function createLevel(idOrConfig = 1) {
  const config = typeof idOrConfig === 'object' && idOrConfig !== null ? idOrConfig : getLevel(idOrConfig);
  if (!config) throw new RangeError(`Unknown level: ${idOrConfig}`);
  const state = { ...baseState('level'), levelId: config.id, config: clone(config) };
  state.board = [...config.initialBoard];
  state.starBoard = config.initialStars ? [...config.initialStars] : Array(64).fill(false);
  state.candidates = levelCandidates(state, 1);
  return ensurePlayable(state);
}
export function createEndless(seed = Date.now(), { ranked = false } = {}) {
  const draw = drawCandidates(ranked ? createCounterRng(seed) : normalizeSeed(seed), 1);
  return { ...baseState('endless'), ranked, rng: draw.rng, candidates: draw.candidates };
}

export function canPlace(state, slot, x, y) {
  if (state.status !== 'playing' || state.waitingNextGroup || state.placedInGroup >= 2 || ![slot, x, y].every(Number.isInteger) || slot < 0 || slot > 2 || state.used.includes(slot)) return false;
  const shape = SHAPE_BY_ID[state.candidates[slot]?.shapeId];
  if (!shape || x < 0 || y < 0 || x + shape.width > 8 || y + shape.height > 8) return false;
  return shape.cells.every(([dx, dy]) => state.board[cellIndex(x + dx, y + dy)] === 0);
}
export function hasPlacement(state, slot) {
  const slots = slot === undefined ? [0, 1, 2] : [slot];
  for (const candidateSlot of slots) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (canPlace(state, candidateSlot, x, y)) return true;
  return false;
}
function fullLines(board) {
  const rows = [], cols = [];
  for (let line = 0; line < 8; line++) {
    if (Array.from({ length: 8 }, (_, x) => board[cellIndex(x, line)]).every(Boolean)) rows.push(line);
    if (Array.from({ length: 8 }, (_, y) => board[cellIndex(line, y)]).every(Boolean)) cols.push(line);
  }
  return { rows, cols };
}
export function previewPlacement(state, slot, x, y) {
  const shape = SHAPE_BY_ID[state.candidates[slot]?.shapeId];
  const valid = canPlace(state, slot, x, y);
  const cells = shape && Number.isInteger(x) && Number.isInteger(y) ? shape.cells
    .map(([dx, dy]) => [x + dx, y + dy]).filter(([cx, cy]) => cx >= 0 && cy >= 0 && cx < 8 && cy < 8).map(([cx, cy]) => cellIndex(cx, cy)) : [];
  if (!valid) return { valid, cells, rows: [], cols: [], lines: 0 };
  const board = [...state.board];
  for (const i of cells) board[i] = state.candidates[slot].color ?? 1;
  const { rows, cols } = fullLines(board);
  return { valid, cells, rows, cols, lines: rows.length + cols.length };
}
export function scoreForClear(lines, combo) {
  if (lines <= 0) return 0;
  return 100 * lines + 50 * lines * (lines - 1) + 25 * lines * Math.min(Math.max(combo - 1, 0), 4);
}
function goalsMet(state) {
  const goal = state.config.goal;
  return state.stats.lines >= goal.lines && state.stats.multiClears >= (goal.multi ?? 0)
    && state.stats.crossClears >= (goal.cross ?? 0) && state.stats.stars >= (goal.stars ?? 0);
}
export function getStars(state) {
  if (state.mode !== 'level' || state.status !== 'won') return 0;
  if (state.continued) return 1;
  const groups = Math.ceil(state.stats.placements / 2);
  if (groups <= state.config.starThresholds.three) return 3;
  if (groups <= state.config.starThresholds.two) return 2;
  return 1;
}
function snapshot(state) {
  const result = clone(state);
  delete result._undo;
  result.canUndo = false;
  return result;
}
function nextGroup(state) {
  state.group += 1;
  state.used = [];
  state.placedInGroup = 0;
  if (state.mode === 'level') state.candidates = levelCandidates(state, state.group);
  else {
    const draw = drawCandidates(state.rng, state.group);
    state.rng = draw.rng; state.candidates = draw.candidates;
  }
  ensurePlayable(state);
}

function placeInternal(state, slot, x, y, issuedOnly) {
  if (!canPlace(state, slot, x, y)) return state;
  const next = clone(state);
  if (state.mode === 'level' && state.undoRemaining > 0) { next._undo = snapshot(state); next.canUndo = true; }
  else { delete next._undo; next.canUndo = false; }
  const candidate = next.candidates[slot];
  const shape = SHAPE_BY_ID[candidate.shapeId];
  for (const [dx, dy] of shape.cells) next.board[cellIndex(x + dx, y + dy)] = candidate.color ?? 1;
  for (const [dx, dy] of candidate.stars ?? []) next.starBoard[cellIndex(x + dx, y + dy)] = true;
  const { rows, cols } = fullLines(next.board);
  const clearedCells = [];
  for (let i = 0; i < 64; i++) if (rows.includes(Math.floor(i / 8)) || cols.includes(i % 8)) clearedCells.push(i);
  const collectedStars = clearedCells.filter((i) => next.starBoard[i]).length;
  for (const i of clearedCells) { next.board[i] = 0; next.starBoard[i] = false; }
  const lines = rows.length + cols.length;
  next.combo = lines ? state.combo + 1 : 0;
  const scoreDelta = scoreForClear(lines, next.combo);
  next.score += scoreDelta;
  next.stats.lines += lines;
  next.stats.stars += collectedStars;
  next.stats.placements += 1;
  if (lines >= 2) next.stats.multiClears += 1;
  if (rows.length && cols.length) next.stats.crossClears += 1;
  next.stats.maxLines = Math.max(next.stats.maxLines, lines);
  next.stats.maxCombo = Math.max(next.stats.maxCombo, next.combo);
  next.used.push(slot);
  next.placedInGroup += 1;
  next.lastEvent = {
    type: 'place', group: state.group, slot, shapeId: shape.id, x, y,
    cells: shape.cells.map(([dx, dy]) => cellIndex(x + dx, y + dy)), rows, cols, clearedCells,
    lines, scoreDelta, collectedStars, discarded: null, groupCompleted: false, nextGroup: null,
  };
  // Victory is checked before discarding, exhausting stock or detecting blockage.
  if (next.mode === 'level' && goalsMet(next)) {
    next.status = 'won'; next.reason = null; next.stars = getStars(next);
    return next;
  }
  if (next.placedInGroup === 2) {
    const discardedSlot = [0, 1, 2].find((candidateSlot) => !next.used.includes(candidateSlot));
    const discardedCandidate = next.candidates[discardedSlot];
    const discardedShape = SHAPE_BY_ID[discardedCandidate.shapeId];
    next.stats.discardedBlocks += 1;
    next.stats.discardedCells += discardedShape.size;
    next.completedGroups += 1;
    next.lastEvent.discarded = { slot: discardedSlot, ...discardedCandidate, size: discardedShape.size };
    next.lastEvent.groupCompleted = true;
    if (next.mode === 'level' && next.config.discardBudget !== undefined && next.stats.discardedCells > next.config.discardBudget) {
      next.status = 'lost'; next.reason = 'discard-budget'; return next;
    }
    const limit = next.mode === 'level' ? next.config.maxGroups + (next.continued ? (next.config.continuationGroups ?? 2) : 0) : Infinity;
    if (next.completedGroups >= limit) { next.status = 'lost'; next.reason = 'groups-exhausted'; return next; }
    if (issuedOnly) { next.waitingNextGroup = true; return next; }
    nextGroup(next);
    next.lastEvent.nextGroup = next.group;
  } else ensurePlayable(next);
  return next;
}

export function place(state, slot, x, y) { return placeInternal(state, slot, x, y, false); }

// A ranked client owns only the current three candidates. It can play those
// while offline, then waits for the authoritative next group without RNG data.
export function placeIssuedGroup(state, slot, x, y) {
  if (state.mode !== 'endless') return state;
  const next = placeInternal(state, slot, x, y, true);
  if (next !== state) { delete next.rng; delete next._undo; next.canUndo = false; next.undoRemaining = 0; }
  return next;
}

export function undo(state) {
  if (state.mode !== 'level' || !state.canUndo || state.undoRemaining <= 0 || !state._undo) return state;
  const previous = clone(state._undo);
  previous.undoRemaining = state.undoRemaining - 1;
  previous.canUndo = false;
  delete previous._undo;
  previous.lastEvent = { type: 'undo', group: previous.group, discarded: null, rows: [], cols: [], clearedCells: [], lines: 0, scoreDelta: 0 };
  return previous;
}
export function continueLevel(state, rewardId) {
  if (state.mode !== 'level' || state.status !== 'lost' || state.reason !== 'groups-exhausted' || state.continued || typeof rewardId !== 'string' || !rewardId) return state;
  const next = clone(state);
  next.continued = true; next.continueRewardId = rewardId;
  next.status = 'playing'; next.reason = null;
  next.canUndo = false; delete next._undo;
  nextGroup(next);
  next.lastEvent = { type: 'continue', rewardId, group: next.group, nextGroup: next.group, discarded: null, rows: [], cols: [], clearedCells: [], lines: 0, scoreDelta: 0 };
  return next;
}
export function finishEndless(state) {
  if (state.mode !== 'endless' || state.status !== 'playing') return state;
  const next = clone(state);
  next.status = 'finished'; next.reason = 'ended'; next.canUndo = false;
  next.lastEvent = { type: 'finish', discarded: null, rows: [], cols: [], clearedCells: [], lines: 0, scoreDelta: 0 };
  return next;
}
export function replay(seed, moves, { ranked = true } = {}) {
  let state = createEndless(seed, { ranked });
  if (!Array.isArray(moves)) return { ok: false, state, error: 'invalid-moves', invalidIndex: 0 };
  for (const [i, action] of moves.entries()) {
    if (!action || typeof action !== 'object') return { ok: false, state, error: 'invalid-action', invalidIndex: i };
    const next = place(state, action.slot, action.x, action.y);
    if (next === state) return { ok: false, state, error: 'illegal-placement', invalidIndex: i };
    state = next;
  }
  return { ok: true, state };
}

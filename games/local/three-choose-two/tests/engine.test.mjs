import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  createLevel, createEndless, place, placeIssuedGroup, undo, canPlace, hasPlacement, previewPlacement,
  scoreForClear, continueLevel, finishEndless, replay,
} from '../src/engine.mjs';
import { SHAPES, SHAPE_BY_ID } from '../src/shapes.mjs';
import { sha256, createCounterRng, nextCounterRandom, RANDOM_VERSION } from '../src/random.mjs';
import {
  createProgress, readProgress, saveProgress, recordLevelResult, recordEndlessResult,
  isLevelUnlocked, mergeProgress, saveCurrentGame, resumeState, totalStars,
} from '../src/progress.mjs';

const piece = (shapeId = 'dot') => ({ shapeId, color: 2 });
const empty = () => Array(64).fill(0);
const idx = (x, y) => y * 8 + x;
function config({ board = empty(), groups = 8, goal = { lines: 99 }, candidates, budget, stars } = {}) {
  return { id: 1, title: '规则测试', maxGroups: groups, initialBoard: board,
    candidates: candidates ?? Array.from({ length: groups + 2 }, () => [piece(), piece(), piece()]),
    goal, starThresholds: { two: groups, three: 1 }, continuationGroups: 2,
    ...(budget === undefined ? {} : { discardBudget: budget }), ...(stars ? { initialStars: stars } : {}),
  };
}
function rowGaps(rows, x = 0) {
  const board = empty();
  for (const y of rows) for (let xx = 0; xx < 8; xx++) if (xx !== x) board[idx(xx, y)] = 1;
  return board;
}
function checkerboard() { return Array.from({ length: 64 }, (_, i) => ((i % 8) + Math.floor(i / 8)) % 2 ? 1 : 0); }

test('fixed shape library has connected unique fixed orientations and at most nine cells', () => {
  assert.equal(SHAPES.length, 25);
  const signatures = new Set();
  for (const shape of SHAPES) {
    assert.equal(shape.cells.length, shape.size);
    assert.ok(shape.size >= 1 && shape.size <= 9);
    const points = new Set(shape.cells.map(([x, y]) => `${x},${y}`));
    assert.equal(points.size, shape.size);
    const reached = new Set();
    const queue = [shape.cells[0]];
    while (queue.length) {
      const [x, y] = queue.pop(), key = `${x},${y}`;
      if (reached.has(key)) continue;
      reached.add(key);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (points.has(`${x + dx},${y + dy}`)) queue.push([x + dx, y + dy]);
    }
    assert.equal(reached.size, shape.size);
    signatures.add([...points].sort().join(';'));
  }
  assert.equal(signatures.size, SHAPES.length);
});

test('one unusable candidate cannot end a group while another still fits', () => {
  const stock = Array.from({ length: 10 }, () => [piece(), piece('square3'), piece()]);
  let state = createLevel(config({ board: checkerboard(), candidates: stock }));
  assert.equal(hasPlacement(state, 1), false);
  state = place(state, 0, 0, 0);
  assert.equal(state.status, 'playing');
  assert.deepEqual(state.used, [0]);
  assert.equal(hasPlacement(state, 2), true);
});

test('a first clear immediately opens the originally unusable large block', () => {
  let state = createLevel(3);
  const first = state.config.solution[0];
  const second = state.config.solution[1];
  assert.equal(hasPlacement(state, second.slot), false);
  state = place(state, first.slot, first.x, first.y);
  assert.equal(canPlace(state, second.slot, second.x, second.y), true);
  assert.equal(state.status, 'playing');
});

test('both remaining blocks being blocked loses without skipping the second placement', () => {
  const stock = Array.from({ length: 10 }, () => [piece(), piece('square3'), piece('square3')]);
  const state = place(createLevel(config({ board: checkerboard(), candidates: stock })), 0, 0, 0);
  assert.equal(state.status, 'lost');
  assert.equal(state.reason, 'no-placement');
  assert.equal(state.placedInGroup, 1);
  assert.equal(state.stats.discardedBlocks, 0);
  assert.equal(continueLevel(state, 'reward'), state);
});

test('intersection clears two lines and the fifteen-cell union once', () => {
  const board = empty();
  for (let n = 0; n < 8; n++) { if (n !== 4) board[idx(n, 3)] = 1; if (n !== 3) board[idx(4, n)] = 1; }
  const stock = Array.from({ length: 10 }, () => [{ ...piece(), stars: [[0, 0]] }, piece(), piece()]);
  const initial = createLevel(config({ board, candidates: stock }));
  const preview = previewPlacement(initial, 0, 4, 3);
  assert.deepEqual(preview.rows, [3]); assert.deepEqual(preview.cols, [4]); assert.equal(preview.lines, 2);
  const state = place(initial, 0, 4, 3);
  assert.equal(state.stats.lines, 2); assert.equal(state.stats.crossClears, 1); assert.equal(state.stats.multiClears, 1);
  assert.equal(state.lastEvent.clearedCells.length, 15); assert.equal(new Set(state.lastEvent.clearedCells).size, 15);
  assert.equal(state.score, 300); assert.equal(state.stats.stars, 1); assert.equal(state.board.filter(Boolean).length, 0);
  assert.equal(initial.stats.lines, 0, 'pure transitions do not mutate the previous state');
});

test('star cells persist until cleared and discarded stars are never collected', () => {
  const stock = Array.from({ length: 10 }, () => [{ ...piece(), stars: [[0, 0]] }, piece(), { ...piece(), stars: [[0, 0]] }]);
  let state = createLevel(config({ candidates: stock }));
  state = place(state, 0, 0, 0);
  assert.equal(state.starBoard[0], true); assert.equal(state.stats.stars, 0);
  state = place(state, 1, 1, 0);
  assert.equal(state.stats.stars, 0); assert.equal(state.stats.discardedBlocks, 1);
  assert.equal(state.starBoard[0], true);
});

test('combo crosses groups, caps the bonus at five and resets only on a successful non-clear', () => {
  let state = createLevel(config({ board: rowGaps([0, 2, 4, 5, 6, 7]) }));
  for (const [i, y] of [0, 2, 4, 6, 7].entries()) {
    state = place(state, i % 2, 0, y);
    assert.equal(state.combo, i + 1);
    assert.equal(state.lastEvent.scoreDelta, [100, 125, 150, 175, 200][i]);
  }
  const unchanged = place(state, 1, -1, 0);
  assert.equal(unchanged, state); assert.equal(state.combo, 5);
  state = place(state, 1, 1, 1);
  assert.equal(state.combo, 0); assert.equal(state.lastEvent.scoreDelta, 0);
  state = place(state, 0, 0, 5);
  assert.equal(state.combo, 1); assert.equal(state.lastEvent.scoreDelta, 100);
  assert.equal(state.stats.maxCombo, 5);
  assert.equal(scoreForClear(2, 3), 400); assert.equal(scoreForClear(3, 1), 600); assert.equal(scoreForClear(1, 20), 200);
});

test('the second placement discards exactly one block and preserves candidate slot positions', () => {
  let state = createLevel(config());
  state = place(state, 2, 0, 0); assert.deepEqual(state.used, [2]); assert.equal(state.candidates.length, 3);
  state = place(state, 0, 1, 0);
  assert.equal(state.stats.discardedBlocks, 1); assert.equal(state.stats.discardedCells, 1);
  assert.equal(state.lastEvent.discarded.slot, 1); assert.equal(state.completedGroups, 1); assert.equal(state.group, 2);
  assert.equal(state.placedInGroup, 0); assert.deepEqual(state.used, []);
});

test('victory on the first placement precedes blockage, budget and automatic discard', () => {
  const stock = Array.from({ length: 3 }, () => [piece(), piece('square3'), piece('square3')]);
  const state = place(createLevel(config({ board: rowGaps([2]), groups: 1, candidates: stock, goal: { lines: 1 }, budget: 0 })), 0, 0, 2);
  assert.equal(state.status, 'won'); assert.equal(state.stats.discardedCells, 0);
  assert.equal(state.completedGroups, 0); assert.equal(state.stars, 3);
  assert.equal(place(state, 1, 0, 0), state);
});

test('the last second placement wins first, while unmet goals exhaust groups', () => {
  const won = place(place(createLevel(config({ board: rowGaps([0, 2]), groups: 1, goal: { lines: 2 } })), 0, 0, 0), 1, 0, 2);
  assert.equal(won.status, 'won'); assert.equal(won.stats.discardedBlocks, 0);
  const lost = place(place(createLevel(config({ board: rowGaps([0, 2]), groups: 1, goal: { lines: 3 } })), 0, 0, 0), 1, 0, 2);
  assert.equal(lost.status, 'lost'); assert.equal(lost.reason, 'groups-exhausted'); assert.equal(lost.completedGroups, 1);
});

test('budget overflow fails immediately and undo restores the pre-discard stats', () => {
  const initial = createLevel(config({ budget: 0 }));
  const first = place(initial, 0, 0, 0);
  const failed = place(first, 1, 1, 0);
  assert.equal(failed.reason, 'discard-budget'); assert.equal(failed.stats.discardedCells, 1);
  assert.equal(continueLevel(failed, 'ad'), failed);
  const restored = undo(failed);
  assert.equal(restored.status, 'playing'); assert.equal(restored.stats.discardedCells, 0);
  assert.deepEqual(restored.board, first.board); assert.equal(restored.undoRemaining, 2);
});

test('undo crosses a group boundary, restores the same future stock and cannot reach further history', () => {
  let state = createLevel(2);
  const [a, b] = state.config.solution;
  state = place(state, a.slot, a.x, a.y);
  const first = state;
  const after = place(state, b.slot, b.x, b.y);
  assert.equal(after.group, 2);
  const restored = undo(after);
  assert.deepEqual(restored.board, first.board); assert.deepEqual(restored.candidates, first.candidates); assert.deepEqual(restored.used, first.used);
  assert.deepEqual(restored.stats, first.stats); assert.equal(restored.score, first.score); assert.equal(restored.combo, first.combo);
  assert.equal(undo(restored), restored, 'single undo cannot chase a second history frame');
  const repeated = place(restored, b.slot, b.x, b.y);
  assert.deepEqual(repeated.candidates, after.candidates); assert.deepEqual(repeated.board, after.board);
  state = repeated;
  for (let i = 0; i < 2; i++) { state = undo(state); state = place(state, b.slot, b.x, b.y); }
  assert.equal(state.undoRemaining, 0); assert.equal(undo(state), state);
});

test('invalid coordinates, reused slots and duplicate terminal actions have no effect', () => {
  let state = createLevel(config());
  for (const [slot, x, y] of [[-1, 0, 0], [3, 0, 0], [0, 8, 0], [0, 0, -1], [0, 0.1, 1], ['0', 0, 0]]) assert.equal(place(state, slot, x, y), state);
  state = place(state, 0, 0, 0);
  assert.equal(place(state, 0, 1, 0), state); assert.equal(place(state, 1, 0, 0), state);
  assert.equal(previewPlacement(state, 1, 0, 0).valid, false);
});

test('continuation requires a confirmed reward id, applies once and awards only one star', () => {
  const initial = createLevel(config({ groups: 1, board: rowGaps([0, 2, 4]), goal: { lines: 3 } }));
  const lost = place(place(initial, 0, 0, 0), 1, 0, 2);
  assert.equal(lost.reason, 'groups-exhausted');
  assert.equal(continueLevel(lost, ''), lost);
  let continued = continueLevel(lost, 'confirmed-transaction-1');
  assert.equal(continued.group, 2); assert.deepEqual(continued.board, lost.board); assert.equal(continued.score, lost.score);
  assert.equal(continued.continued, true); assert.equal(continueLevel(continued, 'confirmed-transaction-1'), continued);
  continued = place(continued, 0, 0, 4);
  assert.equal(continued.status, 'won'); assert.equal(continued.stars, 1);
});

test('endless draws replay exactly, has no success undo and active end preserves the score', () => {
  let state = createEndless('server-session-seed', { ranked: true });
  assert.equal(state.undoRemaining, 0); assert.equal('_undo' in state, false); assert.equal('seed' in state, false);
  const moves = [];
  for (let step = 0; step < 30 && state.status === 'playing'; step++) {
    let action;
    for (let slot = 0; slot < 3 && !action; slot++) for (let y = 0; y < 8 && !action; y++) for (let x = 0; x < 8 && !action; x++) if (canPlace(state, slot, x, y)) action = { slot, x, y };
    assert.ok(action); moves.push(action); state = place(state, action.slot, action.x, action.y);
    assert.equal('_undo' in state, false); assert.equal(undo(state), state);
  }
  const result = replay('server-session-seed', moves);
  assert.equal(result.ok, true); assert.deepEqual(result.state, state);
  const invalid = replay('server-session-seed', [{ slot: 0, x: 100, y: 0 }]);
  assert.equal(invalid.ok, false); assert.equal(invalid.invalidIndex, 0);
  const ended = finishEndless(createEndless(42));
  assert.equal(ended.status, 'finished'); assert.equal(ended.score, 0); assert.equal(finishEndless(ended), ended);
});

test('the public generator forbids triple nine-cell groups and levels do not influence endless draws', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const a = createEndless(seed), b = createEndless(seed);
    assert.deepEqual(a.candidates, b.candidates);
    assert.equal(a.candidates.every(({ shapeId }) => SHAPE_BY_ID[shapeId].size === 9), false);
  }
  for (const [seed, ranked] of [[15939, false], ['0000000000000000000000000000000000000000000000000000000000005535', true]]) {
    const state = createEndless(seed, { ranked });
    assert.deepEqual(state.candidates.slice(0, 2).map(({ shapeId }) => shapeId), ['square3', 'square3']);
    assert.notEqual(state.candidates[2].shapeId, 'square3', 'the third draw excludes nine cells when the first two are nine cells');
  }
});

test('an offline ranked projection consumes only its issued group without secrets or fake future candidates', () => {
  let authoritative = createEndless(334, { ranked: true });
  const issued = JSON.parse(JSON.stringify(authoritative)); delete issued.rng;
  let projected = issued;
  const originalCandidates = JSON.parse(JSON.stringify(issued.candidates));
  for (let step = 0; step < 2; step++) {
    let action;
    for (let slot = 0; slot < 3 && !action; slot++) for (let y = 0; y < 8 && !action; y++) for (let x = 0; x < 8 && !action; x++) if (canPlace(projected, slot, x, y)) action = { slot, x, y };
    assert.ok(action);
    projected = placeIssuedGroup(projected, action.slot, action.x, action.y);
    authoritative = place(authoritative, action.slot, action.x, action.y);
    assert.deepEqual(projected.board, authoritative.board);
    assert.deepEqual(projected.stats, authoritative.stats);
    assert.equal(projected.score, authoritative.score); assert.equal(projected.combo, authoritative.combo);
    assert.equal('rng' in projected, false); assert.equal('seed' in projected, false); assert.equal('_undo' in projected, false);
  }
  assert.equal(projected.waitingNextGroup, true); assert.equal(projected.group, 1);
  assert.equal(projected.completedGroups, 1); assert.equal(projected.placedInGroup, 2);
  assert.deepEqual(projected.candidates, originalCandidates); assert.equal(projected.lastEvent.nextGroup, null);
  assert.equal(projected.status, 'playing'); assert.equal(projected.reason, null);
  assert.equal(hasPlacement(projected), false);
  for (let slot = 0; slot < 3; slot++) assert.equal(placeIssuedGroup(projected, slot, 0, 0), projected, 'a third placement cannot consume an unissued group');
  assert.equal(placeIssuedGroup(createLevel(1), 0, 0, 0).mode, 'level');
});

test('saved progress unlocks through wins, preserves better results and degrades with unavailable storage', () => {
  const initial = createProgress();
  let state = createLevel(1);
  for (const action of state.config.solution) state = place(state, action.slot, action.x, action.y);
  const progress = recordLevelResult(initial, state);
  assert.equal(initial.unlocked, 1); assert.equal(progress.unlocked, 2); assert.equal(totalStars(progress), 3);
  assert.equal(isLevelUnlocked(progress, 2), true); assert.equal(isLevelUnlocked(progress, 3), false);
  let value;
  const storage = { getItem: () => value, setItem: (_, next) => { value = next; } };
  assert.equal(saveProgress(storage, saveCurrentGame(progress, createLevel(2))), true);
  const restored = readProgress(storage); assert.deepEqual(resumeState(restored).board, createLevel(2).board);
  const remote = { ...progress, records: { 1: { stars: 1, bestGroups: 2, continued: true } } };
  assert.equal(mergeProgress(progress, remote).records[1].stars, 3); assert.equal(mergeProgress(progress, remote).records[1].bestGroups, 1);
  assert.equal(saveProgress({ setItem() { throw Error('blocked'); } }, progress), false);
  assert.deepEqual(readProgress({ getItem() { throw Error('blocked'); } }), createProgress());
  assert.deepEqual(readProgress({ getItem: () => '{' }), createProgress());
  assert.equal(readProgress({ getItem: () => JSON.stringify({ version: 1, unlocked: 30 }) }).unlocked, 1);
  assert.equal(saveCurrentGame(progress, createEndless(12, { ranked: true })).currentGame, null);
  assert.equal(recordEndlessResult(progress, finishEndless(createEndless(12))).practiceBest, 0);
});

test('refill replaces only the placed slot after clearing, without discards or group consumption', () => {
  let state = createEndless(42, { variant: 'refill' });
  state.board = rowGaps([0]); state.candidates = [piece(), piece('square3'), piece('square2')];
  state.rng = 1; // First replacement is a deterministic dot.
  const before = structuredClone(state);
  state = place(state, 0, 0, 0);
  assert.equal(state.score, 100); assert.equal(state.stats.lines, 1);
  assert.equal(state.lastEvent.refilledSlot, 0);
  assert.deepEqual(state.candidates.slice(1), before.candidates.slice(1));
  assert.notEqual(state.rng, before.rng);
  assert.deepEqual(state.used, []); assert.equal(state.placedInGroup, 0);
  assert.equal(state.completedGroups, 0); assert.equal(state.stats.discardedBlocks, 0);
  assert.equal(state.lastEvent.discarded, null); assert.equal(state.lastEvent.nextGroup, null);
  const second = place(state, 0, 0, 1);
  assert.equal(second.stats.placements, 2); assert.equal(second.group, 2);
  assert.equal(second.stats.discardedCells, 0); assert.equal(second.canUndo, false);
  assert.equal(before.stats.placements, 0);
});

test('refill detects blockage only after replacement and rejects illegal or ranked usage', () => {
  const state = createEndless(42, { variant: 'refill' });
  state.board = checkerboard(); state.candidates = [piece(), piece('square3'), piece('square3')]; state.rng = 1;
  assert.equal(place(state, 1, 0, 0), state);
  const next = place(state, 0, 0, 0);
  assert.equal(next.status, 'playing', 'new dot is playable even when both retained blocks are blocked');
  assert.equal(next.candidates[0].shapeId, 'dot');
  state.rng = 100000;
  const blocked = place(state, 0, 0, 0);
  assert.equal(hasPlacement(blocked), false); assert.equal(blocked.status, 'lost');
  assert.equal(blocked.reason, 'no-placement'); assert.equal(blocked.candidates.length, 3);
  assert.throws(() => createEndless(1, { ranked: true, variant: 'refill' }), RangeError);
  assert.throws(() => createEndless(1, { variant: 'unknown' }), RangeError);
  assert.equal(placeIssuedGroup(state, 0, 0, 0), state);
});

test('refill resumes the same next draw and keeps records separate while migrating old saves', () => {
  const old = { version: 1, practiceBest: 250, settings: { reducedFlash: true }, currentGame: createEndless(17) };
  const progress = readProgress({ getItem: () => JSON.stringify(old) });
  assert.equal(progress.refillBest, 0); assert.equal(progress.practiceBest, 250);
  assert.equal(progress.settings.reducedFlash, true); assert.deepEqual(resumeState(progress), old.currentGame);
  const original = createEndless(42, { variant: 'refill' });
  const saved = saveCurrentGame(progress, original);
  const restored = resumeState(readProgress({ getItem: () => JSON.stringify(saved) }));
  assert.deepEqual(place(restored, 0, 0, 0), place(original, 0, 0, 0));
  let ended = finishEndless(original); ended.score = 400;
  const result = recordEndlessResult(progress, ended);
  assert.equal(result.refillBest, 400); assert.equal(result.practiceBest, 250);
  const classic = finishEndless(createEndless(1)); classic.score = 500;
  const combined = recordEndlessResult(result, classic);
  assert.equal(combined.refillBest, 400); assert.equal(combined.practiceBest, 500);
  assert.equal(mergeProgress(progress, result).refillBest, 400);
  assert.equal(saveCurrentGame(progress, { ...original, variant: 'unknown' }).currentGame, null);
});

test('shared rules and saves work on native runtimes without structuredClone', () => {
  const previous = globalThis.structuredClone;
  try {
    globalThis.structuredClone = undefined;
    let state = createLevel(1);
    const action = state.config.solution[0];
    state = place(state, action.slot, action.x, action.y);
    assert.equal(state.status, 'won');
    assert.equal(undo(state).status, 'playing');
    assert.equal(recordLevelResult(createProgress(), state).unlocked, 2);
    const endless = createEndless(1); assert.equal(finishEndless(endless).status, 'finished');
    const ranked = createEndless('ab'.repeat(32), { ranked: true });
    assert.equal(finishEndless(ranked).rng.key, 'ab'.repeat(32));
  } finally { globalThis.structuredClone = previous; }
});

test('synchronous SHA-256 matches published vectors and the standard Node implementation', () => {
  const vectors = [
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
    ['a'.repeat(1_000_000), 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0'],
  ];
  for (const [input, expected] of vectors) assert.equal(sha256(input), expected);
  for (const input of ['三块选两块', '🌱积木🧩', '\ud800', ...Array.from({ length: 100 }, (_, i) => `${i}:` + 'counter-seed'.repeat(i))])
    assert.equal(sha256(input), createHash('sha256').update(input).digest('hex'));
});

test('ranked draw derives counter tickets from the full secret seed and preserves it through serialization', () => {
  const key = '0123456789abcdef'.repeat(4);
  let rng = createCounterRng(key);
  for (let counter = 0; counter < 20; counter++) {
    const result = nextCounterRandom(rng);
    const expected = createHash('sha256').update(`three-choose-two/${RANDOM_VERSION}\u0000${key}\u0000${counter}`).digest('hex');
    assert.equal(result.value, Number.parseInt(expected.slice(0, 8), 16) / 4294967296);
    assert.equal(result.rng.counter, counter + 1); assert.equal(result.rng.key, key);
    rng = JSON.parse(JSON.stringify(result.rng));
  }
  const state = createEndless(key, { ranked: true });
  assert.equal(state.rng.algorithm, RANDOM_VERSION); assert.equal(state.rng.key, key); assert.equal(state.rng.counter, 3);
  assert.deepEqual(createEndless(key, { ranked: true }), state);
  assert.notDeepEqual(createEndless(key.slice(0, -1) + '0', { ranked: true }).rng, state.rng);
  assert.equal(typeof createEndless(1234, { ranked: false }).rng, 'number');
  assert.deepEqual(createEndless(1234, { ranked: false }).candidates.map(({ shapeId }) => shapeId), ['h2', 'v5', 'l5-se'], 'numeric practice distribution remains frozen');
});

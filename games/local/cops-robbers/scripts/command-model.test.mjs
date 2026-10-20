import assert from 'node:assert/strict';
import test from 'node:test';
import { minimizeCommands, seededRandom, snapshotModel } from './command-model.mjs';

const initial = { cops: [0, 1], robbers: [4], turn: 0, phase: 'planning' };
const moved = { cops: [2, 1], robbers: [3], turn: 1, phase: 'planning' };
const signature = 'assertion:undo-restores-previous-board';

test('snapshot properties detect independently injected hint, undo and restart defects', () => {
  const model = snapshotModel(initial);
  assert.throws(() => model.hint(initial, moved), error => error.signature === 'assertion:hint-preserves-board');
  model.hint(moved, structuredClone(moved));
  model.moved(initial);
  assert.throws(() => model.undo(moved), error => error.signature === signature);
  assert.equal(model.depth, 1, 'failed checks do not mutate the oracle');
  model.undo(structuredClone(initial));
  assert.equal(model.depth, 0);
  model.moved(initial); model.moved(moved);
  assert.throws(() => model.restart(moved), error => error.signature === 'assertion:restart-restores-initial-board');
  model.restart(structuredClone(initial));
  assert.equal(model.depth, 0);
});

test('the model owns copies of its initial and history observations', () => {
  const start = structuredClone(initial), before = structuredClone(initial);
  const model = snapshotModel(start);
  model.moved(before); start.cops[0] = 99; before.cops[0] = 98;
  model.undo(structuredClone(initial));
  model.restart(structuredClone(initial));
});

test('fixed seeds reproduce choices without sharing generator state', () => {
  const a = seededRandom(91842), b = seededRandom(91842);
  assert.deepEqual(Array.from({ length: 20 }, a), Array.from({ length: 20 }, b));
  assert.notDeepEqual(Array.from({ length: 5 }, seededRandom(91842)), Array.from({ length: 5 }, seededRandom(20261020)));
});

test('shrinking retains the trigger and rejects invalid or different failures', async () => {
  const original = ['noise', 'move', 'noise', 'undo', 'tail'];
  const replay = async commands => {
    if (commands.includes('undo') && !commands.includes('move')) return { status: 'invalid', signature };
    if (!commands.includes('undo')) return { status: 'failed', signature: 'assertion:another-property' };
    return { status: 'failed', signature };
  };
  const accepted = [];
  const result = await minimizeCommands(original, replay, { signature, maxAttempts: 30,
    onAccept: commands => accepted.push(commands) });
  assert.deepEqual(result.commands, ['move', 'undo']);
  assert.equal((await replay(result.commands)).signature, signature);
  assert.ok(accepted.length > 0);
  assert.ok(result.attemptsLog.some(attempt => attempt.status === 'invalid' && !attempt.accepted));
  assert.deepEqual(original, ['noise', 'move', 'noise', 'undo', 'tail']);
});

test('shrinking has a hard attempt budget and does not accept runner errors', async () => {
  let calls = 0;
  const result = await minimizeCommands(['move', 'hint', 'undo', 'restart'],
    async () => { calls++; return { status: 'error', signature }; },
    { signature, maxAttempts: 2 });
  assert.equal(calls, 2);
  assert.equal(result.budgetExhausted, true);
  assert.equal(result.commands.length, 4);
});

test('accepted evidence is saved before a later shrink attempt throws', async () => {
  let calls = 0, saved;
  await assert.rejects(minimizeCommands(['a', 'b', 'c', 'd'], async () => {
    if (++calls > 1) throw new Error('runner unavailable');
    return { status: 'failed', signature };
  }, { signature, onAccept: commands => { saved = commands; } }), /runner unavailable/);
  assert.deepEqual(saved, ['c', 'd']);
});

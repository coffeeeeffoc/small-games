import test from 'node:test';
import assert from 'node:assert/strict';
import { createLevel, createEndless, place, hasPlacement, undo } from '../src/engine.mjs';
import { canResetOptions, resetOptions, createRewardGate } from '../src/rewards.mjs';

test('reset replaces only unused slots and keeps the normal random stream and objectives', () => {
  for (let state of [
    createLevel(10),
    createEndless(52),
    createEndless(52, { variant: 'refill' }),
  ]) {
    if (state.mode === 'level')
      state = place(state, ...Object.values(state.config.solution[0]));
    const original = structuredClone(state),
      next = resetOptions(state, 'completed-1');
    assert.notEqual(next, state);
    assert.deepEqual(state, original);
    for (const key of [
      'board',
      'starBoard',
      'score',
      'group',
      'used',
      'placedInGroup',
      'stats',
      'config',
      'rng',
      'undoRemaining',
    ])
      assert.deepEqual(next[key], state[key], key);
    for (const slot of state.used)
      assert.deepEqual(next.candidates[slot], state.candidates[slot]);
    for (let slot = 0; slot < 3; slot++)
      assert.equal(
        next.candidates[slot].stars?.length || 0,
        state.candidates[slot].stars?.length || 0,
      );
    assert.equal(hasPlacement(next), true);
    assert.equal(next.canUndo, false);
    assert.equal(next._undo, undefined);
    assert.equal(undo(next), next);
    assert.equal(resetOptions(next, 'completed-1'), next);
  }
});
test('fair challenges and authoritative online states cannot reset', () => {
  for (const state of [
    { ...createEndless(1), challenge: true },
    createEndless(1, { ranked: true }),
  ]) {
    assert.equal(canResetOptions(state), false);
    assert.equal(resetOptions(state, 'reward'), state);
  }
  assert.equal(canResetOptions(createEndless(1), true), false);
});
test('completed grants once; all other outcomes, cancellation and stale positions do not grant', async () => {
  for (const status of ['completed', 'failed', 'dismissed', 'unavailable']) {
    let state = createEndless(5),
      grants = 0;
    const gate = createRewardGate({
      getState: () => state,
      eligible: () => true,
      getPort: () => ({ offer: async () => ({ status }) }),
      grant: () => grants++,
    });
    assert.equal((await gate.request('reset')).status, status);
    assert.equal(grants, status === 'completed' ? 1 : 0);
    assert.equal(gate.pending, false);
  }
  for (const stale of ['cancel', 'position']) {
    let state = createEndless(5),
      complete,
      grants = 0;
    const gate = createRewardGate({
      getState: () => state,
      eligible: () => true,
      getPort: () => ({
        offer: () => new Promise((resolve) => (complete = resolve)),
        cancel() {},
      }),
      grant: () => grants++,
    });
    const request = gate.request('reset');
    assert.equal((await gate.request('reset')).status, 'unavailable');
    if (stale === 'cancel') gate.cancel();
    else state = createEndless(9);
    complete({ status: 'completed' });
    assert.equal((await request).status, 'dismissed');
    assert.equal(grants, 0);
    assert.equal(gate.pending, false);
  }
});
test('dense boards retain a legal option without discarding candidate stars', () => {
  for (let seed = 1; seed < 40; seed++) {
    const state = createEndless(seed);
    state.board.fill(1);
    state.board[0] = 0;
    state.candidates = [
      { shapeId: 'dot', color: 1, stars: [[0, 0]] },
      { shapeId: 'square3', color: 2 },
      { shapeId: 'square3', color: 3 },
    ];
    const next = resetOptions(state, 'dense-' + seed);
    assert.equal(hasPlacement(next), true);
    assert.equal(next.candidates[0].stars.length, 1);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createLevel, createEndless, canPlace, place } from '../src/engine.mjs';
import { STORAGE_KEY, createProgress, saveCurrentGame } from '../src/progress.mjs';
await import('../scripts/prepare.mjs');
const { createSession } = await import('../assets/scripts/GameSession.ts');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function fixture(store = new Map(), port) {
  let failProgress = false,
    failOnline = false;
  const storage = {
    getItem: (k) => store.get(k) || null,
    setItem(k, v) {
      if (
        (failProgress && k === STORAGE_KEY) ||
        (failOnline && k === 'three-choose-two-online-v1')
      )
        throw Error('QuotaExceededError');
      store.set(k, v);
    },
  };
  const session = createSession({
    storage,
    port: () => port,
    changed() {},
    inspect: () => session.data,
    hidden: () => false,
    audio: { syncMusic() {}, stop() {}, play() {}, vibrate() {} },
  });
  return {
    session,
    store,
    failProgress(v) {
      failProgress = v;
    },
    failOnline(v) {
      failOnline = v;
    },
  };
}
async function begin(session) {
  await session.dispatch('start');
  await session.dispatch('begin');
}
test('finishing a level is saved before its presentation delay or immediate home', async () => {
  const f = fixture();
  try {
    await begin(f.session);
    const move = f.session.data.state.config.solution[0];
    f.session.place(move.slot, move.x, move.y);
    assert.equal(f.session.data.progress.unlocked, 2);
    await f.session.dispatch('home');
    await wait(320);
    assert.equal(f.session.data.screen, 'home');
    assert.equal(JSON.parse(f.store.get(STORAGE_KEY)).unlocked, 2);
  } finally {
    f.session.dispose();
  }
});
test('cancelled reward A cannot close or grant a newer request B', async () => {
  const pending = [];
  const f = fixture(new Map(), { offer: () => new Promise((r) => pending.push(r)) });
  try {
    await begin(f.session);
    await f.session.dispatch('reset-options');
    const a = f.session.dispatch('reward-confirm');
    await f.session.dispatch('reward-cancel');
    await f.session.dispatch('reset-options');
    const b = f.session.dispatch('reward-confirm');
    pending[0]({ status: 'completed' });
    await a;
    assert.equal(f.session.data.modal, 'reset');
    assert.equal(f.session.data.rewardPending, true);
    assert.equal(f.session.data.state.resetRewardIds, undefined);
    pending[1]({ status: 'completed' });
    await b;
    assert.equal(f.session.data.state.resetRewardIds.length, 1);
    assert.equal(f.store.get('three-choose-two-pending-reward-v1'), 'null');
  } finally {
    f.session.dispose();
  }
});
test('completed reset survives a failed progress write through its receipt', async () => {
  const store = new Map(),
    f = fixture(store, { offer: async () => ({ status: 'completed' }) });
  await begin(f.session);
  f.failProgress(true);
  await f.session.dispatch('reset-options');
  await f.session.dispatch('reward-confirm');
  const rewarded = f.session.data.state;
  assert(store.get('three-choose-two-pending-reward-v1') !== 'null');
  f.session.dispose();
  const recovered = fixture(store);
  try {
    assert.deepEqual(recovered.session.data.progress.currentGame, rewarded);
    assert.equal(store.get('three-choose-two-pending-reward-v1'), 'null');
  } finally {
    recovered.session.dispose();
  }
});
test('stale receipt cannot replace a newer saved game', async () => {
  const store = new Map(),
    f = fixture(store, { offer: async () => ({ status: 'completed' }) });
  await begin(f.session);
  const state = f.session.data.state;
  await f.session.dispatch('home');
  await f.session.dispatch('endless');
  await f.session.dispatch('practice');
  const current = f.session.data.state;
  store.set(
    'three-choose-two-pending-reward-v1',
    JSON.stringify({ state, kind: 'reset', rewardId: 'old' }),
  );
  f.session.dispose();
  const recovered = fixture(store);
  try {
    assert.deepEqual(recovered.session.data.progress.currentGame, current);
  } finally {
    recovered.session.dispose();
  }
});
test('confirmed continuation recovers once after a failed save and keeps its reward ID', async () => {
  const state = { ...createLevel(1), status: 'lost', reason: 'groups-exhausted' };
  const store = new Map([[STORAGE_KEY, JSON.stringify(saveCurrentGame(createProgress(), state))]]);
  const f = fixture(store, { offer: async () => ({ status: 'completed' }) });
  await f.session.dispatch('start');
  f.failProgress(true);
  await f.session.dispatch('continue');
  const rewarded = f.session.data.state;
  assert.equal(rewarded.continued, true);
  assert(rewarded.continueRewardId);
  f.session.dispose();
  const recovered = fixture(store);
  try {
    assert.deepEqual(recovered.session.data.progress.currentGame, rewarded);
    assert.equal(store.get('three-choose-two-pending-reward-v1'), 'null');
  } finally { recovered.session.dispose(); }
});
test('failed recovery storage cannot prevent online sending or settlement', async () => {
  let authoritative = {
      id: 'session',
      seq: 0,
      status: 'active',
      eligible: false,
      state: createEndless(18, { ranked: true }),
    },
    sent = 0,
    finished = 0;
  globalThis.__competition = {
    request: async (path, options) => {
      if (path.endsWith('/actions')) {
        const action = JSON.parse(options.body);
        sent++;
        authoritative = {
          ...authoritative,
          seq: action.seq,
          state: place(authoritative.state, action.slot, action.x, action.y),
        };
      }
      if (path.endsWith('/finish')) {
        finished++;
        authoritative = {
          ...authoritative,
          status: 'finished',
          state: { ...authoritative.state, status: 'finished' },
        };
      }
      return structuredClone(authoritative);
    },
  };
  const f = fixture();
  try {
    await f.session.dispatch('endless');
    await f.session.dispatch('online-start');
    f.failOnline(true);
    const state = f.session.data.state;
    let move;
    for (let slot = 0; slot < 3 && !move; slot++)
      for (let y = 0; y < 8 && !move; y++)
        for (let x = 0; x < 8 && !move; x++)
          if (canPlace(state, slot, x, y)) move = { slot, x, y };
    f.session.place(move.slot, move.x, move.y);
    await wait(10);
    assert.equal(sent, 1);
    await f.session.dispatch('end-run');
    assert.equal(finished, 1);
  } finally {
    f.session.dispose();
    delete globalThis.__competition;
  }
});
test('disposed online create completion cannot overwrite recovery storage', async () => {
  let complete;
  globalThis.__competition = { request: () => new Promise((r) => (complete = r)) };
  const f = fixture();
  try {
    await f.session.dispatch('endless');
    const pending = f.session.dispatch('online-start');
    f.session.dispose();
    f.store.set('three-choose-two-online-v1', 'new-instance');
    complete({
      id: 'old',
      seq: 0,
      status: 'active',
      state: createEndless(19, { ranked: true }),
    });
    await pending;
    assert.equal(f.store.get('three-choose-two-online-v1'), 'new-instance');
  } finally {
    delete globalThis.__competition;
  }
});

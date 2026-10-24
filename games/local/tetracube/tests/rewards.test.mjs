import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.mjs';
import { adPolicy, createRewardController, readRevives } from '../assets/scripts/core/rewards.js';
import { createSaveStore, SAVE_KEY } from '../assets/scripts/core/storage.js';

function blocked(turn) {
  const game = new Game({ seed: 12 });
  if (turn) game.flipContainer(turn);
  const value = game.getSnapshot();
  value.active = null;
  value.pending = structuredClone(value.next[0]);
  value.status = 'danger';
  const [w, d, h] = value.dims;
  value.board = [];
  for (let z = h - 5; z < h; z++)
    for (let x = 0; x < w; x++)
      for (let y = 0; y < d; y++)
        value.board.push({ id: value.board.length + 1, x, y, z, color: '#92b5ff' });
  value.serial = value.board.length;
  game.restore(value);
  return game;
}
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

for (const turn of [undefined, 'left', 'right'])
  test(`revive clears exactly world-top four layers (${turn || 'upright'}) without reroll`, () => {
    const game = blocked(turn),
      before = game.getSnapshot(),
      pending = structuredClone(game.pending);
    assert.equal(game.revive(), true);
    assert.deepEqual(
      game.board,
      before.board.filter((c) => c.z < before.dims[2] - 4),
    );
    assert.equal(game.active.id, pending.id);
    assert.deepEqual(game.active.cells, pending.cells);
    for (const key of [
      'next',
      'bag',
      'rngState',
      'score',
      'lines',
      'placed',
      'flipCount',
      'orientation',
      'dims',
    ])
      assert.deepEqual(game.getSnapshot()[key], before[key], key);
    assert.equal(game.status, 'playing');
    assert.equal(game.pending, null);
    assert.equal(game.revive(), false);
  });
test('revive works after explicit game over with pending piece', () => {
  const g = blocked();
  g.end();
  assert.equal(g.revive(), true);
});
test('normal active play cannot revive or clear cells', () => {
  const g = new Game();
  const before = g.getSnapshot();
  assert.equal(g.revive(), false);
  assert.deepEqual(g.getSnapshot(), before);
});
for (const kind of ['invert', 'revive'])
  for (const status of ['completed', 'dismissed', 'unavailable', 'failed'])
    test(`${kind}: ${status} grants only on completed`, async () => {
      const g = kind === 'revive' ? blocked() : new Game({ seed: 19 }),
        before = g.getSnapshot();
      let calls = 0;
      const r = createRewardController(g, async () => {
        calls++;
        return { status };
      });
      assert.equal((await r.request(kind)).applied, status === 'completed');
      assert.equal(calls, 1);
      assert.equal(r.pending, false);
      assert.equal(r.used, kind === 'revive' && status === 'completed' ? 1 : 0);
      if (status !== 'completed') assert.deepEqual(g.getSnapshot(), before);
      else if (kind === 'invert') assert.equal(g.flipCount, 1);
    });
test('concurrent requests have one offer and one grant', async () => {
  const d = deferred(),
    g = new Game({ seed: 1 });
  let calls = 0;
  const r = createRewardController(g, () => {
    calls++;
    return d.promise;
  });
  const a = r.request('invert');
  assert.equal(r.pending, true);
  assert.equal((await r.request('invert')).applied, false);
  d.resolve({ status: 'completed' });
  assert.equal((await a).applied, true);
  assert.equal(calls, 1);
  assert.equal(g.flipCount, 1);
});
for (const exit of ['cancel', 'dispose'])
  test(`late completion after ${exit} cannot grant`, async () => {
    const d = deferred(),
      g = blocked(),
      before = g.getSnapshot(),
      r = createRewardController(g, () => d.promise);
    const request = r.request('revive');
    r[exit]();
    d.resolve({ status: 'completed' });
    assert.equal((await request).applied, false);
    assert.equal(r.used, 0);
    assert.deepEqual(g.getSnapshot(), before);
  });
test('old request cannot clear the pending state of a newer request', async () => {
  const ds = [deferred(), deferred()],
    g = new Game();
  let n = 0;
  const r = createRewardController(g, () => ds[n++].promise);
  const old = r.request('invert');
  r.cancel();
  const current = r.request('invert');
  ds[0].resolve({ status: 'completed' });
  await old;
  assert.equal(r.pending, true);
  ds[1].resolve({ status: 'completed' });
  assert.equal((await current).applied, true);
  assert.equal(g.flipCount, 1);
});
test('mutated or restored game state expires a pending grant', async () => {
  const d = deferred(),
    g = new Game(),
    r = createRewardController(g, () => d.promise);
  const request = r.request('invert');
  g.hardDrop();
  const after = g.getSnapshot();
  d.resolve({ status: 'completed' });
  assert.equal((await request).applied, false);
  assert.deepEqual(g.getSnapshot(), after);
});
test('two successful revives per run, failed attempts cost nothing', async () => {
  const g = blocked();
  let status = 'failed',
    calls = 0;
  const r = createRewardController(g, async () => {
    calls++;
    return { status };
  });
  await r.request('revive');
  assert.equal(r.used, 0);
  status = 'completed';
  assert.equal((await r.request('revive')).applied, true);
  assert.equal(r.used, 1);
  g.restore(blocked('left').getSnapshot());
  assert.equal((await r.request('revive')).applied, true);
  assert.equal(r.used, 2);
  g.restore(blocked().getSnapshot());
  const before = g.getSnapshot();
  assert.equal((await r.request('revive')).applied, false);
  assert.equal(calls, 3);
  assert.deepEqual(g.getSnapshot(), before);
});
test('reloaded revive quota and old rescueUsed are preserved', async () => {
  assert.equal(readRevives({ rescueUsed: true }), 1);
  assert.equal(readRevives({ rescueUsed: false }), 0);
  assert.equal(readRevives({ rescueUsed: true, revivesUsed: 2 }), 2);
  const r = createRewardController(
    blocked(),
    () => {
      throw Error('must not request');
    },
    readRevives({ revivesUsed: 2 }),
  );
  assert.equal((await r.request('revive')).status, 'unavailable');
  for (const n of [-1, 3, 1.5, '1', null]) assert.throws(() => readRevives({ revivesUsed: n }));
});
test('provider exception and malformed completion are failures', async () => {
  for (const offer of [
    () => {
      throw Error('offline');
    },
    async () => ({ status: true }),
    async () => ({ status: 'shown' }),
    async () => undefined,
  ]) {
    const g = new Game(),
      before = g.getSnapshot(),
      r = createRewardController(g, offer);
    assert.equal((await r.request('invert')).status, 'failed');
    assert.deepEqual(g.getSnapshot(), before);
    assert.equal(r.pending, false);
  }
});
test('off and unconfigured advertising retains free inversion and hides revive', () => {
  for (const port of [undefined, null, { available: false }, { available: undefined }]) {
    assert.deepEqual(adPolicy(port), { invertNeedsAd: false, showRevive: false });
    const g = new Game();
    assert.equal(g.flipContainer('invert'), true);
  }
  assert.deepEqual(adPolicy({ available: true }), { invertNeedsAd: true, showRevive: true });
});
test('configured but SDK unavailable never falls through to free inversion', async () => {
  const port = { available: true, offer: async () => ({ status: 'unavailable' }) },
    g = new Game(),
    before = g.getSnapshot();
  const r = createRewardController(g, () => port.offer());
  assert.equal(adPolicy(port).invertNeedsAd, true);
  await r.request('invert');
  assert.deepEqual(g.getSnapshot(), before);
});
test('save round trip preserves revive count and game', () => {
  const data = new Map(),
    storage = { getItem: (k) => data.get(k) || null, setItem: (k, v) => data.set(k, v) },
    store = createSaveStore(storage),
    g = blocked();
  assert.equal(store.read(), null);
  assert.equal(store.write(g, 2, 3), true);
  const restored = createSaveStore(storage).read();
  assert.equal(restored.revivesUsed, 2);
  assert.equal(restored.tutorialStep, 3);
  assert.deepEqual(restored.game.getSnapshot(), g.getSnapshot());
});
test('old save envelope rescueUsed migrates without replacing existing game', () => {
  const g = new Game();
  const raw = JSON.stringify({ version: 1, game: g.getSnapshot(), rescueUsed: true });
  const store = createSaveStore({
    getItem: () => raw,
    setItem: () => {
      throw Error('read must not write');
    },
  });
  const save = store.read();
  assert.equal(save.revivesUsed, 1);
  assert.deepEqual(save.game.getSnapshot(), g.getSnapshot());
});
for (const raw of [
  'broken json',
  JSON.stringify({ version: 99 }),
  JSON.stringify({ version: 1, game: new Game().getSnapshot(), revivesUsed: 8 }),
])
  test('failed reads preserve original bytes ' + raw.slice(0, 20), () => {
    let writes = 0;
    const store = createSaveStore({ getItem: () => raw, setItem: () => writes++ });
    assert.equal(store.read(), null);
    assert.equal(store.writable, false);
    assert.equal(store.write(new Game(), 0, 0), false);
    assert.equal(writes, 0);
  });
test('storage get exception locks writes without preventing play', () => {
  let writes = 0;
  const s = createSaveStore({
    getItem: () => {
      throw Error('disabled');
    },
    setItem: () => writes++,
  });
  assert.equal(s.read(), null);
  s.write(new Game(), 0, 0);
  assert.equal(writes, 0);
});
test('storage write exception stays nonfatal', () => {
  const s = createSaveStore({
    getItem: () => null,
    setItem: () => {
      throw Error('quota');
    },
  });
  assert.equal(s.read(), null);
  assert.equal(s.write(new Game(), 0, 0), false);
  assert.equal(SAVE_KEY, 'tetracube.save.v1');
});

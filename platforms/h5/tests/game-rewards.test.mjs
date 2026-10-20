import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameRewards } from '../game-rewards.js';
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture(config = {}) {
  const env = new EventTarget();
  env.document = new EventTarget();
  env.document.hidden = false;
  env.SmallGamesPublishingConfig = config;
  let close,
    shown = 0,
    loaded = 0,
    destroyed = 0;
  env.tap = {
    createRewardedVideoAd: () => ({
      onClose(fn) {
        close = fn;
      },
      offClose() {},
      onError() {},
      offError() {},
      async load() {
        loaded++;
      },
      async show() {
        shown++;
      },
      destroy() {
        destroyed++;
      },
    }),
  };
  return {
    env,
    close: (result) => close(result),
    currentClose: () => close,
    shown: () => shown,
    loaded: () => loaded,
    destroyed: () => destroyed,
  };
}
const config = { adsEnabled: true, adMode: 'host', platform: 'taptap-h5', adUnitId: 'test-slot' };
test('off, missing and placeholder IDs never expose or invoke rewards', async () => {
  for (const value of [
    {},
    { ...config, adsEnabled: false },
    { ...config, adUnitId: '' },
    { ...config, adUnitId: 'TODO_ID' },
  ]) {
    const f = fixture(value),
      port = createGameRewards(f.env);
    assert.equal(port.available, false);
    assert.equal((await port.offer({ id: 'test' })).status, 'unavailable');
    assert.equal(f.shown(), 0);
    port.dispose();
  }
});
test('long playback survives hidden pages; completed rewards wait for visibility and are returned once', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(config),
    port = createGameRewards(f.env);
  let settled = 0,
    shown = 0;
  const pending = port
    .show({ opportunityId: 'game:hint', onShown: () => shown++ })
    .then((result) => {
      settled++;
      return result;
    });
  await tick();
  assert.equal(shown, 1);
  assert.equal((await port.offer({ id: 'concurrent' })).status, 'unavailable');
  f.env.document.hidden = true;
  t.mock.timers.tick(600000);
  await tick();
  assert.equal(settled, 0);
  f.close({ isEnded: true });
  await tick();
  assert.equal(settled, 0);
  f.env.document.hidden = false;
  f.env.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal((await pending).status, 'completed');
  f.close({ isEnded: true });
  assert.equal(settled, 1);
  port.dispose();
});
test('cancel, exit, missing completion and stale closes never grant', async () => {
  for (const mode of ['cancel', 'pagehide', 'dismissed', 'missing', 'string']) {
    const f = fixture(config),
      port = createGameRewards(f.env);
    const pending = port.offer({ id: 'game:hint' });
    await tick();
    if (mode === 'cancel') port.cancel();
    if (mode === 'pagehide') f.env.dispatchEvent(new Event('pagehide'));
    f.close(
      mode === 'missing' ? {} : { isEnded: mode === 'string' ? 'true' : mode !== 'dismissed' },
    );
    assert.equal((await pending).status, 'dismissed');
    port.dispose();
  }
});

test('startup preload survives idle cancel; dispose retires it and permanently disables offers', async () => {
  const f = fixture(config),
    port = createGameRewards(f.env);
  assert.equal(f.loaded(), 1);
  assert.equal(f.shown(), 0);
  port.cancel();
  await tick();
  assert.equal(f.destroyed(), 0);
  port.dispose();
  port.dispose();
  assert.equal(f.destroyed(), 1);
  assert.equal(port.available, false);
  assert.equal((await port.offer({ id: 'later' })).status, 'unavailable');
  assert.equal(f.shown(), 0);
});

test('configured rewards tolerate late SDK injection and cancel permits a fresh request', async () => {
  const f = fixture(config),
    sdk = f.env.tap;
  delete f.env.tap;
  const port = createGameRewards(f.env);
  assert.equal(
    port.available,
    true,
    'configured ads must not become free rewards when SDK is late',
  );
  assert.equal((await port.offer({ id: 'first' })).status, 'unavailable');
  f.env.tap = sdk;
  const first = port.offer({ id: 'hint' });
  await tick();
  const oldClose = f.currentClose();
  port.cancel();
  assert.equal((await first).status, 'dismissed');
  const second = port.offer({ id: 'hint' });
  await tick();
  oldClose({ isEnded: true });
  assert.equal(port.pending, true);
  f.close({ isEnded: true });
  assert.equal((await second).status, 'completed');
  port.dispose();
  assert.equal((await port.offer({ id: 'hint' })).status, 'unavailable');
});

test('hidden completion is discarded on cancel, pagehide or disposal and cannot revive', async () => {
  for (const mode of ['cancel', 'pagehide', 'dispose']) {
    const f = fixture(config),
      port = createGameRewards(f.env);
    const pending = port.offer({ id: 'hint' });
    await tick();
    f.env.document.hidden = true;
    f.close({ isEnded: true });
    await tick();
    assert.equal(port.pending, true);
    if (mode === 'pagehide') f.env.dispatchEvent(new Event('pagehide'));
    else port[mode]();
    assert.equal((await pending).status, 'dismissed');
    f.env.document.hidden = false;
    f.env.document.dispatchEvent(new Event('visibilitychange'));
    if (mode === 'dispose') assert.equal((await port.offer({ id: 'again' })).status, 'unavailable');
    port.dispose();
  }
});

test('hidden startup refuses new offers and pagehide releases unused preloads', async () => {
  const f = fixture(config),
    port = createGameRewards(f.env);
  f.env.document.hidden = true;
  assert.equal((await port.offer({ id: 'hint' })).status, 'unavailable');
  f.env.dispatchEvent(new Event('pagehide'));
  assert.equal(f.destroyed(), 1);
  assert.equal(f.shown(), 0);
  port.dispose();
});

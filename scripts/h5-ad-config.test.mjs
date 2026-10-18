import test from 'node:test';
import assert from 'node:assert/strict';
import { h5AdConfig, h5AdGames } from './h5-ad-config.mjs';
import { createHintAccess } from '../games/submodules/xiangqi-five/rewarded-hints.js';
test('missing ad units use the free path; configured host failures never select it', () => {
  for (const game of h5AdGames) {
    assert.deepEqual(h5AdConfig(game, { env: {} }), { adMode: 'off', adsEnabled: false });
    const env = { H5_ADS_ENABLED: '1', SECRET: 'must-not-escape' };
    assert.equal(h5AdConfig(game, { env }).adMode, 'off');
    assert.equal(h5AdConfig(game, { env }).adsEnabled, false);
    const key = `TAPTAP_${game.toUpperCase().replaceAll('-', '_')}_AD_UNIT_ID`;
    assert.equal(h5AdConfig(game, { env: { ...env, [key]: '  ' } }).adMode, 'off');
    assert.equal(h5AdConfig(game, { env: { ...env, [key]: 'real-slot' } }).adMode, 'host');
    assert.equal(h5AdConfig(game, { env: { ...env, [key]: 'real-slot' } }).adsEnabled, true);
    for (const invalid of ['YOUR_AD_UNIT_ID', '<YOUR_ID>', 'bad;value', 'x'.repeat(161)])
      assert.throws(() => h5AdConfig(game, { env: { ...env, [key]: invalid } }));
    assert.equal(h5AdConfig(game, { env, args: ['--without-ads'] }).adMode, 'off');
    assert(!JSON.stringify(h5AdConfig(game, { env })).includes(env.SECRET));
    assert.throws(() => h5AdConfig(game, { env: { H5_ADS_ENABLED: 'yes' } }));
    assert.throws(() => h5AdConfig(game, { args: ['--with-ads', '--without-ads'] }));
  }
});

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('standalone H5 host preserves full-view rewards through visibility changes but cancels exits', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const keys = [
    'SmallGamesPublishingConfig',
    'SmallGamesRewardAds',
    'tap',
    'document',
    'addEventListener',
  ];
  const originals = new Map(
    keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  try {
    for (const scenario of [
      'close-before-return',
      'return-before-close',
      'dismissed',
      'cancel',
      'pagehide',
    ]) {
      const events = new EventTarget();
      let close,
        delivered = false;
      globalThis.SmallGamesPublishingConfig = {
        adMode: 'host',
        platform: 'taptap-h5',
        adUnitId: 'test-slot',
      };
      delete globalThis.SmallGamesRewardAds;
      globalThis.document = { hidden: false };
      globalThis.addEventListener = events.addEventListener.bind(events);
      globalThis.tap = {
        createRewardedVideoAd: () => ({
          onClose(fn) {
            close = fn;
          },
          onError() {},
          offClose() {},
          offError() {},
          load: async () => {},
          show: async () => {},
          destroy() {},
        }),
      };
      await import(`../platforms/h5/rewarded-host.js?case=${scenario}`);
      const access = createHintAccess();
      const changeVisibility = (hidden) => {
        document.hidden = hidden;
        access.setHidden(hidden);
        events.dispatchEvent(new Event('visibilitychange'));
      };
      const pending = access.request().then((outcome) => {
        delivered = true;
        return outcome;
      });
      await tick();
      changeVisibility(true);
      t.mock.timers.tick(600000);
      await tick();
      assert.equal(delivered, false, 'shown ad stays pending on a long end card');
      if (scenario === 'return-before-close') changeVisibility(false);
      if (scenario === 'cancel') access.cancel();
      if (scenario === 'pagehide') events.dispatchEvent(new Event('pagehide'));
      close({ isEnded: scenario !== 'dismissed' });
      await tick();
      if (['close-before-return', 'dismissed'].includes(scenario)) assert.equal(delivered, false);
      changeVisibility(false);
      const expected = scenario.includes('before') ? 'completed' : 'dismissed';
      assert.equal((await pending).status, expected, scenario);
      assert(
        globalThis.SmallGamesRewardAds.diagnostics.events.some(
          (event) => event.event === 'result' && event.status === expected,
        ),
      );
      for (let i = 0; i < 60; i++) events.dispatchEvent(new Event('visibilitychange'));
      assert.equal(globalThis.SmallGamesRewardAds.diagnostics.events.length, 40);
      access.cancel();
    }
  } finally {
    globalThis.SmallGamesRewardAds?.cancel();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

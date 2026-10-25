import test from 'node:test';
import assert from 'node:assert/strict';
import { h5AdConfig, h5PackageGames, prepareH5Ads } from './h5-ad-config.mjs';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHintAccess } from '../games/submodules/xiangqi-five/rewarded-hints.js';
test('missing ad units use the free path; configured host failures never select it', () => {
  for (const game of h5PackageGames) {
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

test('realtime packages copy the common provider and resolve the adapter inside the package', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'realtime-ad-wiring-'));
  try {
    await mkdir(path.join(directory, 'src'));
    await writeFile(path.join(directory, 'index.html'), '<html><head></head><body></body></html>');
    const adapter = path.join(directory, 'src/taptap-h5-ads.js');
    await copyFile(
      new URL('../games/local/cops-robbers-realtime/src/taptap-h5-ads.js', import.meta.url),
      adapter,
    );
    await prepareH5Ads('cops-robbers-realtime', directory, { env: {} });
    const source = await readFile(adapter, 'utf8');
    assert.match(source, /from '\.\.\/platform-ads\.js'/);
    assert(!source.includes('../../../../platforms'));
    assert.equal(
      await readFile(path.join(directory, 'platform-ads.js'), 'utf8'),
      await readFile(new URL('../platforms/h5/platform-ads.js', import.meta.url), 'utf8'),
    );
    await prepareH5Ads('cops-robbers-realtime', directory, { env: {} });
    assert.equal(await readFile(adapter, 'utf8'), source, 'repeated preparation is idempotent');
    const { createTapTapAdProvider } = await import(pathToFileURL(adapter));
    let close;
    const provider = createTapTapAdProvider(
      {
        createRewardedVideoAd() {
          return {
            onClose(fn) {
              close = fn;
            },
            onError() {},
            offClose() {},
            offError() {},
            load: async () => {},
            show: async () => {},
            destroy() {},
          };
        },
      },
      'test-slot',
    );
    const pending = provider.show();
    await new Promise((resolve) => setImmediate(resolve));
    close({ isEnded: true });
    assert.equal((await pending).status, 'completed');
    provider.dispose();
  } finally {
    await rm(directory, { recursive: true, force: true });
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

test('place-and-clear Creator packages use the shared optional reward bridge', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'three-rewards-'));
  try {
    await writeFile(
      path.join(directory, 'index.html'),
      '<html><head></head><body><canvas id="GameCanvas"></canvas></body></html>',
    );
    await prepareH5Ads('place-and-clear', directory, { env: {} });
    assert.deepEqual(h5AdConfig('place-and-clear', { env: {} }), {
      adMode: 'off',
      adsEnabled: false,
    });
    const config = await readFile(path.join(directory, 'platform-config.js'), 'utf8');
    assert.match(config, /"game":"place-and-clear"/);
    assert.match(config, /"adsEnabled":false/);
    const html = await readFile(path.join(directory, 'index.html'), 'utf8');
    assert.equal((html.match(/src=".\/game-rewards.js"/g) || []).length, 1);
    assert.equal(
      await readFile(path.join(directory, 'game-rewards.js'), 'utf8'),
      await readFile(new URL('../platforms/h5/game-rewards.js', import.meta.url), 'utf8'),
    );
    assert.equal(
      h5AdConfig('place-and-clear', {
        env: { H5_ADS_ENABLED: '1', TAPTAP_PLACE_AND_CLEAR_AD_UNIT_ID: 'future-slot' },
      }).adMode,
      'host',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('renamed game accepts deployed advertising IDs while the new variable takes precedence', () => {
  const env = { H5_ADS_ENABLED: '1', TAPTAP_THREE_CHOOSE_TWO_AD_UNIT_ID: 'old-slot' };
  assert.equal(h5AdConfig('place-and-clear', { env }).adUnitId, 'old-slot');
  assert.equal(
    h5AdConfig('place-and-clear', {
      env: { ...env, TAPTAP_PLACE_AND_CLEAR_AD_UNIT_ID: 'new-slot' },
    }).adUnitId,
    'new-slot',
  );
  assert.equal(
    h5AdConfig('place-and-clear', { env: { ...env, TAPTAP_PLACE_AND_CLEAR_AD_UNIT_ID: '' } })
      .adMode,
    'off',
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { installPublishingHost } from '../publishing-host.js';
import { createH5Publishing } from '../publishing.js';
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture({ loading = 'ready', showing = 'ready', enabled = true } = {}) {
  const env = new EventTarget(),
    ads = [];
  env.document = new EventTarget();
  env.document.hidden = false;
  env.SmallGamesPublishingConfig = Object.freeze({
    adsEnabled: enabled,
    adMode: enabled ? 'host' : 'off',
    platform: 'taptap-h5',
    publishingInterstitials: true,
    interstitialAdUnitId: enabled ? 'fake-interstitial-unit' : '',
  });
  env.tap = {
    createRewardedVideoAd() {
      assert.fail('Interstitial packages must not request rewarded videos');
    },
    createInterstitialAd() {
      const a = {
        shown: 0,
        destroyed: 0,
        onLoad(fn) {
          this.loaded = fn;
        },
        onClose(fn) {
          this.close = fn;
        },
        onError(fn) {
          this.error = fn;
        },
        offLoad() {},
        offClose() {},
        offError() {},
        load() {
          if (loading === 'failed') return Promise.reject(Error('load'));
          if (loading === 'pending') return new Promise(() => {});
          return Promise.resolve();
        },
        show() {
          this.shown++;
          if (showing === 'failed') return Promise.reject(Error('show'));
          if (showing === 'pending') return new Promise(() => {});
          return Promise.resolve();
        },
        destroy() {
          this.destroyed++;
        },
      };
      ads.push(a);
      return a;
    },
  };
  return { env, ads, provider: installPublishingHost(env) };
}
const request = { kind: 'interstitial', opportunityId: 'existing.completed' };
test('disabled/missing slot keeps SDK unused and explicit host authority is preserved', () => {
  const f = fixture({ enabled: false });
  assert.equal(f.provider, undefined);
  assert.equal(f.ads.length, 0);
  const provider = {};
  f.env.SmallGamesPublishingConfig = { ...f.env.SmallGamesPublishingConfig, provider };
  assert.equal(installPublishingHost(f.env), undefined);
  assert.equal(f.env.SmallGamesPublishingConfig.provider, provider);
  for (const existing of [{ show() {} }, null, false]) {
    f.env.SmallGamesPublishingConfig = {
      adsEnabled: true,
      adMode: 'host',
      platform: 'taptap-h5',
      publishingInterstitials: true,
      interstitialAdUnitId: 'fake-unit',
      provider: existing,
    };
    assert.equal(installPublishingHost(f.env), undefined);
    assert.equal(f.env.SmallGamesPublishingConfig.provider, existing);
    assert.equal(f.ads.length, 0);
  }
});
test('ready interstitial returns close once; errors and reward requests never grant anything', async () => {
  const f = fixture();
  await tick();
  assert.equal((await f.provider.show({ ...request, kind: 'rewarded' })).status, 'unavailable');
  let settled = 0;
  const pending = f.provider.show(request).then((x) => {
    settled++;
    return x;
  });
  await tick();
  f.ads[0].close();
  f.ads[0].close();
  f.ads[0].error();
  assert.equal((await pending).status, 'dismissed');
  assert.equal(settled, 1);
  assert.equal(f.ads[0].shown, 1);
  await tick();
  const failure = f.provider.show(request);
  await tick();
  f.ads[1].error();
  assert.equal((await failure).status, 'failed');
  f.provider.dispose();
});
test('unready inventory cannot show late; load/show failures settle and release', async () => {
  const f = fixture({ loading: 'pending' });
  assert.equal((await f.provider.show(request)).status, 'unavailable');
  f.ads[0].loaded();
  await tick();
  assert.equal(f.ads[0].shown, 0);
  f.provider.dispose();
  const failed = fixture({ loading: 'failed' });
  await tick();
  assert.equal(failed.ads[0].destroyed, 1);
  failed.provider.dispose();
  const show = fixture({ showing: 'failed' });
  await tick();
  assert.equal((await show.provider.show(request)).status, 'failed');
  show.provider.dispose();
});
test('navigation, opening timeout and BFCache cannot create a late display', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture({ showing: 'pending' });
  await tick();
  const pending = f.provider.show(request);
  f.env.dispatchEvent(new Event('pointerdown'));
  assert.equal((await pending).status, 'dismissed');
  await tick();
  const timed = f.provider.show(request);
  t.mock.timers.tick(2001);
  assert.equal((await timed).status, 'failed');
  await tick();
  const hidden = new Event('pagehide');
  Object.defineProperty(hidden, 'persisted', { value: true });
  f.env.dispatchEvent(hidden);
  assert.equal((await f.provider.show(request)).status, 'unavailable');
  f.env.dispatchEvent(new Event('pageshow'));
  await tick();
  const restored = f.provider.show(request);
  f.ads.at(-1).close();
  assert.equal((await restored).status, 'dismissed');
  f.provider.dispose();
});
test('publishing retains third-break/60s/six-attempt policy and restores prior pause exactly once', async () => {
  const f = fixture();
  await tick();
  let now = 0,
    pauses = 0,
    resumes = 0,
    paused = true;
  const publishing = createH5Publishing({
    gameId: 'existing',
    adMode: 'host',
    provider: f.provider,
    environment: f.env,
    now: () => now,
    pause() {
      pauses++;
      const before = paused;
      paused = true;
      return () => {
        paused = before;
        resumes++;
      };
    },
  });
  let shows = 0;
  for (let round = 1; round <= 21; round++) {
    if (round % 3 === 1) now += 60001;
    const pending = publishing.interstitial({ placement: 'complete', naturalBreak: true });
    await tick();
    const active = f.ads.find((a) => a.shown && !a.destroyed);
    if (active) {
      shows++;
      active.close();
      active.close();
    }
    await pending;
    await tick();
    assert.equal(shows, Math.min(6, Math.floor(round / 3)));
    assert.equal(paused, true);
  }
  assert.equal(pauses, 6);
  assert.equal(resumes, 6);
  publishing.dispose();
});

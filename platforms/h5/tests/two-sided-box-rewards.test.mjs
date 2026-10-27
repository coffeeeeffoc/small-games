import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameRewards } from '../game-rewards.js';
import { resolveRewardHost, offerFaceReward } from '../../../games/local/two-sided-box/rewards.mjs';
import { installPublishingHost } from '../publishing-host.js';
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture(enabled = true) {
  const env = new EventTarget(),
    ads = [];
  env.document = new EventTarget();
  env.document.hidden = false;
  env.SmallGamesPublishingConfig = {
    adsEnabled: enabled,
    adMode: 'host',
    platform: 'taptap-h5',
    adUnitId: enabled ? 'fake-rewarded-unit' : '',
    publishingInterstitials: true,
  };
  env.tap = {
    createInterstitialAd() {
      assert.fail('Reward bridge must not request interstitial with its rewarded slot');
    },
    createRewardedVideoAd() {
      const ad = {
        shown: 0,
        onClose(fn) {
          this.close = fn;
        },
        onError(fn) {
          this.error = fn;
        },
        offClose() {},
        offError() {},
        async load() {},
        async show() {
          this.shown++;
        },
        destroy() {},
      };
      ads.push(ad);
      return ad;
    },
  };
  env.SmallGamesRewardAds = createGameRewards(env);
  return { env, ads, host: resolveRewardHost(env), port: env.SmallGamesRewardAds };
}
test('explicit host is authoritative and a missing H5 unit never enables reward', async () => {
  const f = fixture(false);
  assert.equal(f.host, undefined);
  assert.equal((await offerFaceReward(f.host, 'top')).status, 'unavailable');
  assert.equal(f.ads.length, 0);
  const explicit = { session: { capabilities: [] } };
  f.env.twoSidedBoxHost = explicit;
  assert.equal(resolveRewardHost(f.env), explicit);
  f.port.dispose();
});
test('H5 strict completion, cancellation, error and duplicate callbacks preserve reward semantics', async () => {
  for (const scenario of ['completed', 'dismissed', 'failed', 'abort']) {
    const f = fixture(),
      abort = new AbortController();
    let grants = 0;
    const pending = offerFaceReward(f.host, 'left', { signal: abort.signal }).then((r) => {
      if (r.status === 'completed') grants++;
      return r;
    });
    await tick();
    if (scenario === 'abort') abort.abort();
    else if (scenario === 'failed') f.ads[0].error();
    else f.ads[0].close({ isEnded: scenario === 'completed' });
    f.ads[0].close({ isEnded: true });
    f.ads[0].close({ isEnded: true });
    assert.equal((await pending).status, scenario === 'abort' ? 'dismissed' : scenario);
    assert.equal(grants, scenario === 'completed' ? 1 : 0);
    assert.equal(f.port.pending, false);
    f.port.dispose();
  }
});
test('normal long H5 playback remains pending until strict SDK completion', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  let settled = false;
  const pending = offerFaceReward(f.host, 'top').then((r) => {
    settled = true;
    return r;
  });
  await tick();
  t.mock.timers.tick(180000);
  await tick();
  assert.equal(settled, false);
  f.ads[0].close({ isEnded: true });
  assert.equal((await pending).status, 'completed');
  f.port.dispose();
});

test('an older host with broken cancellation cannot prevent local dismissal', async () => {
  for (const cancel of [
    () => {
      throw Error('cancel failed');
    },
    true,
  ]) {
    const controller = new AbortController();
    const host = {
      session: { capabilities: ['advertising'] },
      ads: { offer: () => new Promise(() => {}), cancel },
    };
    const pending = offerFaceReward(host, 'top', { signal: controller.signal });
    controller.abort();
    assert.equal((await pending).status, 'dismissed');
  }
});

test('the two existing ad types are mutually exclusive in both directions', async () => {
  const f = fixture();
  let interstitial;
  f.env.tap.createInterstitialAd = () =>
    (interstitial = {
      onLoad() {},
      onClose(fn) {
        this.close = fn;
      },
      onError() {},
      offLoad() {},
      offClose() {},
      offError() {},
      async load() {},
      async show() {},
      destroy() {},
    });
  f.env.SmallGamesPublishingConfig.interstitialAdUnitId = 'fake-interstitial-unit';
  const provider = installPublishingHost(f.env);
  await tick();
  const shown = provider.show({ kind: 'interstitial', opportunityId: 'box.complete' });
  await tick();
  assert.equal((await offerFaceReward(f.host, 'left')).status, 'unavailable');
  assert.equal(f.ads[0].shown, 0);
  interstitial.close();
  await shown;
  await tick();
  const rewarded = offerFaceReward(f.host, 'left');
  await tick();
  assert.equal(
    (await provider.show({ kind: 'interstitial', opportunityId: 'box.complete' })).status,
    'unavailable',
  );
  f.ads[0].close({ isEnded: true });
  await rewarded;
  provider.dispose();
  f.port.dispose();
});

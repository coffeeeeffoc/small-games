import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameAds } from '../src/ads.js';
import { createPlatformAdProvider } from '../../../../platforms/h5/platform-ads.js';
import { adConfiguration, configurationScript } from './ad-config.mjs';

test('game port forwards RewardOpportunity, validates outcomes and catches provider errors', async () => {
  for (const status of ['completed', 'dismissed', 'unavailable', 'failed', 'invalid']) {
    let request;
    const ads = createGameAds({ getProvider: () => ({ show: async value => { request = value; return { status }; } }) });
    assert.equal((await ads.offer({ id: 'cops-robbers:hint', reward: { hint: 1 } })).status, status === 'invalid' ? 'failed' : status);
    const { onShown, ...opportunity } = request;
    assert.deepEqual(opportunity, { opportunityId: 'cops-robbers:hint', kind: 'rewarded' });
    assert.equal(typeof onShown, 'function');
    assert.equal(ads.pending, false);
  }
  for (const getProvider of [() => undefined, () => { throw new Error('SDK'); }, () => ({ show() { throw new Error('SDK'); } })])
    assert.notEqual((await createGameAds({ getProvider }).offer({ id: 'hint' })).status, 'completed');
});

const flush = () => new Promise(resolve => setImmediate(resolve));

test('TapTap opening success stops the game deadline before a long video/end card', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let close;
  const provider = createPlatformAdProvider({ platform: 'taptap-h5', adUnitId: 'test-slot', environment: { tap: {
    createRewardedVideoAd() { return {
      onClose(fn) { close = fn; }, onError() {}, offClose() {}, offError() {}, destroy() {},
      load: () => new Promise(resolve => setTimeout(resolve, 12000)), show: async () => {},
    }; },
  } } });
  const ads = createGameAds({ getProvider: () => provider });
  let result;
  const offered = ads.offer({ id: 'hint' }).then(value => { result = value; });
  await flush(); t.mock.timers.tick(12000); await flush();
  t.mock.timers.tick(600000); await flush();
  assert.equal(result, undefined, 'Playback must not time out after the SDK confirms opening');
  close({ isEnded: true }); await offered;
  assert.deepEqual(result, { status: 'completed' });
});

test('hidden results wait for foreground, while explicit cancellation discards them', async () => {
  for (const status of ['completed', 'dismissed', 'failed']) for (const cancel of [false, true]) {
    let finish, result;
    const ads = createGameAds({ getProvider: () => ({ show: () => new Promise(resolve => { finish = resolve; }) }) });
    const offered = ads.offer({ id: 'hint' }).then(value => { result = value; });
    await flush(); ads.setHidden(true); finish({ status }); await flush();
    assert.equal(result, undefined);
    assert.equal((await ads.offer({ id: 'hint' })).status, 'unavailable');
    if (cancel) ads.cancel(); else ads.setHidden(false);
    await offered;
    assert.deepEqual(result, { status: cancel ? 'dismissed' : status });
  }
});

test('hidden opening timeout releases the provider and delivers failure on return', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let finish, result, disposed = 0;
  const ads = createGameAds({ getProvider: () => ({
    show: () => new Promise(resolve => { finish = resolve; }),
    dispose() { disposed++; finish({ status: 'dismissed' }); },
  }) });
  const offered = ads.offer({ id: 'hint' }).then(value => { result = value; });
  await flush(); ads.setHidden(true); t.mock.timers.tick(45001); await flush();
  assert.equal(disposed, 1); assert.equal(result, undefined);
  ads.setHidden(false); await offered;
  assert.deepEqual(result, { status: 'failed' });
});

test('late onShown from a cancelled request cannot disable the next opening deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let finish, shown;
  const ads = createGameAds({ getProvider: () => ({
    show(request) { shown = request.onShown; return new Promise(resolve => { finish = resolve; }); },
    dispose() { finish({ status: 'dismissed' }); },
  }) });
  const first = ads.offer({ id: 'hint' }); await flush();
  const oldShown = shown;
  ads.cancel(); await first; await flush();
  const next = ads.offer({ id: 'hint' }); await flush(); oldShown();
  t.mock.timers.tick(45001);
  assert.deepEqual(await next, { status: 'failed' });
});

test('cancel/timeout recover play but keep unfinished provider requests leased', async () => {
  for (const cancel of [true, false]) {
    let finish, disposed = 0;
    const ads = createGameAds({ timeoutMs: 10, getProvider: () => ({ show: () => new Promise(resolve => { finish = resolve; }), dispose: () => { disposed++; } }) });
    const shown = ads.offer({ id: 'hint' });
    await Promise.resolve();
    assert.equal((await ads.offer({ id: 'hint' })).status, 'unavailable');
    if (cancel) ads.cancel();
    assert.equal((await shown).status, cancel ? 'dismissed' : 'failed');
    assert.equal(disposed, 1); assert.equal(ads.pending, true);
    assert.equal((await ads.offer({ id: 'hint' })).status, 'unavailable');
    finish({ status: 'completed' }); await new Promise(resolve => setImmediate(resolve));
    assert.equal(ads.pending, false);
    ads.dispose(); assert.equal((await ads.offer({ id: 'hint' })).status, 'unavailable');
  }
});

test('TapTap builds use free actions for blank units and host ads for real units without credentials', () => {
  assert.deepEqual(adConfiguration(false, {}), { adMode: 'off', adsEnabled: false });
  assert.deepEqual(adConfiguration(true, {}), { adMode: 'off', adsEnabled: false, platform: 'taptap-h5', adUnitId: '', rewardedAdUnitId: '' });
  assert.deepEqual(adConfiguration(true, { TAPTAP_COPS_ROBBERS_AD_UNIT_ID: ' slot-1 ', SECRET: 'private-token' }), { adMode: 'host', adsEnabled: true, platform: 'taptap-h5', adUnitId: 'slot-1', rewardedAdUnitId: 'slot-1' });
  assert.ok(!configurationScript(adConfiguration(true, { SECRET: 'private-token' })).includes('private-token'));
  for (const value of ['<YOUR_ID>', 'YOUR_AD_UNIT_ID', 'abc;alert(1)', 'x'.repeat(161)])
    assert.throws(() => adConfiguration(true, { TAPTAP_COPS_ROBBERS_AD_UNIT_ID: value }));
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameAds } from '../src/ads.js';
import { adConfiguration, configurationScript } from './ad-config.mjs';

test('game port forwards RewardOpportunity, validates outcomes and catches provider errors', async () => {
  for (const status of ['completed', 'dismissed', 'unavailable', 'failed', 'invalid']) {
    let request;
    const ads = createGameAds({ getProvider: () => ({ show: async value => { request = value; return { status }; } }) });
    assert.equal((await ads.offer({ id: 'cops-robbers:hint', reward: { hint: 1 } })).status, status === 'invalid' ? 'failed' : status);
    assert.deepEqual(request, { opportunityId: 'cops-robbers:hint', kind: 'rewarded' });
    assert.equal(ads.pending, false);
  }
  for (const getProvider of [() => undefined, () => { throw new Error('SDK'); }, () => ({ show() { throw new Error('SDK'); } })])
    assert.notEqual((await createGameAds({ getProvider }).offer({ id: 'hint' })).status, 'completed');
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

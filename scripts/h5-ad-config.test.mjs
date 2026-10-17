import test from 'node:test';
import assert from 'node:assert/strict';
import { h5AdConfig, h5AdGames } from './h5-ad-config.mjs';
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

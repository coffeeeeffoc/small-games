import test from 'node:test';
import assert from 'node:assert/strict';
import { h5AdConfig, h5AdGames } from './h5-ad-config.mjs';
test('each H5 game has explicit free and host builds without secret configuration', () => {
  for (const game of h5AdGames) {
    assert.deepEqual(h5AdConfig(game, { env: {} }), { adMode: 'off', adsEnabled: false });
    const env = { H5_ADS_ENABLED: '1', SECRET: 'must-not-escape' };
    assert.equal(h5AdConfig(game, { env }).adMode, 'host');
    assert.equal(h5AdConfig(game, { env, args: ['--without-ads'] }).adMode, 'off');
    assert(!JSON.stringify(h5AdConfig(game, { env })).includes(env.SECRET));
    assert.throws(() => h5AdConfig(game, { env: { H5_ADS_ENABLED: 'yes' } }));
    assert.throws(() => h5AdConfig(game, { args: ['--with-ads', '--without-ads'] }));
  }
});

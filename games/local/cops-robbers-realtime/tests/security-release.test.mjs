import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getRoleAppearance, roleCharacterMarkup, roleAvatarSvg } from '../src/role-appearance.js';
import { h5AdConfig } from '../../../../scripts/h5-ad-config.mjs';

test('security guard identities keep the existing role and portrait contracts', () => {
  globalThis.__CLASSIC_CHASE_ROLES__ = true;
  try {
    for (let preset = 0; preset < 3; preset++) {
      const appearance = getRoleAppearance('cop', preset);
      assert.equal(appearance.label, '保安');
      assert.match(appearance.character.name, /保安|队长/);
      assert.equal(appearance.character.crop.length, 3);
      assert.match(roleCharacterMarkup('cop', preset), /characters\.png/);
      assert.match(roleAvatarSvg('cop', 0, 0, 44, preset), /characters\.png/);
    }
    assert.equal(getRoleAppearance('robber').label, '小偷');
  } finally { delete globalThis.__CLASSIC_CHASE_ROLES__; }
});

test('the saved TapTap preset selects only this game with rewarded ads and no backend', async () => {
  const config = JSON.parse(await readFile(new URL('../../../../infra/builds/cops-robbers-realtime-taptap.json', import.meta.url), 'utf8'));
  assert.deepEqual(config, {
    version: 1,
    games: ['cops-robbers-realtime'],
    ads: [true],
    backend: [false],
    adUnits: { 'cops-robbers-realtime': '1054324' },
  });
  const ads = h5AdConfig(config.games[0], { args: ['--with-ads'], env: {
    TAPTAP_COPS_ROBBERS_REALTIME_AD_UNIT_ID: config.adUnits[config.games[0]],
  } });
  assert.equal(ads.adMode, 'host');
  assert.equal(ads.rewardedAdUnitId, '1054324');
  assert.notEqual(ads.rewardedAdUnitId, '980554', 'the application ID is not an ad unit ID');
});

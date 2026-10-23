import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { harness, snapshot, tap, collideUntil, output, root } from './cocos-harness.mjs';
import { createProfile } from '../src/progression.mjs';
import { LEVEL_ORDER } from '../src/config.mjs';
// SDK callbacks alone are fixtures. The production Creator runtime, provider,
// combat, navigation and input handlers are unchanged. No writable game debug API.
function mockSDK() {
  window.SmallGamesPublishingConfig = { adMode: 'host', adsEnabled: true, platform: 'taptap-h5', adUnitId: 'fixture-reward' };
  const ads = [];
  window.__mockSDK = {
    label: 'TEST ONLY mock TapTap rewarded SDK; not platform acceptance',
    ads,
    close: (id, value) => ads[id].history.forEach((fn) => fn(value)),
    error: (id) => ads[id].errors.forEach((fn) => fn({ errCode: 999 })),
    mode: 'normal',
    release: () => ads.at(-1).release?.(),
  };
  window.tap = {
    createRewardedVideoAd(options) {
      const ad = {
        options,
        history: [],
        errors: [],
        shown: false,
        destroyed: false,
        onClose(fn) {
          this.history.push(fn);
        },
        offClose() {},
        onError(fn) {
          this.errors.push(fn);
        },
        offError() {},
        load() {
          return Promise.resolve();
        },
        show() {
          this.shown = true;
          return window.__mockSDK.mode === 'opening'
            ? new Promise((resolve) => {
                this.release = resolve;
              })
            : Promise.resolve();
        },
        destroy() {
          this.destroyed = true;
          return Promise.resolve();
        },
      };
      ads.push(ad);
      return ad;
    },
  };
}
const info = JSON.parse(await readFile(path.join(root, 'dist/build-info.json'), 'utf8'));
assert.deepEqual(
  info.channel,
  {
    platform: 'preview',
    appId: '',
    adUnitId: '',
    adsEnabled: false,
  },
  'Run the neutral Creator build through the shared H5 bridge fixture',
);
const h = await harness({ sharedRewards: true }),
  report = {
    mockSDK: true,
    platformAcceptance: false,
    sourceHash: info.sourceHash,
    checks: [],
    errors: h.errors,
  };
const advanced = createProfile({
  xp: 10000,
  completed: LEVEL_ORDER.slice(0, -1),
  selectedLevelId: 'skyreach',
});
try {
  const s = await h.open({ profile: advanced, sdk: mockSDK }),
    p = s.page;
  await tap(p, 'start');
  await tap(p, 'pause');
  assert(!(await snapshot(p)).buttons.some((b) => b.id === 'ad:supply'));
  await tap(p, 'resume');
  await collideUntil(s, (x) => x.screen === 'playing' && x.state.player.hp <= 70);
  await tap(p, 'pause');
  const hp = (await snapshot(p)).state.player.hp,
    t = (await snapshot(p)).state.time;
  await tap(p, 'ad:supply');
  await p.waitForFunction(() => window.__mockSDK.ads.at(-1)?.shown);
  await p.evaluate(() => window.dispatchEvent(new Event('blur')));
  await p.evaluate(() =>
    window.__mockSDK.close(window.__mockSDK.ads.length - 1, { isEnded: true }),
  );
  await p.waitForTimeout(150);
  assert.equal((await snapshot(p)).state.player.hp, hp);
  assert((await snapshot(p)).ads.pending);
  assert.equal((await snapshot(p)).state.time, t);
  await p.evaluate(() => window.dispatchEvent(new Event('focus')));
  await p.waitForTimeout(100);
  let a = await snapshot(p);
  assert.equal(a.screen, 'paused');
  assert.equal(a.state.player.hp, Math.min(a.state.player.maxHp, hp + a.state.player.maxHp * 0.3));
  assert(a.ads.used.supply);
  const healed = a.state.player.hp;
  await p.evaluate(() => window.__mockSDK.close(0, { isEnded: true }));
  assert.equal((await snapshot(p)).state.player.hp, healed);
  report.checks.push(
    'supply hidden completion deferred to focus; 30 percent once; full HP hidden; duplicate ignored',
  );
  await tap(p, 'resume');
  await collideUntil(s, (x) => x.screen === 'failed');
  for (const status of ['dismissed', 'failed', 'completed']) {
    await tap(p, 'ad:revive');
    await p.waitForFunction(() => window.__mockSDK.ads.at(-1)?.shown);
    const id = await p.evaluate(() => window.__mockSDK.ads.length - 1);
    if (status === 'failed') await p.evaluate((id) => window.__mockSDK.error(id), id);
    else
      await p.evaluate(
        ({ id, status }) =>
          window.__mockSDK.close(id, status === 'completed' ? { isEnded: true } : {}),
        { id, status },
      );
    await p.waitForTimeout(100);
    a = await snapshot(p);
    assert.equal(a.ads.used.revive, status === 'completed');
    assert.equal(a.screen, status === 'completed' ? 'paused' : 'failed');
  }
  assert.equal(a.state.player.hp, a.state.player.maxHp * 0.5);
  assert.equal(a.state.player.invulnerable, 3);
  assert.equal(a.profile.settledRuns.length, 0);
  await p.screenshot({ path: path.join(output, 'ads-mockSDK-revived.png') });
  await tap(p, 'abandon');
  await tap(p, 'start');
  await p.evaluate(() => {
    for (let i = 0; i < window.__mockSDK.ads.length; i++)
      window.__mockSDK.close(i, { isEnded: true });
  });
  a = await snapshot(p);
  assert.equal(a.ads.used.revive, false);
  assert.equal(a.ads.used.supply, false);
  report.checks.push(
    'revive dismiss/error/complete; 50 percent HP and 3 seconds protection; failure not settled; late callback cannot affect restart',
  );
  await collideUntil(s, (x) => x.screen === 'playing' && x.state.player.hp <= 70);
  await tap(p, 'pause');
  const oldHP = (await snapshot(p)).state.player.hp;
  await p.evaluate(() => (window.__mockSDK.mode = 'opening'));
  await tap(p, 'ad:supply');
  await p.evaluate(() => window.dispatchEvent(new Event('blur')));
  await p.evaluate(() => window.__mockSDK.release());
  await p.evaluate(() =>
    window.__mockSDK.close(window.__mockSDK.ads.length - 1, { isEnded: true }),
  );
  await p.evaluate(() => window.dispatchEvent(new Event('focus')));
  await p.waitForTimeout(100);
  assert.equal((await snapshot(p)).state.player.hp, Math.min((await snapshot(p)).state.player.maxHp, oldHP + (await snapshot(p)).state.player.maxHp * 0.3));
  assert.equal((await snapshot(p)).ads.used.supply, true);
  report.checks.push(
    'SDK overlay may hide before show resolves; completion is delivered once after focus',
  );
  await s.close();
  assert.deepEqual(h.errors, []);
  report.passed = true;
} finally {
  await writeFile(path.join(output, 'ads-mockSDK-report.json'), JSON.stringify(report, null, 2));
  await h.close();
}
console.log('Production Creator bundle + explicitly marked mockSDK ad fixture passed.');

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = spawn(process.execPath, ['server.mjs', '--dist'], {
  cwd: root,
  env: { ...process.env, PORT: '4454' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((resolve, reject) => {
  server.stdout.once('data', resolve);
  server.once('error', reject);
  server.once('exit', (code) => reject(new Error(`Server exited: ${code}`)));
});
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
});
try {
  for (const shared of [false, true]) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Only this fixture substitutes a GameHost. Production has no test reward source.
  const main = await readFile(new URL('../dist/src/main.mjs', import.meta.url), 'utf8');
  if (!shared) await page.route('**/src/main.mjs', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: main.replace('mountCageRescue().catch', 'mountCageRescue(globalThis.__testHost).catch'),
    }),
  );
  if (shared) {
    await page.route('**/reward-host/*.js', async route => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1);
      assert(['game-rewards.js', 'platform-ads.js', 'interstitial.js'].includes(name));
      await route.fulfill({ contentType: 'text/javascript', body: await readFile(new URL('../../../../platforms/h5/' + name, import.meta.url), 'utf8') });
    });
    await page.route('http://127.0.0.1:4454/', async route => route.fulfill({ contentType: 'text/html',
      body: (await readFile(new URL('../dist/index.html', import.meta.url), 'utf8')).replace('<head>', '<head><script type="module" src="/reward-host/game-rewards.js"></script>') }));
  }
  let requests = 0;
  await page.route('**/api/competition/**', route => { requests++; return route.abort(); });
  await page.addInitScript(({ shared }) => {
    globalThis.__COMPETITION_CONFIG__ = { enabled: false };
    if (shared) {
      globalThis.SmallGamesPublishingConfig = { adMode: 'host', adsEnabled: true, platform: 'taptap-h5', adUnitId: 'cage-test-fixture' };
      globalThis.tap = { createRewardedVideoAd() {
        const ad = { load: async () => {}, show: async () => {
          globalThis.__finishReward = value => ad.close(value);
          if (globalThis.__adOutcome !== 'pending') queueMicrotask(() =>
            globalThis.__adOutcome === 'failed' || globalThis.__adOutcome === 'unavailable'
              ? ad.error({ errCode: 999 }) : ad.close({ isEnded: globalThis.__adOutcome === 'completed' }));
        }, onClose(fn) { ad.close = fn; }, offClose() {}, onError(fn) { ad.error = fn; }, offError() {}, destroy() {} };
        return ad;
      } };
    }
    globalThis.__adOutcome = 'unavailable';
    globalThis.__testHost = {
      session: { adAuthority: 'host' },
      storage: {
        async read() {
          return null;
        },
        async write(key, value) {
          return { value, version: '1' };
        },
      },
      ads: {
        async offer(opportunity) {
          globalThis.__lastOpportunity = opportunity;
          if (globalThis.__adOutcome === 'pending') return new Promise(resolve => {
            globalThis.__finishReward = value => resolve({ status: value.isEnded ? 'completed' : 'dismissed' });
          });
          return { status: globalThis.__adOutcome };
        },
      },
    };
  }, { shared });
  await page.clock.install();
  await page.goto('http://127.0.0.1:4454');
  const snapshot = () => page.evaluate(() => globalThis.__cageRescue.snapshot());
  await page.locator('#start').click();
  let state = await snapshot();
  const bounds = await page.locator('#scene').boundingBox();
  // Miss three balls using actual pointer input and the live requestAnimationFrame loop.
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.89);
  await page.mouse.down();
  for (let i = 0; i < 900 && state.screen !== 'result'; i++) {
    if (state.game.phase === 'ready') {
      await page.mouse.up();
      await page.locator('#launch').click();
      await page.mouse.move(
        bounds.x + (state.game.paddle.x / 390) * bounds.width,
        bounds.y + bounds.height * 0.89,
      );
      await page.mouse.down();
    }
    const x = state.game.ball.x < 195 ? 320 : 70;
    await page.mouse.move(bounds.x + (x / 390) * bounds.width, bounds.y + bounds.height * 0.89);
    await page.clock.runFor(100);
    state = await snapshot();
  }
  await page.mouse.up();
  assert.equal(state.screen, 'result');
  assert.equal(state.game.lossReason, 'no-lives');
  assert.equal(state.trial, false);
  for (const status of ['unavailable', 'dismissed', 'failed']) {
    await page.evaluate((value) => {
      globalThis.__adOutcome = value;
    }, status);
    await page.locator('#revive').click();
    assert.equal((await snapshot()).game.lives, 0, status);
    assert.equal((await snapshot()).game.usedRevive, false, status);
    assert.equal((await snapshot()).screen, 'result');
  }
  await page.evaluate(() => { globalThis.__adOutcome = 'pending'; });
  await page.locator('#revive').click();
  await page.evaluate(() => {
    globalThis.__lateReward = globalThis.__finishReward;
    window.dispatchEvent(new Event('pagehide'));
    globalThis.__lateReward({ isEnded: true });
    window.dispatchEvent(new Event('pageshow'));
  });
  assert.equal((await snapshot()).game.usedRevive, false);
  await page.locator('#revive').click();
  await page.clock.fastForward(600000);
  assert.equal((await snapshot()).game.usedRevive, false);
  await page.evaluate(() => globalThis.__finishReward({ isEnded: true }));
  await page.waitForFunction(() => globalThis.__cageRescue.snapshot().game.usedRevive);
  state = await snapshot();
  assert.equal(state.screen, 'play');
  assert.equal(state.game.lives, 1);
  assert.equal(state.game.usedRevive, true);
  assert.equal(state.game.phase, 'ready');
  if (!shared) assert.deepEqual(await page.evaluate(() => __lastOpportunity.reward), {
    ballLives: 1,
    levelId: 'rescue-01',
  });
  await page.evaluate(() => globalThis.__finishReward({ isEnded: true }));
  assert.equal((await snapshot()).game.lives, 1);
  assert.equal(requests, 0, 'backend off never initializes the same-origin API');
  assert.deepEqual(errors, []);
  console.log(
    'Reward browser: natural three-ball failure, unavailable/dismissed/failed no reward, completed +1 exactly once — passed.',
  );
  await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}

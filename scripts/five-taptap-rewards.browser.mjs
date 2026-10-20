import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tapHome, waitForReady } from '../games/local/carding-car/tests/browser-utils.mjs';
import { press, snapshot } from '../games/local/night-overwatch/tests/flight-browser.mjs';
import preset from '../infra/builds/five-taptap-h5.mjs';

const root = path.resolve(process.argv[2] || '');
assert(
  root.startsWith(path.resolve('outputs/game-builds') + path.sep),
  'Pass this build batch /taptap-h5 directory',
);
const evidence = path.join(root, 'browser-evidence');
await mkdir(evidence, { recursive: true });
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
};
const server = createServer(async (req, res) => {
  try {
    const [id, ...parts] = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
      .split('/')
      .filter(Boolean);
    assert(preset.games.includes(id));
    const base = path.join(root, id + '-taptap-h5-ads-on-service-on/dist');
    const file = path.resolve(base, parts.join('/') || 'index.html');
    assert(file.startsWith(base + path.sep));
    res.writeHead(200, {
      'content-type': mime[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const results = [];
try {
  for (const id of preset.games) {
    const context = await browser.newContext({
      viewport: ['carding-car', 'night-overwatch', 'wulong-city'].includes(id)
        ? { width: 844, height: 390 }
        : { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    if (id === 'carding-car')
      await context.addInitScript(() => {
        if (!localStorage.getItem('kart-career-v1'))
          localStorage.setItem('kart-career-v1', JSON.stringify({ races: 1, coins: 0 }));
      });
    await context.addInitScript(() => {
      globalThis.__rewardCalls = 0;
      globalThis.tap = {
        createRewardedVideoAd() {
          let close, error;
          return {
            onClose(fn) {
              close = fn;
            },
            offClose() {
              close = undefined;
            },
            onError(fn) {
              error = fn;
            },
            offError() {
              error = undefined;
            },
            load: async () => {},
            show: async () => {
              globalThis.__rewardCalls++;
              const completed = close,
                failed = error;
              globalThis.__closeReward = (value) => {
                completed?.({ isEnded: value });
                completed?.({ isEnded: value });
              };
              globalThis.__failReward = () => failed?.({ errCode: 1004 });
            },
            destroy() {
              close = error = undefined;
            },
          };
        },
      };
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const errors = [],
      serviceCalls = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://api.nenggongzhiren.cn/**', async (route) => {
      const req = route.request(),
        body = req.postDataJSON();
      serviceCalls.push({ url: req.url(), game: body?.game });
      const payload = req.url().endsWith('/sessions/guest')
        ? {
            game: id,
            playerId: id,
            identityKind: 'guest',
            token: 'a'.repeat(64),
            sessionId: '00000000-0000-4000-8000-000000000001',
            refreshToken: 'b'.repeat(64),
            expiresAt: Date.now() + 900000,
            refreshExpiresAt: Date.now() + 86400000,
          }
        : { game: id, capabilities: { identity: true, leaderboards: false }, boards: [] };
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload) });
    });
    await page.goto(base + id + '/?dev=0');
    await page.waitForFunction(() => SmallGamesServices?.status === 'ready');
    assert.equal(
      await page.evaluate(() => SmallGamesPublishingConfig.adUnitId),
      preset.targets[0].adUnits[id],
    );
    assert(serviceCalls.some((call) => call.game === id));
    const close = async (value) => {
      await page.waitForFunction(() => typeof __closeReward === 'function');
      await page.evaluate((v) => {
        __closeReward(v);
        globalThis.__closeReward = undefined;
      }, value);
      await page.waitForFunction(() => !SmallGamesRewardAds.pending);
    };
    if (id === 'carding-car') {
      await waitForReady(page);
      await tapHome(page, '金币补给');
      assert.equal(
        await page.evaluate(() => JSON.parse(localStorage.getItem('kart-career-v1')).coins),
        0,
      );
      await tapHome(page, '取消领取');
      await page.waitForFunction(() => !SmallGamesRewardAds.pending);
      await page.evaluate(() => __closeReward(true));
      assert.equal(
        await page.evaluate(() => JSON.parse(localStorage.getItem('kart-career-v1')).coins),
        0,
      );
      await tapHome(page, '金币补给');
      await close(true);
      await page.waitForFunction(
        () => JSON.parse(localStorage.getItem('kart-career-v1')).coins === 100,
      );
      await page.reload();
      await waitForReady(page);
      assert.equal(
        await page.evaluate(() => JSON.parse(localStorage.getItem('kart-career-v1')).coins),
        100,
      );
    } else if (id === 'vibeJam-myself-history-guess') {
      await page.locator('#start').tap();
      await page.locator('#begin-level').tap();
      await page.locator('#load-cover').waitFor({ state: 'hidden' });
      await page.locator('#reward-hint').tap();
      await close(false);
      await expect(page.locator('.pause-card p')).toContainText('未获得线索');
      await page.locator('#resume').tap();
      await page.locator('#reward-hint').tap();
      await close(true);
      await expect(page.locator('.pause-card h1')).toHaveText('历史线索');
      await page.locator('#resume').tap();
      await page.locator('#reward-hint').tap();
      assert.equal(await page.evaluate(() => __rewardCalls), 2);
    } else if (id === 'wulong-city') {
      await page.locator('#start-game').tap();
      await page.locator('#hint').tap();
      await page.locator('#reward-hint').tap();
      await close(false);
      await expect(page.locator('#reward-hint')).toBeEnabled();
      await page.locator('#reward-hint').tap();
      await close(true);
      await expect(page.locator('#reward-status')).toContainText('指引已开启');
      await page.locator('[data-close-hint]').tap();
      await expect(page.locator('#stage')).toHaveClass(/guide-active/);
    } else if (id === 'letters-words2') {
      await page.locator('#focus-button').tap();
      await page.locator('#pause-button').tap();
      await page.locator('#reward-guidance').tap();
      await page.locator('#reward-return').tap();
      await expect(page.locator('#reward-message')).toContainText('未开启逐字提示');
      await page.locator('#reward-return').tap();
      await page.locator('#pause-button').tap();
      await page.locator('#reward-guidance').tap();
      // A completion received while hidden must be delivered only after returning.
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        __closeReward(true);
      });
      assert.equal(await page.evaluate(() => SmallGamesRewardAds.pending), true);
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: false });
        document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
      });
      await expect(page.locator('#reward-message')).toContainText('逐字提示已开启');
      await page.locator('#reward-return').tap();
    } else {
      await page.waitForFunction(
        () => globalThis.__night && !document.getElementById('night-startup'),
      );
      await press(page, 'training', true);
      await press(page, 'start', true);
      await press(page, 'supply', true);
      await press(page, 'supplyWatch', true);
      assert.equal((await snapshot(page)).pendingSupply, false);
      await press(page, 'adCancel', true);
      await page.waitForFunction(() => !SmallGamesRewardAds.pending);
      assert.equal((await snapshot(page)).pendingSupply, false);
      await press(page, 'supply', true);
      await press(page, 'supplyWatch', true);
      assert.equal(
        await page.evaluate(async () => {
          const cc = await System.import('cc');
          return cc.director
            .getScene()
            .getComponentsInChildren(cc.Component)
            .find((c) => c.hud && c.sim).hud.toast;
        }),
        '',
        'a new request clears the previous interruption message',
      );
      await close(true);
      await page.waitForFunction(() => __night.snapshot().pendingSupply);
      await page.waitForFunction(() =>
        __night.snapshot().buttons.some((button) => button.id === 'reward:ammo'),
      );
      await press(page, 'reward:ammo', true);
      assert.equal((await snapshot(page)).homingAmmo, 2);
      assert.equal((await snapshot(page)).pendingSupply, false);
    }
    await page.screenshot({ path: path.join(evidence, id + '.png') });
    assert.deepEqual(errors, []);
    results.push({
      id,
      viewport: page.viewportSize(),
      service: 'guest/metadata fixture',
      reward:
        'actual packaged bridge + SDK fixture, touch, no premature grant, cancellation, completion, duplicate callback',
      errors,
    });
    console.log(id + ' PASS');
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await writeFile(path.join(evidence, 'results.json'), JSON.stringify(results, null, 2));
}

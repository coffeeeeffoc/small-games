import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const root = new URL('../', import.meta.url);
const output = new URL('../docs/design/expansion-2026-10-21/actual/', import.meta.url);
await mkdir(output, { recursive: true });
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const filename = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    assert(!filename.includes('..'));
    const file = filename.startsWith('reward-host/')
      ? new URL(`../../../platforms/h5/${filename.slice(12)}`, root)
      : new URL(`dist/${filename}`, root);
    const type = filename.endsWith('.js')
      ? 'text/javascript'
      : filename.endsWith('.css')
        ? 'text/css'
        : 'text/html';
    let content = await readFile(file);
    if (filename === 'index.html')
      content = content
        .toString()
        .replace(
          '<head>',
          '<head><script type="module" src="/reward-host/game-rewards.js"></script>',
        );
    response.writeHead(200, { 'Content-Type': type }).end(content);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/usr/bin/chromium',
});
const errors = [],
  checks = [];
const action = (page, id) => page.locator(`[data-hit-id="${id}"]`);
const shot = (page, name) =>
  page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)) });
const count = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('moss-garden.save.v1')).active.puzzle.hints);
const saved = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('moss-garden.save.v1')));
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.SmallGamesPublishingConfig = {
      adMode: 'host',
      adsEnabled: true,
      platform: 'taptap-h5',
      adUnitId: 'moss-test-fixture',
    };
    window.__adCalls = [];
    window.tap = {
      createRewardedVideoAd() {
        const ad = {
          async load() {},
          async show() {
            window.__adCalls.push(ad);
          },
          onClose(fn) {
            ad.close = fn;
          },
          offClose() {},
          onError(fn) {
            ad.error = fn;
          },
          offError() {},
          destroy() {},
        };
        return ad;
      },
    };
    window.__hidden = false;
    Object.defineProperty(document, 'hidden', { get: () => window.__hidden });
    window.__visibility = (hidden) => {
      window.__hidden = hidden;
      document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    };
  });
  await page.goto(url);
  await action(page, 'home:start').tap();
  await shot(page, 'tutorial-390');
  await action(page, 'play:hint').tap();
  assert.equal(await count(page), 1);
  const before = (await saved(page)).active.puzzle;
  const open = async () => {
    await action(page, 'play:hint').tap();
    await expect(page.locator('#garden')).toHaveAttribute('data-page', 'hint');
    const calls = await page.evaluate(() => window.__adCalls.length);
    await action(page, 'hint:watch').tap();
    await expect.poll(() => page.evaluate(() => window.__adCalls.length)).toBe(calls + 1);
  };
  const close = (ended) =>
    page.evaluate((value) => window.__adCalls.at(-1).close({ isEnded: value }), ended);
  await action(page, 'play:hint').tap();
  await shot(page, 'hint-confirm-390');
  await page.setViewportSize({ width: 320, height: 568 });
  for (const button of await page.locator('#controls button').all()) {
    const box = await button.boundingBox();
    assert(box.width >= 43.9 && box.height >= 43.9);
  }
  await shot(page, 'hint-confirm-320');
  await action(page, 'hint:cancel').tap();
  await page.setViewportSize({ width: 390, height: 844 });
  await open();
  await close(false);
  await expect(page.getByRole('status')).toContainText('未获得提示');
  assert.deepEqual((await saved(page)).active.puzzle, before);
  await action(page, 'hint:cancel').tap();
  await open();
  await page.evaluate(() => window.__adCalls.at(-1).error({ errCode: 1 }));
  await expect(page.getByRole('status')).toContainText('视频加载失败');
  assert.deepEqual((await saved(page)).active.puzzle, before);
  await action(page, 'hint:cancel').tap();
  await open();
  await action(page, 'hint:cancel').tap();
  await close(true);
  assert.deepEqual((await saved(page)).active.puzzle, before);
  checks.push('shared SDK adapter: dismissed, error, cancelled late completion preserve board');
  for (const closeFirst of [true, false]) {
    const previous = await count(page);
    await open();
    await page.evaluate(() => window.__visibility(true));
    if (closeFirst) await close(true);
    assert.equal(await count(page), previous);
    await page.evaluate(() => window.__visibility(false));
    if (!closeFirst) await close(true);
    await expect(page.locator('#garden')).toHaveAttribute('data-page', 'play');
    await expect.poll(() => count(page)).toBe(previous + 1);
    await close(true);
    assert.equal(await count(page), previous + 1);
  }
  checks.push('reward close/foreground in both orders; duplicate close grants only once');
  await page.clock.install();
  await open();
  await page.clock.fastForward(600000);
  await expect(page.locator('#garden')).toHaveAttribute('data-page', 'hint');
  await close(true);
  await expect(page.locator('#garden')).toHaveAttribute('data-page', 'result');
  await shot(page, 'bloom-result-390');
  checks.push('ten-minute video/end card does not expire after show; reward solves final seed');
  const ordinary = await saved(page);
  await page.goto(url + '?dev=1');
  await action(page, 'home:levels').tap();
  await expect(action(page, 'level:moss-06')).toBeVisible();
  await action(page, 'dev:select').tap();
  for (const digit of '1000') await action(page, `jump:${digit}`).tap();
  await shot(page, 'developer-select-390');
  await action(page, 'jump:start').tap();
  await expect(page.locator('#scene')).toHaveAttribute('aria-label', /第 1000 关/);
  assert.equal(await page.evaluate(() => window.SmallGamesDev.inspect().game.practice), true);
  await action(page, 'play:hint').tap();
  await action(page, 'play:hint').tap();
  await shot(page, 'level-1000-390');
  assert.deepEqual(await saved(page), ordinary);
  await page.goto(url + '?dev=0');
  await action(page, 'home:levels').tap();
  await expect(action(page, 'level:moss-06')).toHaveCount(0);
  await expect(action(page, 'dev:select')).toHaveCount(0);
  checks.push('dev=1 directly selects 1000 without progress writes; dev=0 restores locks');
  // No SDK: a real missing host remains unavailable, without a mock reward.
  await page.evaluate(() => {
    delete window.tap;
  });
  await action(page, 'levels:continue').tap();
  await action(page, 'play:hint').tap();
  await action(page, 'play:hint').tap();
  const noSdkBefore = (await saved(page)).active.puzzle;
  await action(page, 'hint:watch').tap();
  await expect(page.getByRole('status')).toContainText('没有可用视频');
  assert.deepEqual((await saved(page)).active.puzzle, noSdkBefore);
  checks.push('absent SDK does not grant hints or block ordinary puzzle play');
  assert.deepEqual(errors, []);
  console.log(`moss expansion: ${checks.length} browser checks passed`);
} finally {
  await writeFile(
    new URL('expansion-browser.json', output),
    JSON.stringify(
      {
        environment:
          'Chromium touch simulation; shared game-rewards with mock Tap SDK; not real ads',
        checks,
        errors,
      },
      null,
      2,
    ),
  );
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';
import { steerWithPointer } from './pointer-play.mjs';

// Run after building Shell with the cage-rescue artifact. No catalog-wide game build.
const shell = fileURLToPath(new URL('../../../../apps/shell-web/', import.meta.url));
const output = fileURLToPath(new URL('../test-results/shell-performance.json', import.meta.url));
const manifest = JSON.parse(await readFile(`${shell}dist/.vite/manifest.json`, 'utf8'));
const builtinChunks = Object.entries(manifest)
  .filter(
    ([source, chunk]) => /game-[^/]+\/src\/definition\.ts$/.test(source) && chunk.isDynamicEntry,
  )
  .map(([, chunk]) => chunk.file);
const server = await preview({
  root: shell,
  base: '/small-games/',
  preview: { host: '127.0.0.1', port: 0 },
});
const base = `http://127.0.0.1:${server.httpServer.address().port}/small-games/`;
const report = {
  browser: '',
  cases: [],
  errors: [],
  limitations: [
    'Desktop Chromium with emulated touch, CPU throttling and local production Shell; no physical phone.',
  ],
};
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/usr/bin/chromium',
  });
  report.browser = await browser.version();
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
      hasTouch: mobile,
      isMobile: mobile,
      deviceScaleFactor: 2,
    });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const requests = [];
      page.on('request', (request) => requests.push(request.url()));
      page.on('pageerror', (error) => report.errors.push(error.message));
      await page.addInitScript(() => {
        window.__longTasks = [];
        new PerformanceObserver((list) =>
          window.__longTasks.push(...list.getEntries().map((entry) => entry.duration)),
        ).observe({ type: 'longtask', buffered: true });
      });
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await page.goto(base);
      await expect(page.locator('iframe')).toHaveCount(0);
      const samples = [];
      for (let visit = 0; visit < 8; visit++) {
        await page.evaluate(() => {
          location.hash = '#/games/cage-rescue';
        });
        await expect(page.locator('iframe')).toHaveCount(1);
        const frame = await page
          .locator('iframe')
          .elementHandle()
          .then((handle) => handle.contentFrame());
        await frame.waitForFunction(() => !!window.__cageRescue);
        await frame.locator('#start')[mobile ? 'tap' : 'click']();
        await frame.locator('#launch')[mobile ? 'tap' : 'click']();
        if (visit === 0) {
          for (let level = 0; level < 2; level++) {
            const stop = await steerWithPointer(frame, context, { touch: mobile, topPage: page });
            // Real wall-clock RAF, unlike the accelerated campaigns in browser.mjs.
            await frame.waitForFunction(
              () => window.__cageRescue.snapshot().screen === 'result',
              null,
              { timeout: 120000 },
            );
            await stop();
            const result = await frame.evaluate(() => window.__cageRescue.snapshot());
            assert.equal(result.game.phase, 'won');
            assert.equal(result.game.rescued, 6);
            console.log(`PASS real Shell ${mobile ? 'touch' : 'mouse'} level ${level + 1}`);
            if (level === 0) {
              await frame.locator('#next')[mobile ? 'tap' : 'click']();
              await frame.locator('#launch')[mobile ? 'tap' : 'click']();
            }
          }
          await frame.locator('#result-home')[mobile ? 'tap' : 'click']();
        } else {
          await page.waitForTimeout(150);
          await frame.locator('#pause')[mobile ? 'tap' : 'click']();
          await frame.locator('#home')[mobile ? 'tap' : 'click']();
        }
        await page
          .getByRole('button', { name: '返回目录', exact: true })
          [mobile ? 'tap' : 'click']();
        await expect(page.locator('iframe, .game-slot')).toHaveCount(0);
        assert(frame.isDetached(), 'exit destroys the active game document');
        await cdp.send('HeapProfiler.collectGarbage');
        const dom = await cdp.send('Memory.getDOMCounters');
        const heap = await cdp.send('Runtime.getHeapUsage');
        samples.push({ visit: visit + 1, ...dom, heapBytes: heap.usedSize });
      }
      assert(
        samples.at(-1).documents <= samples[0].documents + 1,
        'old iframe documents are not retained',
      );
      assert(
        samples.at(-1).heapBytes < samples[0].heapBytes + 8 * 1024 * 1024,
        'Shell exit does not accumulate active game resources',
      );
      const gameRequests = requests
        .map((url) => new URL(url).pathname)
        .filter((url) => url.includes('/games/'));
      assert(
        gameRequests.every((url) => url.includes('/games/cage-rescue/')),
        'only the selected standalone game is fetched',
      );
      assert(
        !requests.some((url) => builtinChunks.some((chunk) => url.endsWith(`/${chunk}`))),
        'standalone play does not start built-in games',
      );
      report.cases.push({
        input: mobile ? 'touch' : 'mouse',
        cpuThrottle: 4,
        realLevels: 2,
        visits: 8,
        garbageCollectedSamples: samples,
        shellLongTasks: await page.evaluate(() => __longTasks),
        singleIframe: true,
      });
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(report.errors, []);
  report.passed = true;
} finally {
  await mkdir(fileURLToPath(new URL('../test-results/', import.meta.url)), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
console.log(
  'PASS production Shell continuous play, 16 exits, bounded resources and lazy game loading',
);

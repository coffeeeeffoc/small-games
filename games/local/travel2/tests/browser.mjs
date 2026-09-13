import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';

const output = new URL('../../../../.scratch/travel2-browser/', import.meta.url);
await mkdir(output, { recursive: true });
const server = process.env.GAME_URL
  ? null
  : await preview({
      root: fileURLToPath(new URL('../', import.meta.url)),
      preview: { host: '127.0.0.1', port: 0 },
    });
const url = process.env.GAME_URL ?? `http://127.0.0.1:${server.httpServer.address().port}/`;
const executablePath =
  process.env.PLAYWRIGHT_EXECUTABLE_PATH ??
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(existsSync);
const failures = [];
const results = [];
let browser;

async function layout(page) {
  const measurements = await page.evaluate(() => {
    const dialog = document.querySelector('dialog[open]');
    const rect = dialog?.getBoundingClientRect();
    return {
      width: innerWidth,
      pageWidth: document.documentElement.scrollWidth,
      dialog: dialog && {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: dialog.clientWidth,
        content: dialog.scrollWidth,
        viewportHeight: innerHeight,
      },
    };
  });
  assert(
    measurements.pageWidth <= measurements.width + 1,
    `Horizontal overflow: ${JSON.stringify(measurements)}`,
  );
  if (measurements.dialog) {
    const d = measurements.dialog;
    assert(
      d.left >= -1 &&
        d.right <= measurements.width + 1 &&
        d.top >= -1 &&
        d.bottom <= d.viewportHeight + 1,
      `Dialog outside viewport: ${JSON.stringify(d)}`,
    );
    assert(d.content <= d.width + 1, `Dialog content overflows horizontally: ${JSON.stringify(d)}`);
  }
}

async function enterChapter(page, index, mobile) {
  const button = page.getByRole('button', { name: new RegExp(`^前往第${index + 1}幕：`) });
  await button[mobile ? 'tap' : 'click']();
  await expect(page.locator('main')).toHaveAttribute('data-chapter', String(index));
  await expect(page.getByTestId('collect-stamp')).toBeVisible();
}

async function collect(page, count, mobile) {
  const click = (button) => button[mobile ? 'tap' : 'click']();
  await click(page.getByTestId('collect-stamp'));
  await expect(page.locator('dialog')).toBeVisible();
  await layout(page);
  await click(page.getByRole('button', { name: /^盖上这一枚/ }));
  await expect(page.getByTestId('stamp-count')).toHaveText(`${count} / 4`);
  await click(page.getByRole('button', { name: /^收好回忆/ }));
  await expect(page.locator('dialog')).toHaveCount(0);
}

async function swipeIntoNextChapter(page, context) {
  const session = await context.newCDPSession(page);
  const { width, height } = page.viewportSize();
  try {
    for (
      let attempt = 0;
      attempt < 8 && (await page.locator('main').getAttribute('data-chapter')) === '0';
      attempt++
    ) {
      const x = Math.round(width * 0.52);
      const start = Math.round(height * 0.82);
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y: start }],
      });
      for (let step = 1; step <= 12; step++) {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y: start - Math.round((height * 0.48 * step) / 12) }],
        });
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await expect(page.locator('main')).not.toHaveAttribute('data-chapter', '0');
    assert(await page.evaluate(() => scrollY > 0), 'Touch swipe must scroll the document');
  } finally {
    await session.detach();
  }
}

try {
  browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
  for (const scenario of [
    { name: 'desktop', width: 1365, height: 900 },
    { name: 'phone', width: 390, height: 844, mobile: true, swipe: true },
    { name: 'narrow', width: 320, height: 640, mobile: true },
    { name: 'landscape', width: 844, height: 390, mobile: true },
    { name: 'reduced-motion', width: 390, height: 844, mobile: true, reduced: true },
    { name: 'webgl-disabled', width: 390, height: 844, mobile: true, webgl: true },
    { name: 'renderer-fallback', width: 390, height: 844, mobile: true, fallback: true },
  ]) {
    if (process.env.TRAVEL2_SCENARIO && process.env.TRAVEL2_SCENARIO !== scenario.name) continue;
    const context = await browser.newContext({
      viewport: { width: scenario.width, height: scenario.height },
      isMobile: !!scenario.mobile,
      hasTouch: !!scenario.mobile,
      reducedMotion: scenario.reduced ? 'reduce' : 'no-preference',
      acceptDownloads: true,
    });
    try {
      await context.addInitScript(() => {
        const probe = (globalThis.__travel2Probe = { starts: 0, stops: 0, hidden: false });
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => probe.hidden });
        for (const [method, counter] of [
          ['start', 'starts'],
          ['stop', 'stops'],
        ]) {
          const original = AudioBufferSourceNode.prototype[method];
          AudioBufferSourceNode.prototype[method] = function (...args) {
            probe[counter]++;
            return original.apply(this, args);
          };
        }
      });
      if (scenario.webgl || scenario.fallback)
        await context.addInitScript((fallback) => {
          // Pixi also supports WebGPU/Canvas; separately exercise its Canvas and CSS fallbacks.
          Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined });
          const getContext = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (type, ...args) {
            if (/webgl/i.test(type)) return null;
            if (fallback && type === '2d' && (this.width !== 1200 || this.height !== 1500))
              return null;
            return getContext.call(this, type, ...args);
          };
        }, !!scenario.fallback);
      const page = await context.newPage();
      page.on('pageerror', (error) => failures.push(`${scenario.name}: ${error.message}`));
      page.on('response', (response) => {
        if (new URL(response.url()).origin === new URL(url).origin && response.status() >= 400)
          failures.push(`${scenario.name}: ${response.status()} ${response.url()}`);
      });
      page.on('requestfailed', (request) => {
        if (
          new URL(request.url()).origin === new URL(url).origin &&
          !request.failure()?.errorText.includes('ERR_ABORTED')
        )
          failures.push(`${scenario.name}: ${request.failure()?.errorText} ${request.url()}`);
      });
      const click = (button) => button[scenario.mobile ? 'tap' : 'click']();
      assert.equal((await page.goto(url)).status(), 200);
      await expect(page.getByTestId('begin-journey')).toBeVisible();
      await expect(page.locator('.scene')).toHaveAttribute('data-ready', 'true', {
        timeout: 30000,
      });
      await expect(page.locator('.scene')).toHaveAttribute(
        'data-renderer',
        scenario.fallback ? 'fallback' : 'pixi',
      );
      if (scenario.webgl)
        assert(await page.locator('.scene canvas').evaluate((canvas) => !!canvas.getContext('2d')));
      await layout(page);
      await page.screenshot({
        path: fileURLToPath(new URL(`${scenario.name}-opening.png`, output)),
      });
      await click(page.getByTestId('begin-journey'));
      await expect(page.getByTestId('collect-stamp')).toBeVisible();
      if (scenario.name === 'desktop') {
        const starts = await page.evaluate(() => globalThis.__travel2Probe.starts);
        await click(page.getByRole('button', { name: '开启环境音', exact: true }));
        await expect(page.getByRole('button', { name: '关闭环境音', exact: true })).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        await expect
          .poll(() => page.evaluate(() => globalThis.__travel2Probe.starts))
          .toBeGreaterThan(starts);
        const stops = await page.evaluate(() => globalThis.__travel2Probe.stops);
        await page.evaluate(() => {
          globalThis.__travel2Probe.hidden = true;
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await expect
          .poll(() => page.evaluate(() => globalThis.__travel2Probe.stops))
          .toBeGreaterThan(stops);
        const pausedStarts = await page.evaluate(() => globalThis.__travel2Probe.starts);
        await page.waitForTimeout(150);
        assert.equal(await page.evaluate(() => globalThis.__travel2Probe.starts), pausedStarts);
        await page.evaluate(() => {
          globalThis.__travel2Probe.hidden = false;
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await expect
          .poll(() => page.evaluate(() => globalThis.__travel2Probe.starts))
          .toBeGreaterThan(pausedStarts);
        const resumedStops = await page.evaluate(() => globalThis.__travel2Probe.stops);
        await click(page.getByRole('button', { name: '关闭环境音', exact: true }));
        await expect(page.getByRole('button', { name: '开启环境音', exact: true })).toHaveAttribute(
          'aria-pressed',
          'false',
        );
        await expect
          .poll(() => page.evaluate(() => globalThis.__travel2Probe.stops))
          .toBeGreaterThan(resumedStops);
      }
      if (scenario.swipe) await swipeIntoNextChapter(page, context);
      await enterChapter(page, 0, scenario.mobile);
      if (scenario.reduced) {
        assert(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches));
        assert.equal(
          await page.locator('.landmark-dot').evaluate((el) => getComputedStyle(el).animationName),
          'none',
        );
      }
      await collect(page, 1, scenario.mobile);
      await click(page.getByTestId('collect-stamp'));
      await expect(page.getByRole('button', { name: /^盖上这一枚/ })).toHaveCount(0);
      await expect(page.getByTestId('stamp-count')).toHaveText('1 / 4');
      await click(page.getByRole('button', { name: /^收好回忆/ }));

      await click(page.getByRole('button', { name: '打开旅行手账', exact: true }));
      await layout(page);
      await click(page.getByRole('button', { name: /绿顶拾光，未收集，前往探索/ }));
      await expect(page.locator('dialog')).toHaveCount(0);
      await expect(page.locator('main')).toHaveAttribute('data-chapter', '1');
      await collect(page, 2, scenario.mobile);
      for (const index of [2, 3]) {
        await enterChapter(page, index, scenario.mobile);
        await collect(page, index + 1, scenario.mobile);
      }
      await layout(page);
      await page.screenshot({ path: fileURLToPath(new URL(`${scenario.name}-night.png`, output)) });
      await page.reload();
      await expect(page.getByTestId('stamp-count')).toHaveText('4 / 4');
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              Number(document.querySelector('main').dataset.chapter) ===
              Math.min(
                3,
                Math.floor((scrollY / (document.documentElement.scrollHeight - innerHeight)) * 4),
              ),
          ),
        )
        .toBe(true);
      await click(page.getByRole('button', { name: '打开旅行手账', exact: true }));
      await expect(page.locator('.journal-stamp.stamped')).toHaveCount(4);
      await layout(page);
      await page.screenshot({
        path: fileURLToPath(new URL(`${scenario.name}-journal.png`, output)),
      });
      const downloadEvent = page.waitForEvent('download');
      await click(page.getByRole('button', { name: /保存我的外滩明信片/ }));
      const download = await downloadEvent;
      assert.equal(await download.failure(), null);
      assert.equal(download.suggestedFilename(), '外滩-一江入梦.png');
      const destination = fileURLToPath(new URL(`${scenario.name}-postcard.png`, output));
      await download.saveAs(destination);
      const png = await readFile(destination);
      assert.equal(png.subarray(1, 4).toString(), 'PNG');
      assert.equal(png.readUInt32BE(16), 1200);
      assert.equal(png.readUInt32BE(20), 1500);
      await click(page.getByRole('button', { name: '关闭弹窗', exact: true }));
      await enterChapter(page, 3, scenario.mobile);
      await click(page.getByRole('button', { name: '走到旅程尽头', exact: true }));
      await expect(page.locator('.ending')).toContainText('四枚印章，一份完整的外滩回忆。');
      await click(page.getByRole('button', { name: /^再沿江走一遍/ }));
      await expect(page.getByTestId('begin-journey')).toBeVisible();
      await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(2);
      results.push({
        ...scenario,
        renderer: scenario.fallback ? 'fallback' : 'pixi',
        stamps: 4,
        postcard: '1200x1500 PNG',
        passed: true,
      });
      console.log(`Passed: ${scenario.name} (${scenario.width}x${scenario.height})`);
    } catch (error) {
      console.error(
        await context.pages()[0]?.evaluate(() => ({
          scroll: scrollY,
          height: innerHeight,
          content: document.documentElement.scrollHeight,
          chapter: document.querySelector('main')?.dataset.chapter,
        })),
      );
      await context
        .pages()[0]
        ?.screenshot({ path: fileURLToPath(new URL(`${scenario.name}-failure.png`, output)) });
      throw error;
    } finally {
      await context.close();
    }
  }
  assert(results.length > 0, 'No browser scenario matched TRAVEL2_SCENARIO');
  assert.deepEqual(failures, []);
  await writeFile(
    new URL('report.json', output),
    JSON.stringify({ url, results, failures }, null, 2),
  );
  console.log(
    'Travel2: scroll, touch, four stamps, duplicate prevention, persistence, journal navigation, export and fallbacks passed.',
  );
} finally {
  await browser?.close();
  await server?.close();
}

import { chromium, webkit, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createRun } from '../levels.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = new URL('../test-results/', import.meta.url);
await mkdir(evidence, { recursive: true });
const port = process.env.GAME_PORT || '4418';
const url = process.env.GAME_URL || `http://127.0.0.1:${port}/`;
const manifest = JSON.parse(
  await readFile(new URL('../assets/audio/manifest.json', import.meta.url), 'utf8'),
);
const expectedRun = createRun(manifest, 42);
const server = process.env.GAME_URL
  ? null
  : spawn(process.execPath, ['server.mjs', '--dist', '--port', port], {
      cwd: root,
      stdio: 'pipe',
      windowsHide: true,
    });
const report = { browsers: [], clips: [], checks: [] };
let browser;

async function instrument(context) {
  await context.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, 'getRandomValues', {
      value: (array) => array.fill(42),
    });
    window.__audioProbe = { active: new Set(), sources: [], contexts: [] };
    const original = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function (...args) {
      const source = original.apply(this, args);
      const probe = window.__audioProbe;
      if (!probe.contexts.includes(this)) probe.contexts.push(this);
      probe.sources.push(source);
      const start = source.start.bind(source);
      const stop = source.stop.bind(source);
      source.start = (...startArgs) => {
        probe.active.add(source);
        probe.last = source;
        return start(...startArgs);
      };
      source.stop = (...stopArgs) => {
        probe.active.delete(source);
        return stop(...stopArgs);
      };
      source.addEventListener('ended', () => probe.active.delete(source));
      return source;
    };
  });
}

try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* server startup */
    }
    if (i === 59) throw new Error('Local browser test server did not start');
    await delay(100);
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await instrument(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  await expect(page.locator('#intro')).toBeVisible();
  expect(await page.evaluate(() => window.__audioProbe.sources.length)).toBe(0);
  await page.screenshot({
    path: fileURLToPath(new URL('mobile-intro.png', evidence)),
    fullPage: true,
  });
  await page.locator('#start').tap();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
  await expect(page.locator('#scene-play')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__audioProbe.active.size)).toBe(2);
  expect(await page.locator('#confirm').isDisabled()).toBe(true);

  for (let roundIndex = 0; roundIndex < 12; roundIndex++) {
    const expected = expectedRun[roundIndex];
    await expect(page.locator('#round-label')).toHaveText(
      `${String(roundIndex + 1).padStart(2, '0')} / 12`,
    );
    await expect(page.locator('body')).toHaveAttribute('data-phase', 'playing');
    await expect(page.locator('#scene-play')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#scene-play')).toHaveAttribute('aria-pressed', 'false', {
      timeout: 15000,
    });
    await page.evaluate(() => {
      window.__audioProbe.sceneBuffer = window.__audioProbe.last.buffer;
    });
    if (roundIndex === 0) {
      await page.screenshot({
        path: fileURLToPath(new URL('mobile-playing.png', evidence)),
        fullPage: true,
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const shapes = await page
        .locator('[data-listen], [data-select], #scene-play, #confirm')
        .evaluateAll((items) =>
          items.map((item) => ({
            width: item.getBoundingClientRect().width,
            height: item.getBoundingClientRect().height,
          })),
        );
      expect(shapes.every((shape) => shape.width >= 44 && shape.height >= 44)).toBe(true);
    }
    for (let slot = 0; slot < 3; slot++) {
      await page.locator(`[data-listen="${slot}"]`).tap();
      await expect(page.locator(`[data-listen="${slot}"]`)).toHaveAttribute('aria-pressed', 'true');
      expect(await page.evaluate(() => window.__audioProbe.active.size)).toBe(1);
      expect(
        await page.evaluate(
          () => window.__audioProbe.last.buffer === window.__audioProbe.sceneBuffer,
        ),
      ).toBe(slot === expected.correctIndex);
    }
    const choice = roundIndex === 1 ? (expected.correctIndex + 1) % 3 : expected.correctIndex;
    await page.locator(`[data-select="${choice}"]`).tap();
    await expect(page.locator('#feedback')).toBeHidden();
    await expect(page.locator('#confirm')).toBeEnabled();
    await page.locator('#confirm').tap();
    await expect(page.locator('#feedback')).toBeVisible();
    await expect(page.locator('#feedback-title')).toHaveText(
      roundIndex === 1 ? '这次听岔了' : '声线吻合',
    );
    expect(await page.evaluate(() => window.__audioProbe.active.size)).toBe(0);
    await page.locator('#review-correct').tap();
    await expect.poll(() => page.evaluate(() => window.__audioProbe.active.size)).toBe(1);
    expect(
      await page.evaluate(
        () => window.__audioProbe.last.buffer === window.__audioProbe.sceneBuffer,
      ),
    ).toBe(true);
    if (roundIndex === 0)
      await page.screenshot({
        path: fileURLToPath(new URL('mobile-feedback.png', evidence)),
        fullPage: true,
      });
    await page.locator('#next').tap();
  }
  await expect(page.locator('#summary')).toBeVisible();
  await expect(page.locator('#final-score')).toHaveText('11');
  expect(await page.evaluate(() => window.__audioProbe.active.size)).toBe(0);
  await page.screenshot({
    path: fileURLToPath(new URL('mobile-summary.png', evidence)),
    fullPage: true,
  });
  await page.locator('#restart').tap();
  await expect(page.locator('#round-label')).toHaveText('01 / 12');
  await expect(page.locator('#score')).toHaveText('0');
  await page.locator('#home').tap();
  await expect(page.locator('#intro')).toBeVisible();
  expect(await page.evaluate(() => window.__audioProbe.active.size)).toBe(0);
  report.checks.push(
    '12 touch rounds, correct/wrong feedback, exact AudioBuffer target mapping, no overlap, separate selection/confirmation, replay, score, restart, home cleanup',
  );

  report.clips = await page.evaluate(async () => {
    const { phrases } = await (await fetch('./assets/audio/manifest.json')).json();
    const context = new AudioContext();
    const clips = [];
    for (const clip of phrases.flatMap((phrase) => phrase.clips)) {
      const response = await fetch(clip.url);
      const decoded = await context.decodeAudioData(await response.arrayBuffer());
      const data = decoded.getChannelData(0);
      const rms = Math.sqrt(data.reduce((sum, sample) => sum + sample * sample, 0) / data.length);
      clips.push({
        url: clip.url,
        duration: decoded.duration,
        sampleRate: decoded.sampleRate,
        rms,
      });
      if (decoded.duration < 1 || rms < 0.005) throw new Error('Invalid decoded speech');
    }
    await context.close();
    return clips;
  });

  await page.setViewportSize({ width: 360, height: 640 });
  await page.locator('#start').tap();
  await expect(page.locator('#scene-play')).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({
    path: fileURLToPath(new URL('mobile-360.png', evidence)),
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await page.evaluate(() => window.__audioProbe.active.size)).toBe(0);
  await page.evaluate(() => {
    delete document.hidden;
  });
  await page.locator('#home').tap();
  report.checks.push('360px portrait layout and visibilitychange audio cleanup');
  expect(errors).toEqual([]);
  report.browsers.push({
    browser: 'Chromium',
    version: browser.version(),
    viewport: '390x844, 360x640',
    touch: true,
    passed: true,
  });

  const failurePage = await context.newPage();
  await failurePage.route('**/*.wav', (route) => route.abort());
  await failurePage.goto(url);
  await failurePage.locator('#start').tap();
  await expect(failurePage.locator('#error')).toBeVisible();
  await expect(failurePage.locator('#confirm')).toBeDisabled();
  await failurePage.unroute('**/*.wav');
  await failurePage.locator('#retry').tap();
  await expect(failurePage.locator('#scene-play')).toHaveAttribute('aria-pressed', 'true');
  await failurePage.locator('#home').tap();
  await failurePage.close();
  report.checks.push('missing WAV presents error; retry restores playable audio');
  await context.close();
  await browser.close();

  // WebKit desktop engine with touch viewport: useful coverage, not a real iPhone.
  browser = await webkit.launch({ headless: true });
  const webContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const webPage = await webContext.newPage();
  const webErrors = [];
  webPage.on('pageerror', (error) => webErrors.push(error.message));
  await webPage.goto(url);
  await webPage.locator('#start').tap();
  const webAudioSupported = await webPage.evaluate(() =>
    Boolean(window.AudioContext || window.webkitAudioContext),
  );
  if (webAudioSupported) {
    await expect(webPage.locator('#scene-play')).toHaveAttribute('aria-pressed', 'true');
    await expect(webPage.locator('#scene-play')).toHaveAttribute('aria-pressed', 'false', {
      timeout: 15000,
    });
    await webPage.locator('[data-listen="0"]').tap();
    await expect(webPage.locator('[data-listen="0"]')).toHaveAttribute('aria-pressed', 'true');
    await webPage.locator('[data-select="0"]').tap();
    await webPage.locator('#confirm').tap();
    await expect(webPage.locator('#feedback')).toBeVisible();
    expect(webErrors).toEqual([]);
    report.browsers.push({
      browser: 'WebKit',
      version: browser.version(),
      viewport: '390x844',
      touch: true,
      passed: true,
    });
  } else {
    await expect(webPage.locator('#error')).toBeVisible();
    await expect(webPage.locator('#error-message')).toContainText('不支持 Web Audio');
    report.browsers.push({
      browser: 'WebKit',
      version: browser.version(),
      audioSupported: false,
      passed:
        'unsupported-browser error handling only; this Windows WebKit build has no AudioContext',
    });
  }
  await webContext.close();
  await browser.close();
  browser = null;
  await writeFile(new URL('browser-report.json', evidence), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  server?.kill();
}

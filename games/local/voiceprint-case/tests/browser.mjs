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

async function expectRecordingPlayback(page, active = null) {
  await expect
    .poll(() =>
      page
        .locator('#scene-recording, [data-recording-slot]')
        .evaluateAll((canvases) =>
          Object.fromEntries(
            canvases.map((canvas) => [
              canvas.id === 'scene-recording' ? 'scene' : canvas.dataset.recordingSlot,
              canvas.dataset.playing,
            ]),
          ),
        ),
    )
    .toEqual(
      Object.fromEntries(
        ['scene', '0', '1', '2'].map((key) => [key, String(key === String(active))]),
      ),
    );
}

async function recordingFingerprint(canvas) {
  return canvas.evaluate((element) => {
    const pixels = element.getContext('2d').getImageData(0, 0, element.width, element.height).data;
    let hash = 2166136261;
    for (let i = 0; i < pixels.length; i += 17) {
      hash = Math.imul(hash ^ pixels[i], 16777619);
    }
    return hash >>> 0;
  });
}

async function expectTouchLayout(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const controls = await page.locator('button:visible').evaluateAll((items) =>
    items.map((item) => ({
      width: item.getBoundingClientRect().width,
      height: item.getBoundingClientRect().height,
    })),
  );
  expect(controls.every((shape) => shape.width >= 44 && shape.height >= 44)).toBe(true);
  const recordings = await page.locator('[data-recording-slot]').evaluateAll((items) =>
    items.map((item) => ({
      width: item.getBoundingClientRect().width,
      height: item.getBoundingClientRect().height,
    })),
  );
  expect(recordings).toHaveLength(3);
  expect(recordings.every((shape) => shape.width >= 220 && shape.height >= 120)).toBe(true);
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
  await expectRecordingPlayback(page, 'scene');
  await expect(page.locator('#scene-recording')).toHaveAttribute('data-anonymous', 'true');
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
    await expectRecordingPlayback(page);
    await page.evaluate(() => {
      window.__audioProbe.sceneBuffer = window.__audioProbe.last.buffer;
    });
    if (roundIndex === 0) {
      await page.screenshot({
        path: fileURLToPath(new URL('mobile-playing.png', evidence)),
        fullPage: true,
      });
      await expectTouchLayout(page);
      // Drag the actual mobile carousel, including a cancelled second gesture.
      // Playback and selection must only follow a tap, never a swipe.
      await page.locator('[data-recording-slot="0"]').scrollIntoViewIfNeeded();
      const canvasBounds = await page.locator('[data-recording-slot="0"]').boundingBox();
      const cdp = await context.newCDPSession(page);
      const swipeY = Math.round(canvasBounds.y + canvasBounds.height / 2);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: 305, y: swipeY }],
      });
      for (const x of [275, 235, 190, 140, 90, 50]) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y: swipeY }],
        });
        await delay(30);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect
        .poll(() => page.locator('#candidates').evaluate((el) => el.scrollLeft))
        .toBeGreaterThan(100);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: 200, y: swipeY }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: 170, y: swipeY }],
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      await cdp.detach();
      await expectRecordingPlayback(page);
      await expect(page.locator('[data-select][aria-pressed="true"]')).toHaveCount(0);
      report.checks.push('real touch carousel swipe and cancelled gesture do not play or select');
    }
    for (let slot = 0; slot < 3; slot++) {
      const recording = page.locator(`canvas[data-recording-slot="${slot}"]`);
      await recording.tap();
      await expect(page.locator(`[data-listen="${slot}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expectRecordingPlayback(page, slot);
      await expect(recording).toHaveAttribute('data-anonymous', 'false');
      await expect(page.locator('[data-select][aria-pressed="true"]')).toHaveCount(0);
      await expect(page.locator('#confirm')).toBeDisabled();
      expect(await page.evaluate(() => window.__audioProbe.active.size)).toBe(1);
      expect(
        await page.evaluate(
          () => window.__audioProbe.last.buffer === window.__audioProbe.sceneBuffer,
        ),
      ).toBe(slot === expected.correctIndex);
      if (roundIndex === 0 && slot === 0) {
        const inactive = page.locator('canvas[data-recording-slot="1"]');
        const inactiveFrame = await recordingFingerprint(inactive);
        const sceneFrame = await recordingFingerprint(page.locator('#scene-recording'));
        const firstFrame = await recordingFingerprint(recording);
        await expect
          .poll(() => recordingFingerprint(recording), { timeout: 1500 })
          .not.toBe(firstFrame);
        expect(await recordingFingerprint(inactive)).toBe(inactiveFrame);
        expect(await recordingFingerprint(page.locator('#scene-recording'))).toBe(sceneFrame);
        await page.screenshot({
          path: fileURLToPath(new URL('mobile-recording-playing.png', evidence)),
          fullPage: true,
        });
        await page.locator('#stop').tap();
        await expectRecordingPlayback(page);
        expect(await page.evaluate(() => window.__audioProbe.active.size)).toBe(0);
        const stoppedFrame = await recordingFingerprint(recording);
        await delay(250);
        expect(await recordingFingerprint(recording)).toBe(stoppedFrame);
        await recording.tap();
        await expectRecordingPlayback(page, slot);
      }
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
    await expectRecordingPlayback(page);
    await page.locator('#review-correct').tap();
    await expect.poll(() => page.evaluate(() => window.__audioProbe.active.size)).toBe(1);
    await expectRecordingPlayback(page, expected.correctIndex);
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
  await expectRecordingPlayback(page);
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
  await expectRecordingPlayback(page);
  report.checks.push(
    '12 touch rounds, anonymous scene, three character recordings, only active recording animates, correct/wrong feedback, exact AudioBuffer target mapping, no overlap, canvas tap stays separate from selection/confirmation, correct recording replay, score, restart, home cleanup',
    'Playing character canvas changes pixels; stop freezes its frame and stops audio; 390px recordings remain at least 220px wide and all visible controls meet 44px touch targets',
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
  await expectRecordingPlayback(page, 'scene');
  const anonymousFrame = await recordingFingerprint(page.locator('#scene-recording'));
  await expect
    .poll(() => recordingFingerprint(page.locator('#scene-recording')), { timeout: 1500 })
    .not.toBe(anonymousFrame);
  await page.screenshot({
    path: fileURLToPath(new URL('mobile-360.png', evidence)),
    fullPage: true,
  });
  await expectTouchLayout(page);
  await expect(page.locator('#scene-play')).toHaveAttribute('aria-pressed', 'false', {
    timeout: 15000,
  });
  await page.locator('canvas[data-recording-slot="2"]').tap();
  await expectRecordingPlayback(page, 2);
  await page.screenshot({
    path: fileURLToPath(new URL('mobile-360-recording-playing.png', evidence)),
    fullPage: true,
  });
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await page.evaluate(() => window.__audioProbe.active.size)).toBe(0);
  await expectRecordingPlayback(page);
  await page.evaluate(() => {
    delete document.hidden;
  });
  await page.locator('#home').tap();
  report.checks.push(
    '360px portrait recordings and 44px controls, animated anonymous scene, swipe-accessible third recording, visibilitychange stops audio and animation',
  );

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('#start').tap();
  await expect(page.locator('#scene-play')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#scene-play')).toHaveAttribute('aria-pressed', 'false', {
    timeout: 15000,
  });
  const desktopRecordings = await page.locator('[data-recording-slot]').evaluateAll((items) =>
    items.map((item) => ({
      x: item.getBoundingClientRect().x,
      y: item.getBoundingClientRect().y,
      width: item.getBoundingClientRect().width,
    })),
  );
  expect(desktopRecordings).toHaveLength(3);
  expect(desktopRecordings.every((item) => item.width >= 220)).toBe(true);
  expect(
    Math.max(...desktopRecordings.map((item) => item.y)) -
      Math.min(...desktopRecordings.map((item) => item.y)),
  ).toBeLessThan(2);
  expect(
    desktopRecordings[0].x < desktopRecordings[1].x &&
      desktopRecordings[1].x < desktopRecordings[2].x,
  ).toBe(true);
  await page.locator('canvas[data-recording-slot="1"]').tap();
  await expectRecordingPlayback(page, 1);
  await page.screenshot({
    path: fileURLToPath(new URL('desktop-recording-playing.png', evidence)),
    fullPage: true,
  });
  // Exercise the page lifecycle handlers without relying on a browser's cache eligibility.
  const audioContextsBeforeRestore = await page.evaluate(() => window.__audioProbe.contexts.length);
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
  });
  await expectRecordingPlayback(page);
  expect(await page.evaluate(() => window.__audioProbe.active.size)).toBe(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__audioProbe.contexts.every((context) => context.state === 'closed'),
      ),
    )
    .toBe(true);
  const hiddenRecording = page.locator('canvas[data-recording-slot="1"]');
  const hiddenFrame = await recordingFingerprint(hiddenRecording);
  await delay(250);
  expect(await recordingFingerprint(hiddenRecording)).toBe(hiddenFrame);
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await expect(page.locator('#intro')).toBeVisible();
  await expectRecordingPlayback(page);
  await page.locator('#start').tap();
  await expect(page.locator('#scene-play')).toHaveAttribute('aria-pressed', 'true');
  await expectRecordingPlayback(page, 'scene');
  expect(await page.evaluate(() => window.__audioProbe.contexts.length)).toBeGreaterThan(
    audioContextsBeforeRestore,
  );
  const restoredFrame = await recordingFingerprint(page.locator('#scene-recording'));
  await expect
    .poll(() => recordingFingerprint(page.locator('#scene-recording')), { timeout: 1500 })
    .not.toBe(restoredFrame);
  await page.locator('#home').tap();
  await expectRecordingPlayback(page);
  report.checks.push(
    '1280px desktop has three readable recording columns and active-candidate screenshot',
    'Synthetic persisted pagehide/pageshow stops audio and animation, restores intro, and creates fresh audio with moving scene when restarted',
  );
  expect(errors).toEqual([]);
  report.browsers.push({
    browser: 'Chromium',
    version: browser.version(),
    viewport: '390x844, 360x640, 1280x900',
    touch: true,
    passed: true,
  });

  const failurePage = await context.newPage();
  await failurePage.route('**/*.wav', (route) => route.abort());
  await failurePage.goto(url);
  await failurePage.locator('#start').tap();
  await expect(failurePage.locator('#error')).toBeVisible();
  await expect(failurePage.locator('#confirm')).toBeDisabled();
  await expectRecordingPlayback(failurePage);
  await failurePage.unroute('**/*.wav');
  await failurePage.locator('#retry').tap();
  await expect(failurePage.locator('#scene-play')).toHaveAttribute('aria-pressed', 'true');
  await expectRecordingPlayback(failurePage, 'scene');
  await failurePage.locator('#home').tap();
  await expectRecordingPlayback(failurePage);
  await failurePage.close();
  report.checks.push(
    'missing WAV presents error and stops recording animation; retry restores playable audio and scene recording',
  );
  await context.close();

  const reducedContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  await instrument(reducedContext);
  const reducedPage = await reducedContext.newPage();
  const reducedErrors = [];
  reducedPage.on('pageerror', (error) => reducedErrors.push(error.message));
  await reducedPage.goto(url);
  expect(
    await reducedPage.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
  ).toBe(true);
  await reducedPage.locator('#start').tap();
  await expect(reducedPage.locator('#scene-play')).toHaveAttribute('aria-pressed', 'true');
  const reducedScene = reducedPage.locator('#scene-recording');
  const reducedSceneFrame = await recordingFingerprint(reducedScene);
  await delay(250);
  await expect(reducedPage.locator('#scene-play')).toHaveAttribute('aria-pressed', 'true');
  expect(await recordingFingerprint(reducedScene)).toBe(reducedSceneFrame);
  await expect(reducedPage.locator('#scene-play')).toHaveAttribute('aria-pressed', 'false', {
    timeout: 15000,
  });
  const reducedCandidate = reducedPage.locator('canvas[data-recording-slot="0"]');
  await reducedCandidate.tap();
  await expect(reducedPage.locator('[data-listen="0"]')).toHaveAttribute('aria-pressed', 'true');
  const reducedCandidateFrame = await recordingFingerprint(reducedCandidate);
  await delay(350);
  await expect(reducedPage.locator('[data-listen="0"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await reducedPage.evaluate(() => window.__audioProbe.active.size)).toBe(1);
  expect(await recordingFingerprint(reducedCandidate)).toBe(reducedCandidateFrame);
  await expect(reducedPage.locator('[data-listen="0"]')).toHaveAttribute('aria-pressed', 'false', {
    timeout: 15000,
  });
  await expectRecordingPlayback(reducedPage);
  expect(await reducedPage.evaluate(() => window.__audioProbe.active.size)).toBe(0);
  expect(reducedErrors).toEqual([]);
  await reducedContext.close();
  report.checks.push(
    'Reduced-motion preference keeps scene and candidate frames static while speech plays to completion',
  );
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
    await expectRecordingPlayback(webPage, 'scene');
    await expect(webPage.locator('#scene-play')).toHaveAttribute('aria-pressed', 'false', {
      timeout: 15000,
    });
    await webPage.locator('canvas[data-recording-slot="0"]').tap();
    await expect(webPage.locator('[data-listen="0"]')).toHaveAttribute('aria-pressed', 'true');
    await expectRecordingPlayback(webPage, 0);
    await webPage.locator('[data-select="0"]').tap();
    await webPage.locator('#confirm').tap();
    await expect(webPage.locator('#feedback')).toBeVisible();
    await expectRecordingPlayback(webPage);
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

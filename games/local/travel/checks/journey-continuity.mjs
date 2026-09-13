import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Exercise native scroll without setting progress, transforms, or game state.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '@playwright/test');
const chrome = process.env.CHROME_PATH || (process.env.ProgramFiles && resolve(process.env.ProgramFiles, 'Google/Chrome/Application/chrome.exe'));
const url = process.env.BASE_URL || process.env.GAME_URL || 'http://localhost:4178';
const output = resolve(root, 'artifacts/journey-continuity');
const viewport = { width: 390, height: 844 };
const ids = ['distant', 'oldtown', 'pagodas', 'meadow', 'village', 'cafe', 'pier', ...Array.from({ length: 7 }, (_, i) => `near-${i}`)];
const planes = '.journey-world img[data-world-id][data-depth]';
const steps = 20;
const end = 5.58;
const report = { passed: false, startedAt: new Date().toISOString(), url, viewport, steps, checks: [], metrics: {}, alpha: [], forward: [], reverse: [], errors: [] };
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(chrome && existsSync(chrome) ? { executablePath: chrome } : {}) });

const centerDistance = (a, b) => Math.hypot((a.x + a.width / 2) - (b.x + b.width / 2), (a.y + a.height / 2) - (b.y + b.height / 2));
const rectDifference = (a, b) => Math.max(...['x', 'y', 'width', 'height'].map(key => Math.abs(a[key] - b[key])));
const cornerDistance = (a, b) => Math.max(...[0, 1].flatMap(x => [0, 1].map(y => Math.hypot(a.x + a.width * x - b.x - b.width * x, a.y + a.height * y - b.y - b.height * y))));
const intersects = rect => rect.x < viewport.width && rect.y < viewport.height && rect.x + rect.width > 0 && rect.y + rect.height > 0;
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

try {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('#travel-button').click();
  await page.locator('#journey-dialog[open]').waitFor();
  await page.waitForFunction(selector => {
    const images = [...document.querySelectorAll(selector)];
    return images.length === 14 && images.every(image => image.complete && image.naturalWidth > 0);
  }, planes, { timeout: 60000 });
  await page.locator('#journey-loading').waitFor({ state: 'hidden' });
  const references = await page.locator(planes).elementHandles();
  const initialIds = await page.locator(planes).evaluateAll(images => images.map(image => image.dataset.worldId));
  assert.deepEqual([...initialIds].sort(), [...ids].sort(), 'One shared distant plane, six landmarks and seven foreground pieces are present');
  const span = await page.locator('.journey-scroll').evaluate((element, end) => (element.scrollHeight - element.clientHeight) / end, end);
  assert(span > viewport.height / 2, 'A chapter has a meaningful native scroll distance');
  await page.mouse.move(viewport.width * .32, viewport.height * .53);

  report.alpha = await page.locator(`${planes}[data-depth="landmark"]`).evaluateAll(images => images.map(image => {
    const canvas = document.createElement('canvas');
    canvas.width = 96; canvas.height = 96;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, 96, 96);
    const data = ctx.getImageData(0, 0, 96, 96).data;
    let transparent = 0, solid = 0;
    for (let i = 3; i < data.length; i += 4) { if (data[i] < 250) transparent++; if (data[i] > 245) solid++; }
    return { id: image.dataset.worldId, transparentFraction: transparent / (96 * 96), solidFraction: solid / (96 * 96) };
  }));
  for (const alpha of report.alpha) {
    assert(alpha.transparentFraction > .05, `${alpha.id} is a transparent cutout, not a whole opaque scene`);
    assert(alpha.solidFraction > .03, `${alpha.id} contains visible landmark pixels`);
  }
  report.checks.push('Every landmark is a real transparent cutout with visible content');

  async function capture(direction, step, target) {
    const current = await page.locator('.journey-scroll').evaluate(element => element.scrollTop);
    if (Math.abs(target - current) > .1) await page.mouse.wheel(0, target - current);
    await page.waitForFunction(({ target, span }) => {
      const scroll = document.querySelector('.journey-scroll');
      const progress = Number(document.querySelector('#journey-dialog').dataset.progress);
      return Math.abs(scroll.scrollTop - target) <= 1 && Math.abs(progress - scroll.scrollTop / span) < .002;
    }, { target, span });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    for (let i = 0; i < references.length; i++) {
      assert(await references[i].evaluate((element, id) => element === document.querySelector(`.journey-world [data-world-id="${id}"]`), initialIds[i]), `${initialIds[i]} retains its DOM identity`);
    }
    const frame = await page.locator('#journey-dialog').evaluate((dialog, selector) => ({
      progress: Number(dialog.dataset.progress),
      scrollTop: dialog.querySelector('.journey-scroll').scrollTop,
      planes: [...dialog.querySelectorAll(selector)].map(image => {
        const style = getComputedStyle(image);
        const box = image.getBoundingClientRect();
        const matrix = new DOMMatrixReadOnly(style.transform);
        let opacity = 1, displayed = true;
        for (let element = image; element && element !== dialog.parentElement; element = element.parentElement) {
          const parentStyle = getComputedStyle(element);
          opacity *= Number(parentStyle.opacity);
          displayed &&= parentStyle.display !== 'none' && parentStyle.visibility === 'visible';
        }
        return { id: image.dataset.worldId, depth: image.dataset.depth, src: image.currentSrc, opacity, displayed,
          rect: { x: box.x, y: box.y, width: box.width, height: box.height },
          matrix: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f], filter: style.filter };
      }),
    }), planes);
    assert.equal(frame.planes.length, ids.length, 'The full world remains mounted');
    for (const plane of frame.planes) {
      assert(Math.abs(plane.opacity - 1) < .0001, `${plane.id} and its ancestors never crossfade at progress ${frame.progress}`);
      assert(plane.displayed, `${plane.id} remains in the same scene graph`);
      assert(!/opacity\(/.test(plane.filter), `${plane.id} does not hide its crossfade in a filter`);
      assert(plane.matrix.every(Number.isFinite), `${plane.id} has a finite projection`);
      if (report.forward.length) assert.equal(plane.src, report.forward[0].planes.find(item => item.id === plane.id).src, `${plane.id} does not replace its image source`);
    }
    const far = frame.planes.find(plane => plane.depth === 'far').rect;
    assert(far.x <= 2 && far.y <= 2 && far.x + far.width >= viewport.width - 2 && far.y + far.height >= viewport.height - 2, 'The same distant landscape covers the viewport throughout');
    frame.screenshot = `${direction}-${String(step).padStart(2, '0')}.png`;
    await page.screenshot({ path: resolve(output, frame.screenshot) });
    return frame;
  }

  for (let i = 0; i <= steps; i++) report.forward.push(await capture('forward', i, Math.round(span * i / steps)));
  for (let i = 1; i <= steps; i++) report.reverse.push(await capture('reverse', i, Math.round(span * (steps - i) / steps)));
  report.checks.push('Forty native scroll increments retain every node, image source, full opacity and shared backdrop');

  let maxStepPixels = 0;
  let maxReverseError = 0;
  const sequence = [...report.forward, ...report.reverse];
  for (let i = 1; i < sequence.length; i++) {
    const previous = sequence[i - 1];
    const current = sequence[i];
    const deltaProgress = Math.abs(current.progress - previous.progress);
    assert(deltaProgress > .04 && deltaProgress < .06, `Native input yields a small continuous progress step, got ${deltaProgress}`);
    for (const plane of current.planes) {
      const before = previous.planes.find(item => item.id === plane.id);
      const delta = cornerDistance(before.rect, plane.rect);
      if (intersects(before.rect) || intersects(plane.rect)) {
        maxStepPixels = Math.max(maxStepPixels, delta);
        const limit = Math.max(Math.hypot(viewport.width, viewport.height), before.rect.width, before.rect.height, plane.rect.width, plane.rect.height) * .23;
        assert(delta < limit, `${plane.id} jumps ${delta.toFixed(1)}px between adjacent 0.05 steps (limit ${limit.toFixed(1)}px)`);
        const scaleChange = Math.max(plane.rect.width / before.rect.width, before.rect.width / plane.rect.width);
        assert(scaleChange < 1.18, `${plane.id} changes scale abruptly (${scaleChange.toFixed(3)})`);
      }
    }
  }
  for (let i = 0; i < report.reverse.length; i++) {
    const current = report.reverse[i];
    const original = report.forward[steps - i - 1];
    assert(Math.abs(current.progress - original.progress) < .002, 'Reverse reaches the same progress samples');
    for (const plane of current.planes) {
      const error = rectDifference(plane.rect, original.planes.find(item => item.id === plane.id).rect);
      maxReverseError = Math.max(maxReverseError, error);
      assert(error <= 2, `${plane.id} fails to return to its prior projection (${error.toFixed(2)}px)`);
    }
  }
  const first = report.forward[0];
  const last = report.forward.at(-1);
  const distances = depth => first.planes.filter(plane => plane.depth === depth).map(plane => centerDistance(plane.rect, last.planes.find(item => item.id === plane.id).rect));
  const farMotion = median(distances('far'));
  const landmarkMotion = median(distances('landmark'));
  const nearMotion = median(distances('near'));
  assert(landmarkMotion > viewport.width * .25, 'The camera makes meaningful spatial progress past the landmarks');
  assert(farMotion < landmarkMotion * .1, `Shared background remains nearly stationary (${farMotion.toFixed(2)}px vs ${landmarkMotion.toFixed(2)}px)`);
  assert(nearMotion > landmarkMotion * 1.15, `Foreground passes faster than landmarks (${nearMotion.toFixed(2)}px vs ${landmarkMotion.toFixed(2)}px)`);
  report.metrics = { span, farMotion, landmarkMotion, nearMotion, farToLandmark: farMotion / landmarkMotion, nearToLandmark: nearMotion / landmarkMotion, maxStepPixels, maxReverseError };
  report.checks.push('Distant landscape stays nearly still; landmarks move; nearer foliage moves faster');
  report.checks.push('Every adjacent projection is bounded and every reverse sample returns within two pixels');
  await page.locator('#journey-close').click();
  await page.locator('#journey-dialog[open]').waitFor({ state: 'hidden' });
  assert.deepEqual(report.errors, [], 'No uncaught browser errors');
  report.passed = true;
  console.log(`Continuity passed: far ${farMotion.toFixed(1)}px, landmarks ${landmarkMotion.toFixed(1)}px, foreground ${nearMotion.toFixed(1)}px; reverse error ${maxReverseError.toFixed(3)}px.`);
  console.log(`41 screenshots and measurements: ${output}`);
  await context.close();
} catch (error) {
  report.errors.push(error.stack || String(error));
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}

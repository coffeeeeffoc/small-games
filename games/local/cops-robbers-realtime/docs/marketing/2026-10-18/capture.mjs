import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const output = fileURLToPath(new URL('./', import.meta.url));
await mkdir(`${output}/source`, { recursive: true });
const browser = await chromium.launch({ headless: true });
const base = 'http://127.0.0.1:4190/';
const options = { viewport: { width: 432, height: 768 }, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true };
const errors = [], checks = [], segments = [];
let context;
const watch = page => page.on('pageerror', error => errors.push(error.message));
const state = page => page.evaluate(async () => (await import('./src/main.js')).getSnapshot());
const wait = (page, ms) => page.waitForTimeout(ms);
const shot = (page, name) => page.screenshot({ path: `${output}/${name}.png`, animations: 'disabled' });
async function order(page, actor, point) {
  const current = await state(page);
  const from = await page.evaluate(async point => (await import('./src/main.js')).worldToScreen(point), current.cops[actor]);
  await page.touchscreen.tap(from.x, from.y);
  assert.equal((await state(page)).selected, actor, 'actual actor touch selects police');
  const to = await page.evaluate(async point => (await import('./src/main.js')).worldToScreen(point), point);
  await page.touchscreen.tap(to.x, to.y);
  assert.ok((await state(page)).cops[actor].destination, 'road touch issues a movement order');
}
try {
  context = await browser.newContext(options);
  const page = await context.newPage(); watch(page);
  await page.goto(base);
  await page.locator('#levels-button').waitFor({ state: 'visible' });
  await wait(page, 2200);
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.title(), '别跑！街区围捕 · 警察与小偷');
  await shot(page, 'screenshot-01-home-1080x1920');
  await page.locator('#levels-button').tap();
  await page.locator('#start-button').tap();
  await page.waitForFunction(async () => (await import('./src/main.js')).getSnapshot().phase === 'playing');
  await wait(page, 1000);
  const initial = await state(page);
  const destination = initial.nodes.reduce((farthest, point) =>
    Math.hypot(point.x - initial.cops[0].x, point.y - initial.cops[0].y) >
    Math.hypot(farthest.x - initial.cops[0].x, farthest.y - initial.cops[0].y) ? point : farthest);
  await order(page, 0, destination);
  await wait(page, 450);
  await shot(page, 'screenshot-02-gameplay-1080x1920');
  checks.push('Fresh-save campaign level 1, actual on-field police selection and movement, raw portrait screenshot.');
  await context.close(); context = null;

  context = await browser.newContext({ ...options,
    recordVideo: { dir: `${output}/source`, size: { width: 432, height: 768 } },
  });
  const recording = await context.newPage(); watch(recording);
  const start = performance.now();
  const seconds = () => Number(((performance.now() - start) / 1000).toFixed(3));
  await recording.goto(base);
  await wait(recording, 1800);
  await recording.locator('#levels-button').tap();
  await recording.locator('[data-choice-for="mode-select"][data-value="quick"]').tap();
  const solutions = [
    [{ actor: 0, point: { x: 500, y: 300 } }, { actor: 1, point: { x: 500, y: 300 } }],
    [0, 1, 2].map(actor => ({ actor, point: { x: 500, y: 300 } })),
    [0, 1, 2, 3].map(actor => ({ actor, point: { x: 500, y: actor < 2 ? 180 : 420 } })),
  ];
  for (let level = 1; level <= 3; level++) {
    await recording.locator('#start-button').tap();
    await recording.waitForFunction(async () => (await import('./src/main.js')).getSnapshot().phase === 'playing');
    const begin = seconds();
    await wait(recording, 900);
    assert.equal((await state(recording)).level, level);
    for (const command of solutions[level - 1]) {
      await order(recording, command.actor, command.point);
      await wait(recording, 350);
    }
    await recording.locator('#win-dialog').waitFor({ state: 'visible', timeout: 15000 });
    await wait(recording, 1100);
    assert.equal((await state(recording)).phase, 'won');
    if (level === 3) await shot(recording, 'screenshot-03-victory-1080x1920');
    await wait(recording, 1000);
    segments.push({ level, begin, end: seconds(), phase: (await state(recording)).phase });
    checks.push(`Quick trial ${level}: real actor/road taps, normal-speed engine, victory verified.`);
    if (level < 3) {
      await recording.locator('#next-button').tap();
      await wait(recording, 600);
    }
  }
  assert.deepEqual(errors, []);
  await context.close(); context = null;
  const video = await recording.video().path();
  const evidence = { capturedAt: new Date().toISOString(), browser: browser.version(), base,
    source: 'Current working-tree game source, local offline H5 entry; no game/UI code modified.',
    viewport: options.viewport, deviceScaleFactor: 2.5,
    screenshots: '1080x1920, uniform 9:16, unaltered real browser captures',
    input: 'Real touchscreen taps; no save injection, state injection or simulated clock.',
    video, segments, checks, errors };
  await writeFile(`${output}/source/capture-evidence.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  if (context) await context.close();
  await browser.close();
}

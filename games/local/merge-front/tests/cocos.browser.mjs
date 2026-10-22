import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, devices, expect } from '@playwright/test';
import { createMatch, command, runAI, step, snapshot } from '../assets/scripts/core/engine.ts';
import { createProgress } from '../assets/scripts/core/progress.ts';
const url = process.env.GAME_URL || 'http://localhost:4197';
const output = new URL('../reports/browser/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || process.env.CHROMIUM_PATH,
  headless: true,
});
const evidence = [],
  errors = [];
let active;
async function open(viewport = { width: 844, height: 390 }, fixture, fixtureArg) {
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    viewport,
    deviceScaleFactor: 1,
    recordVideo: process.argv.includes('--publishing')
      ? {
          dir: new URL('videos/', output).pathname.replace(/^\/(?:([A-Z]):)/, '$1:'),
          size: { width: 1152, height: 540 },
        }
      : undefined,
  });
  const page = await context.newPage();
  active = page;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  if (fixture) await page.addInitScript(fixture, fixtureArg);
  await page.goto(url);
  await expect.poll(() => state(page).then((s) => s?.ready), { timeout: 60000 }).toBe(true);
  assert.equal((await state(page)).engine, 'Cocos Creator 3.8.8');
  return { context, page };
}
const state = (page) => page.evaluate(() => globalThis.__mergeFront?.snapshot());
async function point(page, id) {
  const s = await state(page);
  const c =
    typeof id === 'object'
      ? { ...id, w: 0, h: 0 }
      : s.controls.find((c) => c.id === id && !c.disabled);
  assert(c, 'Missing enabled control ' + id + ' on ' + s.screen);
  const box = await page.locator('#GameCanvas').boundingBox();
  const rotated = await page.evaluate(() =>
    getComputedStyle(document.getElementById('GameDiv')).transform.startsWith('matrix(0, 1'),
  );
  const width = rotated ? box.height : box.width,
    height = rotated ? box.width : box.height;
  const scale = Math.min(width / s.viewport.width, height / s.viewport.height);
  const x = (width - s.viewport.width * scale) / 2 + (c.x + c.w / 2) * scale;
  const y = (height - s.viewport.height * scale) / 2 + (c.y + c.h / 2) * scale;
  return rotated ? { x: box.x + box.width - y, y: box.y + x } : { x: box.x + x, y: box.y + y };
}
async function tap(page, id) {
  const p = await point(page, id),
    before = await state(page);
  await page.touchscreen.tap(p.x, p.y);
  await expect
    .poll(() =>
      state(page).then(
        (s) =>
          s.inputCount > before.inputCount ||
          (before.screen === 'playing' && s.screen === 'result'),
      ),
    )
    .toBe(true);
}
async function drag(page, source, target, cancel = false) {
  const session = await page.context().newCDPSession(page);
  try {
    const a = await point(page, source),
      b = await point(page, target);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...a, id: 1 }],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ ...b, id: 1 }],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: cancel ? 'touchCancel' : 'touchEnd',
      touchPoints: [],
    });
  } finally {
    await session.detach();
  }
}
async function screen(page, name) {
  await expect.poll(() => state(page).then((s) => s.screen)).toBe(name);
}
async function shot(page, name) {
  await page.screenshot({
    path: new URL(name + '.png', output).pathname.replace(/^\/(?:([A-Z]):)/, '$1:'),
  });
}

const world = (s, x, y) => ({
  x: s.board.x + (x / 1000) * s.board.w,
  y: s.board.y + (y / 360) * s.board.h,
});
const cards = (s) => s.controls.filter((c) => c.id.startsWith('card:'));
const fixture = (m) => ({ m: snapshot(m), p: createProgress() });
function loadFixture(data) {
  if (!localStorage.getItem('merge-front:progress:v2')) {
    localStorage.setItem('merge-front:match:v3', JSON.stringify(data.m));
    localStorage.setItem('merge-front:progress:v2', JSON.stringify(data.p));
  }
}
try {
  const { context, page } = await open(
    { width: 1152, height: 540 },
    loadFixture,
    fixture(createMatch('level-01', 1)),
  );
  await shot(page, 'home');
  await tap(page, 'start');
  await screen(page, 'playing');
  let s = await state(page);
  const first = cards(s)[0].id;
  await tap(page, first);
  assert.equal((await state(page)).match.sides[0].formation.length, 0, 'tap does not deploy');
  await drag(page, first, world(s, 250, 60), true);
  assert.equal((await state(page)).match.sides[0].formation.length, 0, 'cancel does not consume');
  await drag(page, first, world(s, 750, 60));
  assert.equal((await state(page)).match.sides[0].formation.length, 0, 'enemy zone rejects drop');
  await drag(page, first, world(s, 390, 60));
  s = await state(page);
  const deployed = s.match.sides[0].formation[0];
  assert.equal(deployed.level, 1);
  await drag(page, cards(s).find((c) => c.label.includes('哪吒')).id, world(s, 390, 300));
  s = await state(page);
  assert.equal(s.match.sides[0].formation.length, 2);
  await drag(page, 'unit:' + s.match.sides[0].formation[1].id, 'unit:' + deployed.id);
  s = await state(page);
  assert.equal(s.match.sides[0].formation.length, 1);
  assert.equal(s.match.sides[0].formation[0].level, 2);
  await drag(page, 'unit:' + deployed.id, { x: 600, y: 490 });
  s = await state(page);
  assert.equal(s.match.sides[0].formation.length, 0);
  await drag(page, cards(s).find((c) => c.label.includes('哪吒')).id, world(s, 390, 60));
  s = await state(page);
  await drag(page, cards(s).find((c) => c.label.includes('离火铳')).id, world(s, 200, 300));
  s = await state(page);
  assert.equal(cards(s).length, 0, 'empty hand has no fixed placeholder cards');
  for (const kind of ['hero', 'hero', 'weapon', 'hero']) await tap(page, 'draw:' + kind);
  s = await state(page);
  const fragments = s.controls.filter((c) => c.id.startsWith('part:'));
  if (fragments.length) {
    const before = JSON.stringify(s.match.sides[0]);
    await drag(page, fragments[0].id, world(s, 200, 180));
    assert.equal(JSON.stringify((await state(page)).match.sides[0]), before);
  }
  await page.waitForTimeout(3100);
  await shot(page, 'planning-hand');
  // Place every complete card via touch, preserving separate units until the shared cap.
  for (let n = 0; n < 30; n++) {
    s = await state(page);
    const c = cards(s)[0];
    if (!c) break;
    const side = s.match.sides[0],
      id = Number(c.id.slice(5)),
      card = side.hand.find((c) => c.id === id);
    if (side.formation.length >= 6) {
      const target = side.formation.find((c) => c.key === card.key);
      if (!target) break;
      await drag(page, c.id, 'unit:' + target.id);
    } else {
      const pos = [
        { x: 390, y: 60 },
        { x: 390, y: 180 },
        { x: 390, y: 300 },
        { x: 200, y: 60 },
        { x: 200, y: 180 },
        { x: 200, y: 300 },
      ].find((p) => !side.formation.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 46));
      await drag(page, c.id, world(s, pos.x, pos.y));
    }
  }
  s = await state(page);
  assert.ok(s.match.sides[0].formation.length >= 3);
  await shot(page, 'planning');
  await tap(page, 'pause');
  await shot(page, 'pause');
  assert.deepEqual(
    (await state(page)).controls.map((c) => c.id),
    ['resume', 'settings', 'retry', 'home'],
  );
  await tap(page, 'retry');
  assert.ok((await state(page)).controls.some((c) => c.id === 'confirm-retry'));
  await tap(page, 'cancel-retry');
  await tap(page, 'resume');
  await tap(page, 'start-round');
  s = await state(page);
  assert.equal(s.match.roundStage, 'battle');
  assert.ok(!s.controls.some((c) => c.id.startsWith('draw:') || c.id.startsWith('card:')));
  await page.waitForTimeout(2000);
  await shot(page, 'battle');
  await tap(page, 'pause');
  const frozen = (await state(page)).match;
  await page.waitForTimeout(300);
  assert.deepEqual((await state(page)).match, frozen);
  await page.reload();
  await expect.poll(() => state(page).then((s) => s?.ready), { timeout: 60000 }).toBe(true);
  assert.equal((await state(page)).match.tick, frozen.tick);
  await tap(page, 'start');
  await expect.poll(() => state(page).then((s) => s.match.roundNumber), { timeout: 35000 }).toBe(2);
  assert.equal((await state(page)).match.roundStage, 'planning');
  await shot(page, 'next-round');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await screen(page, 'paused');
  await tap(page, 'resume');
  evidence.push({
    case: 'touch-assembly-deploy-split-merge-recall-lock-pause-reload-next-round',
    result: 'passed',
  });
  await tap(page, 'pause');
  await tap(page, 'home');
  await context.close();

  for (const viewport of [
    { width: 844, height: 390 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 568, height: 320 },
  ]) {
    const { context, page } = await open(viewport);
    await tap(page, 'start');
    await tap(page, 'begin');
    const s = await state(page);
    await drag(page, cards(s)[0].id, world(s, 250, 180));
    assert.equal((await state(page)).match.sides[0].formation.length, 1);
    await tap(page, 'pause');
    await page.setViewportSize({ width: viewport.height, height: viewport.width });
    await page.waitForTimeout(250);
    await tap(page, 'resume');
    await tap(page, 'pause');
    await shot(page, 'viewport-' + viewport.width + 'x' + viewport.height);
    await tap(page, 'settings');
    if (viewport.width === 844) {
      await tap(page, 'fullscreen');
      await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
      await tap(page, 'fullscreen');
      await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
      await page.evaluate(() => {
        Element.prototype.requestFullscreen = () => Promise.reject(new Error('Fixture denial'));
      });
      await tap(page, 'fullscreen');
      evidence.push({ case: 'fullscreen-enter-exit-denial', result: 'passed' });
    }
    await tap(page, 'back');
    await tap(page, 'home');
    evidence.push({ case: 'orientation-touch', viewport, result: 'passed' });
    await context.close();
  }
  // A terminal fixture is derived entirely through legal commands and simulation.
  for (const seed of [1, 8]) {
    const m = createMatch('level-01', seed);
    let before;
    while (m.phase === 'running') {
      for (let n = 0; n < 128 && runAI(m, 0)?.ok; n++);
      command(m, 0, { type: 'startRound' });
      while (m.phase === 'running' && m.roundStage !== 'planning') {
        before = snapshot(m);
        step(m);
      }
    }
    const { context, page } = await open(undefined, loadFixture, fixture(before));
    await tap(page, 'start');
    await screen(page, 'result');
    assert.equal((await state(page)).match.phase, m.phase);
    await shot(page, 'result-' + m.phase);
    await context.close();
  }
  for (const status of ['completed', 'dismissed', 'unavailable', 'failed']) {
    const { context, page } = await open(undefined, () => {
      // Explicit SDK fixture exercises the shipped common provider, not a production mock.
      globalThis.SmallGamesPublishingConfig = {
        adsEnabled: true,
        adMode: 'host',
        platform: 'taptap-h5',
        adUnitId: 'browser-fixture',
      };
      globalThis.fixtureAd = { close: null, error: null };
      globalThis.tap = {
        createRewardedVideoAd: () => ({
          onLoad(fn) {
            this.loadCallback = fn;
          },
          offLoad() {},
          onClose(fn) {
            globalThis.fixtureAd.close = fn;
          },
          offClose() {},
          onError(fn) {
            globalThis.fixtureAd.error = fn;
          },
          offError() {},
          load() {
            this.loadCallback?.();
            return Promise.resolve();
          },
          show() {
            return Promise.resolve();
          },
          destroy() {},
        }),
      };
    });
    await tap(page, 'start');
    await tap(page, 'begin');
    await tap(page, 'pause');
    await tap(page, 'settings');
    if (status === 'unavailable')
      await page.evaluate(() => {
        delete globalThis.tap;
      });
    await tap(page, 'reward');
    if (status === 'completed' || status === 'dismissed') {
      await expect
        .poll(() => page.evaluate(() => typeof globalThis.fixtureAd.close))
        .toBe('function');
      await page.evaluate(
        (ended) => globalThis.fixtureAd.close({ isEnded: ended }),
        status === 'completed',
      );
    } else if (status === 'failed') {
      await expect
        .poll(() => page.evaluate(() => typeof globalThis.fixtureAd.error))
        .toBe('function');
      await page.evaluate(() => globalThis.fixtureAd.error({ errCode: 1 }));
    }
    await expect.poll(() => state(page).then((s) => s.rewardPending)).toBe(false);
    const s = await state(page);
    assert.equal(s.match.sides[0].coins, status === 'completed' ? 150 : 120);
    assert(s.match.paused);
    await tap(page, 'back');
    await tap(page, 'resume');
    await tap(page, 'pause');
    if (status === 'completed')
      assert(!(await state(page)).controls.some((c) => c.id === 'reward'));
    evidence.push({ case: 'reward-sdk-fixture', status, result: 'passed' });
    await context.close();
  }

  assert.deepEqual(errors, []);
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  if (active && !active.isClosed()) await shot(active, 'failure').catch(() => {});
  throw error;
} finally {
  await writeFile(
    new URL('report.json', output),
    JSON.stringify(
      {
        evidence,
        errors,
        environment: 'Chromium phone emulation; no physical device or real ad fill',
      },
      null,
      2,
    ),
  );
  await browser.close();
}

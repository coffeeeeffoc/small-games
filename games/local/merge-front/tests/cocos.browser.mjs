import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, devices, expect } from '@playwright/test';
import { CATALOG } from '../assets/scripts/core/content.ts';
import { createMatch, step, snapshot } from '../assets/scripts/core/engine.ts';
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
  const s = await state(page),
    c = s.controls.find((c) => c.id === id && !c.disabled);
  assert(c, `Missing enabled control ${id} on ${s.screen}`);
  const box = await page.locator('#GameCanvas').boundingBox();
  const rotated = await page.evaluate(() =>
    getComputedStyle(document.getElementById('GameDiv')).transform.startsWith('matrix(0, 1'),
  );
  const width = rotated ? box.height : box.width,
    height = rotated ? box.width : box.height;
  const scale = Math.min(width / 960, height / 540);
  const x = (width - 960 * scale) / 2 + (c.x + c.w / 2) * scale;
  const y = (height - 540 * scale) / 2 + (c.y + c.h / 2) * scale;
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
try {
  if (!process.argv.includes('--layout') && !process.argv.includes('--publishing')) {
    const { context, page } = await open();
    await shot(page, 'home');
    await tap(page, 'settings');
    await tap(page, 'fullscreen');
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await tap(page, 'fullscreen');
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    await page.evaluate(() => {
      Element.prototype.requestFullscreen = () => Promise.reject(new Error('Fixture denial'));
    });
    await tap(page, 'fullscreen');
    await tap(page, 'back');
    await tap(page, 'levels');
    await screen(page, 'levels');
    await shot(page, 'levels');
    assert.equal(
      (await state(page)).controls.filter((c) => c.id.startsWith('level:') && !c.disabled).length,
      1,
    );
    await tap(page, 'level:level-01');
    await shot(page, 'prepare');
    const preparedDeck = (await state(page)).deck;
    await tap(page, 'codex');
    await tap(page, 'back');
    await screen(page, 'prepare');
    assert.deepEqual((await state(page)).deck, preparedDeck);
    await tap(page, 'begin');
    await screen(page, 'playing');
    await tap(page, 'draw:hero');
    const bag = (await state(page)).match.sides[0].bag;
    await drag(page, 'part:nezha:0', 'slot:1');
    assert.deepEqual(
      (await state(page)).match.sides[0].bag,
      bag,
      'Tutorial rejects wrong destination',
    );
    await drag(page, 'part:nezha:0', 'slot:0', true);
    assert.deepEqual(
      (await state(page)).match.sides[0].bag,
      bag,
      'Cancelled gesture preserves fragments',
    );
    await drag(page, 'part:nezha:0', 'slot:0');
    await drag(page, 'part:nezha:1', 'slot:0');
    await expect
      .poll(() => state(page).then((s) => s.match.tutorialStep), { timeout: 20000 })
      .toBe(3);
    await tap(page, 'fill');
    await expect.poll(() => state(page).then((s) => s.match.tutorialStep)).toBe(4);
    await tap(page, 'fill');
    await expect.poll(() => state(page).then((s) => s.match.tutorialStep)).toBe(6);
    await shot(page, 'battle');
    await tap(page, 'pause');
    const frozen = (await state(page)).match.tick;
    await shot(page, 'pause');
    assert(
      !(await state(page)).controls.some((c) => c.id === 'reward'),
      'No configured ID means no reward button',
    );
    await page.waitForTimeout(250);
    assert.equal((await state(page)).match.tick, frozen);
    await page.reload();
    await expect.poll(() => state(page).then((s) => s?.ready), { timeout: 60000 }).toBe(true);
    assert.equal((await state(page)).match.tick, frozen);
    await tap(page, 'start');
    // All actions go through actual touch input. Use the default two-recipe deck.
    const started = Date.now();
    while ((await state(page)).screen === 'playing' && Date.now() - started < 160000) {
      try {
        let s = await state(page),
          side = s.match.sides[0];
        for (const i of [0, 3, 1, 2, 4]) {
          s = await state(page);
          if (s.screen !== 'playing') break;
          side = s.match.sides[0];
          const slot = side.slots[i],
            spec = CATALOG.find((v) => v.id === slot.key);
          if (spec.parts.some((_, j) => !slot.parts[j] && side.bag[`${slot.key}:${j}`])) {
            await tap(page, 'slot:' + i);
            await tap(page, 'fill');
          }
        }
        s = await state(page);
        if (s.screen !== 'playing') break;
        if (s.match.sides[0].coins >= 30)
          await tap(page, s.match.tick % 80 < 40 ? 'draw:hero' : 'draw:weapon');
        await page.waitForTimeout(180);
      } catch (error) {
        if ((await state(page)).screen !== 'result') throw error;
      }
    }
    const result = await state(page);
    assert.equal(result.match.phase, 'won', 'Real touch strategy wins without ads');
    assert.equal(result.progress.unlockedLevel, 2);
    assert.equal(result.match.assisted, false);
    await shot(page, 'victory');
    await tap(page, 'next');
    assert.equal((await state(page)).levelId, 'level-02');
    await tap(page, 'levels');
    await tap(page, 'home');
    await tap(page, 'codex');
    await shot(page, 'codex');
    await tap(page, 'detail:nezha');
    await tap(page, 'demo');
    await shot(page, 'detail');
    await tap(page, 'codex-back');
    await tap(page, 'back');
    await tap(page, 'help');
    await shot(page, 'help');
    await tap(page, 'tutorial');
    await tap(page, 'pause');
    await tap(page, 'home');
    await tap(page, 'levels');
    assert.equal(
      (await state(page)).controls.filter((c) => c.id.startsWith('level:') && !c.disabled).length,
      2,
      'Tutorial replay cannot unlock practice levels',
    );
    await tap(page, 'level:level-02');
    await tap(page, 'begin');
    assert.equal((await state(page)).match.practice, false);
    evidence.push({
      case: 'touch-campaign',
      result: 'passed',
      winSeconds: result.match.tick / 20,
      unlocked: 2,
    });
    await context.close();
    // Reach a real near-loss state through simulation, then exercise its restored UI.
    const losing = createMatch('level-01', 7182, undefined, { tutorial: false });
    let beforeLoss;
    for (let i = 0; i < 12000 && losing.phase === 'running'; i++) {
      beforeLoss = snapshot(losing);
      step(losing);
    }
    assert.equal(losing.phase, 'lost');
    const lossProgress = createProgress();
    lossProgress.tutorialStep = 6;
    const lossSession = await open(
      undefined,
      (fixture) => {
        localStorage.setItem('merge-front:progress:v2', JSON.stringify(fixture.progress));
        localStorage.setItem('merge-front:match:v2', JSON.stringify(fixture.match));
      },
      { progress: lossProgress, match: beforeLoss },
    );
    await tap(lossSession.page, 'start');
    await screen(lossSession.page, 'result');
    assert.equal((await state(lossSession.page)).progress.unlockedLevel, 1);
    await shot(lossSession.page, 'defeat');
    await tap(lossSession.page, 'retry');
    await screen(lossSession.page, 'playing');
    assert.equal((await state(lossSession.page)).match.phase, 'running');
    evidence.push({
      case: 'restore-defeat-retry',
      result: 'passed',
      fixture: 'legal simulation before final hit',
    });
    evidence.push({ case: 'fullscreen-enter-exit-denial', result: 'passed' });
    await lossSession.context.close();
  }
  if (!process.argv.includes('--publishing'))
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 320, height: 568 },
      { width: 568, height: 320 },
    ]) {
      const { context, page } = await open(viewport);
      await tap(page, 'start');
      await tap(page, 'begin');
      await tap(page, 'draw:hero');
      await tap(page, 'fill');
      assert.equal((await state(page)).match.sides[0].slots[0].level, 1);
      await tap(page, 'pause');
      const tick = (await state(page)).match.tick;
      await page.setViewportSize({ width: viewport.height, height: viewport.width });
      await page.waitForTimeout(250);
      await tap(page, 'resume');
      await tap(page, 'pause');
      assert((await state(page)).match.tick >= tick);
      await shot(page, `viewport-${viewport.width}`);
      evidence.push({ case: 'orientation-touch', viewport, result: 'passed' });
      await context.close();
    }
  if (!process.argv.includes('--layout'))
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
      await tap(page, 'skip');
      await tap(page, 'pause');
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
      assert.equal(s.match.sides[0].buffTicks, status === 'completed' ? 600 : 0);
      assert(s.match.paused);
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

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, devices, expect } from '@playwright/test';
import {
  createMatch,
  command,
  runAI,
  step,
  snapshot,
  crystalStyle,
} from '../assets/scripts/core/engine.ts';
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
async function saveVideo(page, name) {
  if (page.video())
    await page.video().saveAs(fileURLToPath(new URL('videos/' + name + '.webm', output)));
}
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
    await page.waitForTimeout(100);
    await session.send('Input.dispatchTouchEvent', {
      type: cancel ? 'touchCancel' : 'touchEnd',
      touchPoints: [],
    });
    await page.waitForTimeout(100);
  } finally {
    await session.detach();
  }
}
async function hold(page, id, { cancel = false, screenshot, during } = {}) {
  const session = await page.context().newCDPSession(page),
    p = await point(page, id);
  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...p, id: 1 }],
    });
    await expect.poll(() => state(page).then((s) => !!s.hoverInfo)).toBe(true);
    if (screenshot) await shot(page, screenshot);
    if (during) await during();
    await session.send('Input.dispatchTouchEvent', {
      type: cancel ? 'touchCancel' : 'touchEnd',
      touchPoints: [],
    });
    await expect.poll(() => state(page).then((s) => s.hoverInfo)).toBe(null);
  } finally {
    await session.detach();
  }
}
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
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
    localStorage.setItem('merge-front:match:v4', JSON.stringify(data.m));
    localStorage.setItem('merge-front:progress:v2', JSON.stringify(data.p));
  }
}
try {
  const { context, page } = await open(
    { width: 1152, height: 540 },
    loadFixture,
    fixture(createMatch('level-01', 18)),
  );
  await shot(page, 'home');
  await tap(page, 'start');
  await screen(page, 'playing');
  let s = await state(page),
    first = cards(s)[0].id;
  await tap(page, first);
  assert.equal((await state(page)).match.sides[0].formation.length, 0);
  await hold(page, first, { screenshot: 'long-press-hand' });
  await drag(page, first, world(s, 390, 70), true);
  assert.equal((await state(page)).match.sides[0].formation.length, 0);
  await drag(page, first, world(s, 750, 70));
  assert.equal((await state(page)).match.sides[0].formation.length, 0);
  await drag(page, first, world(s, 390, 70));
  s = await state(page);
  const deployed = s.match.sides[0].formation[0];
  await drag(page, cards(s)[0].id, world(s, 200, 290));
  s = await state(page);
  assert.equal(s.match.sides[0].formation.length, 2);
  await drag(page, 'unit:' + deployed.id, world(s, 302, 30));
  await tap(page, 'trait:flame');
  assert.equal(
    (await state(page)).detailTitle,
    '烈焰',
    'HUD must win over overlapping unit hot area',
  );
  await tap(page, 'info-close');
  await drag(page, 'unit:' + deployed.id, world(s, 390, 70));
  const handDrop = center(s.dropZones.hand),
    sellDrop = center(s.dropZones.sell);
  const fort = s.match.sides[0].shop.find((o) => o.key === 'fortify');
  await drag(page, 'offer:' + fort.id, handDrop, true);
  assert.equal((await state(page)).match.sides[0].coins, 6);
  const beforeInspect = JSON.stringify((await state(page)).match);
  await hold(page, 'offer:' + fort.id, { screenshot: 'long-press-shop' });
  assert.equal(JSON.stringify((await state(page)).match), beforeInspect, 'long press never buys');
  const survivor = (await state(page)).controls.find(
    (c) => c.id === 'offer:' + s.match.sides[0].shop[1].id,
  );
  await tap(page, 'offer:' + fort.id);
  assert.equal(
    (await state(page)).controls.find((c) => c.id === survivor.id).x,
    survivor.x,
    'remaining offer keeps its position',
  );
  s = await state(page);
  assert.equal(s.match.sides[0].coins, 4);
  assert.equal(s.match.sides[0].shop.length, 2);
  await hold(page, 'spell:' + s.match.sides[0].spells[0].id);
  await drag(page, 'spell:' + s.match.sides[0].spells[0].id, world(s, 390, 70));
  s = await state(page);
  assert.equal(s.match.sides[0].formation[0].bonusHp, 35);
  const part = s.match.sides[0].shop.find((o) => o.kind === 'part');
  await drag(page, 'offer:' + part.id, handDrop);
  s = await state(page);
  const before = JSON.stringify(s.match.sides[0]);
  await hold(page, s.controls.find((c) => c.id.startsWith('part:nezha:0:')).id);
  await drag(page, s.controls.find((c) => c.id.startsWith('part:nezha:0:')).id, world(s, 300, 180));
  assert.equal(JSON.stringify((await state(page)).match.sides[0]), before);
  await tap(page, 'refresh');
  s = await state(page);
  assert.equal(s.match.sides[0].coins, 2);
  assert.equal(s.match.sides[0].shop[0].part, 'nezha:1');
  await tap(page, 'offer:' + s.match.sides[0].shop[0].id);
  s = await state(page);
  assert.equal(s.match.sides[0].hand[0].key, 'nezha');
  assert.deepEqual(s.match.sides[0].bag, {});
  await drag(page, cards(s)[0].id, world(s, 390, 290));
  s = await state(page);
  assert.equal(s.match.sides[0].formation.length, 3);
  // Hold a real touch drag and inspect the actual visible nodes, then cancel.
  const session = await page.context().newCDPSession(page),
    a = await point(page, 'unit:' + deployed.id),
    b = await point(page, world(s, 280, 180));
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...a, id: 1 }],
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ ...b, id: 1 }],
  });
  await page.waitForTimeout(120);
  assert(
    !(await state(page)).visibleTroops.includes('image:plan:' + deployed.id),
    'drag source is absent',
  );
  await shot(page, 'drag-source-hidden');
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await session.detach();
  await page.waitForTimeout(100);
  assert(
    (await state(page)).visibleTroops.includes('image:plan:' + deployed.id),
    'cancel restores source',
  );
  const second = s.match.sides[0].formation.find((c) => c.key === 'nezha' && c.id !== deployed.id);
  await drag(page, 'unit:' + deployed.id, world(s, 300, 150));
  await drag(
    page,
    'unit:' + s.match.sides[0].formation.find((c) => c.key === 'fire').id,
    world(s, 300, 200),
  );
  await drag(page, 'unit:' + second.id, world(s, 300, 150));
  s = await state(page);
  assert.equal(s.match.sides[0].formation.find((c) => c.id === deployed.id).level, 2);
  const rearHead = world(s, 300, 150);
  rearHead.y -= 55;
  await drag(page, rearHead, world(s, 390, 70));
  await drag(page, 'unit:' + deployed.id, handDrop);
  s = await state(page);
  assert.equal(s.match.sides[0].hand[0].bonusHp, 35);
  await drag(page, cards(s)[0].id, world(s, 390, 70));
  s = await state(page);
  const fire = s.match.sides[0].formation.find((c) => c.key === 'fire'),
    coins = s.match.sides[0].coins;
  await drag(page, 'unit:' + fire.id, sellDrop);
  s = await state(page);
  assert.equal(s.match.sides[0].coins, coins);
  assert.equal(s.match.sides[0].spells[0].key, 'sharpen');
  await hold(page, 'spell:' + s.match.sides[0].spells[0].id);
  await drag(page, 'spell:' + s.match.sides[0].spells[0].id, world(s, 390, 70));
  s = await state(page);
  assert.equal(s.match.sides[0].formation[0].bonusDamage, 5);
  assert.equal(cards(s).length, 0, 'empty hand has no slot controls');
  const expensive = s.match.sides[0].shop.find((o) => o.cost > s.match.sides[0].coins),
    snapshotBefore = JSON.stringify(s.match);
  await hold(page, 'offer:' + expensive.id, { cancel: true });
  await tap(page, 'offer:' + expensive.id);
  assert.equal(
    JSON.stringify((await state(page)).match),
    snapshotBefore,
    'unaffordable buy is atomic',
  );
  await page.waitForTimeout(3100);
  await shot(page, 'planning');
  await hold(page, 'unit:' + deployed.id, { screenshot: 'long-press-own' });
  await hold(page, s.controls.find((c) => c.id.startsWith('enemy:')).id, {
    screenshot: 'long-press-enemy',
  });
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
  assert.ok(!s.controls.some((c) => c.id.startsWith('offer:') || c.id.startsWith('card:')));
  const live = (await state(page)).controls.find((c) => c.id.startsWith('troop:'));
  const tickBeforeHold = (await state(page)).match.tick;
  await hold(page, live.id, { screenshot: 'long-press-battle' });
  assert((await state(page)).match.tick > tickBeforeHold, 'inspection keeps combat running');
  await page.waitForTimeout(1200);
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
    case: 'touch-shop-buy-refresh-pair-cast-sell-deploy-merge-recall-hidden-source-cancel-lock-pause-reload',
    result: 'passed',
  });
  await tap(page, 'pause');
  await tap(page, 'home');
  await context.close();
  await saveVideo(page, 'shop-flow');

  const showcase = createMatch('level-01', 37, ['juling', 'fire']);
  for (let round = 0; round < 2; round++) {
    for (let n = 0; n < 128 && runAI(showcase, 0)?.ok; n++);
    assert(command(showcase, 0, { type: 'startRound' }).ok);
    while (showcase.roundStage !== 'planning' && showcase.phase === 'running') step(showcase);
  }
  for (const offer of [...showcase.sides[0].shop].slice(0, 2))
    command(showcase, 0, { type: 'buy', offer: offer.id });
  {
    const { context, page } = await open(
      { width: 1152, height: 540 },
      loadFixture,
      fixture(showcase),
    );
    await tap(page, 'start');
    await shot(page, 'shop-showcase');
    await tap(page, 'start-round');
    await page.waitForTimeout(4200);
    await shot(page, 'battle-showcase');
    await tap(page, 'pause');
    await shot(page, 'pause-showcase');
    await context.close();
    await saveVideo(page, 'shop-showcase');
    evidence.push({ case: 'legal-third-round-showcase', result: 'passed' });
  }
  const effects = new Map();
  for (let seed = 0; seed < 100 && effects.size < 6; seed++) {
    const m = createMatch('level-01', seed);
    for (let n = 0; n < 128 && runAI(m, 0)?.ok; n++);
    command(m, 0, { type: 'startRound' });
    while (m.roundStage === 'battle') step(m);
    if (m.roundWinner !== null && !effects.has(crystalStyle(seed, 1)))
      effects.set(crystalStyle(seed, 1), snapshot(m));
  }
  assert.equal(effects.size, 6);
  for (const [style, m] of effects) {
    const { context, page } = await open({ width: 1152, height: 540 }, loadFixture, fixture(m));
    await tap(page, 'start');
    await expect
      .poll(() => state(page).then((s) => s.match.roundTicks), { timeout: 5000, intervals: [30] })
      .toBeGreaterThanOrEqual(26);
    assert.equal((await state(page)).crystalStyle, style);
    await shot(page, 'crystal-' + style);
    await tap(page, 'pause');
    const saved = (await state(page)).match;
    await page.waitForTimeout(140);
    assert.deepEqual((await state(page)).match, saved);
    if (style === 0) {
      await tap(page, 'settings');
      await tap(page, 'motion');
      assert((await state(page)).reducedMotion);
      assert.deepEqual((await state(page)).match, saved);
      await tap(page, 'back');
    }
    await tap(page, 'resume');
    await expect
      .poll(() => state(page).then((s) => s.match.roundNumber), { timeout: 5000 })
      .toBe(2);
    const after = (await state(page)).match,
      loser = m.roundWinner === 0 ? 1 : 0;
    assert.equal(after.sides[loser].crystalHp, m.sides[loser].crystalHp - m.roundDamage);
    await context.close();
    await saveVideo(page, 'crystal-' + style);
    evidence.push({ case: 'crystal-effect-pause-once-damage', style, result: 'passed' });
  }
  {
    const { context, page } = await open(undefined, () => {
      localStorage.setItem('merge-front:match:v2', 'old-v2-evidence');
      localStorage.setItem('merge-front:match:v3', 'old-v3-evidence');
    });
    await tap(page, 'start');
    await tap(page, 'begin');
    await tap(page, 'pause');
    await tap(page, 'home');
    assert.deepEqual(
      await page.evaluate(() => [
        localStorage.getItem('merge-front:match:v2'),
        localStorage.getItem('merge-front:match:v3'),
      ]),
      ['old-v2-evidence', 'old-v3-evidence'],
    );
    await context.close();
    evidence.push({ case: 'legacy-match-keys-preserved', result: 'passed' });
  }

  for (const viewport of [
    { width: 844, height: 390 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 568, height: 320 },
  ]) {
    const { context, page } = await open(viewport);
    await tap(page, 'start');
    assert.equal((await state(page)).supplyChoices.length, 3);
    await shot(page, 'starter-' + viewport.width);
    await tap(page, 'supply:2');
    await tap(page, 'begin');
    const s = await state(page);
    await hold(page, cards(s)[0].id, { screenshot: 'long-press-hand-' + viewport.width });
    await shot(page, 'planning-' + viewport.width);
    await drag(page, cards(s)[0].id, world(s, 250, 180));
    assert.equal((await state(page)).match.sides[0].formation.length, 1);
    await tap(page, 'pause');
    await page.setViewportSize({ width: viewport.height, height: viewport.width });
    await page.waitForTimeout(250);
    await tap(page, 'resume');
    await tap(page, 'pause');
    await shot(page, 'viewport-' + viewport.width + 'x' + viewport.height);
    await tap(page, 'settings');
    assert.equal(
      (await state(page)).controls.some((b) => /fullscreen|全屏/.test(b.id + b.label)),
      false,
    );
    await tap(page, 'back');
    await tap(page, 'home');
    evidence.push({ case: 'orientation-touch', viewport, result: 'passed' });
    await context.close();
  }
  // A terminal fixture is derived entirely through legal commands and simulation.
  for (const seed of [1, 0]) {
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
    if (m.phase === 'lost') {
      assert.equal((await state(page)).progress.unlockedLevel, 1);
      await tap(page, 'retry');
      assert.equal((await state(page)).match.roundStage, 'planning');
      assert.equal((await state(page)).match.roundNumber, 1);
    }
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
    assert.equal(s.match.sides[0].coins, status === 'completed' ? 8 : 6);
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

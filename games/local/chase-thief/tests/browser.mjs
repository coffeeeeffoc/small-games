import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createStaticServer } from '../server.mjs';
const output = new URL('../../../../outputs/chase-thief/browser/', import.meta.url);
await mkdir(output, { recursive: true });
const server = createStaticServer();
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || chromium.executablePath(),
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
const report = {
  artifactSha256: JSON.parse(await readFile(new URL('../dist/build-info.json', import.meta.url)))
    .artifactSha256,
  engine: 'Cocos Engine 3.8.8',
  pipeline: 'official-engine-source-web',
  date: new Date().toISOString(),
  browser: browser.version(),
  checks: [],
  errors: [],
};
const state = (p) => p.evaluate(() => globalThis.__chase?.snapshot());
async function ready(p, url = '?dev=0') {
  p.on('pageerror', (e) => report.errors.push(e.message));
  p.on('console', (m) => {
    if (m.type() === 'error') report.errors.push(m.text());
  });
  await p.goto(base + url);
  await expect.poll(async () => (await state(p))?.ready, { timeout: 60000 }).toBe(true);
}
async function tap(p, id) {
  await expect
    .poll(async () => (await state(p))?.controls.some((c) => c.id === id), { timeout: 10000 })
    .toBe(true);
  const s = await state(p),
    c = s.controls.find((c) => c.id === id),
    box = await p.locator('#GameCanvas').boundingBox();
  await p.touchscreen.tap(
    box.x + ((c.x + c.w / 2) / s.width) * box.width,
    box.y + ((c.y + c.h / 2) / s.height) * box.height,
  );
}
async function screen(p, name) {
  await expect.poll(async () => (await state(p))?.screen).toBe(name);
}
async function shot(p, name) {
  await p.screenshot({ path: fileURLToPath(new URL(name + '.png', output)) });
}
async function swipe(p, direction) {
  const cdp = await p.context().newCDPSession(p),
    box = await p.locator('#GameCanvas').boundingBox();
  const x = box.x + box.width * 0.5,
    y = box.y + box.height * 0.65;
  const [dx, dy] = { left: [-90, 0], right: [90, 0], jump: [0, -100], slide: [0, 100] }[direction];
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 1 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: x + dx, y: y + dy, id: 1 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await ready(page);
  assert.equal(await page.evaluate(() => typeof globalThis.__chaseDev), 'undefined');
  await shot(page, 'home-390x844');
  await tap(page, 'help');
  await screen(page, 'help');
  await tap(page, 'back');
  await screen(page, 'home');
  await tap(page, 'settings');
  await screen(page, 'settings');
  await tap(page, 'toggle:sound');
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('chase-thief.progress.v2')).sound),
    )
    .toBe(false);
  await tap(page, 'back');
  await screen(page, 'home');
  await tap(page, 'districts');
  await screen(page, 'districts');
  await shot(page, 'districts-390x844');
  await tap(page, 'choose:market');
  await tap(page, 'start');
  await screen(page, 'running');
  await expect.poll(async () => (await state(page)).departure).toBe('market');
  await swipe(page, 'left');
  await expect.poll(async () => (await state(page)).lane).toBe(0);
  await swipe(page, 'right');
  await expect.poll(async () => (await state(page)).lane).toBe(1);
  await swipe(page, 'jump');
  await expect.poll(async () => (await state(page)).action).toBe('jump');
  await expect.poll(async () => (await state(page)).action).toBe('run');
  await swipe(page, 'slide');
  await expect.poll(async () => (await state(page)).action).toBe('slide');
  await tap(page, 'pause');
  await screen(page, 'paused');
  const frozen = (await state(page)).distance;
  await page.waitForTimeout(400);
  assert.equal((await state(page)).distance, frozen);
  await shot(page, 'pause-390x844');
  await tap(page, 'settings');
  await screen(page, 'settings');
  await tap(page, 'back');
  await screen(page, 'paused');
  await tap(page, 'resume');
  await screen(page, 'running');
  await expect.poll(async () => (await state(page)).distance).toBeGreaterThan(frozen);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await screen(page, 'paused');
  await tap(page, 'retry');
  await screen(page, 'running');
  await expect.poll(async () => (await state(page)).screen, { timeout: 90000 }).toBe('result');
  const result = await state(page);
  assert.ok(result.best.market.distance >= 80);
  assert.equal(result.practice, false);
  await shot(page, 'result-390x844');
  await tap(page, 'home');
  await page.reload();
  await screen(page, 'home');
  assert.equal((await state(page)).best.market.distance, result.best.market.distance);
  report.checks.push(
    'normal touch menu/actions/pause/settings/resume/background/failure/retry/persist; dev API absent',
  );
  await context.close();

  const dev = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const p = await dev.newPage();
  await ready(p, '?dev=1');
  await tap(p, 'start');
  await screen(p, 'running');
  await p.evaluate(() => {
    __chaseDev.setManual(true);
    __chaseDev.invincible(true);
  });
  async function advanceTo(distance) {
    for (let i = 0; i < 200; i++) {
      const current = await state(p);
      if (current.distance >= distance - 0.4) return;
      await p.evaluate(
        (seconds) => __chaseDev.advance(seconds),
        Math.min(0.2, (distance - current.distance) / current.speed),
      );
    }
    throw Error('manual approach did not reach target');
  }
  await advanceTo(101);
  await p.waitForTimeout(500);
  await shot(p, 'action-row-390x844');
  const gap = await p.evaluate(() =>
    __chaseDev.snapshot().run.obstacles.find((o) => o.type === 'gap' && !o.resolved),
  );
  const beforeGap = await state(p);
  if (gap.lane !== beforeGap.lane) await swipe(p, gap.lane < beforeGap.lane ? 'left' : 'right');
  await advanceTo(gap.at - 6);
  await p.waitForTimeout(500);
  await shot(p, 'gap-390x844');
  report.checks.push('full-width action row and recessed trench captured in actual Cocos runtime');
  for (const [seconds, name] of [
    [3, 'approach'],
    [7, 'city-run'],
    [27, 'fork'],
    [10, 'after-origin'],
    [20, 'market'],
  ]) {
    await p.evaluate((s) => __chaseDev.advance(s), seconds);
    await expect.poll(async () => (await state(p)).world.chunks).toBeLessThanOrEqual(6);
    await p.waitForTimeout(700);
    await shot(p, name + '-390x844');
  }
  for (let i = 0; i < 12; i++) {
    await p.evaluate(() => __chaseDev.advance(120));
    await p.waitForTimeout(40);
    const s = await state(p);
    assert.ok(s.world.chunks <= 6);
    assert.ok(s.world.objects <= 48);
    assert.ok(s.world.renderers <= 150);
  }
  const long = await state(p);
  assert.ok(long.distance > 20000);
  assert.equal(long.phase, 'running');
  assert.deepEqual(long.best, {});
  report.checks.push({
    name: '20km render streaming, origin rebasing, practice isolation',
    distance: long.distance,
    world: long.world,
  });
  await tap(p, 'pause');
  await tap(p, 'retry');
  await screen(p, 'running');
  assert.equal((await state(p)).practice, false);
  await dev.close();

  for (const viewport of [
    { width: 360, height: 640 },
    { width: 430, height: 932 },
  ]) {
    const c = await browser.newContext({
      viewport,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
    const p = await c.newPage();
    await ready(p);
    for (const id of ['help', 'settings']) {
      await tap(p, id);
      const s = await state(p);
      for (const b of s.controls) assert.ok(b.y >= 0 && b.y + b.h <= s.height);
      await tap(p, 'back');
    }
    await tap(p, 'districts');
    const s = await state(p);
    for (const b of s.controls) assert.ok(b.y + b.h <= s.height);
    await shot(p, `districts-${viewport.width}x${viewport.height}`);
    await c.close();
    report.checks.push({ name: 'all menu controls inside design bounds', viewport });
  }
  const desktop = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mousePage = await desktop.newPage();
  await ready(mousePage);
  async function mouseTap(id) {
    const s = await state(mousePage),
      c = s.controls.find((c) => c.id === id);
    await mousePage.mouse.click(c.x + c.w / 2, c.y + c.h / 2);
  }
  await mouseTap('settings');
  await screen(mousePage, 'settings');
  await expect
    .poll(async () => (await state(mousePage)).controls.some((c) => c.id === 'toggle:sound'))
    .toBe(true);
  await mouseTap('toggle:sound');
  await expect
    .poll(() =>
      mousePage.evaluate(() => JSON.parse(localStorage.getItem('chase-thief.progress.v2')).sound),
    )
    .toBe(false);
  await mouseTap('back');
  await screen(mousePage, 'home');
  await expect
    .poll(async () => (await state(mousePage)).controls.some((c) => c.id === 'start'))
    .toBe(true);
  const before = (await state(mousePage)).inputCount;
  await mouseTap('start');
  await screen(mousePage, 'running');
  assert.equal((await state(mousePage)).inputCount, before + 1);
  await desktop.close();
  report.checks.push('desktop mouse activates each control exactly once');
  const legacy = JSON.stringify({
    version: 1,
    sound: false,
    haptics: false,
    best: { 'old-town': { time: 42, collisions: 1 } },
  });
  const c = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await c.addInitScript((value) => localStorage.setItem('chase-thief.progress.v1', value), legacy);
  const legacyPage = await c.newPage();
  await ready(legacyPage, '?dev=0&chaseChallenge=1&level=market&time=20');
  assert.equal((await state(legacyPage)).legacyBest['old-town'].time, 42);
  assert.deepEqual((await state(legacyPage)).best, {});
  await tap(legacyPage, 'settings');
  await tap(legacyPage, 'toggle:haptics');
  assert.equal(
    await legacyPage.evaluate(() => localStorage.getItem('chase-thief.progress.v1')),
    legacy,
  );
  await c.close();
  const broken = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await broken.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw Error('Blocked storage');
    };
    Storage.prototype.setItem = () => {
      throw Error('Blocked storage');
    };
  });
  const b = await broken.newPage();
  await ready(b);
  await tap(b, 'start');
  await screen(b, 'running');
  await broken.close();
  report.checks.push('v1 retained, old challenge retired, storage-denied playable');
  assert.deepEqual(report.errors, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack;
  throw error;
} finally {
  await writeFile(new URL('browser-report.json', output), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  console.log(JSON.stringify(report, null, 2));
}

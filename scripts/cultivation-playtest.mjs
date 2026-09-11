import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer, preview } from 'vite';

// Real browser input only. The development snapshot is read-only; no state is injected.
const server = await createServer({
  root: fileURLToPath(new URL('../apps/game-cultivation', import.meta.url)),
  server: { host: '127.0.0.1', port: 0 },
  logLevel: 'error',
});
await server.listen();
let browser;
let production;
const report = { checks: [], errors: [], screenshots: [] };
try {
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    hasTouch: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', (error) => report.errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') report.errors.push(message.text());
  });
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    window.__trialAudio = [];
    window.Audio = function (src) {
      const sound = new NativeAudio(src);
      window.__trialAudio.push(sound);
      return sound;
    };
  });
  await page.clock.install({ time: new Date('2026-09-12T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-09-12T00:00:01Z'));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  await mkdir('.scratch/cultivation', { recursive: true });
  const snapshot = () => page.locator('canvas').evaluate((node) => node.getCultivationSnapshot());
  async function shot(name) {
    const path = `.scratch/cultivation/${name}.png`;
    await page.screenshot({ path, fullPage: true });
    report.screenshots.push(path);
  }
  async function tick(ms) {
    await page.clock.runFor(Math.ceil(ms));
  }
  async function holdKey(key, ms) {
    await page.keyboard.down(key);
    await tick(ms);
    await page.keyboard.up(key);
  }
  async function tap(name) {
    await page.getByRole('button', { name, exact: true }).click();
  }
  async function sword(charged = true) {
    await holdKey('Space', charged ? 720 : 30);
    await tick(500);
  }
  async function walkTo(x, y) {
    for (const axis of ['x', 'y']) {
      const s = await snapshot(),
        delta = (axis === 'x' ? x : y) - s.player[axis];
      if (Math.abs(delta) < 4) continue;
      await holdKey(
        axis === 'x' ? (delta > 0 ? 'd' : 'a') : delta > 0 ? 's' : 'w',
        (Math.abs(delta) / s.balance.moveSpeed) * 1000,
      );
      const after = await snapshot();
      assert.ok(
        Math.abs(after.player[axis] - (axis === 'x' ? x : y)) < 14,
        `Movement blocked at ${JSON.stringify(after.player)} toward ${x},${y}`,
      );
    }
  }
  await page.getByRole('button', { name: '点香 · 开始修行' }).waitFor();
  await shot('desktop-ready');
  await tap('点香 · 开始修行');
  const beforeQi = (await snapshot()).qi;
  await holdKey('e', 1000);
  assert.ok((await snapshot()).qi > beforeQi + 20);
  await holdKey('e', 2700);
  assert.ok((await snapshot()).message.includes('气息散乱'));
  report.checks.push('Breath banks only on release; overholding loses unbanked qi');
  const before = (await snapshot()).player;
  await holdKey('w', 250);
  assert.ok((await snapshot()).player.y < before.y - 25);
  await sword();
  assert.ok((await snapshot()).enemies[0].hp < 48);
  await sword(false);
  assert.equal((await snapshot()).enemies[0].hp, 0);
  report.checks.push('Keyboard movement and real aimed sword collision kill the practice target');
  await page.keyboard.down('Space');
  await tick(650);
  const time = (await snapshot()).elapsed;
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.keyboard.up('Space');
  await tick(5000);
  assert.equal((await snapshot()).elapsed, time);
  assert.equal((await snapshot()).charge, null);
  await tap('继续修行');
  await tap('静音');
  await tap('开声');
  await page.waitForFunction(
    () =>
      window.__trialAudio.length === 17 &&
      window.__trialAudio.every((sound) => sound.readyState >= 2),
  );
  assert.ok(
    await page.evaluate(() => window.__trialAudio.some((sound) => sound.loop && !sound.paused)),
  );
  report.checks.push(
    'Blur cancels held attacks and freezes time; local audio decodes, starts, mutes and resumes',
  );
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const box = await page.getByRole('button', { name: '御剑', exact: true }).boundingBox();
    assert.ok(box && box.y + box.height <= 844 && box.width >= 44 && box.height >= 44);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await shot('mobile-cave');
  const rect = await page.locator('.trial-stage').boundingBox();
  const touch = await context.newCDPSession(page);
  const at = (id, x, y) => ({
    id,
    x: rect.x + (x / 480) * rect.width,
    y: rect.y + (y / 800) * rect.height,
    radiusX: 3,
    radiusY: 3,
    force: 1,
  });
  const start = (await snapshot()).player;
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [at(1, 107, 701)],
  });
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [at(1, 107, 701), at(2, 403, 721)],
  });
  await tick(600);
  const holding = await snapshot();
  assert.ok(holding.player.x > start.x + 15 && holding.charge > 0.4);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  const cancelled = await snapshot();
  assert.equal(cancelled.charge, null);
  assert.deepEqual(cancelled.move, { x: 0, y: 0 });
  await tick(300);
  assert.deepEqual((await snapshot()).player, cancelled.player);
  report.checks.push(
    '320/390px layout, simultaneous real touch movement/charge, touch cancellation',
  );
  await walkTo(240, 151);
  await tap('出关 · 入秘境');
  assert.equal((await snapshot()).scene, 'forest');
  await sword();
  await sword(false);
  assert.equal((await snapshot()).enemies.find((e) => e.id === 'bamboo-1').hp, 0);
  await walkTo(135, 685);
  await sword();
  await sword(false);
  await sword(false);
  assert.equal((await snapshot()).enemies.find((e) => e.id === 'bamboo-2').hp, 0);
  await walkTo(135, 510);
  await tap('收取 · 避雷木种');
  assert.ok((await snapshot()).relics.includes('wood'));
  await walkTo(95, 365);
  await sword();
  await sword(false);
  assert.equal((await snapshot()).fox, 'following');
  await shot('mobile-forest');
  report.checks.push('Forest combat, physical relic collection and fox rescue');
  await walkTo(230, 365);
  await walkTo(230, 230);
  await walkTo(380, 181);
  await tap('登台 · 提前渡劫');
  assert.equal((await snapshot()).phase, 'tribulation');
  await tap('引雷木 R');
  await walkTo(130, 330);
  await shot('mobile-summit');
  let heldKeys = new Set();
  async function moveKeys(next) {
    for (const key of heldKeys) if (!next.has(key)) await page.keyboard.up(key);
    for (const key of next) if (!heldKeys.has(key)) await page.keyboard.down(key);
    heldKeys = next;
  }
  for (let count = 0; count < 300; count++) {
    const s = await snapshot();
    if (s.phase !== 'tribulation') break;
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const candidates = [
      { x: 130, y: 330 },
      { x: 350, y: 330 },
      { x: 240, y: 350 },
      { x: 240, y: 260 },
    ];
    const safe =
      candidates
        .filter((p) => s.lightning.every((b) => b.struck || distance(p, b) > b.radius + 25))
        .sort((a, b) => distance(a, s.player) - distance(b, s.player))[0] ?? candidates[0];
    const keys = new Set();
    if (Math.abs(safe.x - s.player.x) > 8) keys.add(safe.x > s.player.x ? 'd' : 'a');
    if (Math.abs(safe.y - s.player.y) > 8) keys.add(safe.y > s.player.y ? 's' : 'w');
    await moveKeys(keys);
    if (
      s.lightning.some((b) => !b.struck && b.timer < 0.35 && distance(s.player, b) < b.radius + 10)
    )
      await page.keyboard.press('Shift');
    if (s.exposed > 0 && distance(s.player, s.enemies[0]) < 265) await page.keyboard.press('Space');
    await tick(160);
  }
  await moveKeys(new Set());
  const ending = await snapshot();
  assert.equal(
    ending.phase,
    'won',
    JSON.stringify({
      phase: ending.phase,
      hp: ending.health,
      wave: ending.wave,
      time: ending.trialTime,
    }),
  );
  await page.waitForFunction(() =>
    document.querySelector('.trial-record')?.textContent.includes('筑基 1 次'),
  );
  await shot('mobile-victory');
  report.checks.push(
    'Full three-eye victory through real input, optional wood/fox, result persistence',
  );
  await tap('再入仙山');
  assert.equal((await snapshot()).phase, 'explore');
  await tick(181000);
  assert.equal((await snapshot()).phase, 'lost');
  await page.getByRole('button', { name: '再入仙山' }).waitFor();
  await shot('mobile-failure');
  await page.reload();
  await page.getByRole('button', { name: '点香 · 开始修行' }).waitFor();
  await page.waitForFunction(() =>
    document.querySelector('.trial-record')?.textContent.includes('试炼 2 次'),
  );
  assert.equal((await snapshot()).phase, 'ready');
  report.checks.push(
    'Idle failure, replay, fresh run on reload and persistent independent trial records',
  );
  production = await preview({
    root: fileURLToPath(new URL('../apps/game-cultivation', import.meta.url)),
    preview: { host: '127.0.0.1', port: 0 },
    logLevel: 'error',
  });
  await page.goto(`http://127.0.0.1:${production.httpServer.address().port}/`);
  await tap('点香 · 开始修行');
  assert.equal(
    await page.locator('canvas').evaluate((node) => typeof node.getCultivationSnapshot),
    'undefined',
  );
  await holdKey('e', 1100);
  assert.ok(Number(await page.getByLabel('当前真气').textContent()) > 55);
  await sword();
  await page.waitForFunction(
    () =>
      window.__trialAudio.length === 17 &&
      window.__trialAudio.every((sound) => sound.readyState >= 2),
  );
  await shot('production-cave');
  report.checks.push(
    'Built production entry runs real breath/sword controls and packaged audio, without the development snapshot',
  );
  assert.deepEqual(report.errors, []);
  await writeFile('.scratch/cultivation/playtest.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  if (production) await new Promise((resolve) => production.httpServer.close(resolve));
  await server.close();
}

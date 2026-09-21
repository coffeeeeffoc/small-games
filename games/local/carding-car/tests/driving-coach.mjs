import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { sourceHash } from '../scripts/artifact.mjs';

const url = process.env.KART_URL || 'http://127.0.0.1:4198';
const build = await fetch(new URL('build-info.json', url)).then((r) => r.json());
assert.equal(build.sourceHash, await sourceHash());
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
    (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
      ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
      : undefined),
});
const reports = new URL('../reports/', import.meta.url);
await mkdir(reports, { recursive: true });
const evidence = { build, errors: [] };
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => evidence.errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => globalThis.__kart && !__kart.snapshot().loading);
  assert.equal(await page.title(), '浪湾卡丁车');
  assert.match(await page.evaluate(() => __kart.snapshot().hud.target), /首枚/);
  await page.screenshot({ path: fileURLToPath(new URL('coach-menu.png', reports)) });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => __kart.snapshot().phase === 'racing');
  assert.equal(await page.evaluate(() => __kart.snapshot().hud.coachingStep), 0);
  await page.keyboard.down('w');
  await page.waitForFunction(() => __kart.snapshot().hud.coachingStep === 1);
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.down('Space');
  await page.waitForFunction(() => __kart.snapshot().hud.coachingStep === 3, null, {
    timeout: 6000,
  });
  await page.screenshot({ path: fileURLToPath(new URL('coach-drift.png', reports)) });
  await page.keyboard.press('p');
  await page.keyboard.up('Space');
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('w');
  await page.waitForFunction(() => __kart.snapshot().phase === 'paused');
  await page.waitForFunction(
    () => __kart.snapshot().hud.coachingStep === 2 && /蓄出蓝色火花/.test(__kart.snapshot().hud.coaching),
  );
  evidence.interrupted = await page.evaluate(() => __kart.snapshot().hud);
  assert.match(evidence.interrupted.coaching, /蓄出蓝色火花/);
  await page.keyboard.press('p');
  await page.keyboard.down('w');
  await page.mouse.move(154, 440);
  await page.mouse.down();
  // Follow the read-only racing line through real controls to reach the next bend.
  const retryDeadline = Date.now() + 30000;
  while (Date.now() < retryDeadline) {
    const state = await page.evaluate(() => __kart.snapshot());
    if (state.hud.coachingStep === 3) break;
    const input = state.suggestedInput;
    await page.mouse.move(960 * (0.16 + input.steer * 0.095), 440);
    await page.keyboard[input.drift ? 'down' : 'up']('Space');
    await page.keyboard[input.brake ? 'down' : 'up']('s');
    await page.waitForTimeout(45);
  }
  assert.equal(await page.evaluate(() => __kart.snapshot().hud.coachingStep), 3);
  await page.mouse.up();
  await page.keyboard.up('Space');
  await page.keyboard.up('s');
  await page.waitForFunction(() => __kart.snapshot().hud.coachingStep === 4);
  await page.keyboard.down('ShiftLeft');
  await page.waitForFunction(
    () => __kart.snapshot().hud.coachingStep === 5 && /驾驶入门完成/.test(__kart.snapshot().hud.coaching),
  );
  await page.keyboard.up('ShiftLeft');
  evidence.completed = await page.evaluate(() => __kart.snapshot().hud);
  assert.equal(await page.evaluate(() => localStorage.getItem('kart-driving-coach-v1')), 'done');
  await page.screenshot({ path: fileURLToPath(new URL('coach-complete.png', reports)) });
  await page.reload();
  await page.waitForFunction(() => globalThis.__kart && !__kart.snapshot().loading);
  assert.equal(await page.evaluate(() => __kart.snapshot().hud.coachingEnabled), false);
  await page.keyboard.press('h');
  await page.waitForFunction(() => __kart.snapshot().hud.coachingEnabled);
  assert.equal(await page.evaluate(() => __kart.snapshot().hud.coachingStep), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('#kart-rotate').isVisible(), true);
  await page.screenshot({ path: fileURLToPath(new URL('coach-portrait.png', reports)) });
  await page.setViewportSize({ width: 844, height: 390 });
  assert.equal(await page.locator('#kart-rotate').isVisible(), false);
  assert.deepEqual(evidence.errors, []);
  // A production-like hostname disables the localhost-only development server fallback.
  const publicPage = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await publicPage.route('http://kart.example.test/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const response = await fetch(new URL(requestUrl.pathname + requestUrl.search, url));
    await route.fulfill({
      status: response.status,
      contentType: response.headers.get('content-type') || 'application/octet-stream',
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
  await publicPage.goto('http://kart.example.test/');
  await publicPage.waitForFunction(() => globalThis.__kart?.snapshot().multiplayer);
  assert.equal(
    await publicPage.evaluate(() => __kart.snapshot().multiplayer.entryLabel),
    '好友赛待开放',
  );
  await publicPage.mouse.click(124, 117);
  evidence.unconfigured = await publicPage.evaluate(() => __kart.snapshot().multiplayer);
  assert.equal(evidence.unconfigured.entryVisible, false);
  assert.match(evidence.unconfigured.panelStatus, /单机竞速/);
  await publicPage.screenshot({ path: fileURLToPath(new URL('coach-offline.png', reports)) });
  await writeFile(new URL('driving-coach.json', reports), JSON.stringify(evidence, null, 2));
  console.log(
    'Driving coach: 5 real-input steps, interrupted charge retry, completion persistence, replay, portrait hint, unavailable multiplayer passed',
  );
} finally {
  await browser.close();
}

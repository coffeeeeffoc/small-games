import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gameURL, verifyBuild, startBrowser, waitForReady, designPoint, displayGeometry } from './browser-utils.mjs';

const url = gameURL();
const build = await verifyBuild(url);
const browser = await startBrowser(url);
const reports = new URL('../reports/', import.meta.url);
await mkdir(reports, { recursive: true });
const evidence = { build, errors: [] };
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => evidence.errors.push(e.message));
  await page.goto(url);
  await waitForReady(page);
  assert.equal(await page.title(), '浪湾卡丁车');
  assert.equal(await page.evaluate(() => __kart.snapshot().hud.coachingEnabled), false, 'teaching is opt-in');
  const click = async (x, y) => { const p = await designPoint(page, x, y); await page.mouse.click(p.x, p.y); };
  await click(910, 46);
  await page.waitForFunction(() => __kart.snapshot().hud.settingsVisible);
  await click(480, 304);
  await page.waitForFunction(() => __kart.snapshot().hud.coachingEnabled);
  await click(640, 114);
  await page.waitForFunction(() => !__kart.snapshot().hud.settingsVisible);
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
  await waitForReady(page);
  assert.equal(await page.evaluate(() => __kart.snapshot().hud.coachingEnabled), true, 'the explicit global teaching preference survives reload');
  await page.keyboard.press('h');
  await page.reload();
  await waitForReady(page);
  assert.equal(await page.evaluate(() => __kart.snapshot().hud.coachingEnabled), false, 'turning teaching off also persists');
  await page.keyboard.press('h');
  await page.waitForFunction(() => __kart.snapshot().hud.coachingEnabled);
  assert.equal(await page.evaluate(() => __kart.snapshot().hud.coachingStep), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const portrait = await displayGeometry(page);
  assert.ok(portrait.visible.width >= portrait.visible.height, 'portrait-held phone keeps a landscape game');
  assert.equal(await page.locator('#kart-rotate').count(), 0, 'the old rotate-phone interruption is absent');
  await page.screenshot({ path: fileURLToPath(new URL('coach-portrait.png', reports)) });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(300);
  assert.ok((await displayGeometry(page)).visible.width >= (await displayGeometry(page)).visible.height);
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
  await waitForReady(publicPage);
  await publicPage.waitForFunction(() => globalThis.__kart?.snapshot().multiplayer);
  assert.equal(
    await publicPage.evaluate(() => __kart.snapshot().multiplayer.entryLabel),
    '好友赛待开放',
  );
  const unavailableEntry = await designPoint(publicPage, 796, 46);
  await publicPage.mouse.click(unavailableEntry.x, unavailableEntry.y);
  evidence.unconfigured = await publicPage.evaluate(() => __kart.snapshot().multiplayer);
  assert.equal(evidence.unconfigured.entryVisible, false);
  assert.equal(evidence.unconfigured.panelOpen, false, 'unconfigured multiplayer has no visible lobby entry');
  assert.match(evidence.unconfigured.panelStatus, /单机竞速/);
  await publicPage.screenshot({ path: fileURLToPath(new URL('coach-offline.png', reports)) });
  await writeFile(new URL('driving-coach.json', reports), JSON.stringify(evidence, null, 2));
  console.log(
    'Driving coach: 5 real-input steps, interrupted charge retry, completion and global preference persistence, replay, portrait landscape, unavailable multiplayer passed',
  );
} finally {
  await browser.close();
}

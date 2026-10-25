import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const output = new URL('../publishing/', import.meta.url);
for (const folder of ['gameplay/screenshots/', 'gameplay/videos/'])
  await mkdir(new URL(folder, output), { recursive: true });
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 },
  isMobile: true, hasTouch: true, deviceScaleFactor: 1,
  recordVideo: { dir: fileURLToPath(new URL('../../../../.scratch/ember-recording/', import.meta.url)),
    size: { width: 390, height: 844 } } });
const page = await context.newPage();
const video = page.video(), errors = [];
const snapshot = () => page.locator('#arena').evaluate((canvas) => canvas.getEmberSnapshot());
const capture = (name) => page.screenshot({ path: fileURLToPath(new URL(`gameplay/screenshots/${name}.png`, output)) });
page.on('pageerror', (error) => errors.push(error.message));
async function aim(x, y, name) {
  const bounds = await page.locator('#arena').boundingBox();
  assert(bounds);
  const touch = await context.newCDPSession(page);
  try {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
      { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height * 64 / 600 }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [
      { x: bounds.x + bounds.width * x / 390, y: bounds.y + bounds.height * y / 600 }] });
    await page.waitForTimeout(650);
    if (name) await capture(name);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await touch.detach(); }
}
try {
  await page.goto(process.env.EMBER_URL ?? 'http://127.0.0.1:4418/');
  await expect(page.locator('#start')).toBeVisible();
  await capture('home-390x844');
  await page.locator('#start').tap();
  const initialTargets = (await snapshot()).targets;
  await aim(195, 510, 'aim-390x844');
  await page.waitForFunction(() => document.querySelector('#arena').getEmberSnapshot()
    .balls.some(ball => ball.returning && ball.y >= 561));
  const naturalReturn = await snapshot();
  assert(naturalReturn.balls.every(ball => !ball.returning || ball.y >= 561));
  await capture('recall-390x844');
  await expect.poll(async () => (await snapshot()).corePhase, { timeout: 20000 }).toBe('aim');
  const first = await snapshot();
  assert.equal(first.completedTurns, 1);
  for (const target of initialTargets.filter(target => target.kind !== 'pickup'))
    assert.equal(first.targets.find(current => current.id === target.id)?.hp, target.hp);
  await aim(130, 492, 'aim-390x844');
  await page.waitForTimeout(1100);
  await capture('volley-390x844');
  assert((await snapshot()).bestCombo >= 12);
  await page.locator('#recall').tap();
  await page.waitForTimeout(100);
  const returning = await snapshot();
  assert(returning.balls.some((ball) => ball.returning));
  await page.locator('#pause').tap();
  const paused = await snapshot();
  await page.waitForTimeout(200);
  assert.deepEqual((await snapshot()).balls, paused.balls);
  await page.locator('#resume').tap();
  await expect(page.locator('#upgrade')).toBeVisible({ timeout: 20000 });
  await page.locator('[data-upgrade="power"]').tap();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 568 });
  await capture('reduced-motion-320x568');
  assert.equal((await snapshot()).completedTurns, 2);
  assert.deepEqual(errors, []);
  await writeFile(new URL('gameplay/videos/recording.json', output), JSON.stringify({
    date: '2026-10-25', environment: `Windows Chromium ${browser.version()} touch emulation`,
    viewport: '390x844; final reduced-motion check 320x568', firstRound: first,
    naturalCollection: naturalReturn,
    recall: { count: returning.balls.length, collected: returning.collected }, errors,
    controls: 'Native CDP touch events; normal player mode, no state injection',
  }, null, 2));
} finally {
  await context.close();
  await video.saveAs(fileURLToPath(new URL('gameplay/videos/gravity-volley-390x844.webm', output)));
  await browser.close();
}

import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
const server = spawn(process.execPath, ['server.mjs', '--dist', '--port', '4532'], { cwd: new URL('../', import.meta.url), stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/usr/bin/chromium' });
const output = new URL('../docs/design/publishing-2026-10-11/', import.meta.url);
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { window.SmallGamesPublishingConfig = { publicUrl: 'https://games.example/three-choose-two/' }; window.__shares = []; navigator.share = async (request) => { window.__shares.push(request); }; });
  const action = async (id) => { await page.locator(`[data-action="${id}"]`).first().tap(); };
  const state = () => page.evaluate(() => window.getThreeChooseTwoSnapshot().state);
  const saved = () => page.evaluate(() => localStorage.getItem('three-choose-two-progress-v1'));
  await page.goto('http://127.0.0.1:4532/');
  await action('start'); await action('begin');
  const original = await saved();
  await page.goto('http://127.0.0.1:4532/?seed=1337&variant=classic&targetScore=100&dev=0&token=private');
  await page.screenshot({ path: fileURLToPath(new URL('actual-invite-390x844.png', output)) });
  await action('challenge-invite');
  assert.equal((await state()).initialSeed, 1337);
  assert.equal((await state()).challengeTarget, 100);
  const initial = (await state()).candidates;
  // A real cancelled touch does not place a piece.
  const candidate = await page.locator('[data-slot="0"]').boundingBox();
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: candidate.x + candidate.width / 2, y: candidate.y + candidate.height / 2, id: 1 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  assert.equal((await state()).stats.placements, 0);
  await page.screenshot({ path: fileURLToPath(new URL('actual-play-390x844.png', output)) });
  for (let round = 0; round < 3; round++) {
    await action('pause'); await action('end-run');
    await expect(page.locator('#game')).toHaveAttribute('data-screen', 'result');
    if (round === 0) {
      await action('share');
      const shared = await page.evaluate(() => window.__shares[0]);
      const url = new URL(shared.url);
      assert.equal(url.origin, 'https://games.example');
      assert.equal(url.searchParams.get('seed'), '1337');
      assert.equal(url.searchParams.get('targetScore'), '0');
      await expect(page.locator('.result-status')).toContainText('好友自报目标 100 分 · 还差 100 分');
      assert.equal(url.searchParams.has('dev'), false); assert.equal(url.searchParams.has('token'), false);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: fileURLToPath(new URL('actual-result-390x844.png', output)) });
      await page.setViewportSize({ width: 320, height: 568 });
      await page.screenshot({ path: fileURLToPath(new URL('actual-result-320x568.png', output)), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
    }
    await action(round === 2 ? 'home' : 'same-seed');
    if (round < 2) {
      await expect(page.locator('[data-game-ad]')).toHaveCount(0);
      assert.deepEqual((await state()).candidates, initial);
    } else {
      const ad = page.locator('[data-game-ad="mock"]');
      await expect(ad).toBeVisible();
      await page.screenshot({ path: fileURLToPath(new URL('actual-ad-390x844.png', output)) });
      await ad.getByRole('button', { name: '关闭并继续' }).tap();
      await expect(page.locator('#game')).toHaveAttribute('data-screen', 'home');
    }
  }
  assert.equal(await saved(), original, 'Shared challenges preserve the normal saved board and progress');
  await action('start');
  assert.equal((await state()).levelId, 1);
  const hosted = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  hosted.on('pageerror', error => errors.push(error.message));
  await hosted.addInitScript(() => {
    window.__hostAds = [];
    window.SmallGamesPublishingConfig = { adMode: 'host', provider: { async show(request) { window.__hostAds.push(request); return { status: 'completed' }; } } };
  });
  await hosted.goto('http://127.0.0.1:4532/?seed=5');
  const hostedAction = id => hosted.locator(`[data-action="${id}"]`).first().tap();
  for (let round = 0; round < 3; round++) {
    await hostedAction('challenge-invite'); await hostedAction('pause'); await hostedAction('end-run'); await hostedAction('home');
    await expect(hosted.locator('#game')).toHaveAttribute('data-screen', 'home');
  }
  assert.equal(await hosted.evaluate(() => window.__hostAds.length), 1, 'Host provider receives the frequency-gated natural break');
  await expect(hosted.locator('[data-game-ad]')).toHaveCount(0);
  await hosted.close();
  const interrupted = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  interrupted.on('pageerror', error => errors.push(error.message));
  const interruptedAction = id => interrupted.locator(`[data-action="${id}"]`).first().tap();
  await interrupted.goto('http://127.0.0.1:4532/');
  await interruptedAction('start'); await interruptedAction('begin');
  const preserved = await interrupted.evaluate(() => localStorage.getItem('three-choose-two-progress-v1'));
  await interrupted.goto('http://127.0.0.1:4532/?seed=6');
  for (let round = 0; round < 3; round++) {
    await interruptedAction('challenge-invite'); await interruptedAction('pause'); await interruptedAction('end-run');
    await interruptedAction(round < 2 ? 'home' : 'again');
  }
  await expect(interrupted.locator('[data-game-ad="mock"]')).toBeVisible();
  // Browser visibility is read-only; this lifecycle fixture reproduces a platform background
  // callback while preserving real player taps and an actual pending advertisement.
  await interrupted.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(interrupted.locator('[data-game-ad]')).toHaveCount(0);
  await expect(interrupted.locator('#game')).toHaveAttribute('data-screen', 'result');
  assert.equal(await interrupted.evaluate(() => localStorage.getItem('three-choose-two-progress-v1')), preserved);
  await interrupted.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  await expect(interrupted.locator('#game')).toHaveAttribute('data-screen', 'result');
  await interruptedAction('home'); await interruptedAction('start');
  assert.equal(await interrupted.evaluate(() => window.getThreeChooseTwoSnapshot().state.levelId), 1);
  await interrupted.close();
  assert.deepEqual(errors, []);
  await writeFile(new URL('publishing-browser.json', output), JSON.stringify({ status: 'passed', environment: 'Chromium desktop mobile simulation; actual touch input; not a physical device', checks: ['received seed and replay', 'cancelled touch', 'safe share URL', 'normal save isolation', 'configured host provider and public URL', 'background ad dismissal preserves result and saved run', 'third-result ad, immediate close and resume', '390×844 and 320×568 screenshots'], errors }, null, 2));
  console.log('three-choose-two publishing: 8 checks passed');
} finally { await browser.close(); server.kill(); }

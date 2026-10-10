import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = spawn(process.execPath, ['server.mjs', '--dist', '--port', '4468'], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/usr/bin/chromium' });
const checks = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:4468/?dev=1');
  await page.locator('#start-game').tap();
  // UI settlement fixtures only; natural touch completion is covered by browser.mjs.
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => { const game = __towerBrake.getState(); game.status = 'won'; game.nextLayer = 12; game.elapsed = 10; });
    await expect(page.locator('#result-screen')).toBeVisible();
    await page.locator('#next-game').tap();
    if (i < 2) await expect(page.locator('#play-screen')).toBeVisible();
  }
  await expect(page.getByRole('dialog', { name: '模拟广告' })).toBeVisible();
  await page.screenshot({ path: fileURLToPath(new URL('../docs/design/publishing/mobile-simulated-ad.png', import.meta.url)) });
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.getByRole('dialog', { name: '模拟广告' })).toHaveCount(0);
  await expect(page.locator('#result-screen')).toBeVisible();
  assert.equal(await page.evaluate(() => __towerBrake.snapshot().screen), 'result-screen');
  checks.push('First two natural transitions stay uninterrupted; third opens a labelled simulation; background cancellation stays at result');
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await page.locator('#next-game').tap();
  await expect(page.locator('#play-screen')).toBeVisible();
  const levelId = await page.evaluate(() => __towerBrake.getState().level.id);
  await page.goto(`http://127.0.0.1:4468/?dev=1&challenge=tower-v1&level=${levelId}&targetScore=100`);
  await page.locator('#challenge-game').tap();
  const before = await page.evaluate(() => localStorage.getItem('tower-brake-v1'));
  await page.evaluate(() => { const game = __towerBrake.getState(); game.status = 'won'; game.nextLayer = 12; game.elapsed = 10; game.score = 300; });
  await expect(page.locator('#record-note')).toContainText('好友自报目标 100 分 · 已达成');
  assert.equal(await page.evaluate(() => localStorage.getItem('tower-brake-v1')), before);
  await page.screenshot({ path: fileURLToPath(new URL('../docs/design/publishing/mobile-challenge-result.png', import.meta.url)) });
  checks.push('Challenge result compares a self-reported goal and writes no normal progress');
  assert.deepEqual(errors, []);
  await writeFile(new URL('../docs/design/publishing/publishing-browser-report.json', import.meta.url), JSON.stringify({ browser: browser.version(), checks, errors, passed: true, fixture: 'Dev state settlement fixture tests UI transitions; no gameplay balance claims.' }, null, 2) + '\n');
  console.log('Publishing browser: ad frequency/background cancellation and challenge result isolation passed.');
} finally { await browser.close(); server.kill(); }

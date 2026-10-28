import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { acceptanceBuild, press, snapshot, assertLayout } from './flight-browser.mjs';
const base = process.env.NIGHT_URL, build = await acceptanceBuild(base);
const out = new URL('../reports/2026-10-28-visual-rebuild/style/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined, args: process.platform === 'win32' ? ['--use-angle=d3d11'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const evidence = { build, screens: [], errors: [] };
try {
  for (const [width, height] of [[568, 320], [844, 390], [1280, 720]]) {
    const touch = width < 1000;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    const page = await context.newPage();
    page.on('pageerror', error => evidence.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /TypeError|ReferenceError|Error \d+/.test(message.text())) evidence.errors.push(message.text()); });
    await page.route('**/api/competition/**', route => route.abort());
    await page.goto(base + '?dev=0');
    await page.waitForFunction(() => globalThis.__night?.snapshot().ui.homeArtworkReady && __night.snapshot().buttons.some(b => b.id === 'online:profile'));
    await page.waitForTimeout(800);
    const click = id => press(page, id, touch);
    const capture = async name => {
      await page.waitForTimeout(250); assertLayout(await snapshot(page), width, height);
      await page.screenshot({ path: fileURLToPath(new URL(name + '-' + width + '.png', out)) });
      evidence.screens.push(name + '-' + width);
    };
    await capture('home');
    await click('settings'); await capture('settings'); await click('close');
    await click('help'); await capture('help'); await click('close');
    await click('online:menu'); await capture('lobby');
    await click('online:friend'); await click('online:private'); await capture('private-room'); await click('online:dismiss');
    await click('online:profile'); await capture('nickname'); await click('online:dismiss');
    await click('online:ranking'); await capture('ranking'); await click('online:dismiss');
    await click('online:history'); await capture('history'); await click('online:dismiss');
    await click('missions'); await capture('missions'); await click('start');
    await page.waitForFunction(() => __night.snapshot().phase === 'playing');
    await capture('battle'); await click('settings'); await capture('battle-settings');
    await click('flightControls'); await capture('flight-controls'); await click('close');
    await click('home'); await capture('exit'); await click('exitCancel');
    await context.close();
  }
  assert.deepEqual(evidence.errors, []);
} finally {
  await browser.close(); await writeFile(new URL('style-evidence.json', out), JSON.stringify(evidence, null, 2));
}
console.log(JSON.stringify(evidence));

import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, browserOptions, boardSnapshot } from './browser-helpers.mjs';

const base = process.env.SHELL_URL || 'http://127.0.0.1:4196/';
const output = process.env.QA_OUTPUT || 'docs/design/mobile-2026-10-06/implemented';
await mkdir(output, { recursive: true });
const browser = await chromium.launch(browserOptions);
const errors = [];
try {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}#/games/letters-words2`);
    const iframe = page.locator('iframe[title="词屿 · 字母叠叠乐"]');
    await iframe.waitFor({ state: 'visible' });
    const frame = await (await iframe.elementHandle()).contentFrame();
    await frame.locator('#focus-button').waitFor({ state: 'visible' });
    const nav = page.locator('[data-game-display-host] > nav');
    assert.equal(await page.locator('[data-game-display-host]').getAttribute('data-game-id'), 'letters-words2');
    assert.equal(await nav.isVisible(), true, 'built Shell keeps a catalog exit on the game homepage');
    await frame.locator('#home-help-button').tap();
    assert.equal(await frame.locator('#help-dialog').isVisible(), true, 'built Shell exit does not cover help');
    await nav.waitFor({ state: 'hidden' });
    await frame.locator('#help-dialog [data-close]').first().tap();
    await frame.locator('#settings-button').tap();
    assert.equal(await frame.locator('#settings-dialog').isVisible(), true, 'built Shell exit does not cover settings');
    await frame.locator('#settings-dialog [data-close]').last().tap();
    await frame.locator('#friend-button').waitFor({ state: 'visible' });
    await frame.locator('#friend-button').tap();
    await frame.locator('[data-letters-competition]').waitFor({ state: 'visible' });
    await nav.waitFor({ state: 'hidden' });
    await page.screenshot({ path: join(output, `h5-shell-friend-${viewport.width}x${viewport.height}.png`) });
    await frame.locator('[data-letters-competition] .pk-header [data-close]').tap();
    await page.waitForFunction(() => document.querySelector('[data-game-display-host]').dataset.screen === 'home');
    assert.equal(await nav.isVisible(), true, 'leaving the real PK lobby restores the catalog exit');
    await frame.locator('#focus-button').tap();
    await page.waitForFunction(() => document.querySelector('[data-game-display-host]').dataset.screen === 'playing');
    assert.equal(await nav.isVisible(), false, 'built Shell hides outer controls during play');
    const tools = await frame.locator('.board-tools').evaluate(node => ({ bottom: node.getBoundingClientRect().bottom, viewport: innerHeight }));
    assert.ok(tools.bottom <= tools.viewport, 'built Shell gives the game the full phone height');
    await frame.locator('.tile[aria-disabled="false"]').first().tap();
    const partial = await boardSnapshot(frame);
    await frame.locator('#pause-button').tap();
    assert.equal(await frame.locator('#pause-dialog').isVisible(), true);
    await frame.locator('#resume-button').tap();
    assert.deepEqual(await boardSnapshot(frame), partial);
    await page.screenshot({ path: join(output, `h5-shell-play-${viewport.width}x${viewport.height}.png`) });
    await frame.locator('#pause-button').tap();
    await frame.locator('#home-button').tap();
    await page.waitForFunction(() => document.querySelector('[data-game-display-host]').dataset.screen === 'home');
    assert.equal(await nav.isVisible(), true);
    assert.deepEqual(await boardSnapshot(frame), partial, 'returning to the built Shell game homepage preserves selection');
    await page.screenshot({ path: join(output, `h5-shell-home-${viewport.width}x${viewport.height}.png`) });
    await nav.getByRole('button', { name: '返回目录' }).tap();
    await iframe.waitFor({ state: 'detached' });
    await page.locator('[aria-label="Game Catalog"]').waitFor({ state: 'visible' });
    await context.close();
    console.log(`PASS built Shell ${viewport.width}×${viewport.height}: home/help/settings/real PK lobby, play/pause/resume, return home/catalog and partial save`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}

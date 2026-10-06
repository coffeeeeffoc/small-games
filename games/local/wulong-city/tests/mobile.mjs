import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { enterGame } from './helpers.mjs';

const base = process.env.BASE_URL || 'http://127.0.0.1:4174/';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
});
const errors = [],
  checks = [];
const evidence = new URL('evidence/', import.meta.url);
await mkdir(evidence, { recursive: true });

async function pageIs(page, name) {
  await expect(page.locator('#game')).toHaveAttribute('data-page', name);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
}

async function touchTargets(page, selectors) {
  for (const selector of selectors) {
    const target = page.locator(selector);
    await expect(target).toBeVisible();
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    assert(box.width >= 43 && box.height >= 43, `${selector} has a thumb-sized touch target`);
    const viewport = page.viewportSize();
    assert(
      box.x >= -1 &&
        box.y >= -1 &&
        box.x + box.width <= viewport.width + 1 &&
        box.y + box.height <= viewport.height + 1,
      `${selector} fits the viewport`,
    );
  }
}

async function screenshot(page, label) {
  await page.screenshot({ path: fileURLToPath(new URL(`mobile-${label}.png`, evidence)) });
}

try {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base);
    await pageIs(page, 'home');
    assert.equal(await page.evaluate(() => typeof window.__wulong), 'undefined');
    await expect(page.locator('#canvas')).toBeHidden();
    await touchTargets(page, ['#start-game', '#home-levels', '#home-records', '#home-settings']);
    await screenshot(page, `${viewport.width}-home`);

    await page.locator('#home-levels').tap();
    await pageIs(page, 'levels');
    const levels = [];
    for (let chapter = 0; chapter < 10; chapter++) {
      const cards = page.locator('.level-grid [data-level]');
      await expect(cards).toHaveCount(10);
      const ids = await cards.evaluateAll((nodes) =>
        nodes.map((node) => Number(node.dataset.level)),
      );
      levels.push(...ids);
      for (const id of ids) {
        const card = page.locator(`[data-level="${id}"]`);
        if (id === 1) await expect(card).toBeEnabled();
        else await expect(card).toBeDisabled();
      }
      if (chapter < 9) await page.locator('#chapter-next').tap();
    }
    assert.equal(new Set(levels).size, 100);
    assert.deepEqual(
      [...levels].sort((a, b) => a - b),
      Array.from({ length: 100 }, (_, i) => i + 1),
    );
    await expect(page.locator('#chapter-next')).toBeDisabled();
    await screenshot(page, `${viewport.width}-levels`);
    await page.locator('#levels-back').tap();
    await page.locator('#home-records').tap();
    await pageIs(page, 'records');
    await screenshot(page, `${viewport.width}-records`);
    await page.locator('#records-back').tap();
    await page.locator('#home-settings').tap();
    await pageIs(page, 'pause');
    await touchTargets(page, ['#sound', '#fullscreen', '#pause-home']);
    await screenshot(page, `${viewport.width}-settings`);
    await page.locator('#pause-home').tap();
    await enterGame(page, true);
    await pageIs(page, 'play');
    await expect(page.locator('#home-levels')).toBeHidden();
    await touchTargets(page, ['#left', '#right', '#jump', '#hint', '#pause', '#menu']);
    await expect(page.locator('#pause')).toHaveAccessibleName('暂停');
    assert(!/[Ⅱπ⏸]|\|\|/.test(await page.locator('#pause').textContent()));
    await screenshot(page, `${viewport.width}-play`);
    await page.locator('#hint').tap();
    await pageIs(page, 'hint');
    await expect(page.locator('.hint-step')).toHaveText('提示 1 / 3');
    await page.locator('[data-more]').tap();
    await expect(page.locator('.hint-step')).toHaveText('提示 2 / 3');
    await screenshot(page, `${viewport.width}-hint`);
    await page.locator('[data-close-hint]').tap();
    await page.locator('#pause').tap();
    await pageIs(page, 'pause');
    await screenshot(page, `${viewport.width}-pause`);
    await page.locator('[data-resume]').tap();
    await page.locator('#menu').tap();
    await pageIs(page, 'home');
    checks.push(
      `${viewport.width}x${viewport.height}: home, all ten chapters/100 locked levels, records, settings, play, hints, pause and return use touch controls without overflow`,
    );
    await context.close();
  }

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}?dev=1&level=10`);
  await enterGame(page, true);
  const snapshot = () => page.evaluate(() => window.__wulong.snapshot());
  const cdp = await context.newCDPSession(page);
  const center = async (selector, id) => {
    const b = await page.locator(selector).boundingBox();
    return { id, x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  let right = await center('#right', 1),
    jump = await center('#jump', 2);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [right] });
  await page.waitForFunction(() => window.__wulong.snapshot().state.p.x > 80);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [right, jump] });
  await page.waitForFunction(() => !window.__wulong.snapshot().state.p.grounded);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [jump] });
  const moving = (await snapshot()).state.p.x;
  await page.waitForTimeout(120);
  assert((await snapshot()).state.p.x > moving + 5);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const released = (await snapshot()).state.p.x;
  await page.waitForTimeout(150);
  assert.equal((await snapshot()).state.p.x, released);
  await page.locator('#pause').tap();
  const frozen = (await snapshot()).state.t;
  await page.waitForTimeout(150);
  assert.equal((await snapshot()).state.t, frozen);
  await page.locator('[data-resume]').tap();
  const resumed = (await snapshot()).state.p.x;
  await page.waitForTimeout(150);
  assert.equal((await snapshot()).state.p.x, resumed);
  const beforeRotate = (await snapshot()).state;
  await page.setViewportSize({ width: 844, height: 390 });
  await pageIs(page, 'play');
  assert.equal((await snapshot()).state.id, beforeRotate.id);
  assert.equal((await snapshot()).state.p.x, beforeRotate.p.x);
  await touchTargets(page, ['#left', '#right', '#jump']);
  right = await center('#right', 1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [right] });
  await page.waitForFunction((x) => window.__wulong.snapshot().state.p.x > x + 5, resumed);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.setViewportSize({ width: 390, height: 844 });
  await pageIs(page, 'play');
  checks.push(
    'Actual CDP multitouch moves and jumps together; releasing jump keeps movement, cancellation and pause release inputs, and orientation changes preserve the puzzle',
  );

  // Complete a touch-only challenge to cover the dedicated result and next page.
  await page.goto(`${base}?dev=1&challenge=21`);
  await page.locator('[data-zone="fan-power"]').tap();
  await page.locator('[data-zone="fan-face"]').tap();
  await page.waitForFunction(() => window.__wulong.snapshot().state.dry === 1);
  right = await center('#right', 1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [right] });
  await page.locator('#game[data-page="result"]').waitFor();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await screenshot(page, '390-result');
  await touchTargets(page, ['#next', '#again', '#share']);
  await page.locator('#again').tap();
  await pageIs(page, 'play');
  assert.equal((await snapshot()).state.won, false);
  await page.locator('#menu').tap();
  await pageIs(page, 'home');
  checks.push(
    'A level completes through touch-only scene actions and movement; result has replay/share/next controls and replay safely returns to play',
  );
  await context.close();
  assert.deepEqual(errors, []);
  await writeFile(new URL('mobile.json', evidence), JSON.stringify({ checks, errors }, null, 2));
  console.log(checks.join('\n'));
} finally {
  await browser.close();
}

import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
const output = fileURLToPath(new URL('./source/', import.meta.url));
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 432, height: 768 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2.5 });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4198/');
  assert.equal(await page.evaluate(() => SmallGamesPublishingConfig.rewardedAdUnitId), '1054324');
  await page.locator('#appearance-button').tap();
  for (let preset = 0; preset < 3; preset++) {
    const card = page.locator(`[data-avatar-role="cop"][data-avatar-preset="${preset}"]`);
    await card.tap();
    assert.equal(await card.getAttribute('aria-pressed'), 'true');
    assert.match(await card.getAttribute('aria-label'), /保安/);
    await page.screenshot({ path: `${output}appearance-${preset}.png`, animations: 'disabled' });
  }
  await page.locator('.appearance-footer [data-close-appearance]').tap();
  await page.reload();
  assert.equal(await page.evaluate(async () => (await import('./src/role-appearance.js')).getRoleAppearance('cop').preset), 2);
  await page.locator('#levels-button').tap();
  await page.screenshot({ path: `${output}level-select.png`, animations: 'disabled' });
  await page.locator('#start-button').tap();
  await page.locator('#pause-button').tap();
  await page.screenshot({ path: `${output}pause.png`, animations: 'disabled' });
  const bars = await page.locator('#i-pause rect').evaluateAll(nodes => nodes.map(node => ['x','y','width','height'].map(key => Number(node.getAttribute(key)))));
  assert.deepEqual(bars, [[6,4,4,16],[14,4,4,16]]);
  await page.locator('#resume-button').tap();
  assert.deepEqual(errors, []);
  console.log('Production ad ID 1054324, three guard selections, saved appearance, level select, pause bars and resume: passed.');
} finally { await browser.close(); }

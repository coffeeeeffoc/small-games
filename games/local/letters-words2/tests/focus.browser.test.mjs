import assert from 'node:assert/strict';
import { chromium, browserOptions, openImport } from './browser-helpers.mjs';

const browser = await chromium.launch(browserOptions);
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:4175');
  await openImport(page);
  const definition = '苹果，表示一种可以食用的水果。' + '补充释义，帮助理解词语在句子中的含义。'.repeat(8);
  await page.locator('#word-input').fill(`apple ${definition}\nforest 森林，${'指大面积的树木和自然环境，供学习者阅读完整含义。'.repeat(8)}`);
  await page.locator('#import-form button[type="submit"]').tap();
  for (const [width, height] of [[320, 568], [360, 640], [390, 844]]) {
    await page.setViewportSize({ width, height });
    const areas = await page.locator('#board,.spelling-area,.board-tools').evaluateAll(nodes => nodes.map(node => ({ name: node.className, top: node.getBoundingClientRect().top, bottom: node.getBoundingClientRect().bottom })));
    for (const area of areas) assert(area.top >= 0 && area.bottom <= height, `${width}x${height} ${JSON.stringify(area)}`);
    const targets = await page.locator('.tile').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width));
    assert(Math.min(...targets) >= 44, `letter targets >=44px at ${width}x${height}`);
    const tile = page.locator('.tile[aria-disabled="false"]').first();
    await tile.tap();
    assert.equal(await page.locator('.answer-slot.filled').count(), 1);
    await page.locator('#meaning-details').tap();
    assert((await page.locator('#full-meaning').textContent()).length > 100);
    await page.locator('#meaning-dialog [data-close]').last().tap();
    assert.equal(await page.locator('.answer-slot.filled').count(), 1);
    await page.locator('#pause-button').tap(); await page.locator('#resume-button').tap();
    assert.equal(await page.locator('.answer-slot.filled').count(), 1);
    await page.locator('#undo-button').tap();
    assert.equal(await page.locator('.answer-slot.filled').count(), 0);
    console.log(`${width}x${height}: visible board/answer/tools, 44px letter targets, full definition and pause preserve selection`, areas);
  }
} finally { await browser.close(); }

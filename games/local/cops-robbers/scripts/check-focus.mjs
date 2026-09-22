import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.BASE_URL || 'http://127.0.0.1:43441';
const browser = await chromium.launch();
const checks = [];
try {
  await mkdir('outputs', { recursive: true });
  const page = await browser.newPage({ hasTouch: true });
  for (const [width, height] of [[390, 844], [320, 568], [844, 390], [667, 375], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await page.goto(`${base}/?level=1&motion=reduce`);
    await page.waitForSelector('#cop-actor-0');
    const layout = await page.evaluate(() => {
      const bounds = selector => {
        const element = document.querySelector(selector), rect = element.getBoundingClientRect();
        return { visible: !!element.getClientRects().length, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom };
      };
      return { board: bounds('#board'), actions: bounds('.action-bar'), brand: bounds('.brand'), briefing: bounds('.briefing'), scrollWidth: document.documentElement.scrollWidth };
    });
    assert.equal(layout.brand.visible, false, 'Branding must leave the playing surface');
    assert.equal(layout.briefing.visible, false, 'Long briefing must leave the playing surface');
    for (const target of [layout.board, layout.actions]) {
      assert.ok(target.y >= 0 && target.bottom <= height, `Core controls outside ${width}x${height}: ${JSON.stringify(layout)}`);
      assert.ok(target.x >= 0 && target.right <= width);
    }
    assert.ok(layout.scrollWidth <= width, 'No horizontal scrolling');
    if (width === 390 || width === 844) await page.screenshot({ path: `outputs/focus-${width}.png` });
    await page.getByTestId('cop-0').click();
    await page.getByTestId('node-1').click();
    await page.waitForFunction(() => document.body.dataset.turn === '1' && document.body.dataset.phase === 'planning');
    await page.getByRole('button', { name: '返回大厅', exact: true }).click();
    assert.ok(await page.locator('.brand').isVisible());
    await page.getByRole('button', { name: '继续围捕', exact: true }).click();
    assert.equal(await page.locator('body').getAttribute('data-turn'), '1', 'Focus changes preserve the patrol');
    await page.getByRole('button', { name: '玩法说明', exact: true }).click();
    await page.getByRole('button', { name: '明白，开始拦截！', exact: true }).click();
    await page.getByTestId('undo').click();
    assert.equal(await page.locator('body').getAttribute('data-turn'), '0', 'Input still works after returning');
    checks.push({ width, height, layout, passed: true });
  }
  await mkdir('outputs', { recursive: true });
  await writeFile('outputs/focus-layout.json', JSON.stringify({ base, checks }, null, 2));
  console.log(`PASS ${checks.length} focused layouts, real move, lobby/resume, rules and undo`);
} finally { await browser.close(); }

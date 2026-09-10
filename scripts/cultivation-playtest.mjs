import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

// Run from the repository root: node scripts/cultivation-playtest.mjs
const server = await createServer({
  root: fileURLToPath(new URL('../apps/shell-web', import.meta.url)),
  server: { host: '127.0.0.1', port: 0 },
  mode: 'pages',
  optimizeDeps: { entries: ['index.html'] },
  logLevel: 'error',
});
await server.listen();
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  await mkdir('.scratch/cultivation', { recursive: true });
  page.setDefaultTimeout(10000);
  async function enter(title, heading = title) {
    await page
      .locator('.catalog-grid article')
      .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
      .getByRole('button', { name: '进入游戏' })
      .click();
    await page.getByRole('heading', { name: heading, exact: true }).waitFor();
  }
  await enter('三分钟修仙');
  assert.equal(await page.locator('.cricket-game').count(), 0);
  assert.equal(await page.locator('.xian-realm strong').textContent(), '炼气');
  await page.screenshot({
    path: '.scratch/cultivation/desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const controls = await page.locator('.cultivation .choices').boundingBox();
    assert.ok(controls.y + controls.height <= 844, 'Choices must fit the first mobile viewport');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: '.scratch/cultivation/mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  for (let step = 0; step < 18; step++) {
    assert.match(
      await page.locator('.xian-eyebrow').textContent(),
      new RegExp(`${String(step + 1).padStart(2, '0')} / 18`),
    );
    await page.locator('.cultivation .choices button').first().focus();
    await page.keyboard.press('Enter');
    if (step < 17) await page.getByRole('button', { name: /继续历练/ }).click();
  }
  await page.getByRole('button', { name: /直接转世/ }).waitFor();
  const score = Number(
    await page.locator('.xian-ending-score').evaluate((node) => node.firstChild.textContent),
  );
  assert.ok(score >= 200);
  assert.equal(
    await page.locator('.xian-record b').textContent(),
    String(80 + Math.floor(score / 3)),
  );
  await page.screenshot({ path: '.scratch/cultivation/ending.png', fullPage: true });
  await page.getByRole('button', { name: /带着福缘转世/ }).click();
  await page.getByText('福缘尚未降临，可直接转世再修一生。', { exact: true }).waitFor();
  await page.getByRole('button', { name: /直接转世/ }).click();
  await page.getByRole('heading', { name: '石缝里的功法' }).waitFor();
  assert.equal(await page.locator('.xian-realm strong').textContent(), '炼气');
  await page.getByRole('button', { name: /返回目录/ }).click();
  await enter('秋声斗蟋');
  assert.equal(await page.locator('.cultivation').count(), 0);
  await page.getByRole('button', { name: '揭盖 · 开斗 →' }).click();
  await page.locator('.cricket-game').press('Space', { delay: 720 });
  assert.ok(Number(await page.locator('[aria-label="对手斗志"]').getAttribute('value')) < 80);
  await page.getByRole('button', { name: /返回目录/ }).click();
  await enter('电子斗蛐蛐', '秋夜斗蛐蛐');
  assert.equal(await page.locator('.cricket-game, .cultivation').count(), 0);
  await page.getByRole('button', { name: /返回目录/ }).click();
  await page.reload();
  await enter('三分钟修仙');
  await page.waitForFunction(
    (value) => document.querySelector('.xian-record')?.textContent.includes(`最佳道行 ${value}`),
    score,
  );
  assert.equal(
    await page.locator('.xian-record b').textContent(),
    String(80 + Math.floor(score / 3)),
  );
  assert.deepEqual(errors, []);
  console.log(
    '18 choices, settlement, free reincarnation, unavailable reward, persisted score, 320/390px layout, keyboard and three distinct catalog games: passed.',
  );
} finally {
  await browser?.close();
  await server.close();
}

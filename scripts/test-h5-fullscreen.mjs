import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const script = await readFile(new URL('../platforms/h5/fullscreen.js', import.meta.url));
const html = (content) => `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><body>${content}<script src="/fullscreen.js"></script></body></html>`;
const game = `<button data-game-fullscreen>全屏</button><button id="play" onclick="this.textContent=Number(this.textContent)+1">0</button><input aria-label="进度"><button id="pause" onclick="document.querySelector('dialog').showModal()">暂停</button><dialog><p>暂停中</p><button onclick="this.closest('dialog').close()">继续</button></dialog>`;
const server = createServer((request, response) => {
  response.setHeader('Content-Type', request.url === '/fullscreen.js' ? 'text/javascript' : 'text/html; charset=utf-8');
  response.end(request.url === '/fullscreen.js' ? script : html(request.url === '/host' ? `<main data-game-display-host><button data-game-fullscreen>全屏</button><iframe src="/game" allow="fullscreen" allowfullscreen style="height:600px;width:100%"></iframe></main>` : game));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const results = [];
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const embedded of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + (embedded ? '/host' : '/game'));
    const gameFrame = embedded ? page.frameLocator('iframe') : page;
    await gameFrame.locator('#play').click();
    await gameFrame.getByRole('textbox').fill('本局进度');
    await gameFrame.getByRole('button', { name: '全屏', exact: true }).click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.tagName)).toBe(embedded ? 'MAIN' : 'HTML');
    await expect(gameFrame.getByRole('button', { name: '退出全屏', exact: true })).toBeVisible();
    await gameFrame.locator('#play').click();
    await gameFrame.locator('#pause').click();
    await gameFrame.locator('dialog [data-game-fullscreen]').click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await gameFrame.getByRole('button', { name: '继续', exact: true }).click();
    await gameFrame.locator('#play').click();
    await expect(gameFrame.locator('#play')).toHaveText('3');
    await expect(gameFrame.getByRole('textbox')).toHaveValue('本局进度');
    await gameFrame.locator('body > [data-game-fullscreen]').click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    // Browser-side exit exercises the same fullscreenchange path as system UI.
    await page.evaluate(() => document.exitFullscreen());
    await expect(gameFrame.locator('body > [data-game-fullscreen]')).toHaveText('全屏');
    await page.setViewportSize({ width: 844, height: 390 });
    await gameFrame.locator('#play').click();
    await expect(gameFrame.locator('#play')).toHaveText('4');
    if (embedded) {
      await page.locator('main > [data-game-fullscreen]').click();
      await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
      await page.locator('main').evaluate(element => element.remove());
      await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    }
    assert.deepEqual(errors, []);
    results.push({ entry: embedded ? 'same-origin iframe host' : 'standalone', browser: await browser.version(), viewport: '390x844 -> 844x390', realDesktopFullscreen: true, progressPreserved: true, modalExit: true });
    await page.close();
  }
  for (const mode of ['unsupported', 'rejected', 'no-event']) {
    const page = await browser.newPage();
    await page.addInitScript((mode) => {
      Object.defineProperty(Element.prototype, 'requestFullscreen', { configurable: true, value: mode === 'unsupported' ? undefined : mode === 'rejected' ? () => Promise.reject(new Error('denied')) : () => undefined });
      Object.defineProperty(Element.prototype, 'webkitRequestFullscreen', { configurable: true, value: undefined });
    }, mode);
    await page.goto(origin + '/game');
    await page.getByRole('button', { name: '全屏', exact: true }).click();
    await expect(page.locator('#game-display-notice')).toContainText(mode === 'unsupported' ? '不支持' : mode === 'rejected' ? '未允许' : '未切换');
    await expect(page.locator('body > [data-game-fullscreen]')).toHaveText('全屏');
    await page.locator('#play').click();
    await expect(page.locator('#play')).toHaveText('1');
    assert.equal(await page.evaluate(() => document.fullscreenElement), null);
    results.push({ branch: mode, simulatedCapability: true, playable: true, noFalseFullscreen: true });
    await page.close();
  }
  const output = new URL('../.scratch/six-games-95/', import.meta.url);
  await mkdir(output, { recursive: true });
  await writeFile(new URL('fullscreen-controller.json', output), JSON.stringify({ date: new Date().toISOString(), physicalMobile: false, results }, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}

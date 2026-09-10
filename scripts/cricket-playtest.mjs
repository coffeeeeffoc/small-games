import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

// Run from the repository root: node scripts/cricket-playtest.mjs
const root = fileURLToPath(new URL('../apps/game-cricket', import.meta.url));
const server = await createServer({
  root,
  server: { host: '127.0.0.1', port: 0 },
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
  await page.addInitScript(() => {
    const NativeAudio = window.AudioContext;
    window.AudioContext = class extends NativeAudio {
      constructor(...args) {
        super(...args);
        window.cricketAudio = this;
      }
      createGain() {
        const gain = super.createGain();
        if (!window.cricketMaster) {
          window.cricketMaster = gain;
          window.cricketAnalyser = this.createAnalyser();
          gain.connect(window.cricketAnalyser);
        }
        return gain;
      }
    };
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  await mkdir('.scratch/cricket', { recursive: true });
  await page.screenshot({ path: '.scratch/cricket/desktop.png', fullPage: true });
  await page.getByRole('button', { name: '揭盖 · 开斗 →' }).click();
  await page.keyboard.down('Space');
  await page.waitForTimeout(720);
  await page.keyboard.up('Space');
  assert.equal(await page.locator('[aria-label="对手斗志"]').getAttribute('value'), '63');
  assert.equal(await page.evaluate(() => window.cricketAudio.state), 'running');
  await page.waitForFunction(() => {
    const data = new Float32Array(window.cricketAnalyser.fftSize);
    window.cricketAnalyser.getFloatTimeDomainData(data);
    return data.some((sample) => Math.abs(sample) > 0.0001);
  });
  await page.getByRole('button', { name: '关闭声音' }).click();
  await page.waitForTimeout(400);
  assert.ok(await page.evaluate(() => window.cricketMaster.gain.value < 0.001));
  await page.getByRole('button', { name: '开启声音' }).click();
  await page.getByRole('button', { name: '暂停对局' }).click();
  const time = await page.locator('.cricket-clock b').textContent();
  await page.waitForTimeout(1100);
  assert.equal(await page.locator('.cricket-clock b').textContent(), time);
  assert.equal(await page.evaluate(() => window.cricketAudio.state), 'suspended');
  await page.getByRole('button', { name: '继续斗蟋' }).click();

  // Real DOM-driven player: react to the visible tell, charge and stamina indicators.
  for (let round = 0; round < 3; round++) {
    const deadline = Date.now() + 70000;
    while ((await page.locator('.cricket-overlay').count()) === 0 && Date.now() < deadline) {
      const reading = await page.evaluate(() => ({
        phase: document.querySelector('.cricket-cue')?.className,
        tell: document.querySelector('.cricket-cue progress')?.value,
        tellMax: document.querySelector('.cricket-cue progress')?.max,
        holding: document.querySelector('.cricket-tease').classList.contains('holding'),
        charge: parseFloat(document.querySelector('.cricket-charge-track i').style.left),
        stamina: document.querySelector('[aria-label="气力"]').value,
      }));
      if (
        reading.phase?.includes('tell') &&
        reading.tellMax - reading.tell < 0.25 &&
        reading.stamina >= 23
      ) {
        await page.keyboard.up('Space');
        await page.keyboard.press('KeyD');
      } else if (reading.holding && reading.charge >= 57) await page.keyboard.up('Space');
      else if (!reading.holding && !reading.phase?.includes('tell') && reading.stamina >= 45) {
        await page.keyboard.up('Space');
        await page.keyboard.down('Space');
      }
      await page.waitForTimeout(35);
    }
    await page.keyboard.up('Space');
    assert.match(
      await page.locator('.cricket-intro h2').textContent(),
      round < 2 ? /漂亮/ : /三擂全胜/,
    );
    console.log(`Browser round ${round + 1}: won`);
    if (round < 2) {
      await page.getByRole('button', { name: '迎战下一擂 →' }).click();
      await page.getByRole('button', { name: '揭盖 · 开斗 →' }).click();
    }
  }
  await page.screenshot({ path: '.scratch/cricket/victory.png', fullPage: true });
  await page.getByRole('button', { name: '重新上擂 →' }).click();
  assert.equal(await page.locator('[aria-label="对手斗志"]').getAttribute('value'), '80');

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const touch = await mobile.newPage();
  await touch.goto(page.url());
  await touch.getByRole('button', { name: '揭盖 · 开斗 →' }).tap();
  const button = await touch.locator('.cricket-tease').boundingBox();
  const cdp = await mobile.newCDPSession(touch);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: button.x + 35, y: button.y + 25 }],
  });
  await touch.waitForTimeout(720);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await touch.locator('[aria-label="对手斗志"]').getAttribute('value'), '63');
  await touch.waitForTimeout(500);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: button.x + 35, y: button.y + 25 }],
  });
  await touch.waitForTimeout(100);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  assert.equal(await touch.locator('.cricket-tease').getAttribute('class'), 'cricket-tease ');
  assert.equal(await touch.locator('[aria-label="对手斗志"]').getAttribute('value'), '63');
  await touch.screenshot({ path: '.scratch/cricket/mobile.png', fullPage: true });
  for (const width of [390, 320]) {
    await touch.setViewportSize({ width, height: 844 });
    assert.ok(await touch.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const bounds = await touch.locator('.cricket-actions').boundingBox();
    assert.ok(bounds.y + bounds.height < 844, 'Primary controls fit the first mobile viewport');
  }
  await touch.evaluate(() => window.dispatchEvent(new Event('blur')));
  await touch.getByRole('heading', { name: '对局已暂停' }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    'Keyboard, 3 wins, replay, actual touch/cancel, audio signal/mute, pause/blur, mobile layout: passed.',
  );
} finally {
  await browser?.close();
  await server.close();
}

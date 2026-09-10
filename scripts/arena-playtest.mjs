import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

// Start game-arena on port 43117 first, or set ARENA_URL to a built preview.
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.arenaAudio = [];
    const Audio = window.Audio;
    window.Audio = function (...args) {
      const sound = new Audio(...args);
      window.arenaAudio.push(sound);
      return sound;
    };
  });
  await page.clock.install({ time: new Date('2026-09-10T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-09-10T12:00:01Z'));
  await page.goto(process.env.ARENA_URL ?? 'http://localhost:43117');
  await page.locator('.arena-picks button').first().waitFor();
  await page.clock.runFor(100);
  await mkdir('.tmp/arena', { recursive: true });
  await page.screenshot({ path: '.tmp/arena/desktop.png', fullPage: true });
  const start = async () => {
    await page.locator('.arena-picks button').last().click();
    for (let i = 0; i < 2; i++) await page.locator('.arena-traits button').first().click();
    await page.locator('.arena-ready button').click();
  };
  await start();
  const enemyHp = () => page.getByLabel('对手斗志', { exact: true }).evaluate((el) => el.value);
  const before = await enemyHp();
  const tease = page.locator('.arena-tease');
  await tease.focus();
  await page.keyboard.down('Space');
  await page.clock.runFor(650);
  assert.equal(await enemyHp(), before, 'charging must not deal damage');
  await page.keyboard.up('Space');
  assert.ok((await enemyHp()) < before, 'release must cause a real hit');
  assert.ok(
    await page.evaluate(() => window.arenaAudio.some((a) => !a.paused)),
    'user input unlocks audio',
  );
  await page.getByRole('button', { name: '关闭声音', exact: true }).click();
  assert.ok(await page.evaluate(() => window.arenaAudio.every((a) => a.paused)));
  await page.getByRole('button', { name: '开启声音', exact: true }).click();

  // Dodge through the actual key binding while a button still has focus.
  for (let i = 0; i < 25 && (await page.locator('.arena-warning').count()) === 0; i++)
    await page.clock.runFor(100);
  assert.equal(await page.locator('.arena-warning').count(), 1);
  await page.clock.runFor(300);
  await page.keyboard.press('KeyA');
  await page.clock.runFor(400);
  assert.match(await page.locator('.arena-comment').innerText(), /漂亮/);

  // A suspended hold must not attack on return, and background time cannot advance combat.
  await page.clock.runFor(700);
  await tease.focus();
  await page.keyboard.down('Space');
  await page.clock.runFor(150);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const clock = await page.locator('.arena-clock').innerText();
  const pausedHp = await enemyHp();
  await page.clock.runFor(5000);
  assert.equal(await page.locator('.arena-clock').innerText(), clock);
  assert.ok(await page.evaluate(() => window.arenaAudio.every((a) => a.paused)));
  await page.keyboard.up('Space');
  await page.getByRole('button', { name: '准备好了，继续' }).click();
  assert.equal(await tease.getAttribute('aria-pressed'), 'false');
  assert.equal(await enemyHp(), pausedHp);

  for (let i = 0; i < 10 && (await tease.count()); i++) {
    await page.clock.runFor(700);
    await tease.focus();
    await page.keyboard.down('Space');
    await page.clock.runFor(500);
    await page.keyboard.up('Space');
    await page.clock.runFor(50);
  }
  assert.match(await page.locator('.arena-result').innerText(), /你赢了/);
  assert.match(await page.locator('.arena-footer').innerText(), /胜场 1/);
  await page.reload();
  await page.locator('.arena-picks button').first().waitFor();
  assert.match(await page.locator('.arena-footer').innerText(), /胜场 1/);

  await page.setViewportSize({ width: 390, height: 844 });
  await start();
  const cdp = await page.context().newCDPSession(page);
  const box = await tease.boundingBox();
  const touch = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
  const touchHp = await enemyHp();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] });
  await page.clock.runFor(500);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  assert.equal(await tease.getAttribute('aria-pressed'), 'false');
  assert.equal(await enemyHp(), touchHp, 'touch cancellation must not release an attack');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] });
  await page.clock.runFor(500);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ ...touch, x: 5, y: 20 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.ok((await enemyHp()) < touchHp, 'pointer capture must release even outside the button');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.clock.runFor(100);
    const layout = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      controls: document.querySelector('.arena-actions').getBoundingClientRect().bottom,
    }));
    assert.ok(layout.width <= width, 'no horizontal overflow');
    assert.ok(layout.controls < 844, 'controls remain in the first viewport');
    await page.screenshot({ path: `.tmp/arena/mobile-${width}.png`, fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log(
    'Arena: keyboard, real touch/cancel/capture, damage, dodge, sound/mute, pause, victory, persisted rewards and 390/320px layouts passed.',
  );
} finally {
  await browser.close();
}

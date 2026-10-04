import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const developerUrl = new URL(process.env.MAZE_URL || 'http://127.0.0.1:4437');
developerUrl.searchParams.set('dev', '1');
const url = developerUrl.href;
const out = fileURLToPath(new URL('../docs/evidence/', import.meta.url));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [],
  results = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
page.on('pageerror', (e) => errors.push(e.message));
const snapshot = () => page.evaluate(() => window.mazeDebug.snapshot());
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
let mx = 600,
  my = 400;
async function look(yaw) {
  await page.mouse.move(mx, my);
  for (let i = 0; i < 4; i++) {
    const s = await snapshot(),
      delta = Math.atan2(Math.sin(yaw - s.run.yaw), Math.cos(yaw - s.run.yaw));
    if (Math.abs(delta) < 0.015 && Math.abs(s.run.pitch) < 0.015) break;
    mx -= delta / 0.0024;
    my += s.run.pitch / 0.0024;
    await page.mouse.move(mx, my);
    await page.waitForTimeout(35);
  }
}
async function walk(x, z) {
  for (let i = 0; i < 90; i++) {
    const s = (await snapshot()).run,
      distance = Math.hypot(x - s.x, z - s.z);
    if (distance < 0.16) return;
    await look(Math.atan2(-(x - s.x), -(z - s.z)));
    await page.keyboard.down('w');
    await page.waitForTimeout(Math.min(180, (distance / 3.3) * 1000));
    await page.keyboard.up('w');
  }
  throw new Error(`Could not walk to ${x},${z}: ${JSON.stringify(await snapshot())}`);
}
try {
  await page.goto(url);
  await page.waitForFunction(() => window.mazeDebug && window.mazeDebug.snapshot().metrics);
  await shot('01-home');
  await page.locator('#start').click();
  await page.getByRole('button', { name: /A · 无地图探索/ }).click();
  await page.locator('#enter').click();
  await page.waitForFunction(() => window.mazeDebug.snapshot().screen === 'playing');
  assert.equal(await page.locator('.fog-map').count(), 0);
  await page.keyboard.press('h');
  assert.equal((await snapshot()).run.tutorialDismissed, true);
  await walk(1.45, 9.35);
  await look(Math.atan2(-(2.87 - 1.45), -(9.52 - 9.35)));
  await page.keyboard.press('q');
  await page.getByRole('button', { name: /方向箭头 我选择的方向/ }).click();
  await page.waitForFunction(() => window.mazeDebug.snapshot().screen === 'playing');
  assert.equal(Object.keys((await snapshot()).run.marks).length, 1);
  await page.keyboard.press('m');
  assert.equal((await snapshot()).screen, 'map-confirm');
  await page.getByRole('button', { name: '确认查看，转为 B' }).click();
  assert.equal((await snapshot()).run.mode, 'B');
  const paused = (await snapshot()).run.seconds;
  await page.waitForTimeout(200);
  assert.equal((await snapshot()).run.seconds, paused);
  await shot('02-discovered-map');
  await page.getByRole('button', { name: '收起地图，继续探索' }).click();
  await walk(0, 8);
  await walk(8, 8);
  await shot('03-first-person-home');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.mazeDebug.snapshot().screen === 'pause');
  const saved = (await snapshot()).run;
  await page.reload();
  await page.waitForFunction(() => window.mazeDebug);
  await page.locator('#continue').click();
  const restored = (await snapshot()).run;
  for (const key of ['x', 'z', 'yaw', 'marks', 'visited', 'walked'])
    assert.deepEqual(restored[key], saved[key], key);
  await page.locator('#resume').click();
  mx = 600;
  my = 400;
  await walk(16, 8);
  await walk(16, 16);
  await walk(16, 25.2);
  await look(Math.PI);
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.mazeDebug.snapshot().screen === 'result');
  await shot('04-result');
  assert.equal((await snapshot()).unlocked, 2);
  results.push({
    check: 'native desktop movement/turn, mark, A-to-B, pause, save reload, real exit settlement',
    passed: true,
  });
  assert.deepEqual(errors, []);
} finally {
  await writeFile(
    `${out}/browser-report.json`,
    JSON.stringify(
      {
        date: new Date().toISOString(),
        environment: {
          browser: browser.version(),
          viewport: '1440x900',
          mode: 'headless Chromium',
        },
        results,
        errors,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
console.log(JSON.stringify({ results, errors }));

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { acceptanceBuild, snapshot, assertLayout } from './flight-browser.mjs';

const base = process.env.NIGHT_URL;
const build = await acceptanceBuild(base);
const dir = new URL('../reports/review-20261011/', import.meta.url);
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
const results = [], errors = [];
try {
  for (const [width, height] of [[568, 320], [844, 390], [390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: true, isMobile: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36' });
    page.on('pageerror', error => errors.push(error.message));
    const capture = name => page.screenshot({ path: fileURLToPath(new URL(`${width}-${name}.png`, dir)) });
    const point = (x, y) => page.evaluate(({ x, y }) => {
      const r = document.querySelector('canvas').getBoundingClientRect(), s = __night.snapshot();
      const rotated = new DOMMatrix(getComputedStyle(document.getElementById('GameDiv')).transform).b > .5;
      return rotated ? { x: r.left + r.width - y * r.width / s.ui.height, y: r.top + x * r.height / s.ui.width }
        : { x: r.left + x * r.width / s.ui.width, y: r.top + y * r.height / s.ui.height };
    }, { x, y });
    const press = async id => {
      const s = await snapshot(page), b = s.buttons.find(button => button.id === id);
      assert(b, `visible ${id}`);
      const p = await point(b.x + b.w / 2, b.y + b.h / 2);
      await page.touchscreen.tap(p.x, p.y); await page.waitForTimeout(100);
    };
    const layout = async () => { const s = await snapshot(page); assertLayout(s, s.ui.width, s.ui.height); };
    await page.goto(base);
    await page.waitForFunction(() => globalThis.__night && !document.getElementById('night-startup') && __night.snapshot().modal === 'home' && __night.snapshot().ui.width > __night.snapshot().ui.height);
    await layout(); await capture('home');
    await press('missions'); await layout(); await capture('missions');
    if ((await snapshot(page)).buttons.some(button => button.id === 'missionsNext')) {
      await press('missionsNext'); await layout(); await capture('missions-locked');
      const locked = (await snapshot(page)).buttons.find(button => button.id === 'mission:operation-004');
      assert(locked, 'second page exposes task 004');
      await press(locked.id); assert.equal((await snapshot(page)).mission.id, 'corridor-01', 'locked card cannot change the mission');
      await press('missionsPrevious'); assert.equal((await snapshot(page)).missionPage, 0);
    }
    const missionCards = (await snapshot(page)).buttons.filter(b => b.id.startsWith('mission:'));
    assert.equal(missionCards.length, 3, 'selector renders a bounded row of three cards');
    for (const card of missionCards) assert(card.w >= 44 && card.h >= 44);
    await press('training'); await press('start'); await layout(); await capture('battle');
    await press('pause'); const frozen = (await snapshot(page)).time;
    await page.waitForTimeout(250); assert.equal((await snapshot(page)).time, frozen);
    await layout(); await capture('pause'); await press('settings'); await layout(); await capture('settings');
    await press('help'); await layout(); await press('close'); await press('close');
    assert.equal((await snapshot(page)).modal, 'pause');
    assert.equal((await snapshot(page)).time, frozen, 'fullscreen preserves paused battle');
    await press('resume'); await press('weapon0');
    const fire = (await snapshot(page)).buttons.find(b => b.id === 'fire');
    const p = await point(fire.x + fire.w / 2, fire.y + fire.h / 2);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 1 }] });
    await page.waitForTimeout(180);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    const fired = (await snapshot(page)).fired;
    await page.waitForTimeout(250); assert.equal((await snapshot(page)).fired, fired);
    assert.deepEqual((await snapshot(page)).held, []);
    await press('pause'); await press('home'); assert.equal((await snapshot(page)).modal, 'home');
    results.push({ width, height, missionCards: missionCards.map(b => b.id), pauseFullscreenAndCancellation: 'passed' });
    await page.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await acceptanceBuild(base);
  await writeFile(new URL('verification.json', dir), JSON.stringify({ build, environment: 'Chromium Linux; CDP touch emulation, not physical phone', results, errors }, null, 2));
}

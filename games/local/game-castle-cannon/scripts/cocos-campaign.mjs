/* global window */
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createDuelServer } from '../server-dist/duel-service.js';
import { previewTrajectory } from '../assets/scripts/core/core.js';
const root = fileURLToPath(new URL('../', import.meta.url)),
  out = path.join(root, 'reports/cocos-campaign');
await mkdir(out, { recursive: true });
const service = createDuelServer({ staticRoot: path.join(root, 'dist') });
await new Promise((r) => service.server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  ...(process.env.CASTLE_RECORD
    ? { recordVideo: { dir: path.join(out, 'video'), size: { width: 390, height: 844 } } }
    : {}),
});
const page = await context.newPage(),
  cdp = await context.newCDPSession(page),
  events = [],
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const read = () => page.evaluate(() => window.__castle?.snapshot());
async function point(x, y) {
  const s = await read(),
    b = await page.locator('#GameCanvas').boundingBox(),
    k = Math.min(b.width / s.width, b.height / s.height);
  return {
    x: b.x + (b.width - s.width * k) / 2 + x * k,
    y: b.y + (b.height - s.height * k) / 2 + y * k,
  };
}
async function click(id) {
  const s = await read(),
    c = s.controls.find((c) => c.id === id && !c.disabled);
  if (!c) throw Error('Missing ' + id + ' on ' + s.screen);
  const p = await point(c.x + c.w / 2, c.y + c.h / 2);
  await page.touchscreen.tap(p.x, p.y);
}
async function aim(pitch, yaw) {
  const s = await read(),
    g = s.fighters[0].guns[0],
    a = await point(180, s.height / 2),
    b = await point(180 - (yaw - g.yaw) / 0.09, s.height / 2 - (pitch - g.pitch) / 0.15);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [b] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function fire(power) {
  const s = await read(),
    c = s.controls.find((c) => c.id === 'fire' && !c.disabled),
    p = await point(c.x + c.w / 2, c.y + c.h / 2);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
  await expect
    .poll(
      async () => {
        const s = await read(),
          charge = s.fighters[0].guns[0].charge;
        return charge === null ? 0 : (s.duelTime - charge) / 1.8;
      },
      { timeout: 10000, intervals: [30] },
    )
    .toBeGreaterThanOrEqual(power);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
try {
  await page.goto(`http://127.0.0.1:${service.server.address().port}/play/?dev=0`);
  await expect.poll(async () => (await read())?.ready, { timeout: 60000 }).toBe(true);
  await click('settings');
  await click('lowPower');
  await click('home');
  await click('campaign');
  await click('selected-start');
  await click('blast');
  for (let shot = 0; shot < 12; shot++) {
    await expect
      .poll(
        async () => {
          const s = await read();
          return s.screen === 'result' || s.controls.some((c) => c.id === 'fire' && !c.disabled);
        },
        { timeout: 15000 },
      )
      .toBe(true);
    const s = await read();
    if (s.screen === 'result') break;
    const g = s.fighters[0].guns[0],
      target = s.fighters[1].position,
      duel = { time: s.duelTime, fighters: s.fighters, structures: s.structures };
    const yaw = Math.max(
      -16,
      Math.min(16, (-Math.atan2(target.z - g.position.z, target.x - g.position.x) * 180) / Math.PI),
    );
    let best = { score: Infinity };
    // Full charge keeps the input test stable on software-rendered CI machines.
    for (let pitch = 10; pitch <= 72; pitch += 0.2) {
      const power = 1;
      const preview = previewTrajectory(duel, 0, { ...g, pitch, yaw, charge: null }, power),
        p = preview.impact;
      if (!p) continue;
      const score = Math.hypot(p.x - target.x, p.y - target.y - 1, p.z - target.z);
      if (score < best.score) best = { score, pitch, power, yaw, impact: p, hit: preview.hit };
    }
    await aim(best.pitch, best.yaw);
    await page.screenshot({ path: path.join(out, 'aim-390x844.png') });
    await fire(Math.min(1, best.power));
    await expect
      .poll(async () => (await read()).shells.filter((s) => s.side === 0).length, {
        timeout: 15000,
      })
      .toBe(0);
    const after = await read();
    events.push({
      shot,
      aim: best,
      time: after.duelTime,
      hp: after.fighters.map((p) => p.hp),
      lastShot: after.fighters[0].lastShot,
      gun: after.fighters[0].guns[0],
      result: after.result,
    });
    await page.screenshot({ path: path.join(out, `shot-${shot}-390x844.png`) });
  }
  const result = await read();
  await page.screenshot({ path: path.join(out, 'result-390x844.png') });
  if (result.result?.winner !== 0)
    throw Error('Campaign did not win: ' + JSON.stringify(result.result));
  const cleared = result.progress.cleared.length;
  await click('campaign-next');
  await expect.poll(async () => (await read()).campaignLevel).toBe(1);
  await click('leave');
  await click('leave-confirm');
  await page.reload();
  await expect.poll(async () => (await read())?.ready, { timeout: 60000 }).toBe(true);
  expect((await read()).progress.cleared.length).toBe(cleared);
  expect((await read()).progress.unlocked).toBe(1);
  await page.screenshot({ path: path.join(out, 'saved-home-390x844.png') });
  events.push({ saved: true, cleared, unlocked: 1 });
  await click('practice');
  await click('map-ravine');
  await expect
    .poll(async () => (await read()).screen, { timeout: 240000, intervals: [1000] })
    .toBe('result');
  await page.screenshot({ path: path.join(out, 'defeat-390x844.png') });
  expect((await read()).result.winner).toBe(1);
  await click('rematch');
  await expect.poll(async () => (await read()).screen).toBe('playing');
  expect((await read()).fighters[0].hp).toBeGreaterThan(90);
  events.push({ defeatAndRetry: true });
  expect(errors).toEqual([]);
  console.log('Creator campaign win, next level, saved progress, defeat and retry passed.');
} catch (error) {
  events.push({ failure: error.message, state: await read() });
  await page.screenshot({ path: path.join(out, 'failure-390x844.png') });
  throw error;
} finally {
  await writeFile(path.join(out, 'report.json'), JSON.stringify({ events, errors }, null, 2));
  await cdp.detach();
  await context.close();
  await browser.close();
  await service.stop();
}

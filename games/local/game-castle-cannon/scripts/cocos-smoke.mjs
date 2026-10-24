/* global window, DOMMatrix, getComputedStyle */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium, expect as baseExpect } from '@playwright/test';
import { createDuelServer } from '../server-dist/duel-service.js';

const expect = baseExpect.configure({ timeout: 20000 });
const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.resolve(root, process.env.CASTLE_EVIDENCE_DIR || 'reports/cocos-smoke');
await mkdir(out, { recursive: true });
const service = createDuelServer({ staticRoot: path.join(root, 'dist') });
await new Promise((resolve) => service.server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  args: ['--enable-unsafe-swiftshader'],
});
const records = [],
  errors = [],
  warnings = [];
try {
  for (const [width, height] of [
    [390, 844],
    [320, 568],
    [844, 390],
    [1280, 720],
  ]) {
    const mobile = width !== 1280;
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: mobile,
      isMobile: mobile,
      ...(mobile
        ? {
            userAgent:
              'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36',
          }
        : {}),
      ...(process.env.CASTLE_RECORD && width === 390
        ? { recordVideo: { dir: path.join(out, 'video'), size: { width, height } } }
        : {}),
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`${width}x${height}: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') {
        // Creator calls preventDefault on Chromium's non-cancelable synthetic touchcancel.
        const target = m
          .text()
          .startsWith('Ignored attempt to cancel a touchcancel event with cancelable=false')
          ? warnings
          : errors;
        target.push(`${width}x${height}: ${m.text()}`);
      }
    });
    const read = () => page.evaluate(() => window.__castle?.snapshot());
    const screen = (name) => expect.poll(async () => (await read())?.screen).toBe(name);
    async function point(x, y) {
      const s = await read(),
        box = await page.locator('#GameCanvas').boundingBox();
      const rotated = await page
        .locator('#GameDiv')
        .evaluate((n) => Math.abs(new DOMMatrix(getComputedStyle(n).transform).b) > 0.5);
      const w = rotated ? box.height : box.width,
        h = rotated ? box.width : box.height;
      const scale = Math.min(w / s.width, h / s.height);
      const px = (w - s.width * scale) / 2 + x * scale,
        py = (h - s.height * scale) / 2 + y * scale;
      return rotated
        ? { x: box.x + box.width - py, y: box.y + px }
        : { x: box.x + px, y: box.y + py };
    }
    async function control(id) {
      const s = await read(),
        c = s.controls.find((c) => c.id === id);
      assert(c && !c.disabled, `Unavailable control ${id} on ${s.screen}`);
      assert(
        c.x >= 0 && c.y >= 0 && c.x + c.w <= s.width + 1 && c.y + c.h <= s.height + 1,
        `Clipped control ${id}`,
      );
      return point(c.x + c.w / 2, c.y + c.h / 2);
    }
    async function click(id) {
      const p = await control(id);
      if (mobile) await page.touchscreen.tap(p.x, p.y);
      else await page.mouse.click(p.x, p.y);
    }
    const shot = async (cancel = false) => {
      const p = await control('fire');
      const charged = () =>
        expect
          .poll(async () => {
            const s = await read(),
              charge = s.fighters[0].guns[0].charge;
            return charge === null ? 0 : (s.duelTime - charge) / 1.8;
          })
          .toBeGreaterThan(0.3);
      if (mobile) {
        const touch = await context.newCDPSession(page);
        try {
          await touch.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [{ ...p, id: 1 }],
          });
          await expect.poll(async () => (await read()).fighters[0].guns[0].charge).not.toBeNull();
          await charged();
          await touch.send('Input.dispatchTouchEvent', {
            type: cancel ? 'touchCancel' : 'touchEnd',
            touchPoints: [],
          });
        } finally {
          await touch.detach();
        }
      } else {
        await page.mouse.move(p.x, p.y);
        await page.mouse.down();
        try {
          await charged();
        } finally {
          await page.mouse.up();
        }
      }
    };
    try {
      await page.goto(`http://127.0.0.1:${service.server.address().port}/play/?dev=0`);
      await expect.poll(async () => (await read())?.ready, { timeout: 90000 }).toBe(true);
      await screen('home');
      const initial = await read();
      assert.equal(initial.renderer, 'cocos');
      assert(initial.assets.meshes > 50 && initial.assets.textures > 2);
      assert(!initial.controls.some((c) => ['pause', 'fullscreen'].includes(c.id)));
      assert.equal(await page.locator('button').filter({ hasText: /全屏/ }).count(), 0);
      await page.screenshot({ path: path.join(out, `home-${width}x${height}.png`) });
      for (const menu of ['settings', 'help', 'skins']) {
        await click(menu);
        await screen(menu);
        await page.screenshot({ path: path.join(out, `${menu}-${width}x${height}.png`) });
        await click('home');
        await screen('home');
      }
      await click('campaign');
      await screen('campaign');
      await page.screenshot({ path: path.join(out, `campaign-${width}x${height}.png`) });
      await click('selected-start');
      await screen('playing');
      await expect.poll(async () => (await read()).trajectory.points.length).toBeGreaterThan(3);
      const before = await read(),
        aim = await point(180, before.height / 2),
        end = await point(192, before.height / 2 - 30);
      if (mobile) {
        const touch = await context.newCDPSession(page);
        try {
          await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [aim] });
          await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [end] });
          await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } finally {
          await touch.detach();
        }
      } else {
        await page.mouse.move(aim.x, aim.y);
        await page.mouse.down();
        await page.mouse.move(end.x, end.y, { steps: 5 });
        await page.mouse.up();
      }
      await expect
        .poll(async () => (await read()).fighters[0].guns[0].pitch)
        .toBeGreaterThan(before.fighters[0].guns[0].pitch);
      await page.screenshot({ path: path.join(out, `battle-${width}x${height}.png`) });
      if (mobile) {
        await shot(true);
        assert.equal((await read()).fighters[0].lastShot, null);
      }
      await shot();
      await expect
        .poll(async () => (await read()).fighters[0].lastShot?.power ?? 0)
        .toBeGreaterThan(0.15);
      await click('scope');
      await expect.poll(async () => (await read()).scope).toBe(true);
      await click('scope');
      await click('leave');
      await screen('confirm');
      const time = (await read()).duelTime;
      await page.waitForTimeout(350);
      assert.equal((await read()).duelTime, time);
      await page.screenshot({ path: path.join(out, `exit-${width}x${height}.png`) });
      await click('resume');
      await screen('playing');
      await expect.poll(async () => (await read()).duelTime).toBeGreaterThan(time);
      await click('leave');
      await click('leave-confirm');
      await screen('home');
      await click('practice');
      await screen('maps');
      await click('map-ravine');
      await screen('playing');
      await click('leave');
      await click('leave-confirm');
      await screen('home');
      records.push({
        width,
        height,
        renderer: initial.renderer,
        assets: initial.assets,
        controls:
          'menus, campaign, aim, trajectory, charge, cancellation, scope, back, resume, practice',
      });
      console.log(`Creator interaction passed: ${width}x${height}`);
    } catch (e) {
      await page.screenshot({ path: path.join(out, `failure-${width}x${height}.png`) });
      throw e;
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await writeFile(
    path.join(out, 'report.json'),
    JSON.stringify({ records, errors, warnings }, null, 2),
  );
  await browser.close();
  await service.stop();
}

await import('./cocos-campaign.mjs');

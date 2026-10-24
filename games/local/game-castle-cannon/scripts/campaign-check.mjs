/* global window, localStorage, HTMLCanvasElement */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { playCampaign } from './campaign-touch-play.mjs';
import { createDuelServer } from '../server-dist/duel-service.js';

const root = fileURLToPath(new URL('../', import.meta.url)),
  out = path.resolve(
    root,
    process.env.CAMPAIGN_EVIDENCE_DIR ?? 'docs/design/review-2026-10-11/actual',
  ),
  service = createDuelServer({ staticRoot: path.join(root, 'dist') });
await mkdir(out, { recursive: true });
await new Promise((resolve) => service.server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${service.server.address().port}`,
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? '/usr/bin/chromium',
  }),
  errors = [],
  records = [];
async function check(name, viewport, iframe = false, late = false, win = false) {
  const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true }),
    page = await context.newPage();
  if (win)
    await context.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        return kind === 'webgl' || kind === 'webgl2' ? null : original.call(this, kind, ...args);
      };
    });
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  if (!late)
    await context.addInitScript(() => {
      const key = 'small-games:castle-cannon:progress';
      if (!localStorage.getItem(key))
        localStorage.setItem(
          key,
          JSON.stringify({
            version: '1',
            value: {
              version: 1,
              cleared: [],
              bonus: [],
              materials: 0,
              owned: [0],
              skin: 0,
              sound: false,
              motion: true,
              lowPower: true,
            },
          }),
        );
    });
  if (late)
    await context.addInitScript(() => {
      const cleared = [
        'grass-v1',
        'twins-v1',
        'ridge-v1',
        ...Array.from(
          { length: 116 },
          (_, i) => `duel-campaign-${String(i + 4).padStart(3, '0')}-v1`,
        ),
      ];
      localStorage.setItem(
        'small-games:castle-cannon:progress',
        JSON.stringify({
          version: '1',
          value: {
            version: 1,
            cleared,
            bonus: [],
            materials: 600,
            owned: [0],
            skin: 0,
            sound: false,
            motion: true,
            lowPower: true,
          },
        }),
      );
    });
  if (iframe)
    await page.route('**/fixture', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}iframe{width:100vw;height:100vh;border:0}</style><iframe allow="fullscreen" sandbox="allow-scripts allow-same-origin allow-forms" src="/play/?dev=0"></iframe>',
      }),
    );
  try {
    await page.goto(`${base}/${iframe ? 'fixture' : 'play/?dev=0'}`);
    const frame = iframe ? page.frames().find((f) => f !== page.mainFrame()) : page.mainFrame(),
      game = frame.locator('.castle-root'),
      tap = (id) => frame.locator(`[data-action="${id}"]`).tap(),
      state = async () => JSON.parse(await frame.locator('#battle').getAttribute('data-renderer')),
      screen = (s) => expect(game).toHaveAttribute('data-screen', s);
    await expect(game).toHaveAttribute('data-ready', 'true');
    console.log('Campaign check ready:', name);
    await tap('campaign');
    await screen('campaign');
    console.log('Campaign menu:', name);
    await expect(frame.locator(`[data-action="campaign-level:${late ? 119 : 0}"]`)).toBeEnabled();
    if (!late) {
      await expect(frame.locator('[data-action="campaign-level:1"]')).toBeDisabled();
      await tap('chapter-next');
      await expect(frame.locator('[data-action="campaign-level:10"]')).toBeDisabled();
      await tap('chapter-prev');
    }
    if (name === 'portrait')
      await page.screenshot({ path: path.join(out, 'portrait-campaign.png') });
    await tap('campaign-continue');
    await screen('playing');
    assert.equal((await state()).campaignLevel, late ? 119 : 0);
    if (late) {
      assert.equal((await state()).fighters[1].hp, 97);
      assert.equal((await state()).fighters[1].medicines, 2);
      await page.screenshot({ path: path.join(out, 'landscape-stage-120.png') });
    }
    const cdp = await context.newCDPSession(page),
      point = async (x, y) => {
        const rect = await frame.locator('#battle').boundingBox(),
          rotated = (await game.getAttribute('data-rotated')) === 'true';
        return rotated
          ? { x: rect.x + rect.width * (1 - y / 540), y: rect.y + (rect.height * x) / 960 }
          : { x: rect.x + (rect.width * x) / 960, y: rect.y + (rect.height * y) / 540 };
      },
      touch = async (type, points) =>
        cdp.send('Input.dispatchTouchEvent', {
          type,
          touchPoints: points.map((p, id) => ({ ...p, id: id + 1 })),
        });
    const fire = await point(850, 460);
    await touch('touchStart', [fire]);
    await page.waitForTimeout(150);
    await touch('touchCancel', []);
    await expect
      .poll(async () => {
        const fighter = (await state()).fighters[0];
        return fighter.guns.find((g) => g.id === fighter.station)?.charge;
      })
      .toBeNull();
    assert.equal((await state()).fighters[0].lastShot, null);
    await tap('pause');
    await screen('paused');
    const tick = (await state()).tick;
    await frame.evaluate(() => {
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new Event('focus'));
    });
    await page.waitForTimeout(150);
    await screen('paused');
    assert.equal((await state()).tick, tick);
    await tap('help');
    await tap('back');
    await screen('paused');
    await tap('resume');
    await screen('playing');
    if (win) await playCampaign({ page, game, tap, state, screen, touch, point, fire, out });
    else await tap('pause');
    await tap('leave');
    await tap('leave-confirm');
    await screen('home');
    if (win) {
      await page.reload();
      await expect(game).toHaveAttribute('data-ready', 'true');
      assert.equal((await state()).unlocked, 1);
      await tap('campaign');
      await expect(frame.locator('[data-action="campaign-level:1"]')).toBeEnabled();
      await expect(frame.locator('[data-action="campaign-level:2"]')).toBeDisabled();
    }
    records.push({
      name,
      viewport,
      iframe,
      late,
      renderer: win ? 'official Canvas fallback' : '3D low-power mode',
      checks: [
        'normal progress/page locks',
        'touch continue',
        'cancel charge without firing',
        'manual pause survives focus',
        'help/back',
        'leave confirmation',
        ...(win ? ['real touch-aim victory', 'next stage', 'saved reload/unlocks'] : []),
      ],
    });
    await cdp.detach();
  } finally {
    await context.close();
  }
}
try {
  await check('portrait-canvas', { width: 390, height: 844 }, false, false, true);
  await check('portrait', { width: 390, height: 844 });
  await check('small-iframe', { width: 568, height: 320 }, true);
  await check('late-landscape', { width: 844, height: 390 }, false, true);
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(out, 'verification.json'),
    JSON.stringify(
      {
        environment: 'Production Chromium, mobile viewport + CDP touch; not physical devices',
        records,
        errors,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`120 关战役手机浏览器验证通过：${records.length} 组`);
} finally {
  await browser.close();
  service.stop();
}

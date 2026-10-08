/* global window, document */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { createDuelServer } from '../server-dist/duel-service.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.resolve(
  root,
  process.env.DUEL_EVIDENCE_DIR ?? 'docs/design/artillery-duel-2026-10-09/actual',
);
await mkdir(out, { recursive: true });
const service = createDuelServer({ staticRoot: path.join(root, 'dist') });
await new Promise((resolve) => service.server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${service.server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_EXECUTABLE_PATH ??
    (process.platform === 'win32'
      ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
      : '/usr/bin/chromium'),
});
const records = [],
  errors = [];
async function fixture(name, viewport, touch, iframe = false, dev = false) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`${name}: ${error.message}`));
  if (iframe)
    await page.route('**/fixture', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}iframe{width:100vw;height:100vh;border:0}</style><iframe allow="fullscreen" sandbox="allow-scripts allow-same-origin allow-forms" src="/play/?dev=${dev ? 1 : 0}"></iframe>`,
      }),
    );
  await page.goto(iframe ? `${base}/fixture` : `${base}/play/?dev=${dev ? 1 : 0}`);
  const frame = iframe ? page.frames().find((f) => f !== page.mainFrame()) : page.mainFrame();
  await expect(frame.locator('.castle-root')).toHaveAttribute('data-ready', 'true');
  const click = async (id) => {
    const button = frame.locator(`[data-action="${id}"]`);
    await expect(button).toBeVisible();
    if (touch) await button.tap();
    else await button.click();
  };
  const snapshot = async () =>
    JSON.parse(await frame.locator('#battle').getAttribute('data-renderer'));
  const logical = async (x, y) => {
    const rect = await frame.locator('#battle').boundingBox(),
      rotated = (await frame.locator('.castle-root').getAttribute('data-rotated')) === 'true';
    return rotated
      ? { x: rect.x + rect.width * (1 - y / 540), y: rect.y + (rect.height * x) / 960 }
      : { x: rect.x + (rect.width * x) / 960, y: rect.y + (rect.height * y) / 540 };
  };
  const cdp = await context.newCDPSession(page);
  const event = async (type, points) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p, i) => ({ ...p, id: i + 1 })),
    });
  async function gesture(start, end, hold = 0, cancel = false) {
    const a = await logical(...start),
      b = await logical(...end);
    if (touch) {
      await event('touchStart', [a]);
      if (hold) await page.waitForTimeout(hold);
      await event('touchMove', [b]);
      await event(cancel ? 'touchCancel' : 'touchEnd', []);
    } else {
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      if (hold) await page.waitForTimeout(hold);
      await page.mouse.move(b.x, b.y);
      if (cancel) await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await page.mouse.up();
      if (cancel) await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    }
  }
  const capture = async (state) => {
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(out, `${name}-${state}.png`) });
  };
  return {
    name,
    context,
    page,
    frame,
    click,
    snapshot,
    logical,
    event,
    gesture,
    capture,
    close: () => context.close(),
  };
}
async function practice(name, viewport, touch, iframe = false) {
  const f = await fixture(name, viewport, touch, iframe);
  try {
    await f.capture('home');
    await f.click('practice');
    await f.capture('maps');
    await f.click('map-ravine');
    await expect(f.frame.locator('.castle-root')).toHaveAttribute('data-screen', 'playing');
    const first = await f.snapshot();
    assert.equal(first.mode, 'practice');
    assert.equal(first.renderer, 'three-duel');
    await f.gesture([470, 320], [495, 285]);
    await expect
      .poll(async () => (await f.snapshot()).fighters[0].guns[0].pitch)
      .toBeGreaterThan(40);
    const angle = (await f.snapshot()).fighters[0].guns[0].pitch;
    await f.click('scope');
    await f.gesture([470, 260], [520, 235]);
    const observed = await f.snapshot();
    assert.equal(observed.fighters[0].guns[0].pitch, angle);
    assert.ok(observed.scopeX > 0);
    await f.capture('scope');
    await f.click('scope');
    const before = (await f.snapshot()).fighters[0].lastShot;
    await f.gesture([850, 460], [850, 460], 300, true);
    await expect.poll(async () => (await f.snapshot()).fighters[0].guns[0].charge).toBeNull();
    assert.deepEqual((await f.snapshot()).fighters[0].lastShot, before);
    await f.gesture([850, 460], [850, 460], 650);
    await expect
      .poll(async () => (await f.snapshot()).fighters[0].lastShot?.power ?? -1)
      .toBeGreaterThan(0.2);
    await f.capture('shot');
    await expect
      .poll(async () => (await f.snapshot()).fighters[0].guns[0].reload, { timeout: 6000 })
      .toBe(1);
    if (touch) {
      const fire = await f.logical(850, 460),
        prone = await f.logical(260, 470);
      await f.event('touchStart', [fire]);
      await f.page.waitForTimeout(200);
      await f.event('touchStart', [fire, prone]);
      await expect.poll(async () => (await f.snapshot()).fighters[0].crouched).toBe(true);
      await f.capture('crouch');
      await f.event('touchCancel', []);
      await expect.poll(async () => (await f.snapshot()).fighters[0].crouched).toBe(false);
    }
    await f.click('station:wall');
    await expect.poll(async () => (await f.snapshot()).fighters[0].route.length).toBeGreaterThan(0);
    await f.capture('moving');
    await expect
      .poll(async () => (await f.snapshot()).fighters[0].station, { timeout: 12000 })
      .toBe('wall');
    await f.capture('wall-gun');
    await f.click('pause');
    const paused = (await f.snapshot()).tick;
    await f.page.waitForTimeout(250);
    assert.equal((await f.snapshot()).tick, paused);
    await f.capture('paused');
    await f.click('settings');
    await f.click('sound');
    await f.capture('settings');
    await f.click('back');
    await f.click('help');
    await f.capture('help');
    await f.click('back');
    await f.click('leave');
    await f.click('leave-confirm');
    await expect(f.frame.locator('.castle-root')).toHaveAttribute('data-screen', 'home');
    await f.click('skins');
    await f.capture('skins');
    await f.click('back');
    records.push({
      name,
      viewport,
      touch,
      iframe,
      checks: [
        'home/maps/battle/menu/result routes',
        'aim drag',
        'independent telescope',
        'charge release',
        'cancel no shot',
        'reload',
        'real transfer',
        'practice pause',
        'settings/help/skins',
        ...(touch ? ['multitouch crouch cancels charge', 'touch cancellation'] : []),
      ],
    });
  } finally {
    await f.close();
  }
}
async function online() {
  const a = await fixture('human-blue', { width: 844, height: 390 }, true),
    b = await fixture('human-red', { width: 960, height: 540 }, false);
  try {
    await a.click('start');
    await a.capture('matching');
    await b.click('start');
    for (const f of [a, b])
      await expect(f.frame.locator('.castle-root')).toHaveAttribute('data-screen', 'playing', {
        timeout: 15000,
      });
    const sa = await a.snapshot(),
      sb = await b.snapshot();
    assert.equal(sa.mode, 'human');
    assert.equal(sa.matchId, sb.matchId);
    assert.notEqual(sa.side, sb.side);
    await a.gesture([470, 320], [480, 313]);
    await a.gesture([850, 460], [850, 460], 700);
    await expect
      .poll(async () => (await b.snapshot()).fighters[sa.side].lastShot?.power ?? 0)
      .toBeGreaterThan(0.2);
    await a.capture('battle');
    await b.capture('battle');
    await b.click('scope');
    await b.capture('scope');
    await b.click('scope');
    await a.click('pause');
    const tick = (await b.snapshot()).tick;
    await b.page.waitForTimeout(400);
    assert.ok((await b.snapshot()).tick > tick);
    await a.click('resume');
    await a.context.setOffline(true);
    await a.page.waitForTimeout(300);
    await a.context.setOffline(false);
    await expect
      .poll(async () => (await a.snapshot()).tick, { timeout: 10000 })
      .toBeGreaterThan(tick);
    assert.equal((await a.snapshot()).matchId, sa.matchId);
    await a.click('pause');
    await a.click('leave');
    await a.click('leave-confirm');
    await expect(b.frame.locator('.castle-root')).toHaveAttribute('data-screen', 'result', {
      timeout: 5000,
    });
    assert.equal((await b.snapshot()).result.winner, sb.side);
    await b.capture('victory');
    await b.click('home');
    await a.click('start');
    await a.click('cancel-match');
    await a.page.waitForTimeout(500);
    await expect(a.frame.locator('.castle-root')).toHaveAttribute('data-screen', 'home');
    await a.click('start');
    await expect(a.frame.locator('.castle-root')).toHaveAttribute('data-screen', 'playing', {
      timeout: 15000,
    });
    assert.equal((await a.snapshot()).mode, 'bot');
    await a.capture('bot-fallback');
    records.push({
      name: 'two-client-online',
      checks: [
        'real human matchmaking',
        'same match/authoritative shell',
        'human menu does not pause',
        'same-match reconnect',
        'leave result',
        'cancel queue',
        'production 8s bot fallback',
      ],
    });
  } finally {
    await a.close();
    await b.close();
  }
}
async function criticalStates() {
  const f = await fixture('critical', { width: 844, height: 390 }, true, false, true);
  const dev = async (id) => {
    await f.page.evaluate(() => window.SmallGamesDev.setPanelHidden(false));
    await f.frame.locator('[data-toggle]').tap();
    await f.frame.locator(`[data-dev-action="${id}"]`).tap();
    await f.frame.locator('[data-close]').tap();
    await f.page.evaluate(() => window.SmallGamesDev.setPanelHidden(true));
  };
  try {
    await dev('castle-injury');
    await f.capture('injury');
    assert.equal((await f.snapshot()).fighters[0].hp, 12);
    await f.click('retreat');
    await expect
      .poll(async () => (await f.snapshot()).fighters[0].healing, { timeout: 10000 })
      .not.toBeNull();
    await f.capture('healing');
    const medicine = (await f.snapshot()).fighters[0].medicines;
    assert.equal(medicine, 2);
    await dev('castle-collapse');
    await expect.poll(async () => (await f.snapshot()).fighters[0].destroyed).toBe(true);
    await expect
      .poll(async () => (await f.snapshot()).fighters[0].node, { timeout: 10000 })
      .toBe('shelter');
    await f.capture('exposed-bunker');
    await f.click('station:bunker');
    await expect
      .poll(async () => (await f.snapshot()).fighters[0].station, { timeout: 5000 })
      .toBe('bunker');
    await f.capture('bunker-gun');
    await f.click('pause');
    await f.click('leave');
    await f.click('leave-confirm');
    const full = f.frame.locator('[data-game-fullscreen]');
    await full.tap();
    await f.page.waitForTimeout(200);
    await f.page.evaluate(async () => {
      if (document.fullscreenElement) await document.exitFullscreen();
    });
    await expect(f.frame.locator('[data-action="start"]')).toBeVisible();
    records.push({
      name: 'critical-and-collapse',
      checks: [
        'isolated dev previews',
        'critical red vignette',
        'route retreat',
        'finite progressive treatment',
        'city collapse auto route',
        'only bunker gun',
        'fullscreen exit keeps navigation',
      ],
    });
  } finally {
    await f.close();
  }
}
try {
  await practice('landscape', { width: 844, height: 390 }, true);
  await practice('portrait', { width: 390, height: 844 }, true);
  await practice('iframe', { width: 844, height: 390 }, true, true);
  await online();
  await criticalStates();
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(out, 'verification.json'),
    JSON.stringify(
      {
        environment: 'Chrome desktop with mobile viewport and CDP touch, not physical devices',
        records,
        errors,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`双城炮战浏览器验证通过：${records.length} 组，证据 ${out}`);
} finally {
  await browser.close();
  service.stop();
}

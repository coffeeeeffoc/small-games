// 建房后停留在房间；房间可收起为大厅底部房间条，并一键展开。
// NIGHT_URL / NIGHT_EXPECTED_SOURCE_HASH 指向当前构建，NIGHT_LOBBY_URL 指向本机房间服务。
// 本机自测栈只放行 TapTap 来源时，设 NIGHT_LOBBY_STRIP_ORIGIN=1 由测试代理去掉 Origin 并补 CORS 头。
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { acceptanceBuild, snapshot, assertLayout } from './flight-browser.mjs';
import { press, settleVisuals } from './visual-helpers.mjs';

const base = process.env.NIGHT_URL, api = process.env.NIGHT_LOBBY_URL, build = await acceptanceBuild(base);
assert(api && ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(api).hostname), 'Use a local room service');
const out = new URL(process.env.NIGHT_REPORT_URL || '../reports/room-dock/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11'] });
const evidence = { build, checks: [], errors: [] };
try {
  for (const [width, height] of [[568, 320], [844, 390], [1280, 720]]) {
    const touch = width < 1000, context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    await context.addInitScript(() => localStorage.setItem('night-overwatch-coach-v2', 'done'));
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', error => evidence.errors.push(error.message));
    await page.route('**/game-service-config.js', route => route.fulfill({ contentType: 'text/javascript',
      body: 'globalThis.__COMPETITION_CONFIG__=' + JSON.stringify({ game: 'night-overwatch', platform: 'h5', competitionEnabled: true, apiUrl: api }) }));
    if (process.env.NIGHT_LOBBY_STRIP_ORIGIN === '1')
      await page.route(new URL(api).origin + '/**', async route => {
        const request = route.request(), cors = { 'access-control-allow-origin': new URL(base).origin, 'access-control-allow-credentials': 'true',
          'access-control-allow-headers': request.headers()['access-control-request-headers'] || '*', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' };
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
        const headers = { ...request.headers() }; delete headers.origin; delete headers.referer;
        try { const response = await route.fetch({ headers }); await route.fulfill({ response, headers: { ...response.headers(), ...cors } }); }
        catch { /* 关闭页面时长轮询被取消。 */ }
      });
    await page.goto(base + '?dev=0');
    await page.waitForFunction(() => globalThis.__night?.snapshot().online?.identity.playerId && !document.getElementById('night-startup'), null, { timeout: 60000 });
    await settleVisuals(page);
    const hit = id => press(page, id, touch, false);
    const shot = async name => { await settleVisuals(page); const s = await snapshot(page); assertLayout(s, width, height);
      await page.screenshot({ path: fileURLToPath(new URL(`${name}-${width}.png`, out)) }); return s; };
    const target = (s, id) => { const b = s.buttons.find(b => b.id === id); assert(b && !b.disabled, `${width}: ${id} available`);
      assert(b.w >= 44 && b.h >= 44, `${width}: ${id} touch target ${b.w}x${b.h}`); };

    await hit('online:menu'); await hit('online:friend'); await hit('online:createConfirm');
    await page.waitForFunction(() => __night.snapshot().online.room?.status === 'waiting');
    await page.waitForTimeout(2500);
    let s = await shot('room');
    const code = s.online.room.code;
    assert.equal(s.online.panel, 'room', 'creating a room stays in that room');
    target(s, 'online:roomCollapse');

    await hit('online:chatInvite');
    await page.waitForFunction(() => !__night.snapshot().online.chatSending);
    s = await snapshot(page); assert.equal(s.online.panel, 'room', 'inviting from the room keeps the room open');

    await hit('online:roomCollapse');
    await page.waitForFunction(() => __night.snapshot().modal.startsWith('online:menu'));
    await page.waitForFunction(code => __night.snapshot().online.rooms.some(room => room.code === code), code);
    s = await shot('collapsed');
    assert.equal(s.online.room?.code, code, 'collapsing keeps membership');
    target(s, 'online:roomReturn');
    const row = 'online:roomReturn:' + code;
    target(s, row);
    assert(!s.buttons.some(b => ['online:friend', 'online:match', 'online:bot'].includes(b.id)), 'room dock replaces create/match actions');

    await hit(row);
    await page.waitForFunction(code => __night.snapshot().online.panel === 'room' && __night.snapshot().online.room?.code === code, code);
    await hit('online:roomCollapse');
    await hit('online:roomReturn');
    await page.waitForFunction(() => __night.snapshot().online.panel === 'room');
    await hit('online:roomCollapse'); await hit('online:back');
    await page.waitForFunction(() => __night.snapshot().online.panel === 'room');
    await hit('online:backLobby');
    await page.waitForFunction(() => !__night.snapshot().online.room && __night.snapshot().online.panel === 'menu');
    evidence.checks.push({ width, height, code, staysInRoom: true, inviteStays: true, collapse: true, expand: true, listReturnsToSameRoom: true, backRestores: true });
    await context.close();
  }
  assert.deepEqual(evidence.errors, []);
} finally { await browser.close(); await writeFile(new URL('evidence.json', out), JSON.stringify(evidence, null, 2)); }
console.log(JSON.stringify(evidence));

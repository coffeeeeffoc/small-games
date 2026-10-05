import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { sourceHash } from '../scripts/artifact.mjs';
import { designPoint, tapDesign } from './browser-utils.mjs';

const origin = process.env.KART_MULTIPLAYER_URL || 'http://127.0.0.1:43003';
const url = new URL('/play/', origin);
assert.equal(
  (await fetch(new URL('build-info.json', url)).then((r) => r.json())).sourceHash,
  await sourceHash(),
);
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const reports = new URL('../reports/multiplayer/', import.meta.url);
await mkdir(reports, { recursive: true });
const errors = [];
const snap = (page) => page.evaluate(() => __kart.snapshot());
const loaded = (page) =>
  page.waitForFunction(
    () =>
      globalThis.__kart?.snapshot().multiplayer &&
      !__kart.snapshot().loading &&
      __kart.snapshot().modelsLoaded,
    {},
    { timeout: 60000 },
  );
async function open(mobile, vehicle) {
  const context = await browser.newContext({
    viewport: { width: 960, height: 540 },
    isMobile: mobile,
    hasTouch: mobile,
    ...(mobile
      ? {
          userAgent:
            'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36',
        }
      : {}),
  });
  await context.addInitScript(
    (value) =>
      localStorage.setItem(
        'kart-selection-v1',
        JSON.stringify({
          theme: 'seaside',
          route: 'seaside',
          driver: 'rookie',
          vehicle: value,
        }),
      ),
    vehicle,
  );
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return page;
}
try {
  const host = await open(false, 'classic-kart');
  await host.goto(url.href);
  await loaded(host);
  const entry = await designPoint(host, 807, 142);
  await host.mouse.click(entry.x, entry.y);
  for (const [width, height] of [[844, 390], [1280, 585]]) {
    await host.setViewportSize({ width, height });
    await host.waitForTimeout(350); // Cocos debounces canvas resize.
    const click = async (x, y) => {
      const point = await designPoint(host, 480 + x, 270 - y);
      await host.mouse.click(point.x, point.y);
    };
    await host.screenshot({ path: fileURLToPath(new URL(`entry-${width}.png`, reports)) });
    await click(327, 128);
    assert.equal((await snap(host)).multiplayer.panelOpen, true, 'modal shields the entry behind it');
    await click(256, 150);
    assert.equal((await snap(host)).multiplayer.panelOpen, false, 'compact close button works');
    await click(327, 128);
    assert.equal((await snap(host)).multiplayer.panelOpen, true, 'entry reopens after closing');
  }
  await host.setViewportSize({ width: 960, height: 540 });
  await host.waitForTimeout(350);
  await host.mouse.click(480, 218);
  await host.locator('input:visible, textarea:visible').fill('房主');
  // Identity outages block ranked play, but never block creating a practice room.
  await host.evaluate(() => {
    globalThis.savedCompetition = globalThis.__competition;
    globalThis.identityCalls = 0;
    globalThis.__competition = {
      async session() { globalThis.identityCalls++; throw new Error('测试：玩家身份暂不可用'); },
      async request() { throw new Error('测试：玩家身份暂不可用'); },
    };
  });
  await host.mouse.click(480, 348);
  await host.waitForFunction(() => __kart.snapshot().multiplayer.panelStatus.includes('玩家身份暂不可用'));
  assert.ok(!(await snap(host)).multiplayer.room);
  await host.mouse.click(297, 348);
  await host.waitForFunction(() => __kart.snapshot().multiplayer.room?.members.length === 1);
  assert.equal(await host.evaluate(() => globalThis.identityCalls), 1);
  await host.evaluate(() => {
    globalThis.__competition = globalThis.savedCompetition;
    delete globalThis.savedCompetition; delete globalThis.identityCalls;
  });
  const room = (await snap(host)).multiplayer.room;
  const friend = await open(true, 'formula');
  const invite = new URL(url);
  invite.searchParams.set('room', room.code);
  for (const field of ['theme', 'route', 'vehicle', 'driver']) invite.searchParams.set(field, room[field]);
  await friend.goto(invite.href);
  await loaded(friend);
  assert.equal((await snap(friend)).multiplayer.entryVisible, false);
  assert.equal((await snap(friend)).multiplayer.invite.code, room.code);
  assert.equal((await snap(friend)).selection.vehicle, room.vehicle);
  await friend.touchscreen.tap(610, 335);
  await host.waitForFunction(() => __kart.snapshot().multiplayer.room.members.length === 2);
  await friend.waitForFunction(() => __kart.snapshot().multiplayer.room?.members.length === 2);
  for (let bots = 2; bots >= 0; bots--) {
    await host.mouse.click(315, 369);
    await host.waitForFunction((count) => __kart.snapshot().multiplayer.room.bots === count, bots);
  }
  await host.screenshot({ path: fileURLToPath(new URL('room.png', reports)) });
  await host.waitForFunction(() => __kart.snapshot().multiplayer.room.members.every(m => m.loadedRevision === __kart.snapshot().multiplayer.room.revision));
  await host.mouse.click(355, 430);
  await friend.touchscreen.tap(355, 430);
  await host.waitForFunction(() =>
    __kart.snapshot().multiplayer.room.members.every((m) => m.ready),
  );
  await host.mouse.click(550, 430);
  await Promise.all([loaded(host), loaded(friend)]);
  await host.waitForFunction(() => __kart.snapshot().phase === 'racing', {}, { timeout: 30000 });
  await friend.waitForFunction(() => __kart.snapshot().phase === 'racing');
  await host.keyboard.down('ArrowUp');
  await friend.keyboard.down('ArrowDown');
  await host.waitForFunction(() => __kart.snapshot().time > 2);
  await host.keyboard.up('ArrowUp');
  await friend.keyboard.up('ArrowDown');
  const a = await snap(host),
    b = await snap(friend);
  assert.equal(a.drivers.length, 2);
  assert.equal(b.drivers.length, 2);
  assert.equal(a.renderedVehicles[0], 'classic-kart');
  assert.equal(b.renderedVehicles[0], 'classic-kart');
  assert.ok(a.player.speed > 10);
  assert.ok(b.player.speed < a.player.speed);
  assert.notEqual(a.multiplayer.selfId, b.multiplayer.selfId);
  assert.ok(
    Math.hypot(a.drivers[0].x - b.drivers[1].x, a.drivers[0].z - b.drivers[1].z) < 4,
    'both clients see the same host car, allowing one snapshot interval',
  );
  assert.equal(a.multiplayer.room.seed, b.multiplayer.room.seed);
  assert.equal(a.hud.menuVisible, false, 'racing hides the preparation and results panel');
  assert.equal(a.hud.coachingVisible, false, 'PK does not show solo teaching by default');
  assert.equal(a.hud.help, '竞赛规则');
  assert.equal(a.hud.pause, '房间', 'online cannot pretend that a local pause stops the race');
  await host.keyboard.press('h');
  await host.waitForFunction(() => __kart.snapshot().hud.coachingVisible);
  assert.match((await snap(host)).hud.coaching, /不暂停比赛/);
  await host.keyboard.press('h');
  await host.waitForFunction(() => !__kart.snapshot().hud.coachingVisible);
  await host.keyboard.press('p');
  await host.waitForFunction(() => __kart.snapshot().multiplayer.panelOpen);
  assert.equal((await snap(host)).hud.menuVisible, false);
  await host.mouse.click(866, 80);
  await host.waitForFunction(() => !__kart.snapshot().multiplayer.panelOpen);
  assert.deepEqual(
    a.items.map((i) => i.kind),
    b.items.map((i) => i.kind),
  );
  await host.screenshot({ path: fileURLToPath(new URL('host-race.png', reports)) });
  await friend.screenshot({ path: fileURLToPath(new URL('friend-race.png', reports)) });
  const id = b.multiplayer.selfId;
  // Reload exercises persisted reconnect credentials and a new transport, without changing race state.
  await friend.reload();
  await loaded(friend);
  await friend.waitForFunction(
    (playerId) =>
      __kart.snapshot().multiplayer.connected &&
      __kart.snapshot().multiplayer.selfId === playerId &&
      __kart.snapshot().phase === 'racing',
    id,
  );
  assert.ok((await snap(friend)).time >= b.time);
  assert.equal((await snap(host)).multiplayer.room.members.length, 2);
  await tapDesign(friend, 56, 126); // The in-race room button replaces the ready-only entry.
  await friend.waitForFunction(() => __kart.snapshot().multiplayer.panelOpen);
  await friend.touchscreen.tap(750, 430);
  await friend.waitForFunction(() => !__kart.snapshot().multiplayer.room);
  await loaded(friend);
  assert.equal((await snap(friend)).drivers.length, 4, 'leaving returns to offline play');
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('validation.json', reports),
    JSON.stringify(
      {
        room: room.code,
        hostSelectedCars: [a.renderedVehicles[0], b.renderedVehicles[0]],
        bots: a.multiplayer.room.bots,
        hostTick: a.multiplayer.tick,
        friendTick: b.multiplayer.tick,
        reconnected: id,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: two real Cocos clients, desktop/touch room controls, zero bots, independent inputs, shared state, reload reconnect and offline return.',
  );
} finally {
  await browser.close();
}

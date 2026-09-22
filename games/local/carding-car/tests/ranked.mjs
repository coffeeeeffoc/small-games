import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { sourceHash } from '../scripts/artifact.mjs';

const url = process.env.KART_URL || 'http://127.0.0.1:43003/play/';
const build = await fetch(new URL('build-info.json', url)).then((response) => response.json());
assert.equal(build.sourceHash, await sourceHash(), 'ranked test requires the current build');
const reports = new URL('../reports/ranked/', import.meta.url);
await mkdir(reports, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const errors = [];
const snapshot = (page) => page.evaluate(() => __kart.snapshot());
async function open(address) {
  const context = await browser.newContext({
    viewport: { width: 960, height: 540 }, hasTouch: true, isMobile: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36',
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(address);
  await page.waitForFunction(() => globalThis.__kart?.snapshot().multiplayer && !__kart.snapshot().loading, {}, { timeout: 60000 });
  assert.equal(await page.evaluate(() => typeof globalThis.__competition?.session), 'function', 'real shared client must be installed');
  return page;
}
try {
  const host = await open(url);
  await host.touchscreen.tap(126, 117);
  await host.touchscreen.tap(480, 348);
  await host.waitForFunction(() => __kart.snapshot().multiplayer.room?.ranked, {}, { timeout: 20000 });
  const room = (await snapshot(host)).multiplayer.room;
  const invitation = new URL(url);
  invitation.searchParams.set('room', room.code);
  for (const field of ['theme', 'route', 'vehicle', 'driver']) invitation.searchParams.set(field, room[field]);
  const friend = await open(invitation.href);
  await friend.touchscreen.tap(610, 335);
  await host.waitForFunction(() => __kart.snapshot().multiplayer.room.members.length === 2);
  await friend.waitForFunction(() => __kart.snapshot().multiplayer.room?.members.length === 2);
  const ids = await Promise.all([host, friend].map((page) => page.evaluate(async () => (await __competition.session()).playerId)));
  assert.notEqual(ids[0], ids[1], 'two independent persistent identities');
  // Only these test-owned contexts; reports/ is ignored and credentials are never printed.
  for (const [index, page] of [host, friend].entries()) await writeFile(new URL(`browser-state-${index}.json`, reports), JSON.stringify(await page.context().storageState()), { mode: 0o600 });
  for (const page of [host, friend]) {
    await page.waitForFunction(() => __kart.snapshot().multiplayer.room.members.every((member) => member.loadedRevision === 1));
    await page.waitForFunction(key => {
      const saved = JSON.parse(localStorage.getItem('kart-ranked-before') || 'null');
      return saved?.key === key && Object.hasOwn(saved, 'me');
    }, `${room.code}:1`, { timeout: 30000 });
    await page.touchscreen.tap(355, 430);
  }
  const before = await Promise.all([host, friend].map(page => page.evaluate(() => JSON.parse(localStorage.getItem('kart-ranked-before')).me)));
  assert.deepEqual(before, [null, null], 'fresh identities must have no invented pre-race rank');
  await host.waitForFunction(() => __kart.snapshot().multiplayer.room.members.every((member) => member.ready));
  await host.touchscreen.tap(550, 430);
  await Promise.all([host, friend].map((page) => page.waitForFunction(() => __kart.snapshot().phase === 'racing', {}, { timeout: 60000 })));
  const clients = await Promise.all([host, friend].map(async (page) => ({ page, cdp: await page.context().newCDPSession(page), points: [] })));
  const started = Date.now();
  let logged = 0;
  let reconnected = false;
  while (Date.now() - started < 550000) {
    const states = await Promise.all(clients.map((client) => snapshot(client.page)));
    if (states.every((state) => state.phase === 'finished')) break;
    for (const [index, client] of clients.entries()) {
      const state = states[index];
      if (state.phase === 'finished' || state.progress.finishedAt) continue;
      assert.equal(state.hud.menuVisible, false);
      const input = state.suggestedInput;
      const points = [{ x: 960 * (0.16 + input.steer * 0.095), y: 440, id: 1 }];
      if (input.drift) points.push({ x: 844, y: 440, id: 2 });
      if (input.brake) points.push({ x: 674, y: 440, id: 3 });
      if (client.points.some((point) => !points.some((next) => next.id === point.id))) {
        await client.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        client.points = [];
      }
      await client.cdp.send('Input.dispatchTouchEvent', { type: points.length > client.points.length ? 'touchStart' : 'touchMove', touchPoints: points });
      client.points = points;
    }
    if (!reconnected && states[0].time > 25) {
      const peer = clients[1];
      await peer.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await peer.page.reload();
      await peer.page.waitForFunction(() => globalThis.__kart?.snapshot().multiplayer?.connected && !__kart.snapshot().loading && __kart.snapshot().phase === 'racing', {}, { timeout: 60000 });
      peer.points = [];
      assert.equal(await peer.page.evaluate(async () => (await __competition.session()).playerId), ids[1]);
      reconnected = true;
    }
    if (states[0].time > logged + 30) {
      logged = states[0].time;
      console.log(`ranked ${Math.round(logged)}s: laps ${states.map((state) => state.progress.laps).join('/')}`);
    }
    await host.waitForTimeout(35);
  }
  for (const client of clients) await client.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const finished = await Promise.all(clients.map((client) => snapshot(client.page)));
  await writeFile(new URL('attempt.json', reports), JSON.stringify({ build, url, room: room.code, identities: ids, reconnected, elapsedWallMs: Date.now() - started, finished, errors }, null, 2));
  for (const [index, client] of clients.entries()) await client.page.screenshot({ path: fileURLToPath(new URL(`attempt-${index}.png`, reports)) });
  assert.ok(finished.every((state) => state.phase === 'finished' && state.progress.laps === 3), 'both real clients must complete legal three-lap races');
  await Promise.all([host, friend].map((page) => page.waitForFunction(() => __kart.snapshot().multiplayer.room.settlement === 'saved', {}, { timeout: 30000 })));
  const boards = await Promise.all([host, friend].map((page) => page.evaluate(() => __competition.request('/boards/carding-car'))));
  assert.deepEqual(boards[0].top, boards[1].top);
  assert.ok(boards.every((board) => board.me?.rank > 0));
  const resultText = [];
  for (const [index, page] of [host, friend].entries()) {
    const board = boards[index];
    const expected = [
      `个人最佳 ${(-board.me.score / 1000).toFixed(3)} 秒`,
      `全站第 ${board.me.rank} 名 / ${board.eligiblePlayers} 人`,
      '首次有效纪录', '首次上榜',
      board.previous ? `距上一名快 ${(board.gap.score / 1000).toFixed(3)} 秒` : '已并列或独占榜首',
    ];
    await page.waitForFunction(expected => expected.every(text => __kart.snapshot().hud.leaderboard.includes(text)), expected, { timeout: 30000 });
    const rendered = (await snapshot(page)).hud.leaderboard;
    assert(!rendered.includes('完成比赛后记录成绩'), 'ranked results cannot display an empty local-record placeholder');
    resultText.push(rendered);
    await page.screenshot({ path: fileURLToPath(new URL(`finish-${index}.png`, reports)) });
    await page.touchscreen.tap(480, 395);
    await page.waitForFunction(() => __kart.snapshot().multiplayer.panelOpen && !__kart.snapshot().hud.menuVisible);
    assert.equal((await snapshot(page)).hud.menuVisible, false, 'room overlays do not expose the results panel behind them');
    await page.touchscreen.tap(155, 374);
    await page.waitForFunction(() => __kart.snapshot().multiplayer.ranking?.visible && /我的最佳/.test(__kart.snapshot().multiplayer.ranking.summary));
    await page.screenshot({ path: fileURLToPath(new URL(`leaderboard-${index}.png`, reports)) });
  }
  assert.deepEqual(errors, []);
  await writeFile(new URL('validation.json', reports), JSON.stringify({ build, room: room.code, identities: ids, reconnected, before, finished, boards, resultText, errors, environment: 'two real Cocos browser clients and shared HTTP/WS services; Android emulation, not devices' }, null, 2));
  console.log('PASS: two real Cocos clients completed ranked race, reconnect, durable settlement and shared Top 100.');
} finally { await browser.close(); }

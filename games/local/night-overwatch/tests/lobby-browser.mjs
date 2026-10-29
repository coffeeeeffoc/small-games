import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { acceptanceBuild, press, snapshot, assertLayout, navigateMap, aimAt } from './flight-browser.mjs';

const base = process.env.NIGHT_URL, build = await acceptanceBuild(base);
const out = new URL('../reports/2026-10-28-lobby/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const evidence = { build, checks: [], errors: [], metrics: {} };
const contexts = [];
async function open(width = 1280, height = 720, search = '?dev=0', record = false) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 1000, isMobile: width < 1000,
    ...(record ? { recordVideo: { dir: fileURLToPath(out), size: { width, height } } } : {}) });
  contexts.push(context);
  const page = await context.newPage();
  const recordingStarted = Date.now();
  page.on('pageerror', error => evidence.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /TypeError|ReferenceError|Error \d+/.test(message.text())) evidence.errors.push(message.text()); });
  await page.goto(base + search);
  await page.waitForFunction(() => globalThis.__night?.snapshot().ui.homeArtworkReady && __night.snapshot().online.identity.playerId);
  await page.waitForTimeout(800);
  return { page, context, width, height, touch: width < 1000, recordingStarted };
}
const click = (actor, id) => press(actor.page, id, actor.touch, false);
const waitPanel = (actor, panel) => actor.page.waitForFunction(panel => __night.snapshot().modal.startsWith('online:' + panel), panel);
async function capture(actor, name) {
  await actor.page.waitForTimeout(250);
  assertLayout(await snapshot(actor.page), actor.width, actor.height);
  await actor.page.screenshot({ path: fileURLToPath(new URL(name + '.png', out)) });
}
async function field(actor, row, value) {
  const ph = Math.min(400, actor.height - 28), py = (actor.height - ph) / 2;
  const x = actor.width / 2 + 60, y = py + row + 22;
  if (actor.touch) await actor.page.touchscreen.tap(x, y); else await actor.page.mouse.click(x, y);
  await actor.page.locator('input:visible').fill(value);
}
try {
  for (const [width, height] of (process.env.NIGHT_DESKTOP_ONLY ? [] : [[568, 320], [844, 390]])) {
    const actor = await open(width, height, '?dev=0&fullscreen=1');
    await capture(actor, 'home-' + width);
    await click(actor, 'online:profile'); await waitPanel(actor, 'profile'); await field(actor, 83, '触屏飞行员' + width);
    await click(actor, 'online:saveName'); await actor.page.waitForFunction(() => __night.snapshot().online.identity.name?.startsWith('触屏飞行员'));
    await capture(actor, 'profile-' + width); await click(actor, 'online:back');
    await click(actor, 'online:menu'); await waitPanel(actor, 'menu'); await capture(actor, 'lobby-' + width);
    await click(actor, 'online:friend'); await click(actor, 'online:private'); await field(actor, 127, 'friends-28');
    await capture(actor, 'private-form-' + width); await click(actor, 'online:back');
    await click(actor, 'online:ranking'); await waitPanel(actor, 'ranking');
    for (const board of ['clears', 'level', 'points', 'win-rate']) {
      await click(actor, 'online:category:' + (['clears', 'level'].includes(board) ? 'solo' : 'duel'));
      await click(actor, 'online:board:' + board); await capture(actor, 'board-' + board + '-' + width);
    }
    await click(actor, 'online:back'); await click(actor, 'online:history'); await waitPanel(actor, 'history');
    await capture(actor, 'history-' + width);
    await actor.context.close();
    evidence.checks.push('touch forms and four boards ' + width);
  }
  const a = await open(1280, 720, '?dev=0', true), b = await open();
  assert(!(await snapshot(a.page)).buttons.some(button => button.id === 'screen'));
  await capture(a, 'home');
  await click(a, 'online:menu'); await click(a, 'online:friend'); await click(a, 'online:createConfirm');
  await a.page.waitForFunction(() => __night.snapshot().online.room?.status === 'waiting');
  const code = (await snapshot(a.page)).online.room.code; assert.match(code, /^[0-9]{6}$/);
  await capture(a, 'room');
  await click(b, 'online:menu'); await click(b, 'online:join'); await field(b, 73, code); await click(b, 'online:joinConfirm');
  await b.page.waitForFunction(() => __night.snapshot().online.room?.players.length === 2);
  const observer = await open(1280, 720, '?dev=0&fullscreen=1');
  await click(observer, 'online:menu');
  await observer.page.waitForFunction(code => __night.snapshot().online.rooms.some(room => room.code === code), code);
  const roomIndex = (await snapshot(observer.page)).online.rooms.findIndex(room => room.code === code);
  for (let i = 0; i < Math.floor(roomIndex / 3); i++) await click(observer, 'online:roomNext');
  await observer.page.waitForFunction(code => __night.snapshot().buttons.some(button => button.id === 'online:watchCode:' + code), code);
  await click(observer, 'online:watchCode:' + code);
  await click(a, 'online:ready'); await click(b, 'online:ready');
  await b.page.waitForFunction(() => __night.snapshot().modal === 'entering');
  await capture(b, 'entry');
  for (const actor of [a, b, observer]) await actor.page.waitForFunction(() => __night.snapshot().online.active && !__night.snapshot().modal);
  assert((await snapshot(observer.page)).online.room.spectator);
  await observer.page.keyboard.press('Space');
  assert.equal((await snapshot(observer.page)).fired, 0);
  await click(observer, 'screen'); await observer.page.waitForFunction(() => !!document.fullscreenElement);
  await click(observer, 'screen'); await observer.page.waitForFunction(() => !document.fullscreenElement);
  await click(observer, 'settings'); await click(observer, 'home'); await click(observer, 'exitConfirm');
  await observer.context.close();
  evidence.checks.push('room code join, entry, spectator read-only and fullscreen enter/exit');
  await a.page.bringToFront();
  evidence.metrics = await a.page.evaluate(() => new Promise(resolve => {
    const samples = [], start = performance.now();
    const sample = () => { const s = __night.snapshot(); samples.push({ time: s.time, shown: s.presentedTime, fps: s.frameRate });
      if (performance.now() - start < 2500) requestAnimationFrame(sample);
      else resolve({ frames: samples.length, networkSteps: new Set(samples.map(s => s.time)).size,
        visualSteps: new Set(samples.map(s => s.shown)).size, reportedFps: samples.at(-1).fps }); };
    requestAnimationFrame(sample);
  }));
  assert(evidence.metrics.visualSteps > evidence.metrics.networkSteps * 1.5, JSON.stringify(evidence.metrics));
  await click(a, 'weapon3');
  let state = await snapshot(a.page); const target = state.units.find(unit => !unit.friendly && unit.kind === 'turret');
  await navigateMap(a.page, target); await aimAt(a.page, target);
  await a.page.mouse.down(); await a.page.waitForTimeout(60); await a.page.mouse.up();
  await a.page.waitForFunction(() => __night.snapshot().fireZones.length > 0, null, { timeout: 15000 });
  await capture(a, 'incendiary'); await a.page.waitForTimeout(4000);
  await b.context.setOffline(true);
  await b.page.waitForFunction(() => /网络异常/.test(__night.snapshot().online.message), null, { timeout: 10000 });
  await a.page.waitForFunction(() => __night.snapshot().online.room.players.some(player => player.disconnected), null, { timeout: 10000 });
  await capture(a, 'offline-notice');
  await b.context.setOffline(false);
  await b.page.waitForFunction(() => !__night.snapshot().online.message);
  await a.page.waitForFunction(() => __night.snapshot().online.room.players.every(player => !player.disconnected));
  await b.page.reload();
  await b.page.waitForFunction(() => globalThis.__night?.snapshot().online.active);
  evidence.checks.push('short network loss and refresh restore the same match');
  await b.page.waitForFunction(() => !__night.snapshot().modal);
  await click(b, 'settings'); await click(b, 'home'); await click(b, 'exitConfirm');
  await a.page.waitForFunction(() => __night.snapshot().online.room.settlement?.outcome === 'win', null, { timeout: 40000 });
  state = await snapshot(a.page);
  assert.equal(state.phase, 'playing'); assert(state.online.room.players.some(player => player.takenOver));
  assert.equal(state.online.room.settlement.points, 120);
  await click(b, 'online:history'); await b.page.waitForFunction(() => __night.snapshot().online.history?.summary.games >= 1);
  await capture(b, 'history');
  assert.equal((await snapshot(b.page)).online.history.matches[0].points, 40);
  evidence.checks.push('30 second leave settlement, winner continues against bot, history has loser points');
  await click(a, 'settings'); await click(a, 'home'); await click(a, 'exitConfirm');
  await click(a, 'online:back'); await click(a, 'missions'); await click(a, 'start');
  await a.page.waitForFunction(() => __night.snapshot().phase === 'playing');
  await click(a, 'settings'); await click(a, 'close');
  assert.equal((await snapshot(a.page)).resumeCountdown, 0);
  await capture(a, 'single-player');
  evidence.checks.push('single player resumes without countdown');
  evidence.gameplayStart = (Date.now() - a.recordingStarted) / 1000;
  const until = Date.now() + 26000;
  await click(a, 'weapon0');
  while (Date.now() < until) {
    const state = await snapshot(a.page), target = state.units.find(unit => !unit.friendly && unit.hp > 0);
    if (state.phase !== 'playing' || !target) break;
    await navigateMap(a.page, target); await aimAt(a.page, target);
    await a.page.mouse.down(); await a.page.waitForTimeout(800); await a.page.mouse.up();
  }
  evidence.gameplayDuration = (Date.now() - a.recordingStarted) / 1000 - evidence.gameplayStart;
  await capture(a, 'single-fire');
  assert.deepEqual(evidence.errors, []);
  evidence.video = await a.page.video().path();
} catch (error) {
  evidence.failure = error.message;
  for (const [i, context] of contexts.entries()) for (const page of context.pages()) {
    await page.screenshot({ path: fileURLToPath(new URL('failure-' + i + '.png', out)) }).catch(() => {});
    evidence['last-' + i] = await snapshot(page).then(s => ({ modal: s.modal, online: s.online })).catch(() => undefined);
  }
  throw error;
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser.close();
  await writeFile(new URL('evidence.json', out), JSON.stringify(evidence, null, 2));
}
console.log(JSON.stringify(evidence));

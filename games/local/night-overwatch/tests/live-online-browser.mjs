import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { acceptanceBuild, snapshot, press, navigateMap, aimAt, waitForImpact, assertLayout } from './flight-browser.mjs';
const base = process.env.NIGHT_URL, build = await acceptanceBuild(base);
const dir = fileURLToPath(new URL('../reports/2026-10-27-live-online/', import.meta.url));
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11'] });
const evidence = { build, errors: [], markers: {}, checks: [] };
let contexts = [];
try {
  const make = async record => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, permissions: ['clipboard-read', 'clipboard-write'],
      ...(record ? { recordVideo: { dir, size: { width: 1280, height: 720 } } } : {}) });
    contexts.push(context);
    await context.addInitScript(() => localStorage.setItem('night-overwatch-coach-v2', 'done'));
    const page = await context.newPage(); page.on('pageerror', error => evidence.errors.push(error.message)); return page;
  };
  const a = await make(true), start = Date.now(), b = await make(false);
  const mark = name => { console.log('STAGE', name); evidence.markers[name] = (Date.now() - start) / 1000; };
  const shot = async (page, name) => { assertLayout(await snapshot(page), 1280, 720); await page.screenshot({ path: `${dir}/${name}.png` }); };
  const ready = async (page, url) => {
    console.log('STAGE', 'load'); await page.goto(url);
    await page.waitForFunction(() => globalThis.__night?.snapshot().ui.homeArtworkReady && !document.getElementById('night-startup'), null, { timeout: 60000 });
    await page.waitForTimeout(1000);
    if (!(await snapshot(page)).online.identity.playerId && !url.includes('room=')) {
      await press(page, 'online:ranking', false); await page.waitForTimeout(1500); await press(page, 'online:back', false);
    }
    await page.waitForFunction(() => __night.snapshot().online.identity.playerId, null, { timeout: 15000 });
    await page.waitForTimeout(500); console.log('STAGE', 'identity-ready');
  };
  const hit = async (page, id) => { await press(page, id, false); await page.waitForTimeout(200); };
  const menu = async page => { await hit(page, 'online:menu'); await page.waitForFunction(() => __night.snapshot().modal.startsWith('online:menu')); };
  const exitDuel = async page => { await hit(page, 'settings'); await hit(page, 'home'); await hit(page, 'exitConfirm'); await page.waitForFunction(() => __night.snapshot().modal === 'home'); };
  await ready(a, base + '?dev=0'); await menu(a); await hit(a, 'online:friend');
  await a.waitForFunction(() => __night.snapshot().online.room?.status === 'waiting');
  await hit(a, 'online:share'); const link = await a.evaluate(() => navigator.clipboard.readText());
  assert.match(link, /\?room=[A-F0-9]{12}$/); await ready(b, link);
  await a.waitForFunction(() => __night.snapshot().online.room?.players.length === 2);
  const one = (await snapshot(a)).online.identity, two = (await snapshot(b)).online.identity;
  assert.notEqual(one.playerId, two.playerId); evidence.players = [one, two];
  mark('room'); await shot(a, '04-friend-room'); await a.waitForTimeout(3000);
  await hit(a, 'online:ready'); assert.equal((await snapshot(a)).online.room.status, 'waiting');
  await hit(b, 'online:ready'); await Promise.all([a, b].map(page => page.waitForFunction(() => __night.snapshot().online.active)));
  assert.equal((await snapshot(a)).online.room.code, (await snapshot(b)).online.room.code);
  assert.equal((await snapshot(b)).online.room.you, 1); evidence.checks.push('shared link, distinct identities and both-ready');
  await hit(a, 'weapon3'); await a.waitForFunction(() => __night.snapshot().selected === 3);
  const target = (await snapshot(a)).units.find(unit => !unit.friendly && unit.kind === 'turret');
  await navigateMap(a, target, false); await aimAt(a, target, false); await a.keyboard.press('Space');
  await a.waitForFunction(() => __night.snapshot().fireZones.length > 0, null, { timeout: 15000 });
  await hit(a, 'zoomIn'); await hit(a, 'zoomIn'); await hit(a, 'zoomIn');
  await hit(a, 'resume');
  await a.waitForTimeout(500); mark('duelFire'); await shot(a, '02-duel-incendiary'); await a.waitForTimeout(7000);
  await hit(a, 'battleReport'); mark('report'); await shot(a, '03-duel-report');
  let state = await snapshot(a); const fired = state.fired, time = state.time;
  await a.keyboard.down('Space'); await a.waitForTimeout(1000); await a.keyboard.up('Space');
  state = await snapshot(a); assert.equal(state.fired, fired); assert(state.time > time + .6);
  await hit(a, 'close'); await hit(a, 'settings'); await a.keyboard.press('Space'); await a.waitForTimeout(350);
  assert.equal((await snapshot(a)).fired, fired); await hit(a, 'resume');
  evidence.checks.push('shared authoritative fire, modal input blocked and duel clock continues');
  await exitDuel(a); await b.waitForFunction(() => __night.snapshot().online.room?.status === 'abandoned'); await hit(b, 'online:back');
  await menu(a); await menu(b); await hit(a, 'online:match'); await hit(b, 'online:match');
  await Promise.all([a, b].map(page => page.waitForFunction(() => __night.snapshot().online.active)));
  assert.equal((await snapshot(a)).online.room.code, (await snapshot(b)).online.room.code);
  assert.equal((await snapshot(a)).online.room.state.bot, false); evidence.checks.push('two browser human matchmaking');
  await exitDuel(a); await b.waitForFunction(() => __night.snapshot().online.room?.status === 'abandoned'); await hit(b, 'online:back');
  await menu(a); await hit(a, 'online:match'); await a.waitForFunction(() => __night.snapshot().online.room?.state?.bot, null, { timeout: 15000 });
  evidence.checks.push('server bot after empty queue'); await exitDuel(a);
  await hit(a, 'missions'); await hit(a, 'start'); await a.waitForFunction(() => __night.snapshot().phase === 'playing');
  assert.equal((await snapshot(a)).online.rankStatus, 'recording');
  await hit(a, 'weapon2'); mark('campaign');
  for (let i = 0; i < 12 && (await snapshot(a)).threatsRemaining > 0; i++) {
    state = await snapshot(a); const enemy = state.units.find(unit => !unit.friendly && unit.hp > 0);
    await navigateMap(a, enemy, false); await aimAt(a, enemy, false);
    await a.waitForFunction(() => __night.snapshot().guns[2].cooldown === 0);
    await a.keyboard.press('Space'); const firing = await snapshot(a), shell = firing.shots.at(-1);
    assert(shell && firing.fired > state.fired); if (i === 0) await shot(a, '01-escort-fire');
    await waitForImpact(a, shell);
  }
  await a.waitForFunction(() => __night.snapshot().phase === 'success', null, { timeout: 20000 });
  mark('campaignEnd'); await a.waitForFunction(() => __night.snapshot().online.rankStatus === 'finished', null, { timeout: 15000 });
  const result = await snapshot(a); assert(result.timeComparison.newRecord); assert(result.completionTime <= result.time);
  await shot(a, '05-personal-best'); evidence.result = { time: result.time, completionTime: result.completionTime, comparison: result.timeComparison };
  await hit(a, 'home');
  const rankingResponse = a.waitForResponse(response => response.url().includes('/leaderboards/level-corridor-01') && response.status() === 200, { timeout: 15000 });
  await hit(a, 'online:ranking');
  await a.waitForFunction(() => __night.snapshot().online.panel === 'ranking' && __night.snapshot().modal.startsWith('online:ranking'));
  const ranking = await (await rankingResponse).json();
  assert.equal(ranking.me.playerId, one.playerId); assert.equal(ranking.me.secondary, result.timeComparison.bestMs);
  evidence.ranking = ranking; await a.waitForTimeout(700); await shot(a, '06-level-ranking'); evidence.checks.push('real escort result submitted and own ranking received');
  const video = a.video(); await contexts[0].close(); contexts.shift(); await video.saveAs(`${dir}/source-1280x720.webm`);
  assert.deepEqual(evidence.errors, []);
} catch (error) {
  console.error(error); evidence.failure = String(error); throw error;
} finally {
  await writeFile(`${dir}/evidence.json`, JSON.stringify(evidence, null, 2));
  for (const context of contexts) await context.close(); await browser.close();
  await writeFile(`${dir}/evidence.json`, JSON.stringify(evidence, null, 2));
}

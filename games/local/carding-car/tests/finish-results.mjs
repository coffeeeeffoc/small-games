import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createTrack, pointAt } from '../assets/scripts/TrackGenerator.ts';
import { createKart } from '../assets/scripts/KartPhysics.ts';
import { sourceHash } from '../scripts/artifact.mjs';
import { startRace, waitForReady } from './browser-utils.mjs';

const url = process.env.KART_URL || 'http://127.0.0.1:4198';
const build = await fetch(new URL('build-info.json', url)).then(r => r.json());
assert.equal(build.sourceHash, await sourceHash(), 'test the current Creator build');
const reports = new URL('../reports/', import.meta.url);
await mkdir(reports, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath:
  process.env.PLAYWRIGHT_EXECUTABLE_PATH || (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
    ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined) });
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, hasTouch: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const snapshot = () => page.evaluate(() => __kart.snapshot());
const track = createTrack();
// Start each kart on its final approach; actual game frames perform all crossings and updates.
const approaches = [0.1, 60, 90, 120].map(remaining => {
  const s = track.length - remaining, p = pointAt(track, s);
  return { kart: { ...createKart(p.x, p.z, p.heading), speed: 30 },
    progress: { s, distance: track.length * 3 - remaining, laps: 2,
      lapStarted: 80, lapTimes: [40, 40], nextGate: track.checkpoints.length, finishedAt: 0 } };
});
async function finalApproach() {
  await page.waitForFunction(() => __kart.snapshot().phase === 'racing');
  await page.evaluate(async approaches => {
    const cc = await System.import('cc');
    const g = cc.director.getScene().getComponentsInChildren(cc.Component)
      .find(c => cc.js.getClassName(c) === 'KartGame');
    g.race.time = 120;
    g.race.drivers.forEach((d, i) => {
      Object.assign(d.kart, approaches[i].kart);
      Object.assign(d.progress, approaches[i].progress);
      d.shortcut = false; d.shortcutFailure = d.stuck = 0;
    });
  }, approaches);
  await page.waitForFunction(() => __kart.snapshot().hud.standings.includes('1/4 完赛'));
  return snapshot();
}
try {
  await page.goto(url);
  await page.waitForFunction(() => globalThis.__kart && !__kart.snapshot().loading);
  await page.locator('#kart-loading').waitFor({ state: 'detached' });
  assert.equal((await snapshot()).route.id, 'seaside');
  await startRace(page);
  const waiting = await finalApproach();
  assert.equal(waiting.hud.menuVisible, true);
  assert.match(waiting.hud.standings, /比赛中/);
  assert.equal(waiting.drivers.filter(d => d.lap === 3).length, 1);
  await page.screenshot({ path: fileURLToPath(new URL('finish-waiting.png', reports)) });
  await page.waitForFunction(() => __kart.snapshot().hud.standings.includes('4/4 完赛'), {}, { timeout: 15000 });
  const complete = await snapshot();
  assert.equal(complete.progress.finishedAt, waiting.progress.finishedAt);
  assert.equal(complete.hud.timer, waiting.hud.timer);
  assert.deepEqual(complete.records, waiting.records, 'waiting must not write the result again');
  assert.equal(complete.records[0].time, complete.progress.finishedAt);
  assert.ok(complete.time > complete.progress.finishedAt, 'rivals have independent later finish times');
  assert.doesNotMatch(complete.hud.standings, /比赛中|未完赛/);
  await page.screenshot({ path: fileURLToPath(new URL('finish-complete.png', reports)) });
  await page.keyboard.press('Enter');
  await waitForReady(page);
  assert.equal((await snapshot()).phase, 'ready');
  assert.equal((await snapshot()).staged, true);
  await startRace(page);
  const retryFrom = await finalApproach();
  await page.keyboard.press('Enter');
  await page.waitForFunction(seed => __kart.snapshot().seed !== seed && !__kart.snapshot().loading, retryFrom.seed);
  assert.equal((await snapshot()).progress.finishedAt, 0, 'retry resets immediately while rivals are unfinished');
  assert.equal((await snapshot()).phase, 'ready');
  assert.equal((await snapshot()).staged, true);
  await startRace(page);
  await finalApproach();
  const oldSeed = (await snapshot()).seed;
  await page.touchscreen.tap(216, 395); // 退出本局
  await page.waitForFunction(() => __kart.snapshot().phase === 'ready' && !__kart.snapshot().loading);
  const exited = await snapshot();
  assert.equal(exited.home.visible, true);
  assert.notEqual(exited.seed, oldSeed);
  assert.equal(exited.progress.finishedAt, 0);
  assert.deepEqual(errors, []);
  await writeFile(new URL('finish-results.json', reports), JSON.stringify({ waiting, complete, retryFrom, exited, errors }, null, 2));
  console.log('PASS: live finish results, frozen player score, no duplicate save, keyboard retry and touch exit');
} finally {
  await browser.close();
}

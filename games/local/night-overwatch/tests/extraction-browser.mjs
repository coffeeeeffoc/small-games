import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { acceptanceBuild, snapshot, press, aimAt, navigateMap, waitForImpact } from './flight-browser.mjs';
const base = process.env.NIGHT_URL, build = await acceptanceBuild(base);
const dir = fileURLToPath(new URL('../reports/2026-10-24-compact-hud/extraction/', import.meta.url));
const mode = process.env.NIGHT_EXTRACTION_PAUSE ? 'pause' : 'normal';
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, recordVideo: { dir, size: { width: 844, height: 390 } } });
  await context.addInitScript(() => { localStorage.setItem('night-overwatch-coach-v2', 'done'); localStorage.setItem('night-overwatch-reduced-effects', 'true'); });
  const page = await context.newPage(), errors = [];
  if (mode === 'pause') await page.exposeFunction('pauseAtClear', () => page.keyboard.press('KeyP'));
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '?dev=0&mission=corridor-01');
  await page.waitForFunction(() => globalThis.__night?.snapshot().audio === 'ready' && !document.getElementById('night-startup'), null, { timeout: 90000 });
  await press(page, 'start'); await press(page, 'convoy'); await press(page, 'weapon2');
  assert.equal((await snapshot(page)).convoy, 'holdRequested');
  await page.evaluate(pauseAtClear => {
    globalThis.__extractionObservation = { first: null, samples: [] };
    const observe = () => {
      const s = __night.snapshot(), record = globalThis.__extractionObservation;
      if (s.extractionRemaining !== undefined) {
        if (!record.first && pauseAtClear) globalThis.pauseAtClear();
        record.first ??= s;
        record.samples.push({ time: s.time, progress: s.progress, shots: s.shots.length, fired: s.fired,
          radioPending: s.radioPending, radioPlaying: s.radioPlaying, radioTime: s.radioTime, phase: s.phase });
      }
      if (s.phase === 'playing') requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
  }, mode === 'pause');
  for (let shot = 0; shot < 12 && (await snapshot(page)).threatsRemaining > 0; shot++) {
    let s = await snapshot(page), enemy = s.units.find(u => !u.friendly && u.hp > 0);
    if (s.kills === 3) await press(page, 'weapon1');
    assert(enemy); await navigateMap(page, enemy); await aimAt(page, enemy);
    assert(!(await snapshot(page)).friendlyRisk);
    if (s.kills === 3) await page.keyboard.down('Space'); else await page.keyboard.press('Space');
    const fired = await snapshot(page), shell = fired.shots.at(-1); assert(shell && fired.fired > s.fired);
    if (s.kills === 3) await page.waitForFunction(() => { const s = __night.snapshot(); return s.threatsRemaining === 0 || s.phase !== 'playing'; }, null, { timeout: 60000 });
    else await waitForImpact(page, shell);
    console.log('impact', shot + 1, (await snapshot(page)).kills);
  }
  const clear = await page.evaluate(() => globalThis.__extractionObservation.first), wallClear = Date.now();
  assert.equal(clear.threatsRemaining, 0); assert.equal(clear.phase, 'playing');
  assert(clear.extractionRemaining > 0 && clear.extractionRemaining <= 3);
  assert.equal(clear.convoy, 'moving');
  assert(clear.radioPending && clear.extractionRadioPending); assert(clear.radioDuration > 4);
  await page.keyboard.up('Space');
  const accelerated = clear.shots.find(s => s.timeScale === 4); assert(accelerated, 'held burst fire leaves rounds in flight at clearance');
  const clearTime = clear.time - (3 - clear.extractionRemaining);
  if (mode === 'normal' && (await snapshot(page)).phase === 'playing') {
    await page.keyboard.down('Space'); await page.mouse.down(); await page.waitForTimeout(250); await page.mouse.up(); await page.keyboard.up('Space');
    if ((await snapshot(page)).phase === 'playing') await press(page, 'fire', true);
  }
  assert.equal((await snapshot(page)).fired, clear.fired, 'keyboard, mouse and touch cannot fire during extraction');
  await page.screenshot({ path: `${dir}/${mode}-extracting-844.png` });
  if (mode === 'pause') {
    await page.waitForFunction(() => __night.snapshot().pauses.includes('settings')); await page.waitForTimeout(120);
    const paused = await snapshot(page); assert(!paused.radioPlaying); assert(paused.radioPending);
    await page.waitForTimeout(800); const held = await snapshot(page);
    assert.equal(held.time, paused.time); assert(Math.abs(held.radioTime - paused.radioTime) < .08);
    await press(page, 'resume', true);
    await page.waitForFunction(() => __night.snapshot().pauses.length === 0 && __night.snapshot().radioPlaying);
  }
  await page.waitForFunction(() => { const s = __night.snapshot(); return s.progress === 1 && s.shots.length === 0; });
  const arrived = await snapshot(page);
  await page.screenshot({ path: `${dir}/${mode}-arrival-844.png` });
  let lastAudible = arrived.radioTime;
  for (let i = 0; i < 100; i++) {
    const s = await snapshot(page);
    if (s.radioPlaying) { assert.equal(s.phase, 'playing'); lastAudible = Math.max(lastAudible, s.radioTime); }
    if (s.phase !== 'playing') break;
    await page.waitForTimeout(60);
  }
  const result = await snapshot(page), wallSeconds = (Date.now() - wallClear) / 1000;
  const samples = await page.evaluate(() => globalThis.__extractionObservation.samples);
  lastAudible = Math.max(lastAudible, ...samples.filter(s => s.radioPlaying).map(s => s.radioTime));
  await writeFile(`${dir}/${mode}-probe.json`, JSON.stringify({ build, samples, lastAudible, clearTime, resultTime: result.time }, null, 2));
  assert(samples.some(s => s.phase === 'playing' && (s.progress < 1 || s.shots > 0 || s.radioPending)
    && (s.progress === 1 || s.shots === 0 || !s.radioPending)), 'a finished task waits for the other tasks');
  assert(samples.every(s => s.fired === clear.fired), 'held input stops as soon as extraction begins');
  assert.equal(result.phase, 'success'); assert.equal(result.kills, 4); assert.equal(result.friendlyDamage, 0);
  assert.equal(result.progress, 1); assert.equal(result.shots.length, 0); assert(!result.radioPending);
  assert(lastAudible > clear.radioDuration * .8, 'sampled playback advances through the line before its completion signal');
  assert(result.time - clearTime >= 3 && result.time - clearTime < 6);
  await page.screenshot({ path: `${dir}/${mode}-escort-success-844.png` }); await page.waitForTimeout(1500);
  await press(page, 'retry'); assert.equal((await snapshot(page)).phase, 'playing'); assert.equal((await snapshot(page)).fired, 0);
  const video = page.video(); await context.close(); await video.saveAs(`${dir}/${mode}-escort-source.webm`);
  assert.deepEqual(errors, []); await acceptanceBuild(base);
  await writeFile(`${dir}/${mode}.json`, JSON.stringify({ build, phase: result.phase, kills: result.kills, time: result.time, clearTime,
    extractionSeconds: result.time - clearTime, wallSeconds, fired: result.fired, friendlyDamage: result.friendlyDamage,
    resumedHold: true, retry: true, radioDuration: clear.radioDuration, lastAudible, accelerated, samples, mode, errors,
    input: 'Actual mouse/keyboard/touch; no simulation state writes or reward fixture' }, null, 2));
} finally { await browser.close(); }

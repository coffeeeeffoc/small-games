import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { acceptanceBuild, press, snapshot, aimAt, predictUnit, assertLayout } from './flight-browser.mjs';
import { MAP } from '../assets/scripts/core/Data.ts';
const base = process.env.NIGHT_URL, build = await acceptanceBuild(base);
const out = new URL(process.env.NIGHT_REPORT_URL || '../reports/2026-10-28-lobby/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
const evidence = { build, errors };
async function locate(target) {
  const map = (await snapshot(page)).ui.minimap;
  await page.mouse.click(map.x + 8 + (target.x + MAP.halfWidth) / (2 * MAP.halfWidth) * (map.w - 16),
    map.y + 25 + (target.z + MAP.halfDepth) / (2 * MAP.halfDepth) * (map.h - 33));
  await page.waitForTimeout(150);
}
try {
  await page.goto(base + '?dev=0');
  await page.waitForFunction(() => globalThis.__night?.snapshot().ui.homeArtworkReady && __night.snapshot().online.identity.playerId);
  await page.waitForTimeout(800);
  await press(page, 'online:menu'); await press(page, 'online:bot');
  await page.waitForFunction(() => __night.snapshot().online.active && !__night.snapshot().modal);
  await press(page, 'weapon3');
  let state = await snapshot(page), target = state.units.find(unit => !unit.friendly && unit.kind === 'turret');
  await locate(target); await aimAt(page, target);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -1500); await page.waitForTimeout(100); }
  await aimAt(page, target); await page.mouse.down(); await page.waitForTimeout(100); await page.mouse.up();
  await page.waitForFunction(() => __night.snapshot().fireZones.length > 0);
  await page.mouse.move(500, 500); await page.waitForTimeout(800);
  await page.screenshot({ path: fileURLToPath(new URL('fire-close.png', out)) });
  evidence.fire = (await snapshot(page)).effects.fires;
  await press(page, 'weapon2');
  const deadline = Date.now() + 360000;
  while (Date.now() < deadline) {
    state = await snapshot(page);
    if (state.phase !== 'playing') break;
    target = state.units.filter(unit => !unit.friendly && unit.hp > 0).sort((a, b) => a.hp - b.hp)[0];
    if (!target) { await page.waitForTimeout(300); continue; }
    let lead = target;
    for (let i = 0; i < 3; i++) {
      const flight = await page.evaluate(point => __night.flightTime(point, 2), lead);
      lead = predictUnit(state, target, flight + .2);
    }
    await locate(lead); await aimAt(page, lead);
    await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up();
  }
  await page.waitForFunction(() => __night.snapshot().modal === 'duelResult', null, { timeout: 10000 });
  state = await snapshot(page);
  assert.equal(state.phase, 'success'); assert.equal(state.online.room.settlement.points, 40);
  evidence.result = { phase: state.phase, time: state.time, settlement: state.online.room.settlement, radioPlaying: state.radioPlaying, radioDuration: state.radioDuration };
  assert(state.radioPlaying && state.radioDuration > 0, 'Completion audio is playing with the result panel');
  await page.waitForTimeout(700); assert.equal((await snapshot(page)).time, state.time);
  await page.screenshot({ path: fileURLToPath(new URL('settlement.png', out)) });
  if (process.env.NIGHT_STYLE_REVIEW === '1') for (const [width, height] of [[568, 320], [844, 390], [1280, 720]]) {
    await page.setViewportSize({ width, height }); await page.waitForTimeout(400);
    assertLayout(await snapshot(page), width, height);
    await page.screenshot({ path: fileURLToPath(new URL('settlement-' + width + '.png', out)) });
  }
  await press(page, 'online:backLobby');
  await page.waitForFunction(() => __night.snapshot().online.panel === 'menu' && !__night.snapshot().online.active);
  assert.deepEqual(errors, []);
} finally {
  await writeFile(new URL('finish-evidence.json', out), JSON.stringify(evidence, null, 2));
  await context.close(); await browser.close();
}
console.log(JSON.stringify(evidence));

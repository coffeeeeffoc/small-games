import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { patrolPoint } from '../assets/scripts/core/Data.ts';
import { acceptanceBuild, snapshot, press, aimAt, navigateMap, waitForImpact } from './flight-browser.mjs';
const base = process.env.NIGHT_URL, build = await acceptanceBuild(base);
const dir = fileURLToPath(new URL('../reports/2026-10-24-redesign/', import.meta.url));
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir, size: { width: 1280, height: 720 } } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '?dev=0&mission=training-60');
  await page.waitForFunction(() => globalThis.__night?.snapshot().audio === 'ready' && !document.getElementById('night-startup'));
  await press(page, 'start'); await press(page, 'weapon2');
  for (let shot = 0; shot < 15 && (await snapshot(page)).phase === 'playing'; shot++) {
    let s = await snapshot(page), enemy = s.units.find(u => !u.friendly && u.hp > 0);
    assert(enemy); await navigateMap(page, enemy);
    s = await snapshot(page); enemy = s.units.find(u => u.id === enemy.id);
    const flight = await page.evaluate(p => __night.flightTime(p, 2), enemy);
    const target = enemy.kind === 'light' ? patrolPoint(enemy.origin, s.time - enemy.born + flight, s.mission.map) : enemy;
    await aimAt(page, target); assert(!(await snapshot(page)).friendlyRisk);
    await page.keyboard.press('Space');
    const fired = await snapshot(page), shell = fired.shots.at(-1); assert(shell && fired.fired > s.fired);
    await waitForImpact(page, shell); console.log('impact', shot + 1, (await snapshot(page)).kills);
    await page.waitForTimeout(150);
  }
  const result = await snapshot(page); assert.equal(result.phase, 'success'); assert.equal(result.kills, 3); assert.equal(result.friendlyDamage, 0);
  await page.screenshot({ path: `${dir}/training-success-1280.png` });
  await press(page, 'retry'); assert.equal((await snapshot(page)).phase, 'playing'); assert.equal((await snapshot(page)).fired, 0);
  const video = page.video(); await context.close(); await video.saveAs(`${dir}/training-source.webm`);
  assert.deepEqual(errors, []); await acceptanceBuild(base);
  await writeFile(`${dir}/onboarding.json`, JSON.stringify({ build, phase: result.phase, kills: result.kills, time: result.time, fired: result.fired, friendlyDamage: result.friendlyDamage, retry: true, errors }, null, 2));
} finally { await browser.close(); }

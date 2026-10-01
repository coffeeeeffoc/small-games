import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { acceptanceBuild, snapshot, press, missionReplay } from './flight-browser.mjs';

const base = process.env.NIGHT_URL, touch = process.env.NIGHT_TOUCH_ONLY === '1';
const build = await acceptanceBuild(base);
const dir = new URL('../reports/interaction-overhaul/', import.meta.url);
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errors = [];
try {
  const page = await browser.newPage({ viewport: touch ? { width: 844, height: 390 } : { width: 1366, height: 768 },
    hasTouch: touch, isMobile: touch });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base);
  await page.waitForFunction(() => globalThis.__night?.snapshot().audio === 'ready' && !document.getElementById('night-startup'));
  await press(page, 'start', touch);
  const replay = await missionReplay(page, { touch });
  const final = await snapshot(page);
  assert.equal(final.phase, 'success');
  assert.deepEqual(errors, []);
  await acceptanceBuild(base);
  const name = touch ? 'touch-mission' : 'desktop-mission';
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, dir)) });
  await writeFile(new URL(`${name}.json`, dir), JSON.stringify({ build, touch, replay, final, errors }, null, 2));
  console.log(JSON.stringify({ touch, time: final.time, phase: final.phase, kills: final.kills, friendlyDamage: final.friendlyDamage, errors }));
} finally { await browser.close(); }

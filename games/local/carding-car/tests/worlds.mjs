import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { themes } from '../assets/scripts/ThemeCatalog.ts';
import { routes } from '../assets/scripts/RouteCatalog.ts';
import { vehicles, drivers } from '../assets/scripts/Selection.ts';
import { sourceHash } from '../scripts/artifact.mjs';

const url = process.env.KART_URL || 'http://127.0.0.1:4198';
const build = await fetch(new URL('build-info.json', url)).then(r => r.json());
assert.equal(build.sourceHash, await sourceHash(), 'use the current built game');
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const reports = new URL('../reports/worlds/', import.meta.url);
await mkdir(reports, { recursive: true });
const errors = [], evidence = { worlds: [], choices: [], mobile: [] };
const snapshot = page => page.evaluate(() => globalThis.__kart.snapshot());
const loaded = page => page.waitForFunction(() => globalThis.__kart && !__kart.snapshot().loading && __kart.snapshot().modelsLoaded && __kart.snapshot().sceneryLoaded, {}, { timeout: 60000 });
async function open(options) {
  const page = await browser.newPage(options);
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Ignored attempt to cancel a touchcancel')) errors.push(m.text()); });
  await page.goto(url);
  assert.equal(await page.title(), '浪湾卡丁车');
  await loaded(page);
  return page;
}
try {
  const page = await open({ viewport: { width: 960, height: 540 } });
  for (const world of themes) {
    while ((await snapshot(page)).selection.theme !== world.id) await page.keyboard.press('Digit1');
    while ((await snapshot(page)).selection.route !== world.id) await page.keyboard.press('Digit2');
    await loaded(page);
    const menu = await snapshot(page);
    assert.equal(menu.items.length, 24);
    assert.equal(new Set(menu.items.map(i => i.kind)).size, 12);
    assert.deepEqual(menu.renderedItems, menu.items.map(i => `Item-${i.kind}`));
    if (world.id === 'desert') {
      const color = await page.evaluate(async () => {
        const cc = await System.import('cc'), pending = [cc.director.getScene()];
        while (pending.length) {
          const node = pending.pop();
          if (node.name === 'expansion/props/desert-rock') {
            const c = node.getComponentsInChildren(cc.MeshRenderer)[0].sharedMaterials[0].getProperty('mainColor');
            return [c.x, c.y, c.z, c.w];
          }
          pending.push(...node.children);
        }
      });
      assert.ok(color && color.every((v, i) => Math.abs(v - [0.69, 0.37, 0.18, 1][i]) < 1e-5), 'untextured GLB keeps its imported color');
    }
    await page.keyboard.press('Enter');
    await page.keyboard.down('ArrowUp');
    await page.waitForFunction(() => __kart.snapshot().time > 2);
    await page.keyboard.up('ArrowUp');
    const race = await snapshot(page);
    assert.ok(race.player.speed > 0 && race.progress.distance > menu.progress.distance, world.id);
    await page.screenshot({ path: fileURLToPath(new URL(`${world.id}.png`, reports)) });
    evidence.worlds.push({ id: world.id, length: race.route.length, speed: race.player.speed, items: race.items.length, fps: race.fps });
    await page.keyboard.press('KeyP');
    const paused = await snapshot(page);
    await page.waitForTimeout(180);
    assert.equal((await snapshot(page)).time, paused.time);
    await page.keyboard.press('KeyR');
    await page.waitForFunction(() => {
      const s = __kart.snapshot();
      return s.renderedItems.every((name, i) => name === `Item-${s.items[i].kind}`);
    });
    const restarted = await snapshot(page);
    assert.equal(restarted.time, 0);
    assert.deepEqual(restarted.renderedItems, restarted.items.map(i => `Item-${i.kind}`));
    assert.notEqual(restarted.seed, paused.seed);
    await page.keyboard.press('KeyP');
    await page.keyboard.press('KeyG');
    await loaded(page);
  }
  assert.equal(new Set(evidence.worlds.map(w => w.length)).size, themes.length, 'worlds must have distinct routes');
  for (let i = 0; i < vehicles.length; i++) {
    while ((await snapshot(page)).selection.vehicle !== vehicles[i][0]) await page.keyboard.press('Digit3');
    while ((await snapshot(page)).selection.driver !== drivers[i][0]) await page.keyboard.press('Digit4');
    await loaded(page);
    const state = await snapshot(page);
    assert.equal(state.loadError || '', '');
    assert.equal(state.renderedVehicles[0], vehicles[i][0]);
    assert.equal(state.renderedDrivers[0], drivers[i][0]);
    evidence.choices.push(state.selection);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => __kart.snapshot().phase === 'countdown');
    await page.waitForTimeout(150);
    await page.screenshot({ path: fileURLToPath(new URL(`choice-${vehicles[i][0]}.png`, reports)) });
    await page.keyboard.press('KeyP');
    await page.keyboard.press('KeyG');
    await loaded(page);
  }
  const saved = (await snapshot(page)).selection;
  await page.reload(); await loaded(page);
  assert.deepEqual((await snapshot(page)).selection, saved, 'selection survives reload');
  // Real input during overlapping loads must leave only the final selected world active.
  for (let i = 0; i < 5; i++) { await page.keyboard.press('Digit1'); await page.keyboard.press('Digit2'); }
  const finalChoice = (await snapshot(page)).selection;
  await loaded(page);
  assert.deepEqual((await snapshot(page)).selection, finalChoice);
  await page.close();

  for (const viewport of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) {
    const mobile = await open({ viewport, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36' });
    const portrait = viewport.height > viewport.width;
    const scale = portrait ? Math.min(viewport.width / 540, viewport.height / 960) : Math.min(viewport.width / 960, viewport.height / 540);
    const tap = (x, y) => portrait
      ? mobile.touchscreen.tap((viewport.width + 540 * scale) / 2 - y * scale, (viewport.height - 960 * scale) / 2 + x * scale)
      : mobile.touchscreen.tap((viewport.width - 960 * scale) / 2 + x * scale, (viewport.height - 540 * scale) / 2 + y * scale);
    const before = (await snapshot(mobile)).selection;
    await tap(710, 226); await loaded(mobile);
    assert.notEqual((await snapshot(mobile)).selection.theme, before.theme);
    await tap(710, 306); await loaded(mobile);
    assert.notEqual((await snapshot(mobile)).selection.vehicle, before.vehicle);
    await tap(710, 346); await loaded(mobile);
    assert.notEqual((await snapshot(mobile)).selection.driver, before.driver);
    await mobile.screenshot({ path: fileURLToPath(new URL(`mobile-${viewport.width}-menu.png`, reports)) });
    await tap(480, 395);
    await mobile.waitForFunction(() => __kart.snapshot().time > 1);
    assert.ok((await snapshot(mobile)).player.speed > 0, 'touch starts automatic driving');
    assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    evidence.mobile.push({ ...viewport, selection: (await snapshot(mobile)).selection });
    await mobile.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(new URL('validation.json', reports), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally { await browser.close(); }

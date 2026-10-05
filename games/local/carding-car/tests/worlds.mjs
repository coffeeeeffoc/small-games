import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { themes } from '../assets/scripts/ThemeCatalog.ts';
import { routes } from '../assets/scripts/RouteCatalog.ts';
import { defaultSelection, vehicles, drivers } from '../assets/scripts/Selection.ts';
import { gameURL, startBrowser, tapHome, verifyBuild, prepareRace, startRace } from './browser-utils.mjs';

const url = gameURL();
await verifyBuild(url);
const browser = await startBrowser(url);
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
async function setup(page) {
  const state = await snapshot(page);
  assert.equal(state.home.visible, true, 'selection only changes from the home/setup flow');
  if (state.home.page !== 'setup') await tapHome(page, '选择比赛');
}
async function select(page, field, id) {
  await setup(page);
  const index = ['theme', 'route', 'vehicle', 'driver'].indexOf(field);
  const choices = field === 'theme' ? themes : field === 'route' ? routes : field === 'vehicle' ? vehicles : drivers;
  for (let i = 0; (await snapshot(page)).selection[field] !== id; i++) {
    assert.ok(i < choices.length, `cannot select ${field}=${id} within one catalog cycle`);
    await tapHome(page, '›', index);
  }
  await loaded(page);
}
try {
  const page = await open({ viewport: { width: 960, height: 540 } });
  for (const world of themes) {
    await select(page, 'theme', world.id);
    await select(page, 'route', world.id);
    await prepareRace(page);
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
    await startRace(page, false);
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
    await loaded(page);
    await page.waitForFunction(() => {
      const s = __kart.snapshot();
      return s.renderedItems.every((name, i) => name === `Item-${s.items[i].kind}`);
    });
    const restarted = await snapshot(page);
    assert.equal(restarted.phase, 'ready');
    assert.equal(restarted.staged, true);
    assert.equal(restarted.time, 0);
    assert.deepEqual(restarted.renderedItems, restarted.items.map(i => `Item-${i.kind}`));
    assert.notEqual(restarted.seed, paused.seed);
    await startRace(page, false);
    await page.keyboard.press('KeyP');
    await page.keyboard.press('KeyG');
    await loaded(page);
  }
  assert.equal(new Set(evidence.worlds.map(w => w.length)).size, themes.length, 'worlds must have distinct routes');
  // Synthetic ownership fixture for catalog rendering/configuration, never an economy check.
  await page.evaluate(owned => localStorage.setItem('kart-career-v1', JSON.stringify({ owned })),
    [...vehicles.map(([id]) => 'vehicle:' + id), ...drivers.map(([id]) => 'driver:' + id)]);
  await page.reload(); await loaded(page);
  for (let i = 0; i < vehicles.length; i++) {
    await select(page, 'vehicle', vehicles[i][0]);
    await select(page, 'driver', drivers[i][0]);
    const state = await snapshot(page);
    assert.equal(state.loadError || '', '');
    assert.equal(state.renderedVehicles[0], vehicles[i][0]);
    assert.equal(state.renderedDrivers[0], drivers[i][0]);
    evidence.choices.push(state.selection);
    await prepareRace(page);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => __kart.snapshot().phase === 'countdown');
    await page.waitForTimeout(150);
    await page.screenshot({ path: fileURLToPath(new URL(`choice-${vehicles[i][0]}.png`, reports)) });
    await page.keyboard.press('KeyP');
    await page.keyboard.press('KeyG');
    await loaded(page);
  }
  await page.reload(); await loaded(page);
  assert.deepEqual((await snapshot(page)).selection, defaultSelection, 'a plain URL reload restores the default selection');
  // Real input during overlapping loads must leave only the final selected world active.
  await setup(page);
  for (let i = 0; i < 5; i++) { await tapHome(page, '›', 0); await tapHome(page, '›', 1); }
  const finalChoice = (await snapshot(page)).selection;
  await loaded(page);
  assert.deepEqual((await snapshot(page)).selection, finalChoice);
  await page.close();

  for (const viewport of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) {
    const mobile = await open({ viewport, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36' });
    await startRace(mobile);
    await mobile.keyboard.press('KeyP'); await mobile.keyboard.press('KeyG');
    await loaded(mobile);
    // This second pass tests unlocked candidate configuration with a synthetic owned catalog.
    await mobile.evaluate(owned => localStorage.setItem('kart-career-v1', JSON.stringify({ owned })),
      [...vehicles.map(([id]) => 'vehicle:' + id), ...drivers.map(([id]) => 'driver:' + id)]);
    await mobile.reload(); await loaded(mobile); await setup(mobile);
    const before = (await snapshot(mobile)).selection;
    await tapHome(mobile, '›', 0); await loaded(mobile);
    assert.notEqual((await snapshot(mobile)).selection.theme, before.theme);
    await tapHome(mobile, '›', 2); await loaded(mobile);
    assert.notEqual((await snapshot(mobile)).selection.vehicle, before.vehicle);
    await tapHome(mobile, '›', 3); await loaded(mobile);
    assert.notEqual((await snapshot(mobile)).selection.driver, before.driver);
    await mobile.screenshot({ path: fileURLToPath(new URL(`mobile-${viewport.width}-menu.png`, reports)) });
    await startRace(mobile);
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

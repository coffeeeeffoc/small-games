import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { themes } from '../assets/scripts/ThemeCatalog.ts';
import { routes } from '../assets/scripts/RouteCatalog.ts';
import { defaultSelection, vehicles, drivers } from '../assets/scripts/Selection.ts';
import { gameURL, startBrowser, tapHome, verifyBuild, startRace } from './browser-utils.mjs';

const url = gameURL();
await verifyBuild(url);
const browser = await startBrowser(url);
const reports = new URL('../reports/themes-routes/', import.meta.url);
await mkdir(reports, { recursive: true });
const errors = [],
  evidence = [];
const snapshot = (page) => page.evaluate(() => __kart.snapshot());
const loaded = async (page) => {
  await page.waitForFunction(
    () => globalThis.__kart && (!__kart.snapshot().loading || __kart.snapshot().loadError),
    {},
    { timeout: 60000 },
  );
  assert.equal((await snapshot(page)).loadError, '');
};
async function select(page, field, id) {
  if ((await snapshot(page)).home.page !== 'setup') await tapHome(page, '选择比赛');
  const before = await snapshot(page);
  for (let i = 0; (await snapshot(page)).selection[field] !== id; i++) {
    assert.ok(i < (field === 'theme' ? themes : routes).length, `cannot select ${field}=${id} within one catalog cycle`);
    await tapHome(page, '›', field === 'theme' ? 0 : 1);
  }
  await loaded(page);
  const after = await snapshot(page),
    other = field === 'theme' ? 'route' : 'theme';
  assert.equal(after.selection[other], before.selection[other]);
  if (field === 'theme') assert.deepEqual(after.route, before.route);
}
function observe(page) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Ignored attempt to cancel a touchcancel'))
      errors.push(m.text());
  });
}
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  observe(page);
  await page.goto(url);
  assert.equal(await page.title(), '浪湾卡丁车');
  await loaded(page);
  assert.deepEqual((await snapshot(page)).selection, defaultSelection);
  await startRace(page, false);
  await page.keyboard.press('KeyP'); await page.keyboard.press('KeyG');
  await loaded(page);
  // Synthetic ownership enables catalog/configuration checks; it does not prove purchases or progression.
  await page.evaluate(owned => {
    localStorage.setItem('kart-career-v1', JSON.stringify({ owned }));
    localStorage.setItem(
      'kart-selection-v1',
      JSON.stringify({ world: 'glacier', vehicle: 'rally', driver: 'ranger' }),
    );
    localStorage.setItem(
      'kart-records-v1-glacier',
      JSON.stringify([{ time: 150, bestLap: 48, place: 1 }]),
    );
  }, [...vehicles.map(([id]) => 'vehicle:' + id), ...drivers.map(([id]) => 'driver:' + id)]);
  await page.reload();
  await loaded(page);
  assert.deepEqual((await snapshot(page)).selection, defaultSelection,
    'a plain URL starts the default selection even when legacy preferences exist');
  const glacierURL = new URL(url);
  for (const [key, value] of Object.entries({ theme: 'glacier', route: 'glacier', vehicle: 'rally', driver: 'ranger' }))
    glacierURL.searchParams.set(key, value);
  await page.goto(glacierURL.href);
  await loaded(page);
  assert.deepEqual((await snapshot(page)).selection, {
    theme: 'glacier',
    route: 'glacier',
    vehicle: 'rally',
    driver: 'ranger',
  });
  assert.equal((await snapshot(page)).records[0].time, 150);
  await select(page, 'theme', 'city');
  assert.equal(
    (await snapshot(page)).records[0].time,
    150,
    'visual theme must not change route records',
  );
  await select(page, 'route', 'desert');
  assert.deepEqual((await snapshot(page)).records, [], 'another route has its own records');
  await select(page, 'route', 'glacier');
  assert.equal((await snapshot(page)).records[0].time, 150);
  await page.keyboard.down('ShiftRight');
  const beforeBlockedKey = (await snapshot(page)).selection.route;
  await page.keyboard.press('Digit2');
  assert.equal((await snapshot(page)).selection.route, beforeBlockedKey, 'home blocks legacy selection shortcuts');
  await tapHome(page, '‹', 1);
  await loaded(page);
  await tapHome(page, '‹', 1);
  await loaded(page);
  await page.keyboard.up('ShiftRight');
  assert.equal(
    (await snapshot(page)).selection.route,
    'city',
    'previous-map taps keep cycling backwards across loads',
  );
  await tapHome(page, '›', 1);
  await loaded(page);
  assert.equal(
    (await snapshot(page)).selection.route,
    'desert',
    'next-map tap restores forward cycling',
  );
  for (const theme of themes.filter(
    (t) => !process.env.KART_THEME || t.id === process.env.KART_THEME,
  )) {
    await select(page, 'theme', theme.id);
    for (const route of process.env.KART_MATRIX_SMOKE
      ? routes.filter((r) => r.id === theme.id)
      : routes) {
      await select(page, 'route', route.id);
      const state = await snapshot(page);
      assert.equal(state.selection.theme, theme.id);
      assert.equal(state.selection.route, route.id);
      assert.equal(Object.keys(state.home.selection).length, 4);
      const choices = await page.evaluate(async () => {
        const cc = await System.import('cc');
        const game = cc.director.getScene().getComponentsInChildren(cc.Component).find(c => c.home && c.race);
        return game.home.root.getComponentsInChildren(cc.Label).filter(label => label.node.activeInHierarchy).map(label => label.string);
      });
      for (const name of [theme.name, route.name, vehicles.find(v => v[0] === state.selection.vehicle)[1], drivers.find(v => v[0] === state.selection.driver)[1]])
        assert.ok(choices.includes(name), `selected option ${name} is visible in setup`);
      assert.equal(state.items.length, 24);
      assert.equal(
        await page.evaluate(async () => {
          const cc = await System.import('cc');
          return cc.director
            .getScene()
            .getChildByName('KartGame')
            .children.filter((n) => n.name === 'SelectedTheme' && n.active).length;
        }),
        1,
      );
      evidence.push({ theme: theme.id, route: route.id, length: state.route.length });
      if (theme.id === route.id || route.id === 'highland' || route.id === 'seaside') {
        await startRace(page, false);
        await page.keyboard.down('ArrowUp');
        await page.waitForFunction(() => __kart.snapshot().time > 1.2);
        await page.keyboard.up('ArrowUp');
        assert.ok((await snapshot(page)).player.speed > 0);
        await page.screenshot({
          path: fileURLToPath(new URL(`${theme.id}-${route.id}.png`, reports)),
        });
        await page.keyboard.press('KeyP');
        await page.keyboard.press('KeyG');
        await loaded(page);
      }
    }
    console.log(`validated theme: ${theme.id}`);
  }
  await page.reload();
  await loaded(page);
  assert.deepEqual((await snapshot(page)).selection, {
    theme: 'glacier', route: 'glacier', vehicle: 'rally', driver: 'ranger',
  }, 'reloading honors the launch URL instead of the last menu selection');
  await page.goto(url);
  await loaded(page);
  assert.deepEqual((await snapshot(page)).selection, defaultSelection,
    'a plain URL restores the lightweight default selection');
  await tapHome(page, '选择比赛');
  for (let i = 0; i < 6; i++) {
    await tapHome(page, '›', 0);
    await tapHome(page, '›', 1);
  }
  const finalSelection = (await snapshot(page)).selection;
  await loaded(page);
  assert.deepEqual((await snapshot(page)).selection, finalSelection);
  await page.close();
  for (const viewport of [
    { width: 844, height: 390 },
    { width: 360, height: 800 },
  ]) {
    const mobile = await browser.newPage({
      viewport,
      hasTouch: true,
      isMobile: true,
      userAgent:
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36',
    });
    observe(mobile);
    await mobile.goto(url);
    await loaded(mobile);
    assert.deepEqual((await snapshot(mobile)).selection, defaultSelection);
    await startRace(mobile);
    await mobile.keyboard.press('KeyP'); await mobile.keyboard.press('KeyG');
    await loaded(mobile);
    // Synthetic unlocked catalog for the independent candidate-selection checks below.
    await mobile.evaluate(owned => localStorage.setItem('kart-career-v1', JSON.stringify({ owned })),
      [...vehicles.map(([id]) => 'vehicle:' + id), ...drivers.map(([id]) => 'driver:' + id)]);
    await mobile.reload(); await loaded(mobile); await tapHome(mobile, '选择比赛');
    for (const [i, field] of ['theme', 'route', 'vehicle', 'driver'].entries()) {
      const before = (await snapshot(mobile)).selection;
      await tapHome(mobile, '›', i);
      await loaded(mobile);
      const after = (await snapshot(mobile)).selection;
      assert.notEqual(after[field], before[field]);
      for (const other of Object.keys(before).filter((k) => k !== field))
        assert.equal(after[other], before[other]);
    }
    await mobile.screenshot({
      path: fileURLToPath(new URL(`menu-${viewport.width}.png`, reports)),
    });
    await startRace(mobile);
    await mobile.waitForFunction(() => __kart.snapshot().time > 1);
    assert.ok((await snapshot(mobile)).player.speed > 0);
    assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await mobile.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('validation.json', reports),
    JSON.stringify({ combinations: evidence, errors }, null, 2),
  );
  console.log(
    `PASS: ${evidence.length} combinations, independent touch choices, default/URL selection, rapid switching; no errors.`,
  );
} finally {
  await browser.close();
}

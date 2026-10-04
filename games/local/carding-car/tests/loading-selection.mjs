import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { defaultSelection } from '../assets/scripts/Selection.ts';
import { gameURL, startBrowser, verifyBuild } from './browser-utils.mjs';

const url = gameURL();
const build = await verifyBuild(url);
const browser = await startBrowser(url);
const staleSelection = { theme: 'glacier', route: 'highland', vehicle: 'supercar', driver: 'polar-guide' };
const sharedSelection = { theme: 'danxia', route: 'city', vehicle: 'formula', driver: 'champion' };
const reports = [];
try {
  for (const [label, query, expected] of [
    ['default-with-old-save', '', defaultSelection],
    ['selected-share', new URLSearchParams(sharedSelection).toString(), sharedSelection],
    ['invalid-share', 'theme=missing&route=missing&vehicle=missing&driver=missing', defaultSelection],
  ]) {
    const context = await browser.newContext({ viewport: { width: 960, height: 540 }, hasTouch: true });
    await context.addInitScript((saved) => localStorage.setItem('kart-selection-v1', JSON.stringify(saved)), staleSelection);
    const page = await context.newPage();
    const requests = [], errors = [];
    page.on('request', (request) => requests.push(new URL(request.url()).pathname));
    page.on('pageerror', (error) => errors.push(error.message));
    const target = new URL(url); target.search = query;
    const started = performance.now();
    await page.goto(target.href);
    await page.waitForFunction(() => globalThis.__kart && !__kart.snapshot().loading && __kart.snapshot().modelsLoaded,
      null, { timeout: 120000 });
    await page.locator('#kart-loading').waitFor({ state: 'detached' });
    const state = await page.evaluate(() => __kart.snapshot());
    assert.deepEqual(state.selection, expected, label);
    assert.equal(state.phase, 'ready', 'loading cannot start the race automatically');
    assert.deepEqual(state.renderedVehicles, [expected.vehicle]);
    assert.deepEqual(state.renderedDrivers, [expected.driver]);
    assert.equal(state.audioClips, 0);
    assert.ok(!state.requestedArt.some((path) => /art-items|art-audio/.test(path)), 'pickups and audio wait for play');
    const vehicles = requests.filter((path) => /\/art-vehicle-/.test(path));
    const drivers = requests.filter((path) => /\/art-driver-/.test(path));
    assert.ok(vehicles.length > 0 && vehicles.every((path) => path.includes(`art-vehicle-${expected.vehicle}/`)), label);
    assert.ok(drivers.length > 0 && drivers.every((path) => path.includes(`art-driver-${expected.driver}/`)), label);
    assert.ok(!requests.some((path) => /\/art-(items|audio|scene-|props-|texture-glacier)/.test(path)),
      'no unrelated scene, item, audio or stale saved-theme assets are transferred');
    if (label === 'selected-share') {
      assert.ok(!requests.some((path) => /\/art-(palm|broadleaf|coastal-rocks|lighthouse)\//.test(path)),
        'a shared theme must not load the default coast first');
      assert.ok(!state.requestedArt.includes('art-catalog/seaside'), 'procedural Danxia needs no seaside model catalog');
    }
    assert.deepEqual(errors, []);
    reports.push({ label, milliseconds: Math.round(performance.now() - started), selection: state.selection,
      requestedArt: state.requestedArt, requests, errors });
    await context.close();
  }
  await mkdir(new URL('../reports/', import.meta.url), { recursive: true });
  await writeFile(new URL('../reports/loading-selection.json', import.meta.url), JSON.stringify({ build, cases: reports }, null, 2));
  console.log('PASS: deterministic default, direct selected-share loading, invalid-share fallback and deferred optional assets');
} finally { await browser.close(); }

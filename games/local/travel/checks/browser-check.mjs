import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLACES } from '../game-state.mjs';

// Exercise real keyboard / touch controls. Telemetry is read only; no game state is seeded.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '@playwright/test');
const chrome = process.env.CHROME_PATH || (process.env.ProgramFiles && resolve(process.env.ProgramFiles, 'Google/Chrome/Application/chrome.exe'));
const browser = await chromium.launch({ headless: true, ...(chrome && existsSync(chrome) ? { executablePath: chrome } : {}) });
const baseURL = process.env.BASE_URL || process.env.GAME_URL || 'http://localhost:4178';
const key = 'quye-travel-v1';
const loadingOnly = process.argv.includes('--loading');
const artifacts = resolve(root, 'artifacts');
await mkdir(artifacts, { recursive: true });
const report = { url: baseURL, checks: [], scenes: [], photos: [], assets: [], errors: [], expectedErrors: [] };
let activePage;

function pass(message) { report.checks.push(message); console.log(`PASS ${message}`); }
async function game(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)), key); }
async function stats(page) {
  return page.locator('#world-canvas').evaluate(canvas => Object.fromEntries(Object.entries(canvas.dataset).map(([k, v]) => [k, v !== '' && Number.isFinite(Number(v)) ? Number(v) : v])));
}
async function shot(page, name, fullPage = false) {
  return page.screenshot({ path: resolve(artifacts, `qa-3d-${name}.png`), fullPage, animations: 'disabled' });
}
async function makePage(options = {}, expectedFailures = new Set()) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...options });
  const page = await context.newPage();
  activePage = page;
  page.on('pageerror', error => report.errors.push(error.message));
  const networkError = (url, message) => (expectedFailures.has(url) ? report.expectedErrors : report.errors).push(message);
  page.on('console', message => { if (message.type() === 'error') networkError(message.location().url, message.text()); });
  page.on('requestfailed', request => networkError(request.url(), `${request.method()} ${request.url()}: ${request.failure()?.errorText}`));
  page.on('response', response => {
    if (response.status() >= 400) networkError(response.url(), `HTTP ${response.status()} ${response.url()}`);
    else if (/\/assets\/(reference|pbr)\//.test(response.url()) && !report.assets.includes(response.url())) report.assets.push(response.url());
  });
  await page.goto(baseURL);
  await page.locator('.map-art').evaluate(image => image.decode());
  assert.match(await page.title(), /去野/);
  return page;
}
async function enter(page, id) {
  activePage = page;
  await page.locator(`[data-place="${id}"]`).click();
  await page.locator('#travel-button').click();
  assert.equal(await page.locator('#travel-button').isDisabled(), true);
  await page.locator('#world-dialog[open]').waitFor();
  await page.waitForFunction(() => Number(document.querySelector('#world-canvas').dataset.triangles) > 0);
  assert.match(await page.locator('#world-dialog').innerText(), new RegExp(PLACES.find(p => p.id === id).name));
  assert.equal(await page.locator('#world-finish').isDisabled(), true);
  assert.equal((await stats(page)).mode, 'walk');
  assert.equal((await stats(page)).cameraHeight, 1.65, 'Walking uses an eye-level first-person camera');
}
async function leave(page) {
  await page.locator('#world-leave').click();
  await page.locator('#world-dialog').waitFor({ state: 'hidden' });
}
async function held(page, keys, duration = 180) {
  for (const key of keys) await page.keyboard.down(key);
  await page.waitForTimeout(duration);
  for (const key of keys) await page.keyboard.up(key);
}
async function walkTo(page, x, z) {
  for (let i = 0; i < 60; i++) {
    const s = await stats(page);
    const dx = x - s.playerX, dz = z - s.playerZ;
    if (Math.hypot(dx, dz) < 1.9) return;
    const localX = dx * Math.cos(s.yaw) + dz * Math.sin(s.yaw);
    const localZ = -dx * Math.sin(s.yaw) + dz * Math.cos(s.yaw);
    const keys = [];
    if (Math.abs(localX) > .4) keys.push(localX > 0 ? 'd' : 'a');
    if (Math.abs(localZ) > .4) keys.push(localZ > 0 ? 's' : 'w');
    await held(page, keys);
  }
  assert.fail(`Could not walk to (${x}, ${z}): ${JSON.stringify(await stats(page))}`);
}
async function interactTwice(page, move = walkTo, touch = false) {
  const targets = await page.locator('#world-markers [data-interaction]').evaluateAll(markers => markers.map(marker => ({ x: Number(marker.dataset.x), z: Number(marker.dataset.z) })));
  assert.equal(targets.length, 2);
  await move(page, targets[0].x, targets[0].z);
  assert.equal(await page.locator('#world-interact').isDisabled(), false);
  if (touch) await page.locator('#world-interact').tap();
  else await page.keyboard.press('e');
  await page.waitForFunction(() => Number(document.querySelector('#world-canvas').dataset.interactions) === 1);
  if (!touch) await page.keyboard.press('e');
  assert.equal((await stats(page)).interactions, 1, 'Repeated action must not count as a second encounter');
  await move(page, targets[1].x, targets[1].z);
  assert.equal(await page.locator('#world-interact').isDisabled(), false);
  if (touch) await page.locator('#world-interact').tap();
  else await page.locator('#world-interact').click();
  await page.waitForFunction(() => Number(document.querySelector('#world-canvas').dataset.interactions) === 2);
  assert.equal(await page.locator('#world-finish').isDisabled(), true, 'A photo is also required');
}
async function capture(page, checkFraming = false) {
  await page.locator('#world-camera').click();
  await page.waitForFunction(() => document.querySelector('#world-canvas').dataset.mode === 'photo');
  if (checkFraming) {
    await page.waitForFunction(() => !document.querySelector('#world-shutter').disabled);
    const bounds = await page.locator('#world-canvas').boundingBox();
    const x = bounds.width * .45, y = bounds.height * .5;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 250, y, { steps: 12 });
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('#world-shutter').disabled);
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#world-finish').isDisabled(), true, 'Looking away from the landmark must not produce a photo');
    await page.mouse.move(x + 250, y);
    await page.mouse.down();
    await page.mouse.move(x, y, { steps: 12 });
    await page.mouse.up();
    await page.waitForFunction(() => !document.querySelector('#world-shutter').disabled);
  }
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !document.querySelector('#world-finish').disabled);
}
async function complete(page, id) {
  const before = await game(page);
  await enter(page, id);
  await interactTwice(page);
  await capture(page);
  assert.deepEqual(await game(page), before, 'Photo stays provisional until finishing the visit');
  await page.locator('#world-finish').click();
  await page.locator('#world-dialog').waitFor({ state: 'hidden' });
  const saved = await game(page);
  const visit = saved.state.visits.at(-1);
  assert.equal(visit.id, id);
  assert.match(visit.photo, /^data:image\/jpeg;base64,/);
  const jpeg = Buffer.from(visit.photo.split(',')[1], 'base64');
  assert.deepEqual(jpeg.subarray(0, 2), Buffer.from([0xff, 0xd8]));
  assert.ok(jpeg.length > 2000 && visit.photo.length <= 220000, `JPEG size ${jpeg.length}`);
  report.photos.push({ id, score: visit.score, stars: visit.stars, bytes: jpeg.length });
  return saved;
}
async function noOverflow(page, width, height) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const bounds = await page.locator('#world-dialog').boundingBox();
  assert.ok(bounds.x >= -1 && bounds.y >= -1 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1, JSON.stringify(bounds));
  for (const selector of ['#world-camera', '#world-interact', '#world-leave', '#world-joystick']) {
    const control = await page.locator(selector).boundingBox();
    assert.ok(control && control.x >= 0 && control.y >= 0 && control.x + control.width <= width + 1 && control.y + control.height <= height + 1, `${selector}: ${JSON.stringify(control)}`);
  }
}

async function checkAssetFailures() {
  // This required texture is loaded by every destination; only this injected failure is expected.
  const assetURL = new URL('/assets/pbr/ground-color.jpg', baseURL).href;
  const expectedFailures = new Set([assetURL]);
  const failed = await makePage({ reducedMotion: 'reduce' }, expectedFailures);
  let requested = false;
  await failed.route(assetURL, async route => { requested = true; await route.fulfill({ status: 404, body: 'Deliberate QA asset failure' }); });
  await failed.locator('[data-place="oldtown"]').click();
  await failed.locator('#travel-button').click();
  await failed.locator('#world-error').waitFor({ state: 'visible' });
  assert.equal(requested, true, 'The required texture must actually be requested');
  assert.match(await failed.locator('#world-error').innerText(), /素材|加载|重试/);
  assert.equal(await failed.locator('#world-loading').isVisible(), false);
  assert.equal(await game(failed), null);
  await shot(failed, 'asset-error');
  await leave(failed);
  assert.equal(await failed.locator('#travel-button').isDisabled(), false);
  assert.equal(await failed.locator('#time-value').innerText(), '08:00');
  assert.equal(await game(failed), null);
  await failed.context().close();
  pass('Required scene texture 404 displays an actionable error; returning to map restores controls without charging resources');

  // Hold one old scene request until a newer scene is ready, then reject the old request.
  const oldSceneAsset = new URL('/assets/reference/dali-old-town.jpg', baseURL).href;
  expectedFailures.add(oldSceneAsset);
  const slow = await makePage({ reducedMotion: 'reduce' }, expectedFailures);
  let release, firstRequest = true;
  const assetGate = new Promise(resolve => { release = resolve; });
  const intercepted = slow.waitForRequest(oldSceneAsset, { timeout: 10000 });
  await slow.route(oldSceneAsset, async route => {
    if (!firstRequest) { await route.continue(); return; }
    firstRequest = false;
    await assetGate;
    await route.fulfill({ status: 404, body: 'Disposed scene request rejected by QA' });
  });
  await slow.locator('[data-place="oldtown"]').click();
  await slow.locator('#travel-button').click();
  await intercepted;
  await slow.locator('#world-loading').waitFor({ state: 'visible' });
  assert.equal(await slow.locator('#world-error').isVisible(), false);
  await leave(slow);
  assert.equal(await game(slow), null);
  await enter(slow, 'pier');
  const initial = await stats(slow);
  release();
  await slow.waitForTimeout(400);
  assert.equal(await slow.locator('#world-error').isVisible(), false, 'Disposed scene rejection must not cover the new scene');
  assert.equal(await slow.locator('#world-loading').isVisible(), false);
  assert.equal(await slow.locator('#world-title').innerText(), '龙龛码头');
  assert.ok((await stats(slow)).frames > initial.frames, 'New scene must keep rendering after old request finishes');
  const beforeMove = await stats(slow);
  await held(slow, ['w'], 300);
  await slow.waitForTimeout(150);
  assert.ok(beforeMove.playerZ - (await stats(slow)).playerZ > .2);
  await leave(slow);
  assert.equal(await game(slow), null);
  await slow.context().close();
  pass('Leaving during asset loading and re-entering is safe: delayed old failure cannot replace the new UI, controls or renderer');
}

try {
  await checkAssetFailures();
  if (!loadingOnly) {
  const page = await makePage();
  assert.equal(await page.locator('#time-value').innerText(), '08:00');
  await shot(page, 'desktop-home', true);
  await page.locator('#album-nav').click();
  assert.equal(await page.locator('.empty-album').isVisible(), true);
  await page.keyboard.press('Escape');
  await page.locator('#guide-nav').click();
  assert.match(await page.locator('#info-dialog').innerText(), /3D|三维|摇杆|WASD/);
  await page.keyboard.press('Escape');
  await page.locator('#sound-toggle').click();
  assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'), 'true');
  pass('Map entrance, empty journal, updated control guide and audio toggle');

  for (const place of PLACES) {
    await enter(page, place.id);
    const first = await stats(page);
    assert.ok(first.triangles > 100 && first.drawCalls > 0, JSON.stringify(first));
    assert.equal(await page.locator('#world-interact').isDisabled(), true, 'Cannot interact from the spawn point');
    await page.keyboard.press('e');
    assert.equal((await stats(page)).interactions, 0);
    const started = Date.now();
    await page.waitForTimeout(500);
    const rendered = await stats(page);
    assert.ok(rendered.frames > first.frames, '3D renderer must produce new frames');
    report.scenes.push({ id: place.id, ...rendered, sampledFPS: Math.round((rendered.frames - first.frames) * 1000 / (Date.now() - started)) });
    await shot(page, `scene-${place.id}`);
    await leave(page);
    const closed = await stats(page);
    await page.waitForTimeout(250);
    assert.deepEqual(await stats(page), closed, 'Closed scene must stop updating its canvas');
    assert.equal(await game(page), null);
    assert.equal(await page.locator('#time-value').innerText(), '08:00');
  }
  pass('Six rendered destinations, proximity locks, cancellation without charges and renderer cleanup');

  await enter(page, 'oldtown');
  const beforeMove = await stats(page);
  const beforeImage = await page.locator('#world-canvas').screenshot();
  await held(page, ['w'], 450);
  const afterMove = await stats(page);
  assert.ok(beforeMove.playerZ - afterMove.playerZ > .3, `${beforeMove.playerZ} -> ${afterMove.playerZ}`);
  const movedImage = await page.locator('#world-canvas').screenshot();
  assert.notDeepEqual(movedImage, beforeImage);
  report.movement = { before: beforeMove, after: afterMove, renderedPixelsChanged: !movedImage.equals(beforeImage), screenshotBytes: [beforeImage.length, movedImage.length] };
  const canvas = await page.locator('#world-canvas').boundingBox();
  const cx = canvas.x + canvas.width * .6, cy = canvas.y + canvas.height * .5;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 80, cy - 40, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(160);
  assert.ok(Math.abs((await stats(page)).yaw - afterMove.yaw) > .1, 'Dragging must turn the 3D camera');
  assert.ok((await stats(page)).pitch - afterMove.pitch > .1, 'First-person vertical drag changes eye pitch');
  assert.equal((await stats(page)).cameraHeight, 1.65);
  await page.mouse.move(cx + 80, cy - 40);
  await page.mouse.down();
  await page.mouse.move(cx, cy, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.down('w');
  await page.locator('#world-pause').click();
  const paused = await stats(page);
  await page.waitForTimeout(300);
  assert.equal((await stats(page)).playerZ, paused.playerZ);
  await page.keyboard.up('w');
  await page.locator('#world-pause').click();
  await page.waitForTimeout(160);
  const resumed = await stats(page);
  await page.waitForTimeout(250);
  assert.equal((await stats(page)).playerZ, resumed.playerZ, 'Resume must not retain held movement');
  await interactTwice(page);
  await capture(page, true);
  await shot(page, 'desktop-photo');
  assert.equal(await game(page), null);
  await page.locator('#world-finish').click();
  await page.locator('#world-dialog').waitFor({ state: 'hidden' });
  let saved = await game(page);
  assert.deepEqual([saved.state.hour, saved.state.money, saved.state.energy], [10, 182, 84]);
  assert.match(saved.state.visits[0].photo, /^data:image\/jpeg;base64,/);
  assert.equal(saved.album.length, 1);
  await page.locator('[data-place="oldtown"]').click();
  assert.equal(await page.locator('#travel-button').isDisabled(), true);
  await page.reload();
  assert.deepEqual(await game(page), saved);
  await page.locator('#album-nav').click();
  assert.equal(await page.locator('.postcard-photo img, img.postcard-photo').count(), 1);
  await page.keyboard.press('Escape');
  pass('Real WASD movement, camera drag, pause/input cleanup, two interactions, captured 3D photo, exact single charge and persisted album');

  saved = await complete(page, 'pagodas');
  assert.deepEqual([saved.state.hour, saved.state.money, saved.state.energy], [12, 144, 64]);
  await page.locator('#rest-button').click();
  saved = await game(page);
  assert.deepEqual([saved.state.hour, saved.state.money, saved.state.energy], [13, 129, 94]);
  await page.locator('#finish-button').click();
  await page.locator('[data-action="close"]').click();
  assert.deepEqual(await game(page), saved);
  await page.locator('#finish-button').click();
  await page.locator('[data-action="finish"]').click();
  assert.equal((await game(page)).state.status, 'finished');
  const downloading = page.waitForEvent('download');
  await page.locator('[data-action="export"]').click();
  const download = await downloading;
  const exportPath = resolve(artifacts, 'qa-3d-journal.png');
  await download.saveAs(exportPath);
  const png = await readFile(exportPath);
  assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(png.readUInt32BE(16), 1000);
  await shot(page, 'desktop-summary');
  await page.locator('[data-action="restart"]').click();
  assert.deepEqual([(await game(page)).state.visits.length, (await game(page)).album.length], [0, 2]);
  pass('Rest, canceled trip end, confirmed trip end, PNG journal export and restart preserving photos');

  const route = await makePage({ reducedMotion: 'reduce' });
  for (const id of ['oldtown', 'pagodas', 'meadow', 'village', 'cafe']) await complete(route, id);
  saved = await game(route);
  assert.deepEqual([saved.state.hour, saved.state.money, saved.state.energy, saved.state.visits.length, saved.state.status], [18, 62, 4, 5, 'finished']);
  await route.locator('#info-close').click();
  await route.locator('[data-place="pier"]').click();
  assert.equal(await route.locator('#travel-button').isDisabled(), true);
  await route.reload();
  assert.equal(await route.locator('.live-dot').innerText(), '今日已收官');
  pass('Fresh five-stop 3D route reaches four-stamp target, ends at 18:00 and restores completed state under reduced motion');

  const phone = await makePage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await enter(phone, 'pier');
  await noOverflow(phone, 390, 844);
  await shot(phone, 'phone-portrait');
  const session = await phone.context().newCDPSession(phone);
  const stick = await phone.locator('#world-joystick').boundingBox();
  const center = { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 };
  const look = { x: 275, y: 360 };
  const mobileBefore = await stats(phone);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, ...center }, { id: 2, ...look }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: center.x, y: center.y - 35 }, { id: 2, x: look.x + 65, y: look.y }] });
  await phone.waitForTimeout(500);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await phone.waitForTimeout(160);
  const mobileAfter = await stats(phone);
  assert.ok(Math.hypot(mobileAfter.playerX - mobileBefore.playerX, mobileAfter.playerZ - mobileBefore.playerZ) > .3, JSON.stringify(mobileAfter));
  assert.ok(Math.abs(mobileAfter.yaw - mobileBefore.yaw) > .1, 'Second finger rotates view while moving');
  const released = await stats(phone);
  await phone.waitForTimeout(250);
  assert.deepEqual([(await stats(phone)).playerX, (await stats(phone)).playerZ], [released.playerX, released.playerZ]);
  await phone.setViewportSize({ width: 844, height: 390 });
  await noOverflow(phone, 844, 390);
  await shot(phone, 'phone-landscape');
  const touchWalk = async (page, x, z) => {
    const bounds = await page.locator('#world-joystick').boundingBox();
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    for (let i = 0; i < 70; i++) {
      const s = await stats(page), dx = x - s.playerX, dz = z - s.playerZ;
      const distance = Math.hypot(dx, dz);
      if (distance < 1.9) return;
      const localX = (dx * Math.cos(s.yaw) + dz * Math.sin(s.yaw)) / distance;
      const localZ = (-dx * Math.sin(s.yaw) + dz * Math.cos(s.yaw)) / distance;
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, ...center }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: center.x + localX * 30, y: center.y + localZ * 30 }] });
      await page.waitForTimeout(220);
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(120);
    }
    assert.fail(`Touch could not reach (${x}, ${z}): ${JSON.stringify(await stats(page))}`);
  };
  await interactTwice(phone, touchWalk, true);
  await phone.locator('#world-camera').tap();
  await phone.waitForFunction(() => document.querySelector('#world-canvas').dataset.mode === 'photo');
  const s = await stats(phone);
  const targetYaw = Math.atan2(-s.playerX, s.playerZ + 13);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 2, x: 460, y: 195 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 2, x: 460 + (targetYaw - s.yaw) / .005, y: 195 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await phone.waitForFunction(() => !document.querySelector('#world-shutter').disabled);
  await phone.locator('#world-shutter').tap();
  await phone.waitForFunction(() => !document.querySelector('#world-finish').disabled);
  assert.equal(await game(phone), null);
  await shot(phone, 'phone-photo');
  await phone.locator('#world-finish').tap();
  await phone.locator('#world-dialog').waitFor({ state: 'hidden' });
  assert.equal((await game(phone)).state.visits[0].id, 'pier');
  assert.match((await game(phone)).state.visits[0].photo, /^data:image\/jpeg;base64,/);
  await phone.reload();
  assert.equal(await phone.locator('#visit-count').innerText(), '1');
  pass('390 × 844 and 844 × 390 fit controls; simultaneous joystick + look, touch movement/interactions/photo, release cleanup and mobile persistence');
  for (const path of ['reference/dali-shop-door.jpg', 'reference/erhai-panorama.jpg', 'pbr/sky.hdr']) {
    assert.ok(report.assets.some(url => url.endsWith(`/assets/${path}`)), `Scene did not request ${path}`);
  }
  assert.ok(report.assets.some(url => /\/pbr\/.+-color\.jpg$/.test(url)), 'Scenes must actually request their photographic PBR textures');
  pass('Real scenes requested the Dali shopfront photo, Erhai panorama, photographed PBR textures and HDR sky');
  }
  assert.deepEqual(report.errors, []);
  pass('No unexpected JavaScript errors, console errors, failed requests or HTTP errors; injected asset 404s are recorded separately');
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.failure = error.stack;
  if (activePage && !activePage.isClosed()) await shot(activePage, 'failure').catch(() => {});
  throw error;
} finally {
  await writeFile(resolve(artifacts, loadingOnly ? 'qa-3d-loading-report.json' : 'qa-3d-report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}

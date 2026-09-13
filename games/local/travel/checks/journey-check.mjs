import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLACES, newGame, isValidPhoto } from '../game-state.mjs';

// Real navigation, native wheel and touch input; stored game state is read only.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '@playwright/test');
const chrome = process.env.CHROME_PATH || (process.env.ProgramFiles && resolve(process.env.ProgramFiles, 'Google/Chrome/Application/chrome.exe'));
const browser = await chromium.launch({ headless: true, ...(chrome && existsSync(chrome) ? { executablePath: chrome } : {}) });
const baseURL = process.env.BASE_URL || process.env.GAME_URL || 'http://localhost:4178';
const artifacts = resolve(root, 'artifacts/journey');
const errors = [];
const checkGroups = [];
let visualMode;
const startedAt = new Date().toISOString();
await mkdir(artifacts, { recursive: true });

async function pageFor(context) {
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  return page;
}
async function enter(page, ready = true) {
  await page.locator('#travel-button').click();
  await page.locator('#journey-dialog[open]').waitFor();
  if (ready) {
    await page.waitForFunction(() => {
      const spatial = !!document.querySelector('.journey-world');
      const images = [...document.querySelectorAll(spatial ? '.journey-visual' : '.journey-image')];
      return images.length === (spatial ? 14 : 6) && images.every(image => image.complete && image.naturalWidth > 0);
    });
    await page.locator('#journey-loading').waitFor({ state: 'hidden' });
  }
}
async function chapter(page, index) {
  await page.locator('.journey-nav button').nth(index).click();
  await page.waitForFunction(({ id, index }) => {
    const scene = document.querySelector(`.journey-scene[data-place="${id}"]`);
    const progress = Number(document.querySelector('#journey-dialog').dataset.progress);
    return scene?.dataset.active === 'true' && Number(getComputedStyle(scene).opacity) > .95 && Math.abs(progress - index) < .02;
  }, { id: PLACES[index].id, index });
}
async function stateOf(page) {
  return await page.evaluate(() => JSON.parse(localStorage.getItem('quye-travel-v1'))?.state) || newGame();
}
async function clickCollect(page, twice = false) {
  const box = await page.locator('#journey-collect').boundingBox();
  assert(box, 'Collection button is visible');
  if (twice) await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2, { delay: 30 });
  else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
async function waitVisits(page, count) {
  await page.waitForFunction(n => JSON.parse(localStorage.getItem('quye-travel-v1'))?.state.visits.length === n, count);
}
async function leave(page) {
  await page.locator('#journey-close').click();
  await page.locator('#journey-dialog[open]').waitFor({ state: 'hidden' });
}

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await pageFor(desktop);
  const homeProgress = await page.locator('main .journey-progress').evaluate(el => getComputedStyle(el).position);
  assert.notEqual(homeProgress, 'absolute', 'Journey styling must not move the map progress bar');
  await enter(page);
  const spatial = await page.locator('.journey-world').count() === 1;
  visualMode = spatial ? 'shared-world' : 'illustration-crossfade';
  assert.equal(await page.locator('.journey-nav button').count(), 6);
  for (let i = 0; i < PLACES.length; i++) await chapter(page, i);
  assert.equal((await stateOf(page)).visits.length, 0, 'Browsing does not spend resources');
  await chapter(page, 0);
  await page.locator('.journey-scroll').focus();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(250);
  const keyDownPosition = await page.locator('.journey-scroll').evaluate(el => el.scrollTop);
  assert(keyDownPosition > 0, 'ArrowDown scrolls the focused journey');
  await page.keyboard.press('ArrowUp');
  await page.waitForFunction(before => document.querySelector('.journey-scroll').scrollTop < before, keyDownPosition);
  await chapter(page, 0);
  await page.mouse.move(700, 450);
  const distant = spatial ? await page.locator('.journey-distant').elementHandle() : null;
  const distantSource = spatial ? await page.locator('.journey-distant').getAttribute('src') : null;
  let middle = false;
  for (let i = 0; i < 18 && !middle; i++) {
    await page.mouse.wheel(0, 110);
    await page.waitForTimeout(90);
    middle = spatial ? await page.locator('.journey-world').evaluate(world => {
      const progress = Number(document.querySelector('#journey-dialog').dataset.progress);
      const visible = [...world.querySelectorAll('[data-depth="landmark"]')].filter(image => {
        const box = image.getBoundingClientRect();
        return Math.min(innerWidth, box.right) - Math.max(0, box.left) > innerWidth * .2
          && Math.min(innerHeight, box.bottom) - Math.max(0, box.top) > innerHeight * .2;
      });
      const opaque = [...world.querySelectorAll('img')].every(image => {
        let opacity = 1;
        for (let element = image; element && element !== world.parentElement; element = element.parentElement) opacity *= Number(getComputedStyle(element).opacity);
        return opacity === 1;
      });
      return progress > .15 && progress < .85 && visible.length >= 2 && opaque
        && world.querySelectorAll('[data-depth="far"]').length === 1;
    }) : await page.locator('.journey-scene').evaluateAll(scenes => {
      const values = scenes.map(scene => Number(getComputedStyle(scene).opacity));
      return values.filter(value => value > .02).length >= 2 && values.some(value => value > .05 && value < .95);
    });
  }
  assert(middle, spatial ? 'Native wheel reveals adjacent landmarks in the same opaque world without crossfading' : 'Native wheel reaches an intermediate frame in the current illustration preview');
  if (spatial) {
    assert(await distant.evaluate(element => element === document.querySelector('.journey-distant')), 'The same distant backdrop remains mounted');
    assert.equal(await page.locator('.journey-distant').getAttribute('src'), distantSource);
  }
  await page.screenshot({ path: resolve(artifacts, 'desktop-transition.png') });
  const beforeBack = await page.locator('.journey-scroll').evaluate(el => el.scrollTop);
  await page.mouse.wheel(0, -300);
  await page.waitForFunction(before => document.querySelector('.journey-scroll').scrollTop < before - 20, beforeBack);
  await chapter(page, 0);
  await clickCollect(page, true);
  await waitVisits(page, 1);
  const once = await stateOf(page);
  await clickCollect(page);
  assert.deepEqual(await stateOf(page), once, 'Repeated collection is idempotent');
  for (let i = 1; i < 5; i++) { await chapter(page, i); await clickCollect(page); await waitVisits(page, i + 1); }
  const finished = await stateOf(page);
  assert.equal(finished.hour, 18);
  assert.equal(finished.status, 'finished');
  assert.equal(finished.money, 200 - PLACES.slice(0, 5).reduce((sum, p) => sum + p.cost, 0));
  assert.equal(finished.energy, 100 - PLACES.slice(0, 5).reduce((sum, p) => sum + p.energy, 0));
  assert.equal(new Set(finished.visits.map(v => v.id)).size, 5);
  assert(finished.visits.every(v => isValidPhoto(v.photo)), 'Each collected chapter stores a bounded JPEG photo');
  await chapter(page, 5);
  await clickCollect(page);
  assert.deepEqual(await stateOf(page), finished, 'The final chapter remains browsable after the day finishes');
  await page.screenshot({ path: resolve(artifacts, 'desktop-pier.png') });
  await leave(page);
  if (await page.locator('#info-dialog[open]').count()) await page.locator('#info-close').click();
  await enter(page);
  await chapter(page, 1);
  await page.keyboard.press('Escape');
  await page.locator('#journey-dialog[open]').waitFor({ state: 'hidden' });
  assert.deepEqual(await stateOf(page), finished, 'Re-entry and exit do not repeat settlement');
  await page.reload({ waitUntil: 'networkidle' });
  assert.deepEqual(await stateOf(page), finished, 'Reload retains resource totals and every photo');
  await page.locator('#open-journal').click();
  await page.locator('#info-dialog[open]').waitFor();
  assert.equal(await page.locator('.postcard-photo-image').count(), 5);
  await page.waitForFunction(() => [...document.querySelectorAll('.postcard-photo-image')].every(image => image.complete && image.naturalWidth > 0));
  const downloading = page.waitForEvent('download');
  await page.locator('[data-action="export"]').click();
  const download = await downloading;
  assert.match(download.suggestedFilename(), /\.png$/i);
  const journalPath = resolve(artifacts, 'travel-journal.png');
  await download.saveAs(journalPath);
  const journal = await readFile(journalPath);
  assert.equal(journal.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'Journal has a PNG signature');
  const decoded = await page.evaluate(async src => { const image = new Image(); image.src = src; await image.decode(); return { width: image.naturalWidth, height: image.naturalHeight }; }, `data:image/png;base64,${journal.toString('base64')}`);
  assert.deepEqual(decoded, { width: 1000, height: 1375 }, 'Downloaded journal decodes at the expected full image dimensions');
  await desktop.close();
  checkGroups.push('Desktop: six chapters, native wheel, intermediate transition, ArrowDown/Up, Escape, photos, dedup, resource settlement, finished-day browsing, re-entry, reload persistence and PNG export');
  console.log(`✓ ${checkGroups.at(-1)}`);

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const phone = await pageFor(mobile);
  await enter(phone);
  const cdp = await mobile.newCDPSession(phone);
  const touch = (x, y) => [{ x, y, radiusX: 5, radiusY: 5, force: 1, id: 1 }];
  const touchStart = await phone.locator('.journey-scroll').evaluate(el => el.scrollTop);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touch(195, 570) });
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touch(195, 570 - i * 29) });
    await phone.waitForTimeout(20);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await phone.waitForFunction(before => document.querySelector('.journey-scroll').scrollTop > before + 100, touchStart);
  await chapter(phone, 1);
  await phone.screenshot({ path: resolve(artifacts, 'phone-pagodas.png') });
  await chapter(phone, 2);
  await phone.screenshot({ path: resolve(artifacts, 'phone-meadow.png') });
  await clickCollect(phone);
  await waitVisits(phone, 1);
  await phone.setViewportSize({ width: 844, height: 390 });
  await phone.waitForFunction(() => Math.abs(document.querySelector('.journey-stage').clientHeight - document.querySelector('#journey-dialog').clientHeight) < 2);
  const collectBox = await phone.locator('#journey-collect').boundingBox();
  assert(collectBox && collectBox.y >= 0 && collectBox.y + collectBox.height <= 390, 'Collect button survives landscape resize');
  await chapter(phone, 4);
  await leave(phone);
  assert.equal((await stateOf(phone)).visits.length, 1);
  await mobile.close();
  checkGroups.push('Phone: native swipe, chapter navigation, collection, landscape resize and exit');
  console.log(`✓ ${checkGroups.at(-1)}`);

  const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const still = await pageFor(reduced);
  await enter(still);
  await chapter(still, 3);
  if (await still.locator('.journey-world').count()) {
    await still.mouse.move(150, 420);
    await still.mouse.wheel(0, 200);
    await still.waitForFunction(() => Number(document.querySelector('#journey-dialog').dataset.progress) > 3.05);
    const reducedPlanes = await still.locator('.journey-world img').evaluateAll(images => images.map(image => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(image).transform);
      return { depth: image.dataset.depth, x: image.getBoundingClientRect().x, scaleX: matrix.a, scaleY: matrix.d };
    }));
    assert(reducedPlanes.every(plane => Math.abs(plane.scaleX - 1) < .001 && Math.abs(plane.scaleY - 1) < .001), 'Reduced motion disables extra camera zoom');
    const landmarkPositions = reducedPlanes.filter(plane => plane.depth === 'landmark').map(plane => plane.x);
    assert(landmarkPositions.every((x, i) => i === 0 || x > landmarkPositions[i - 1] + 100), 'Reduced motion preserves spatial arrangement');
  } else {
    assert.equal(await still.locator('.journey-image').first().evaluate(image => getComputedStyle(image).transform), 'none', 'Reduced motion disables the current preview image zoom');
  }
  await leave(still);
  await reduced.close();
  const blocked = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await blocked.route('**/assets/journey/**', route => route.abort());
  const failed = await pageFor(blocked);
  await enter(failed, false);
  await failed.waitForTimeout(350);
  await leave(failed);
  await failed.waitForTimeout(300);
  assert.equal(await failed.locator('#journey-dialog[open]').count(), 0);
  assert.equal((await stateOf(failed)).visits.length, 0);
  await blocked.close();
  const recovery = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await recovery.route('**/assets/journey/**', route => route.abort());
  const retryPage = await pageFor(recovery);
  await enter(retryPage, false);
  await retryPage.locator('#journey-retry').waitFor({ state: 'visible' });
  await recovery.unroute('**/assets/journey/**');
  await retryPage.locator('#journey-retry').click();
  await retryPage.locator('#journey-loading').waitFor({ state: 'hidden' });
  assert.equal(await retryPage.locator('#journey-collect').isEnabled(), true, 'Retry restores collection');
  await clickCollect(retryPage);
  await waitVisits(retryPage, 1);
  await leave(retryPage);
  await recovery.close();
  checkGroups.push('Reduced motion, exit after image-loading failure, retry recovery and collection');
  console.log(`✓ ${checkGroups.at(-1)}`);
  assert.deepEqual(errors, [], 'No uncaught browser errors');
  console.log(`Screenshots: ${artifacts}`);
} catch (error) {
  errors.push(error.stack || String(error));
  throw error;
} finally {
  await writeFile(resolve(artifacts, 'report.json'), JSON.stringify({ passed: errors.length === 0 && checkGroups.length === 3, visualMode, startedAt, finishedAt: new Date().toISOString(), url: baseURL, checkGroups, errors }, null, 2));
  await browser.close();
}

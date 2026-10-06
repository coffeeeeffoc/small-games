import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { photoHunts, photoHuntTarget, validatePhotoHunt, PHOTO_HUNT_SAVE_KEY } from '../src/photo-hunts.ts';

// This suite runs the complete renderer, authored city GLBs and real Rapier
// controller. Never route or replace Scene, world data, shaders or the camera.
const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../../../../.scratch/travel-bund-photo-hunts-scene/', import.meta.url);
const references = new URL('../src/assets/photo-hunts/', import.meta.url);
const captureReferences = process.env.PHOTO_CAPTURE_REFERENCES === '1';
const source = process.env.PHOTO_SCENE_SOURCE === 'dev' ? 'dev' : 'production';
const data = JSON.parse(await readFile(new URL('../../../assets/bund/runtime/world/world.json', new URL('../', import.meta.url)), 'utf8'));
await mkdir(output, { recursive: true });
if (captureReferences) await mkdir(references, { recursive: true });
const server = source === 'dev'
  ? await createServer({ root, server: { host: '127.0.0.1', port: 0, hmr: false } })
  : await preview({ root, preview: { host: '127.0.0.1', port: 0 } });
if (source === 'dev') await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}/`;
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const report = {
  source,
  renderer: 'Chromium ANGLE SwiftShader; complete Scene, city assets, materials and Rapier physics',
  browser: await browser.version(),
  physicalMobile: false,
  checks: [], references: [], errors: [], warnings: [], passed: false,
  limitations: 'Cloud software WebGL and emulated touch; physical phones and Safari are not verified.',
};
let current;
if (process.env.PHOTO_TOUCH_ONLY === '1') {
  const prior = JSON.parse(await readFile(new URL('report.json', output), 'utf8'));
  assert.equal(prior.source, source, 'Partial continuation reuses the same real renderer source');
  const sceneChecks = prior.checks.filter(check => check.detail);
  assert.equal(sceneChecks.length, 4, 'Only reuse a completed four-case shader check');
  report.checks.push(...prior.checks.filter(check => check.detail || check.touchWalk));
  report.reusedSceneChecks = true;
}

function state(page) {
  return page.locator('main').evaluate(element => ({ ...element.dataset }));
}

async function livePose(page) {
  return page.evaluate(() => {
    const game = window.SmallGamesDev.inspect().game;
    const camera = game?.streetLife?.camera;
    const pose = game?.photoHunts?.pose;
    if (pose) return pose;
    if (camera) return {
      position: [camera.position[0], camera.position[1] - .82, camera.position[2]],
      yaw: camera.yaw, pitch: camera.pitch,
      grounded: document.querySelector('main').dataset.grounded === 'true',
    };
    return null;
  });
}

async function open({ viewport = { width: 1200, height: 800 }, mobile = false, detail = 'original', night = false, hunt = false } = {}) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  await context.addInitScript(({ night }) => {
    localStorage.setItem('travel-bund.settings.v1', JSON.stringify({ night, quality: 0, sound: false, crowd: false, motion: false, sensitivity: 1 }));
    localStorage.removeItem('travel-bund.photo-hunts.v1');
  }, { night });
  const page = await context.newPage();
  current = page;
  page.setDefaultTimeout(30000);
  const loading = new Set(), loaded = new Set();
  let lastActivity = Date.now();
  page.on('request', request => {
    if (/\/(world|life)\/.*\.glb(?:\?|$)/.test(request.url())) {
      loading.add(request); lastActivity = Date.now();
    }
  });
  page.on('requestfinished', request => {
    if (loading.delete(request)) {
      loaded.add(request.url().split('/').at(-1).split('?')[0]); lastActivity = Date.now();
    }
  });
  page.on('requestfailed', request => {
    if (loading.delete(request)) report.errors.push(`Asset request failed: ${request.url()} ${request.failure()?.errorText}`);
  });
  page.on('pageerror', error => report.errors.push(error.stack || error.message));
  page.on('console', message => {
    if (message.type() === 'error') report.errors.push(message.text());
    else if (message.type() === 'warning' && /shader|webgl|THREE/i.test(message.text())) report.warnings.push(message.text());
  });
  await page.goto(`${base}?dev=1&renderDetail=${detail}`);
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'intro');
  // Keep registered actions available while preventing the dev overlay from
  // covering player controls or appearing in evidence screenshots.
  await page.addStyleTag({ content: 'small-games-devtools,.debug{visibility:hidden!important;pointer-events:none!important}' });
  if (hunt) {
    await page.screenshot({ path: fileURLToPath(new URL('home-portrait.png', output)) });
    await page.getByRole('button', { name: '照片寻景关卡', exact: true }).tap();
    await page.screenshot({ path: fileURLToPath(new URL('hunt-menu-portrait.png', output)) });
    await page.getByRole('button', { name: `第1关 ${photoHunts[0].title}`, exact: true }).tap();
    await expect(page.getByRole('img', { name: `${photoHunts[0].title}的参考照片` })).toBeVisible();
    await page.screenshot({ path: fileURLToPath(new URL('hunt-preview-portrait.png', output)) });
    await page.getByRole('button', { name: '开始寻找', exact: true }).tap();
  } else {
    const enter = page.locator('#enter-world');
    if (mobile) await enter.tap(); else await enter.click();
  }
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'playing', { timeout: 120000 });
  await expect(page.locator('main')).toHaveAttribute('data-render-detail', detail);
  assert.equal(await page.locator('main').evaluate(element => element.classList.contains('night')), night,
    'Requested day/night lighting is active in the actual application');
  await expect(page.locator('main')).toHaveAttribute('data-grounded', 'true', { timeout: 120000 });
  async function settled() {
    await expect.poll(() => loading.size === 0 && Date.now() - lastActivity >= 3000, { timeout: 180000, intervals: [500, 1000] }).toBe(true);
    await expect.poll(async () => Number((await state(page)).triangles), { timeout: 120000 }).toBeGreaterThan(1000);
    // Asset request completion precedes Draco decoding and GPU material compile.
    await page.waitForTimeout(2500);
  }
  await settled();
  return { page, context, loaded, settled, viewport, detail, night };
}

async function referencePose(session, hunt) {
  const action = `photo-reference-${hunt.id}`;
  await expect.poll(() => session.page.evaluate(id => Boolean(document.querySelector('small-games-devtools')?.shadowRoot?.querySelector(`[data-dev-action="${id}"]`)), action), { timeout: 60000 }).toBe(true);
  const beforeSave = await session.page.evaluate(key => localStorage.getItem(key), PHOTO_HUNT_SAVE_KEY);
  await session.page.evaluate(id => document.querySelector('small-games-devtools').shadowRoot.querySelector(`[data-dev-action="${id}"]`).click(), action);
  await expect.poll(async () => {
    const pose = await livePose(session.page);
    return pose ? Math.hypot(pose.position[0] - hunt.station.position[0], pose.position[2] - hunt.station.position[2]) : Infinity;
  }, { timeout: 120000 }).toBeLessThan(1);
  await expect(session.page.locator('main')).toHaveAttribute('data-grounded', 'true', { timeout: 120000 });
  await session.settled();
  await expect.poll(async () => {
    const pose = await livePose(session.page);
    return Boolean(pose && validatePhotoHunt(hunt, pose, data).ok);
  }, { timeout: 60000 }).toBe(true);
  assert.equal(await session.page.evaluate(key => localStorage.getItem(key), PHOTO_HUNT_SAVE_KEY), beforeSave,
    'Reference pose action never completes a hunt or writes progress');
  const pose = await livePose(session.page);
  assert(Number.isFinite(pose?.pitch), 'Actual camera pitch is observable for reference validation');
  assert.equal(validatePhotoHunt(hunt, pose, data).ok, true, `Real physics station matches ${hunt.id}: ${JSON.stringify(pose)}`);
  const target = photoHuntTarget(hunt, data);
  const targetTiles = data.tiles.filter(tile => tile.name.startsWith('city_') && Math.hypot(...tile.center.map((value, index) => value - target[index])) < tile.radius);
  await expect.poll(() => targetTiles.some(tile => session.loaded.has(`${tile.name}.glb`)), { timeout: 120000 }).toBe(true);
  await session.settled();
  return pose;
}

async function capture(session, hunt) {
  const pose = await referencePose(session, hunt);
  const canvas = await session.page.locator('canvas').first().evaluate(element => ({ width: element.width, height: element.height, image: element.toDataURL('image/webp', .88) }));
  assert(canvas.image.startsWith('data:image/webp;base64,'), 'Browser exports actual WebP scene photo');
  const bytes = Buffer.from(canvas.image.split(',')[1], 'base64');
  assert(bytes.length > 5000, 'Captured scene is not empty');
  await writeFile(new URL(`${hunt.id}.webp`, references), bytes);
  await session.page.screenshot({ path: fileURLToPath(new URL(`reference-${hunt.id}.png`, output)) });
  report.references.push({ id: hunt.id, width: canvas.width, height: canvas.height, bytes: bytes.length, pose, loadedModels: [...session.loaded] });
  console.log(`Reference ${hunt.id}: ${bytes.length} bytes, ${canvas.width}×${canvas.height}`);
}

async function touchWalk(session) {
  const cdp = await session.context.newCDPSession(session.page);
  const rotated = (await state(session.page)).rotated === 'true';
  const box = await session.page.getByRole('group', { name: '移动摇杆' }).boundingBox();
  assert(box, 'Actual on-screen joystick is available');
  const before = await state(session.page);
  const finger = { id: 3, x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger] });
  finger.x += rotated ? 24 : 0;
  finger.y -= rotated ? 0 : 24;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [finger] });
  await expect.poll(async () => {
    const after = await state(session.page);
    return Math.hypot(Number(after.x) - Number(before.x), Number(after.z) - Number(before.z));
  }, { timeout: 60000 }).toBeGreaterThan(.35);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(session.page.locator('main')).toHaveAttribute('data-speed', '0.00', { timeout: 30000 });
  const after = await state(session.page);
  assert.equal(after.grounded, 'true');
  report.checks.push({ touchWalk: true, viewport: session.viewport, rotated, before, after });
}

async function completeWithTouch() {
  const hunt = photoHunts[0];
  const session = await open({ hunt: true, mobile: true, detail: 'light', viewport: { width: 390, height: 844 } });
  await expect(session.page.locator('main')).toHaveAttribute('data-rotated', 'true');
  await expect(session.page.locator('main')).toHaveAttribute('data-photo-hunt', hunt.id);
  const before = await livePose(session.page);
  assert(Math.hypot(before.position[0] - hunt.station.position[0], before.position[2] - hunt.station.position[2]) > hunt.station.radius,
    'Player starts outside the photograph station; selecting a hunt cannot pass it');
  await session.page.getByRole('button', { name: '拍照', exact: true }).tap();
  await expect(session.page.getByRole('status')).toContainText('拍摄地点还不对');
  assert.equal(await session.page.evaluate(key => localStorage.getItem(key), PHOTO_HUNT_SAVE_KEY), null);
  await session.page.screenshot({ path: fileURLToPath(new URL('hunt-start-portrait.png', output)) });
  await session.page.getByRole('button', { name: '暂停', exact: true }).tap();
  await expect(session.page.getByRole('dialog', { name: '漫游设置' })).toBeVisible();
  await session.page.screenshot({ path: fileURLToPath(new URL('pause-portrait.png', output)) });
  await session.page.getByRole('button', { name: '继续漫游', exact: true }).tap();
  await expect(session.page.locator('main')).toHaveAttribute('data-phase', 'playing');

  const cdp = await session.context.newCDPSession(session.page);
  const box = await session.page.getByRole('group', { name: '移动摇杆' }).boundingBox();
  const finger = { id: 3, x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger] });
  // The complete game is rotated clockwise: physical +X is logical forward.
  finger.x += 40;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [finger] });
  let lastProgress = 0;
  await expect.poll(async () => {
    const pose = await livePose(session.page);
    const distance = Math.hypot(pose.position[0] - hunt.station.position[0], pose.position[2] - hunt.station.position[2]);
    if (Date.now() - lastProgress > 5000) {
      console.log('Touch approach', JSON.stringify({ position: pose.position, distance }));
      lastProgress = Date.now();
    }
    return distance;
  }, { timeout: 180000, intervals: [200, 300] }).toBeLessThan(hunt.station.radius - 1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(session.page.locator('main')).toHaveAttribute('data-speed', '0.00', { timeout: 30000 });
  const walked = await livePose(session.page);
  assert(Math.hypot(walked.position[0] - before.position[0], walked.position[2] - before.position[2]) > 35,
    'A real touch gesture walks the player from the starting area to the station');

  // Aim by real pointer processing, including physical-to-logical mapping.
  // No pose action, input assignment or synthetic success is used in this run.
  const target = photoHuntTarget(hunt, data);
  const desiredYaw = Math.atan2(walked.position[0] - target[0], walked.position[2] - target[2]);
  const desiredPitch = Math.atan2(target[1] - walked.position[1] - .82,
    Math.hypot(walked.position[0] - target[0], walked.position[2] - target[2]));
  const yawDelta = Math.atan2(Math.sin(walked.yaw - desiredYaw), Math.cos(walked.yaw - desiredYaw));
  // Touch drags grab the scene (direction=-1), opposite to mouse look.
  const logicalDx = -yawDelta / .002, logicalDy = (desiredPitch - walked.pitch) / .002;
  const swipes = Math.max(1, Math.ceil(Math.max(Math.abs(logicalDx), Math.abs(logicalDy)) / 45));
  for (let index = 0; index < swipes; index++) {
    const look = { id: 8, x: session.viewport.width * .62, y: session.viewport.height * .6 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [look] });
    look.x -= logicalDy / swipes;
    look.y += logicalDx / swipes;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [look] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.page.waitForTimeout(200);
  }
  await expect.poll(async () => validatePhotoHunt(hunt, await livePose(session.page), data).ok, { timeout: 60000 }).toBe(true);
  await session.settled();
  const finalPose = await livePose(session.page);
  await session.page.screenshot({ path: fileURLToPath(new URL('hunt-aim-portrait.png', output)) });
  await session.page.getByRole('button', { name: '拍照', exact: true }).tap();
  await expect(session.page.getByRole('dialog', { name: '寻景通关' })).toBeVisible();
  await expect(session.page.getByRole('img', { name: '本次拍摄的通关照片' })).toBeVisible();
  const captured = await session.page.getByRole('img', { name: '本次拍摄的通关照片' }).getAttribute('src');
  assert(captured.startsWith('data:image/png;base64,'), 'Success compares the actual WebGL camera photograph');
  assert.deepEqual(await session.page.evaluate(key => JSON.parse(localStorage.getItem(key)), PHOTO_HUNT_SAVE_KEY),
    { version: 1, completed: [hunt.id] });
  await session.page.screenshot({ path: fileURLToPath(new URL('hunt-result-portrait.png', output)) });
  const nextButton = await session.page.getByRole('button', { name: '下一关', exact: true }).boundingBox();
  assert(nextButton && nextButton.x >= 0 && nextButton.y >= 0 &&
    nextButton.x + nextButton.width <= session.viewport.width + 1 &&
    nextButton.y + nextButton.height <= session.viewport.height + 1,
    'The result next-level touch target is visible inside the rotated phone viewport');
  await session.page.getByRole('button', { name: '下一关', exact: true }).tap();
  await expect(session.page.getByRole('heading', { name: photoHunts[1].title, exact: true })).toBeVisible();
  await session.page.getByRole('button', { name: '查看关卡', exact: true }).tap();
  await expect(session.page.getByRole('button', { name: `第2关 ${photoHunts[1].title}`, exact: true })).toBeEnabled();
  await expect(session.page.getByRole('button', { name: `第3关 ${photoHunts[2].title}`, exact: true })).toBeDisabled();
  report.checks.push({ actualTouchCompletion: true, viewport: session.viewport, rotated: true,
    route: 'home → locked catalog → photograph briefing → wrong-location shutter → real joystick walking → real look gestures → shutter → result → next unlocked level',
    before, walked, finalPose, completed: [hunt.id] });
  await session.context.close();
}

try {
  if (captureReferences) {
    const session = await open();
    const selected = new Set((process.env.PHOTO_CAPTURE_IDS || '').split(',').filter(Boolean));
    for (const hunt of photoHunts) if (!selected.size || selected.has(hunt.id)) await capture(session, hunt);
    await session.context.close();
  }
  if (process.env.PHOTO_CAPTURE_ONLY !== '1' && process.env.PHOTO_TOUCH_ONLY !== '1') for (const detail of ['original', 'light']) {
    for (const night of [false, true]) {
      const session = await open({ detail, night, mobile: true, viewport: { width: 844, height: 390 } });
      const hunt = photoHunts[0];
      const pose = await referencePose(session, hunt);
      await session.page.screenshot({ path: fileURLToPath(new URL(`facade-${detail}-${night ? 'night' : 'day'}.png`, output)) });
      assert.deepEqual(report.errors, [], 'Full-scene shader compile and runtime remain error-free');
      report.checks.push({ detail, night, pose, state: await state(session.page), loadedModels: [...session.loaded] });
      if (detail === 'original' && !night) await touchWalk(session);
      await session.context.close();
      console.log(`Full scene: ${detail}, ${night ? 'night' : 'day'} passed`);
    }
  }
  if (process.env.PHOTO_CAPTURE_ONLY !== '1' && process.env.PHOTO_SKIP_TOUCH_COMPLETION !== '1') await completeWithTouch();
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) {
  report.failure = error.stack;
  if (current && !current.isClosed()) {
    report.failureBody = await current.locator('body').innerText().catch(() => 'unavailable');
    report.failureState = await state(current).catch(() => null);
    report.failurePose = await livePose(current).catch(() => null);
    await current.screenshot({ path: fileURLToPath(new URL('failure.png', output)) }).catch(() => {});
  }
  throw error;
} finally {
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2));
  if (captureReferences) await writeFile(new URL('capture-report.json', output), JSON.stringify(report, null, 2));
  await browser.close();
  await server.close();
}

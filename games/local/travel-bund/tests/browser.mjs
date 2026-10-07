import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';
import { fileURLToPath } from 'node:url';

const output = new URL('../../../../.scratch/travel-bund-browser/', import.meta.url);
await mkdir(output, { recursive: true });
const server = process.env.GAME_URL
  ? null
  : await preview({
      root: fileURLToPath(new URL('../', import.meta.url)),
      preview: { host: '127.0.0.1', port: 0 },
    });
const url = process.env.GAME_URL || `http://127.0.0.1:${server.httpServer.address().port}/`;
const executablePath = [
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((path) => path && existsSync(path));
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist'],
});
const errors = [],
  results = [];
const log = (stage) => console.log(`BROWSER_STAGE ${stage}`);
let currentPage;
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  context.setDefaultTimeout(30000);
  const page = await context.newPage();
  currentPage = page;
  const tiles = new Set();
  page.on('request', (request) => {
    if (/world\/(?:city|sidewalk)_.*\.glb/.test(request.url())) tiles.add(request.url());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  const worldResponse = page.waitForResponse((response) => response.url().endsWith('/world/world.json'));
  await page.goto(`${url}?debug=1`);
  await expect(page).toHaveTitle('江风入境 · 外滩漫游');
  await expect(page.locator('main')).toHaveAttribute('data-ready','true',{timeout:120000});
  assert.equal(await page.locator('canvas').count(),1,'Home previews the same city');
  await page.screenshot({ path: fileURLToPath(new URL('desktop-intro.png', output)) });
  log('desktop enter');
  await page.locator('#enter-world').click();
  const worldData = await (await worldResponse).json();
  const totalTiles = worldData.tiles.length;
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'playing', { timeout: 120000 });
  log('desktop ready');
  assert(tiles.size < 40, 'Entry must not wait for the entire city');
  results.push({ startupTileRequests: tiles.size });
  await page.waitForTimeout(1000);
  assert(
    Math.abs(Number(await page.locator('main').getAttribute('data-yaw')) + 2.9) < 0.01,
    'Initial spawn must set the first-person camera after physics initializes',
  );
  log('desktop jump');
  const standingY = Number(await page.locator('main').getAttribute('data-y'));
  await page.keyboard.press('Space');
  await expect.poll(async () => Number(await page.locator('main').getAttribute('data-y')), {
    timeout: 5000, message: 'Space must jump in the actual scene',
  }).toBeGreaterThan(standingY + .7);
  await page.waitForTimeout(900);
  await expect(page.locator('main')).toHaveAttribute('data-grounded', 'true');
  log('desktop move');
  const before = await page.locator('main').getAttribute('data-z');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1800);
  await page.keyboard.up('KeyW');
  const after = await page.locator('main').getAttribute('data-z');
  const position = await page.locator('main').evaluate((el) => ({ ...el.dataset }));
  results.push({ desktop: position, before, after });
  await page.screenshot({ path: fileURLToPath(new URL('desktop-walk.png', output)) });
  assert(
    Math.hypot(Number(position.x) + 377, Number(position.z) - 37) > 1,
    'WASD must move the player',
  );
  log('desktop railing');
  const facingRiver=Number(await page.locator('main').getAttribute('data-yaw'));
  await page.evaluate(dx=>document.dispatchEvent(new MouseEvent('mousemove',{movementX:dx})),(facingRiver+1.5)/.002);
  await page.waitForTimeout(150);
  // Walk into the riverside railing and keep pushing: it must stop the capsule.
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(4000);
  const railing = Number(await page.locator('main').getAttribute('data-x'));
  await page.waitForTimeout(1800);
  await page.keyboard.up('KeyW');
  assert(
    Math.abs(Number(await page.locator('main').getAttribute('data-x')) - railing) < 0.2,
    'Railing must block movement',
  );
  log('desktop bench');
  const nearRail = await page.locator('main').evaluate((el) => ({ ...el.dataset }));
  const bench = worldData.benches.reduce((a, b) =>
    Math.hypot(a.position[0] - Number(nearRail.x), a.position[2] - Number(nearRail.z)) <
    Math.hypot(b.position[0] - Number(nearRail.x), b.position[2] - Number(nearRail.z)) ? a : b);
  const benchYaw = Math.atan2(Number(nearRail.x) - bench.position[0], Number(nearRail.z) - bench.position[2]);
  await page.evaluate((dx) => document.dispatchEvent(new MouseEvent('mousemove', { movementX: dx })),
    (Number(nearRail.yaw) - benchYaw) / .002);
  await expect.poll(async () => Math.abs(Number(await page.locator('main').getAttribute('data-yaw')) - benchYaw)).toBeLessThan(.01);
  await page.keyboard.down('KeyW');
  try {
    await expect(page.getByRole('button', { name: /在长椅上坐一会儿/ })).toBeVisible({ timeout: 15000 });
  } finally {
    await page.keyboard.up('KeyW');
  }
  await page.keyboard.press('KeyE');
  await expect(page.locator('main')).toHaveAttribute('data-sitting', 'true');
  await page.keyboard.press('KeyE');
  await expect(page.locator('main')).toHaveAttribute('data-sitting', 'false');
  log('desktop Esc and resume');
  await page.keyboard.press('Escape');
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'playing');
  await expect.poll(() => page.evaluate(() => Boolean(document.pointerLockElement))).toBe(false);
  await page.locator('canvas').click({ position: { x: 600, y: 350 } });
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS');
  await page.keyboard.press('Escape');
  const desktopZoom = Number(await page.locator('main').getAttribute('data-zoom'));
  await page.mouse.move(600, 350);
  await page.mouse.wheel(0, -180);
  await expect.poll(async () => Number(await page.locator('main').getAttribute('data-zoom'))).toBeGreaterThan(desktopZoom + .1);
  await page.mouse.wheel(0, 180);
  await expect.poll(async () => Math.abs(Number(await page.locator('main').getAttribute('data-zoom')) - desktopZoom)).toBeLessThan(.01);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '两岸地图 ↗' }).click();
  await page.getByRole('button', { name: /02 和平饭店/ }).click();
  await page.waitForTimeout(1000);
  await page.keyboard.press('KeyE');
  await expect(page.getByRole('dialog', { name: '地标介绍' })).toBeVisible();
  await page.getByRole('button', { name: '收入旅行手记' }).click();
  await expect(page.getByRole('button', { name: '已收入旅行手记 ✓' })).toBeDisabled();
  await page.getByRole('button', { name: '返回漫游' }).click();
  await page.getByRole('button', { name: '拍照', exact: true }).click();
  await page.getByRole('button', { name: '打开旅行手记' }).click();
  await expect(page.locator('figure img')).toBeVisible();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('link', { name: '保存这张照片' }).click();
  assert((await downloaded).suggestedFilename().endsWith('.png'));
  await page.getByRole('button', { name: '返回漫游' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '夜色', exact: true }).click();
  await page.getByRole('button', { name: '继续漫游' }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: fileURLToPath(new URL('desktop-night.png', output)) });
  log('desktop destinations');
  for (const [index, name] of [
    [0, '01 外滩'],
    [2, '03 外白渡桥'],
    [3, '04 陆家嘴'],
    [4, '05 上海中心'],
  ]) {
    await page.keyboard.press('KeyM');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await page.waitForTimeout(900);
    const at = await page.locator('main').evaluate((el) => ({ ...el.dataset }));
    assert(
      Number(at.y) >= 0.85 && Number(at.y) < 8,
      `Invalid ground at ${name}: ${JSON.stringify(at)}`,
    );
    results.push({ destination: name, at });
    if (index === 0) {
      await page.waitForTimeout(1200);
      await page.screenshot({ path: fileURLToPath(new URL('river-night.png', output)) });
    }
    if (index === 2) {
      await page.keyboard.down('KeyW');
      try {
        await expect.poll(async () => {
          const position = await page.locator('main').evaluate((el) => ({ ...el.dataset }));
          return Number(position.z) < Number(at.z) - 25 && Number(position.y) > 3.5;
        }, { timeout: 15000, message: 'Default fast travel must climb onto the actual bridge deck' }).toBe(true);
      } finally {
        await page.keyboard.up('KeyW');
      }
      const bridge = await page.locator('main').evaluate((el) => ({ ...el.dataset }));
      assert(Number(bridge.z) < Number(at.z) - 25, 'Bridge approach must be walkable');
      assert(Number(bridge.y) > 3.5, 'Player must climb onto bridge deck');
      results.push({ bridge });
      await page.screenshot({ path: fileURLToPath(new URL('bridge.png', output)) });
    }
  }
  await page.keyboard.press('KeyM');
  await page.getByRole('button', { name: /01 外滩/ }).click();
  await page.waitForTimeout(700);
  await page.keyboard.down('KeyW');
  try {
    await expect.poll(async () => Number(await page.locator('main').getAttribute('data-speed')), {
      timeout: 5000, message: 'Movement starts at the default 18 m/s without a speed toggle',
    }).toBeGreaterThan(17.5);
  } finally {
    await page.keyboard.up('KeyW');
  }
  assert.equal(await page.locator('.run').count(), 0, 'No speed mode switch remains');
  assert(tiles.size < totalTiles, 'Unseen city and sidewalk tiles should remain unloaded');
  results.push({ visitedTileRequests: tiles.size, totalTiles });
  await page.reload();
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem('travel-bund.visits.v1')).length),
    1,
  );
  await page.locator('#enter-world').click();
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'playing', { timeout: 120000 });
  await page.waitForTimeout(300);
  await page.keyboard.down('KeyW');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'paused');
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(400);
  const paused = await page.locator('main').getAttribute('data-x');
  await page.waitForTimeout(600);
  assert.equal(
    await page.locator('main').getAttribute('data-x'),
    paused,
    'Blur must clear held movement',
  );
  await context.close();
  // Controlled road placement makes the moving car meet the player's path deterministically.
  log('moving car collision');
  const trafficContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  trafficContext.setDefaultTimeout(30000);
  const traffic = await trafficContext.newPage();
  currentPage = traffic;
  traffic.on('pageerror', (e) => errors.push(e.message));
  await traffic.route('**/world/world.json', async (route) => {
    const response = await route.fetch(),
      data = await response.json();
    // Leave enough approach distance for the faster car to meet the player on the asphalt.
    data.props['city-car'] = [{ position: [-408, 0.02, 37], yaw: 0, scale: [1, 1, 1] }];
    await route.fulfill({ response, json: data });
  });
  await traffic.goto(url);
  await traffic.locator('#enter-world').click();
  await expect(traffic.locator('main')).toHaveAttribute('data-phase', 'playing', { timeout: 120000 });
  await traffic.waitForTimeout(1500);
  const facing = Number(await traffic.locator('main').getAttribute('data-yaw'));
  await traffic.evaluate(
    (dx) => document.dispatchEvent(new MouseEvent('mousemove', { movementX: dx })),
    (facing - Math.PI / 2) / 0.002,
  );
  await traffic.waitForTimeout(50);
  await traffic.keyboard.down('KeyW');
  await traffic.waitForTimeout(2500);
  const stoppedX = Number(await traffic.locator('main').getAttribute('data-x'));
  await traffic.waitForTimeout(1500);
  await traffic.keyboard.up('KeyW');
  const heldX = Number(await traffic.locator('main').getAttribute('data-x'));
  assert(
    Math.abs(stoppedX - heldX) < 0.15 && heldX > -408 && heldX < -383,
    'Visible moving car must stop a player traveling at the default fast speed',
  );
  await traffic.screenshot({ path: fileURLToPath(new URL('car-collision-fixture.png', output)) });
  results.push({ carCollision: { stoppedX, heldX } });
  await trafficContext.close();
  if (process.env.INSPECT_ONLY !== '1') {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ]) {
      log(`mobile ${viewport.width}x${viewport.height}`);
      const mobile = await browser.newContext({
        viewport,
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 1,
      });
      mobile.setDefaultTimeout(30000);
      const p = await mobile.newPage();
      currentPage = p;
      p.on('pageerror', (e) => errors.push(e.message));
      await p.goto(url);
      await p.locator('#enter-world').tap();
      await expect(p.locator('main')).toHaveAttribute('data-phase', 'playing', { timeout: 120000 });
      await expect(p.getByRole('group', { name: '移动摇杆' })).toBeVisible();
      await p.waitForTimeout(1500);
      await expect(p.locator('main')).toHaveAttribute('data-grounded','true');
      const groundY = Number(await p.locator('main').getAttribute('data-y'));
      await p.getByRole('button', { name: '跳跃', exact: true }).tap();
      await expect.poll(async()=>Number(await p.locator('main').getAttribute('data-y')),{timeout:2500,message:'Touch jump in the clear spawn area lifts the player'}).toBeGreaterThan(groundY+.6);
      await expect(p.locator('main')).toHaveAttribute('data-grounded','true');
      const pos = await p.locator('main').getAttribute('data-x');
      const box = await p.getByRole('group', { name: '移动摇杆' }).boundingBox();
      const cdp = await mobile.newCDPSession(p);
      const yaw = Number(await p.locator('main').getAttribute('data-yaw'));
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: box.x + 55, y: box.y + 55, id: 1 }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { x: box.x + 55, y: box.y + 55, id: 1 },
          { x: viewport.width * 0.6, y: viewport.height * 0.4, id: 2 },
        ],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x: box.x + 55, y: box.y + 15, id: 1 },
          { x: viewport.width * 0.6 + 60, y: viewport.height * 0.4, id: 2 },
        ],
      });
      // An extra joystick finger must not replace the original movement owner.
      const walking = { x: box.x + 55, y: box.y + 15, id: 1 };
      const looking = { x: viewport.width * 0.6 + 60, y: viewport.height * 0.4, id: 2 };
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [walking, looking, { x: box.x + 35, y: box.y + 55, id: 3 }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [{ x: box.x + 35, y: box.y + 55, id: 3 }],
      });
      await expect
        .poll(async () => Number(await p.locator('main').getAttribute('data-speed')))
        .toBeGreaterThan(0.5);
      const zoomBeforePinch = Number(await p.locator('main').getAttribute('data-zoom'));
      await expect.poll(async () => Number(await p.locator('main').getAttribute('data-yaw')) - yaw).toBeGreaterThan(.05);
      const beforePinchYaw = Number(await p.locator('main').getAttribute('data-yaw'));
      const pinching = { x: viewport.width * .65, y: viewport.height * .5, id: 4 };
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart', touchPoints: [walking, looking, pinching],
      });
      pinching.x -= 50;
      pinching.y += 50;
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [walking, looking, pinching],
      });
      await expect.poll(async () => Number(await p.locator('main').getAttribute('data-zoom'))).toBeGreaterThan(zoomBeforePinch + .1);
      assert.equal(Number(await p.locator('main').getAttribute('data-yaw')), beforePinchYaw, 'Two scene fingers zoom without turning the view');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [pinching] });
      looking.x += 45;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [walking, looking] });
      await p.waitForTimeout(350);
      assert.equal(Number(await p.locator('main').getAttribute('data-yaw')), beforePinchYaw, 'The remaining pinch finger must not turn the view');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [looking] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [walking, looking] });
      looking.x += 35;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [walking, looking] });
      await expect.poll(async () => Number(await p.locator('main').getAttribute('data-yaw')) - beforePinchYaw).toBeGreaterThan(.03);
      await p.waitForTimeout(1500);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      await p.waitForTimeout(500);
      await expect(p.locator('main')).toHaveAttribute('data-speed', '0.00');
      assert.notEqual(
        await p.locator('main').getAttribute('data-x'),
        pos,
        'Touch movement must change position',
      );
      assert(
        Number(await p.locator('main').getAttribute('data-yaw')) - yaw > 0.05,
        'A rightward scene drag must move the image right while walking',
      );
      assert.equal(await p.locator('.run').count(), 0, 'Touch movement uses the same default fast speed');
      await expect(p.getByRole('button', { name: '拍照', exact: true })).toBeVisible();
      await expect(p.getByRole('button', { name: '打开旅行手记' })).toBeVisible();
      assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await p.screenshot({ path: fileURLToPath(new URL(`mobile-${viewport.width}.png`, output)) });
      await p.getByRole('button', { name: '暂停' }).tap();
      await expect(p.getByRole('dialog')).toBeVisible();
      results.push({
        viewport,
        position: await p.locator('main').evaluate((el) => ({ ...el.dataset })),
      });
      await mobile.close();
    }
  }
  log('network recovery');
  const recoveryContext = await browser.newContext();
  recoveryContext.setDefaultTimeout(30000);
  const recovery = await recoveryContext.newPage();
  currentPage = recovery;
  await recovery.route('**/world/world.json', (route) =>
    route.fulfill({ status: 503, body: 'offline' }),
  );
  await recovery.goto(url);
  await recovery.locator('#enter-world').click();
  await expect(recovery.getByRole('alert')).toBeVisible();
  await recovery.unroute('**/world/world.json');
  await recovery.getByRole('button', { name: /^重新载入/ }).click();
  await recovery.locator('#enter-world').click();
  await expect(recovery.locator('main')).toHaveAttribute('data-ready', 'true', { timeout: 120000 });
  await recoveryContext.close();
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('report.json', output),
    JSON.stringify({ url, results, errors }, null, 2),
  );
  console.log(JSON.stringify({ results, errors }, null, 2));
} catch (e) {
  console.error('BROWSER_FAILURE', e);
  console.error('BROWSER_ERRORS', errors);
  if (currentPage && !currentPage.isClosed()) {
    console.error(await currentPage.locator('body').innerText({ timeout: 5000 }).catch(() => '[Page text unavailable]'));
    console.error(
      await currentPage
        .locator('main')
        .evaluate((e) => ({ ...e.dataset }), undefined, { timeout: 5000 })
        .catch(() => null),
    );
    await currentPage.screenshot({ path: fileURLToPath(new URL('failure.png', output)), timeout: 5000 }).catch(() => {});
  }
  throw e;
} finally {
  await browser.close();
  await server?.close();
}

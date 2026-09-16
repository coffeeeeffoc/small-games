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
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist'],
});
const errors = [],
  results = [];
let currentPage;
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
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
  const totalTiles = (await (await worldResponse).json()).tiles.length;
  await expect(page).toHaveTitle('江风入境 · 外滩漫游');
  await expect(page.locator('main')).toHaveAttribute('data-ready', 'true', { timeout: 120000 });
  assert(tiles.size < 40, 'Entry must not wait for the entire city');
  results.push({ startupTileRequests: tiles.size });
  await page.screenshot({ path: fileURLToPath(new URL('desktop-intro.png', output)) });
  await page.locator('#enter-world').click();
  await expect(page.locator('main')).toHaveAttribute('data-phase', 'playing');
  await page.waitForTimeout(1000);
  assert(
    Math.abs(Number(await page.locator('main').getAttribute('data-yaw')) + 1.5) < 0.01,
    'Initial spawn must set the first-person camera after physics initializes',
  );
  const standingY = Number(await page.locator('main').getAttribute('data-y'));
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);
  assert(
    Number(await page.locator('main').getAttribute('data-y')) > standingY + 0.7,
    'Space must jump',
  );
  await page.waitForTimeout(900);
  await expect(page.locator('main')).toHaveAttribute('data-grounded', 'true');
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
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(5600);
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(350);
  await page.keyboard.press('KeyE');
  await expect(page.locator('main')).toHaveAttribute('data-sitting', 'true');
  await page.keyboard.press('KeyE');
  await expect(page.locator('main')).toHaveAttribute('data-sitting', 'false');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '两岸地图 ↗' }).click();
  await page.getByRole('button', { name: /02 和平饭店/ }).click();
  await page.waitForTimeout(1000);
  await page.keyboard.press('KeyE');
  await expect(page.getByRole('dialog', { name: '地标介绍' })).toBeVisible();
  await page.getByRole('button', { name: '收入旅行手记' }).click();
  await expect(page.getByRole('button', { name: '已收入旅行手记 ✓' })).toBeDisabled();
  await page.getByRole('button', { name: '返回漫游' }).click();
  await page.keyboard.press('KeyP');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '旅行手记 ↗' }).click();
  await expect(page.locator('figure img')).toBeVisible();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('link', { name: '保存这张照片' }).click();
  assert((await downloaded).suggestedFilename().endsWith('.png'));
  await page.getByRole('button', { name: '返回漫游' }).click();
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').getByText('暮色', { exact: true }).click();
  await page.getByRole('button', { name: '继续漫游' }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: fileURLToPath(new URL('desktop-night.png', output)) });
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
      await page.keyboard.down('ShiftLeft');
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(10500);
      await page.keyboard.up('KeyW');
      await page.keyboard.up('ShiftLeft');
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
  await page.keyboard.down('KeyR');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(500);
  assert(
    Number(await page.locator('main').getAttribute('data-speed')) > 8,
    'R must move faster than Shift',
  );
  await page.keyboard.up('KeyD');
  await page.keyboard.up('KeyR');
  assert(tiles.size < totalTiles, 'Unseen city and sidewalk tiles should remain unloaded');
  results.push({ visitedTileRequests: tiles.size, totalTiles });
  await page.reload();
  await expect(page.locator('main')).toHaveAttribute('data-ready', 'true', { timeout: 120000 });
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem('travel-bund.visits.v1')).length),
    1,
  );
  await page.locator('#enter-world').click();
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
  const trafficContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
  await expect(traffic.locator('main')).toHaveAttribute('data-ready', 'true', { timeout: 120000 });
  await traffic.locator('#enter-world').click();
  await traffic.waitForTimeout(1500);
  const facing = Number(await traffic.locator('main').getAttribute('data-yaw'));
  await traffic.evaluate(
    (dx) => document.dispatchEvent(new MouseEvent('mousemove', { movementX: dx })),
    (facing - Math.PI / 2) / 0.002,
  );
  await traffic.waitForTimeout(50);
  await traffic.keyboard.down('KeyR');
  await traffic.keyboard.down('KeyW');
  await traffic.waitForTimeout(2500);
  const stoppedX = Number(await traffic.locator('main').getAttribute('data-x'));
  await traffic.waitForTimeout(1500);
  await traffic.keyboard.up('KeyW');
  await traffic.keyboard.up('KeyR');
  const heldX = Number(await traffic.locator('main').getAttribute('data-x'));
  assert(
    Math.abs(stoppedX - heldX) < 0.15 && heldX > -408 && heldX < -383,
    'Visible moving car must stop a sprinting player',
  );
  await traffic.screenshot({ path: fileURLToPath(new URL('car-collision-fixture.png', output)) });
  results.push({ carCollision: { stoppedX, heldX } });
  await trafficContext.close();
  if (process.env.INSPECT_ONLY !== '1') {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ]) {
      const mobile = await browser.newContext({
        viewport,
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 1,
      });
      const p = await mobile.newPage();
      currentPage = p;
      p.on('pageerror', (e) => errors.push(e.message));
      await p.goto(url);
      await expect(p.locator('main')).toHaveAttribute('data-ready', 'true', { timeout: 120000 });
      await p.locator('#enter-world').tap();
      await expect(p.getByRole('group', { name: '移动摇杆' })).toBeVisible();
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
        Math.abs(Number(await p.locator('main').getAttribute('data-yaw')) - yaw) > 0.05,
        'Second finger must turn the camera while walking',
      );
      const groundY = Number(await p.locator('main').getAttribute('data-y'));
      await p.getByRole('button', { name: /跳上 \/ 跳下/ }).tap();
      await expect
        .poll(async () => Number(await p.locator('main').getAttribute('data-y')), {
          message: 'Touch jump must lift the player',
          timeout: 2500,
        })
        .toBeGreaterThan(groundY + 0.6);
      await p.waitForTimeout(900);
      await p.getByRole('button', { name: '漫步 ×1' }).tap();
      await p.getByRole('button', { name: '快走 ×2' }).tap();
      await expect(p.getByRole('button', { name: '疾行 ×6' })).toBeVisible();
      await p.getByRole('button', { name: '疾行 ×6' }).tap();
      assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await p.screenshot({ path: fileURLToPath(new URL(`mobile-${viewport.width}.png`, output)) });
      await p.getByRole('button', { name: '暂停漫游' }).tap();
      await expect(p.getByRole('dialog')).toBeVisible();
      results.push({
        viewport,
        position: await p.locator('main').evaluate((el) => ({ ...el.dataset })),
      });
      await mobile.close();
    }
  }
  const recoveryContext = await browser.newContext();
  const recovery = await recoveryContext.newPage();
  currentPage = recovery;
  await recovery.route('**/world/world.json', (route) =>
    route.fulfill({ status: 503, body: 'offline' }),
  );
  await recovery.goto(url);
  await expect(recovery.getByRole('alert')).toBeVisible();
  await recovery.unroute('**/world/world.json');
  await recovery.getByRole('button', { name: '重新载入 ↻' }).click();
  await expect(recovery.locator('main')).toHaveAttribute('data-ready', 'true', { timeout: 120000 });
  await recoveryContext.close();
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('report.json', output),
    JSON.stringify({ url, results, errors }, null, 2),
  );
  console.log(JSON.stringify({ results, errors }, null, 2));
} catch (e) {
  console.error('BROWSER_ERRORS', errors);
  if (currentPage && !currentPage.isClosed()) {
    console.error(await currentPage.locator('body').innerText());
    console.error(
      await currentPage
        .locator('main')
        .evaluate((e) => ({ ...e.dataset }))
        .catch(() => null),
    );
    await currentPage.screenshot({ path: fileURLToPath(new URL('failure.png', output)) });
  }
  throw e;
} finally {
  await browser.close();
  await server?.close();
}

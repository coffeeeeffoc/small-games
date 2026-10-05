import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';

// Full production scene, real touch input and actual instance transforms; no scene fixtures.
const server = await preview({
  root: fileURLToPath(new URL('../', import.meta.url)),
  preview: { host: '127.0.0.1', port: 0 },
});
const base = `http://127.0.0.1:${server.httpServer.address().port}/`;
const executablePath = [
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => p && existsSync(p));
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist'],
});
const output = new URL('../../../../.scratch/travel-bund-life/', import.meta.url);
await mkdir(output, { recursive: true });
const errors = [],
  checks = [],
  samples = [];
let current;
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    const context = await browser.newContext({
      viewport,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    current = page;
    const requests = new Set();
    const homeLoads = [];
    page.on('request', (r) => {
      if (/\/(world|life)\/.*\.glb/.test(r.url())) requests.add(r.url().split('/').at(-1));
      if (/world\.json|\.glb|\/Scene-|rapier.*wasm/.test(r.url())) homeLoads.push(r.url());
    });
    page.on('pageerror', (e) => errors.push(e.stack || e.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto(base + '?dev=1');
    await expect(page.locator('main')).toHaveAttribute('data-phase', 'intro');
    await expect(page.locator('main')).toHaveAttribute('data-ready', 'true', { timeout: 120000 });
    assert.equal(await page.locator('canvas').count(), 1, 'Home previews the actual tour');
    assert(
      homeLoads.some((url) => /world\.json/.test(url)),
      'Home uses real world data',
    );
    await page.evaluate(() => window.SmallGamesDev.setPanelHidden(true));
    await page.addStyleTag({ content: '.debug{display:none}' });
    await page.getByRole('button', { name: '游览设置' }).tap();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('combobox', { name: '画面精度' }).tap();
    await page.screenshot({
      path: fileURLToPath(new URL(`settings-options-${viewport.width}.png`, output)),
    });
    await page.locator('[role="option"][value="' + '0' + '"]').tap();
    await page.getByRole('button', { name: '返回首页', exact: true }).tap();
    await expect(page.locator('main')).toHaveAttribute('data-phase', 'intro');
    await page.screenshot({ path: fileURLToPath(new URL(`home-${viewport.width}.png`, output)) });
    await page.locator('#enter-world').tap();
    await expect(page.locator('main')).toHaveAttribute('data-phase', 'playing', {
      timeout: 120000,
    });
    const read = () => page.evaluate(() => window.SmallGamesDev.inspect().game?.streetLife);
    await expect.poll(async () => Boolean((await read())?.blocks.length)).toBe(true);
    const start = await read();
    assert.equal(start.colliders.length, start.blocks.length * 3);
    assert(start.blocks.length <= 5);
    assert(start.blocks.some((b) => b.id === 'welcome'));
    await page.waitForTimeout(700);
    const moving = await read();
    assert.notDeepEqual(
      moving.visitors[0].matrix,
      start.visitors[0].matrix,
      'A real visitor walks, beyond a changing toast',
    );
    const cdp = await context.newCDPSession(page);
    async function swipe(dx, dy = 0) {
      const x = viewport.width * 0.62,
        y = viewport.height * 0.3;
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ id: 7, x, y }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ id: 7, x: x + dx, y: y + dy }],
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(80);
    }
    async function aim(p, height) {
      let scene = await read();
      const [x, y, z] = scene.camera.position;
      const yaw = Math.atan2(x - p[0], z - p[2]),
        pitch = Math.atan2(p[1] + height - y, Math.hypot(x - p[0], z - p[2]));
      const delta = Math.atan2(Math.sin(scene.camera.yaw - yaw), Math.cos(scene.camera.yaw - yaw));
      const dx = -delta / 0.002,
        dy = -(scene.camera.pitch - pitch) / 0.002;
      const n =
        Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / Math.min(70, viewport.height * 0.18)) || 1;
      for (let i = 0; i < n; i++) await swipe(dx / n, dy / n);
      await page.waitForTimeout(400);
    }
    const cart = moving.blocks.find((b) => b.id === 'welcome');
    await aim(cart.position, 2.3);
    await expect(page.getByRole('button', { name: '江风小站', exact: true })).toBeVisible();
    await page.screenshot({
      path: fileURLToPath(new URL(`playing-${viewport.width}.png`, output)),
    });
    const marker = await page.getByRole('button', { name: '江风小站', exact: true }).boundingBox();
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ id: 9, x: marker.x + marker.width / 2, y: marker.y + marker.height / 2 }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    assert.equal(
      await page.getByRole('dialog').count(),
      0,
      'Cancelling a marker gesture must not open a gift dialog',
    );
    await page.getByRole('button', { name: '江风小站', exact: true }).tap();
    await expect(page.getByRole('dialog', { name: '江风小站' })).toBeVisible();
    await page.screenshot({ path: fileURLToPath(new URL(`stall-${viewport.width}.png`, output)) });
    await page.getByRole('button', { name: /一杯江边清凉/ }).tap();
    assert(
      (
        await page.evaluate(() => JSON.parse(localStorage.getItem('travel-bund.moments.v1')))
      ).includes('drink'),
    );
    await aim(cart.position, 2.3);
    await page.getByRole('button', { name: '江风小站', exact: true }).tap();
    await page.getByRole('button', { name: /一张外滩明信片/ }).tap();
    await page.getByRole('button', { name: '打开旅行手记' }).tap();
    await expect(page.locator('figure img')).toBeVisible();
    await page.screenshot({
      path: fileURLToPath(new URL(`journal-${viewport.width}.png`, output)),
    });
    await expect(page.getByText('一张外滩明信片', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '返回漫游' }).tap();
    // Aim at the actual visible pigeon's current transform, then check its actual height.
    let scene = await read();
    const bird = scene.pigeons.find((b) => b.id === 'welcome/pigeon/0');
    const p = [bird.matrix[12], 0.92, bird.matrix[14]];
    await aim(p, 0.65);
    await expect(page.getByRole('button', { name: '看看小鸽子', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '看看小鸽子', exact: true }).tap();
    await expect
      .poll(async () => Math.max(...(await read()).pigeons.map((b) => b.matrix[13])))
      .toBeGreaterThan(1.7);
    scene = await read();
    const visitor = scene.visitors.find((b) => b.id === 'welcome/visitor/2');
    await aim([visitor.matrix[12], 0.92, visitor.matrix[14]], 1.7);
    await expect(page.getByRole('button', { name: '打个招呼', exact: true })).toBeVisible();
    const armBefore = (await read()).arms.find((b) => b.id === visitor.id).matrix;
    await page.getByRole('button', { name: '打个招呼', exact: true }).tap();
    await page.waitForTimeout(250);
    const armAfter = (await read()).arms.find((b) => b.id === visitor.id).matrix;
    assert.notDeepEqual(
      armAfter.slice(0, 12),
      armBefore.slice(0, 12),
      'The visitor actually raises an articulated arm',
    );
    await aim(cart.position, 1.2);
    const stick = await page.getByRole('group', { name: '移动摇杆' }).boundingBox(),
      finger = { id: 1, x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 };
    const before = await page.locator('main').evaluate((el) => ({ ...el.dataset }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger] });
    finger.y -= 35;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [finger] });
    await page.waitForTimeout(650);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect(page.locator('main')).toHaveAttribute('data-speed', '0.00');
    const after = await page.locator('main').evaluate((el) => ({ ...el.dataset }));
    assert(
      Math.hypot(Number(after.x) - Number(before.x), Number(after.z) - Number(before.z)) > 0.3,
    );
    await page.getByRole('button', { name: '暂停', exact: true }).tap();
    await page.screenshot({ path: fileURLToPath(new URL(`pause-${viewport.width}.png`, output)) });
    const paused = await read();
    await page.waitForTimeout(300);
    assert.deepEqual((await read()).visitors, paused.visitors);
    const bars = await page
      .getByRole('button', { name: '暂停', exact: true })
      .locator('svg rect')
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          w: node.getAttribute('width'),
          h: node.getAttribute('height'),
          x: node.getAttribute('x'),
        })),
      );
    assert.equal(bars.length, 2);
    assert.equal(bars[0].w, bars[1].w);
    assert.equal(bars[0].h, bars[1].h);
    assert.notEqual(bars[0].x, bars[1].x);
    await page.getByRole('switch', { name: '生活动画' }).tap();
    await page.getByRole('button', { name: '继续漫游' }).tap();
    const reduced = await read();
    await page.waitForTimeout(300);
    assert.deepEqual(
      (await read()).visitors,
      reduced.visitors,
      'Reduced-motion visitors stay still',
    );
    if (viewport.width === 390) {
      const npc = (await read()).visitors.find((v) => v.id === 'welcome/visitor/0');
      const destination = [npc.matrix[12], 0.92, npc.matrix[14]];
      await aim(destination, 0.82);
      const finger = { id: 1, x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger] });
      finger.y -= 35;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [finger] });
      let closest = Infinity,
        captured = false;
      for (let i = 0; i < 65; i++) {
        await page.waitForTimeout(100);
        const sample = await page.evaluate(() => ({
          player: document.querySelector('main').dataset,
          colliders: window.SmallGamesDev.inspect().game.streetLife.colliders,
        }));
        const player = { x: Number(sample.player.x), z: Number(sample.player.z) };
        for (const body of sample.colliders) {
          const gap = Math.hypot(body.position.x - player.x, body.position.z - player.z);
          assert(
            gap > 0.53,
            `A player must not penetrate the visible visitor ${body.id}: ${gap} m`,
          );
          closest = Math.min(closest, gap);
        }
        if (closest < 0.67 && !captured) {
          captured = true;
          await page.screenshot({ path: fileURLToPath(new URL('visitor-collision.png', output)) });
        }
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      assert(closest < 0.67, `Touch walking actually meets a visible visitor: ${closest} m`);
      checks.push(
        `Actual CDP touch walking contacts solid visitors at ${closest.toFixed(3)} m; 65 samples never overlap, including sliding around them.`,
      );
    }
    await page.getByRole('button', { name: '暂停', exact: true }).tap();
    await page.getByRole('button', { name: '夜色', exact: true }).tap();
    await page.getByRole('button', { name: '继续漫游' }).tap();
    await page.waitForTimeout(500);
    await page.screenshot({ path: fileURLToPath(new URL(`night-${viewport.width}.png`, output)) });
    await page.getByRole('button', { name: '打开地图' }).tap();
    await page.screenshot({ path: fileURLToPath(new URL(`map-${viewport.width}.png`, output)) });
    await page.getByRole('button', { name: '返回漫游', exact: true }).tap();
    await page.getByRole('button', { name: '返回首页', exact: true }).tap();
    await expect(page.locator('main')).toHaveAttribute('data-phase', 'intro');
    assert.equal(await page.locator('canvas').count(), 1, 'Returning home keeps the same scene');
    await page.waitForTimeout(300);
    const homeStill = await read();
    await page.waitForTimeout(300);
    assert.deepEqual(
      (await read()).visitors,
      homeStill.visitors,
      'Home preview pauses street simulation',
    );
    await page.locator('#enter-world').tap();
    await expect(page.locator('main')).toHaveAttribute('data-phase', 'playing', {
      timeout: 120000,
    });
    await expect.poll(async () => (await read())?.colliders.length || 0).toBeGreaterThan(0);
    await page.getByRole('button', { name: '暂停', exact: true }).tap();
    await page.getByRole('switch', { name: '行人与鸽子' }).tap();
    await page.getByRole('button', { name: '继续漫游' }).tap();
    await expect.poll(async () => (await read())?.colliders.length).toBe(0);
    await page.reload();
    await expect(page.locator('main')).toHaveAttribute('data-motion', 'false');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    samples.push({ viewport, frames: after, requested: requests.size, lifeBytes: 602788 });
    checks.push(
      `${viewport.width}: home settings, cart gifts/photo, actual bird flight and arm wave, touch walking/cancel, pause, reduced motion, night and saved preferences`,
    );
    await context.close();
  }
  // The actual built game and same-origin iframe retain URL/storage developer precedence.
  for (const embedded of [false, true])
    for (const mode of [
      { query: '', stored: null, enabled: false },
      { query: '?dev=1', stored: null, enabled: true },
      { query: '', stored: '1', enabled: true },
      { query: '?dev=0', stored: '1', enabled: false },
    ]) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      if (mode.stored)
        await context.addInitScript((value) => localStorage.setItem('dev', value), mode.stored);
      const page = await context.newPage();
      current = page;
      page.on('pageerror', (e) => errors.push(e.message));
      if (embedded) {
        await page.route('**/embed-fixture', (route) =>
          route.fulfill({
            contentType: 'text/html',
            body: `<meta name="viewport" content="width=device-width,initial-scale=1"><iframe style="position:fixed;inset:0;width:100%;height:100%;border:0" src="${base + mode.query}" allow="fullscreen"></iframe>`,
          }),
        );
        await page.goto(base + 'embed-fixture');
        await expect(page.locator('iframe')).toBeVisible();
      } else await page.goto(base + mode.query);
      const frame = embedded ? page.frames().find((f) => f.parentFrame()) : page;
      await expect
        .poll(() => frame.evaluate(() => window.SmallGamesDev?.isEnabled()))
        .toBe(mode.enabled);
      if (mode.enabled) {
        const tools = frame.locator('small-games-devtools');
        await expect(tools).toBeVisible();
      }
      checks.push(
        `${embedded ? 'iframe' : 'standalone'} dev URL=${mode.query || 'none'} storage=${mode.stored || 'none'} enabled=${mode.enabled}`,
      );
      await context.close();
    }
  assert.deepEqual(errors, []);
  await writeFile(
    new URL('report.json', output),
    JSON.stringify(
      {
        checks,
        samples,
        errors,
        environment:
          'Windows Chrome hardware WebGL with emulated mobile touch; physical phone and Safari not verified',
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks, samples, errors }, null, 2));
} catch (e) {
  if (current && !current.isClosed()) {
    console.error('ERRORS', errors, await current.locator('body').innerText());
    await current.screenshot({ path: fileURLToPath(new URL('failure.png', output)) });
    console.error(
      await current
        .locator('main')
        .evaluate((el) => ({ ...el.dataset }))
        .catch(() => null),
    );
  }
  throw e;
} finally {
  await browser.close();
  await server.close();
}

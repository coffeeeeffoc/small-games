import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';
const out = fileURLToPath(new URL('../../../../.scratch/travel-bund-preview/', import.meta.url));
await mkdir(out, { recursive: true });
const server = await preview({
  root: fileURLToPath(new URL('../', import.meta.url)),
  preview: { host: '127.0.0.1', port: 0 },
});
const base = `http://127.0.0.1:${server.httpServer.address().port}/`;
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist'],
});
const errors = [],
  checks = [],
  external = [],
  samples = [];
function assertViewpoint(actual, expected, message) {
  assert.deepEqual(
    [actual.yaw, actual.pitch, actual.position[0], actual.position[2]],
    [expected.yaw, expected.pitch, expected.position[0], expected.position[2]],
    message,
  );
}
let current;
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    current = page;
    // A full city scene can render below 1 FPS in shared CPU SwiftShader.
    // Keep real touch input and allow Chromium to acknowledge completed UI taps.
    page.setDefaultTimeout(120000);
    console.log(`${viewport.width}x${viewport.height}: loading full production scene`);
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('request', (r) => {
      if (!r.url().startsWith(base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:'))
        external.push(r.url());
    });
    await page.goto(base + '?dev=1');
    await expect(page.locator('main')).toHaveAttribute('data-ready', 'true', { timeout: 120000 });
    await page.evaluate(() => window.SmallGamesDev.setPanelHidden(true));
    await page.addStyleTag({ content: '.debug{display:none}' });
    await page.waitForTimeout(3500);
    const canvas = page.locator('canvas');
    await canvas.evaluate((el) => (window.previewCanvas = el));
    const inspect = () => page.evaluate(() => window.SmallGamesDev.inspect().game.streetLife);
    const logicalAspect = await page
      .locator('main')
      .evaluate((el) => el.clientWidth / el.clientHeight);
    await expect
      .poll(async () => (await inspect()).camera.aspect, { timeout: 15000 })
      .toBeCloseTo(logicalAspect, 3);
    const buffer = await canvas.evaluate((el) => ({ width: el.width, height: el.height }));
    assert(
      Math.abs(buffer.width / buffer.height - logicalAspect) < 0.01,
      `WebGL drawing buffer uses landscape logical dimensions: ${buffer.width}x${buffer.height}`,
    );
    // CDP accepts physical screen coordinates. The complete landscape game rotates
    // clockwise in a portrait viewport, so gestures must follow its logical axes.
    const logicalPoint = (x, y) =>
      page.locator('main').evaluate(
        (el, [x, y]) => {
          const rect = el.getBoundingClientRect();
          return el.dataset.rotated === 'true'
            ? { x: rect.right - y * el.clientHeight, y: rect.top + x * el.clientWidth }
            : { x: rect.left + x * el.clientWidth, y: rect.top + y * el.clientHeight };
        },
        [x, y],
      );
    const logicalDelta = (dx, dy) =>
      page
        .locator('main')
        .evaluate(
          (el, [dx, dy]) => (el.dataset.rotated === 'true' ? { x: -dy, y: dx } : { x: dx, y: dy }),
          [dx, dy],
        );
    await expect(page.locator('main')).toHaveAttribute(
      'data-rotated',
      String(viewport.height > viewport.width),
    );
    assert(await page.locator('main').evaluate((el) => el.clientWidth >= el.clientHeight));
    const home = await inspect();
    await page.screenshot({ path: `${out}/home-${viewport.width}.png` });
    await page.locator('#enter-world').tap();
    await expect(page.locator('main')).toHaveAttribute('data-phase', 'playing', {
      timeout: 120000,
    });
    await expect
      .poll(async () => Boolean((await inspect())?.blocks.length), { timeout: 15000 })
      .toBe(true);
    const play = await inspect();
    assert.equal(play.camera.yaw, home.camera.yaw, 'Entering preserves camera yaw');
    assert.equal(play.camera.pitch, home.camera.pitch, 'Entering preserves camera pitch');
    assert.equal(play.camera.position[0], home.camera.position[0]);
    assert.equal(play.camera.position[2], home.camera.position[2]);
    assert(
      await canvas.evaluate((el) => el === window.previewCanvas),
      'Entering preserves the same WebGL canvas',
    );
    await page.screenshot({ path: `${out}/playing-${viewport.width}.png` });
    console.log(
      `${viewport.width}x${viewport.height}: projection/entry passed; CDP walking and turning`,
    );
    const before = await page.locator('main').evaluate((el) => ({ ...el.dataset }));
    const stick = await page.getByRole('group', { name: '移动摇杆' }).boundingBox();
    const cdp = await context.newCDPSession(page);
    const touch = { id: 1, x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] });
    const forward = await logicalDelta(0, -30);
    touch.x += forward.x;
    touch.y += forward.y;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch] });
    await expect
      .poll(
        async () => {
          const pos = await page.locator('main').evaluate((el) => ({ ...el.dataset }));
          return Math.hypot(Number(pos.x) - Number(before.x), Number(pos.z) - Number(before.z));
        },
        { timeout: 45000 },
      )
      .toBeGreaterThan(0.3);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect(page.locator('main')).toHaveAttribute('data-speed', '0.00', { timeout: 15000 });
    const cdpLook = { id: 2, ...(await logicalPoint(0.63, 0.3)) };
    const yaw = Number(await page.locator('main').getAttribute('data-yaw'));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [cdpLook] });
    const turn = await logicalDelta(45, 0);
    cdpLook.x += turn.x;
    cdpLook.y += turn.y;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [cdpLook] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect
      .poll(
        async () => Math.abs(Number(await page.locator('main').getAttribute('data-yaw')) - yaw),
        { timeout: 15000 },
      )
      .toBeGreaterThan(0.05);
    samples.push({
      viewport,
      logicalAspect,
      cameraAspect: (await inspect()).camera.aspect,
      buffer,
      telemetry: await page.locator('main').evaluate((el) => ({ ...el.dataset })),
    });
    console.log(
      `${viewport.width}x${viewport.height}: real CDP controls passed; pause/settings/journal`,
    );
    await page.getByRole('button', { name: '暂停', exact: true }).tap();
    const paused = await inspect();
    await page.waitForTimeout(500);
    assertViewpoint((await inspect()).camera, paused.camera, 'Pause preserves the viewpoint');
    assert.deepEqual(
      (await inspect()).visitors,
      paused.visitors,
      'Pause freezes street simulation',
    );
    await page.screenshot({ path: `${out}/settings-${viewport.width}.png` });
    await page.getByRole('combobox', { name: '模型细节' }).tap();
    await page.locator('[role="option"][value="balanced"]').tap();
    await expect(page.getByRole('combobox', { name: '模型细节' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await page.screenshot({ path: `${out}/choices-${viewport.width}.png` });
    await page.getByRole('button', { name: '继续漫游' }).tap();
    await page.getByRole('button', { name: '拍照', exact: true }).tap();
    await page.getByRole('button', { name: '打开旅行手记' }).tap();
    await expect(page.locator('figure img')).toBeVisible();
    await page.getByRole('button', { name: '返回漫游', exact: true }).tap();
    const beforeHome = await inspect();
    await page.getByRole('button', { name: '返回首页', exact: true }).tap();
    assert(
      await canvas.evaluate((el) => el === window.previewCanvas),
      'Home preserves the actual viewpoint and Canvas',
    );
    const still = await inspect();
    assertViewpoint(still.camera, beforeHome.camera, 'Returning home preserves the viewpoint');
    await page.waitForTimeout(1000);
    assert.deepEqual((await inspect()).visitors, still.visitors);
    await page.locator('#enter-world').tap();
    await expect(page.locator('main')).toHaveAttribute('data-phase', 'playing');
    assertViewpoint((await inspect()).camera, still.camera, 'Resume preserves the home viewpoint');
    console.log(`${viewport.width}x${viewport.height}: complete`);
    checks.push(
      `${viewport.width}x${viewport.height}: full production landscape scene and ${viewport.height > viewport.width ? 'portrait rotation fallback' : 'physical landscape'}, entry camera continuity, logical CDP touch walking/turning/cancel, pause/settings, persistent model choices, photo/journal, preserved Canvas and viewpoint on return/resume`,
    );
    await context.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  await writeFile(
    `${out}/visual-report.json`,
    JSON.stringify(
      {
        checks,
        samples,
        errors,
        external,
        environment:
          'Full production scene; Linux Chromium headless WebGL with browser touch emulation, not physical phone or mobile Safari; software rendering cannot establish mobile GPU performance',
      },
      null,
      2,
    ),
  );
  console.log(checks.join('\n'));
} catch (error) {
  if (current && !current.isClosed()) {
    await current.screenshot({ path: `${out}/failure.png` }).catch(() => {});
    console.error('Scene browser errors:', errors);
    console.error(
      await current
        .locator('main')
        .evaluate((el) => ({ ...el.dataset }))
        .catch(() => null),
    );
  }
  throw error;
} finally {
  await browser.close();
  await server.close();
}

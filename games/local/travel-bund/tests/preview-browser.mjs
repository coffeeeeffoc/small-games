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
  external = [];
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
    const page = await context.newPage();
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
    const before = await page.locator('main').evaluate((el) => ({ ...el.dataset }));
    const stick = await page.getByRole('group', { name: '移动摇杆' }).boundingBox();
    const cdp = await context.newCDPSession(page);
    const touch = { id: 1, x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] });
    touch.y -= 30;
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
    const cdpLook = { id: 2, x: viewport.width * 0.63, y: viewport.height * 0.3 };
    const yaw = Number(await page.locator('main').getAttribute('data-yaw'));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [cdpLook] });
    cdpLook.x += 45;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [cdpLook] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect
      .poll(
        async () => Math.abs(Number(await page.locator('main').getAttribute('data-yaw')) - yaw),
        { timeout: 15000 },
      )
      .toBeGreaterThan(0.05);
    await page.getByRole('button', { name: '暂停', exact: true }).tap();
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
    await page.getByRole('button', { name: '返回首页', exact: true }).tap();
    assert(
      await canvas.evaluate((el) => el === window.previewCanvas),
      'Home preserves the actual viewpoint and Canvas',
    );
    const still = await inspect();
    await page.waitForTimeout(1000);
    assert.deepEqual((await inspect()).visitors, still.visitors);
    await page.locator('#enter-world').tap();
    await expect(page.locator('main')).toHaveAttribute('data-phase', 'playing');
    checks.push(
      `${viewport.width}x${viewport.height}: actual scene preview and entry camera continuity, CDP touch walking/turning/cancel, manual pause/settings, persistent model choices, photo and journal, return/resume with paused simulation`,
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
        errors,
        external,
        environment: 'Full production scene; browser touch emulation, not physical phone',
      },
      null,
      2,
    ),
  );
  console.log(checks.join('\n'));
} finally {
  await browser.close();
  await server.close();
}

import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const out = fileURLToPath(new URL('../docs/evidence/', import.meta.url));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [],
  results = [];
const page = await browser.newPage({ viewport: { width: 1100, height: 720 } });
let renderer;
page.on('pageerror', (e) => errors.push(e.message));
let mx = 500,
  my = 300;
async function look(yaw) {
  await page.mouse.move(mx, my);
  for (let i = 0; i < 5; i++) {
    const r = await page.evaluate(() => window.mazeDebug.snapshot().run),
      delta = Math.atan2(Math.sin(yaw - r.yaw), Math.cos(yaw - r.yaw));
    if (Math.abs(delta) < 0.015 && Math.abs(r.pitch) < 0.015) break;
    mx -= delta / 0.0024;
    my += r.pitch / 0.0024;
    await page.mouse.move(mx, my);
    await page.waitForTimeout(40);
  }
}
async function walk(x, z) {
  for (let i = 0; i < 100; i++) {
    const r = await page.evaluate(() => window.mazeDebug.snapshot().run),
      dist = Math.hypot(x - r.x, z - r.z);
    if (dist < 0.18) return;
    await look(Math.atan2(-(x - r.x), -(z - r.z)));
    await page.keyboard.down('w');
    await page.waitForTimeout(Math.min(240, (dist / 3.3) * 1000));
    await page.keyboard.up('w');
  }
  throw new Error(`Mixed-scene physical traversal failed: ${x},${z}`);
}
try {
  await page.goto(process.env.MAZE_URL || 'http://127.0.0.1:4437');
  await page.waitForFunction(() => window.mazeDebug);
  renderer = await page.evaluate(() => {
    const gl = document.querySelector('canvas').getContext('webgl2');
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
  });
  for (const id of [1, 5, 9, 13, 17, ...(process.argv.includes('--mixed') ? [20] : [])]) {
    let mirrorQuality;
    await page.evaluate((id) => window.mazeDebug.select(id), id);
    await page.locator('#enter').click();
    await page.waitForFunction(() => window.mazeDebug.snapshot().screen === 'playing');
    await look(id === 13 ? 0 : -Math.PI / 2);
    await page.keyboard.down('w');
    await page.waitForTimeout(350);
    await page.keyboard.up('w');
    if (id === 13) {
      let s = await page.evaluate(() => window.mazeDebug.snapshot());
      assert.ok(s.run.candidates.includes('A:0'));
      assert.equal(s.run.verified['A:0'], undefined);
      assert.deepEqual(s.run.visited, ['A']);
      await page.keyboard.press('e');
      s = await page.evaluate(() => window.mazeDebug.snapshot());
      assert.equal(s.run.verified['A:0'], 'mirror');
      await look(-0.42);
      await page.keyboard.press('q');
      await page.getByRole('button', { name: /参考点 辨认空间的位置/ }).click();
      await look(0);
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${out}/theme-13-mirror-mark.png` });
      const before = await page.evaluate(() => window.mazeDebug.snapshot());
      await page.keyboard.down('w');
      await page.waitForTimeout(950);
      await page.keyboard.up('w');
      const after = await page.evaluate(() => window.mazeDebug.snapshot());
      assert.ok(after.run.z > -2.68, 'mirror is solid');
      assert.equal(Object.keys(after.run.marks).length, 1);
      assert.deepEqual(after.run.visited, ['A']);
      assert.ok(before.metrics.reflections > 0 && before.metrics.reflections <= 2);
      await walk(0, 0);
      await look(Math.PI / 4);
      await page.waitForTimeout(350);
      const high = await page.evaluate(() => window.mazeDebug.snapshot());
      assert.equal(
        high.metrics.reflections,
        2,
        'two visible mirrors update once each, without recursion',
      );
      await page.screenshot({ path: `${out}/mirror-two-surfaces.png` });
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '设置', exact: true }).click();
      await page.getByRole('combobox').selectOption('low');
      await page.getByRole('button', { name: '保存设置', exact: true }).click();
      await page.locator('#resume').click();
      await look(Math.PI / 4);
      await page.waitForTimeout(600);
      const low = await page.evaluate(() => window.mazeDebug.snapshot());
      assert.equal(low.metrics.reflections, 2);
      assert.deepEqual(low.run.verified, high.run.verified);
      assert.deepEqual(low.run.marks, high.run.marks);
      await page.screenshot({ path: `${out}/mirror-low-quality.png` });
      mirrorQuality = { high: high.metrics, low: low.metrics };
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '设置', exact: true }).click();
      await page.getByRole('combobox').selectOption('high');
      await page.getByRole('button', { name: '保存设置', exact: true }).click();
      await page.locator('#resume').click();
    }
    if (id === 20) {
      await walk(0, 0);
      for (const [z, theme] of [
        [8, 'garden'],
        [16, 'light'],
        [24, 'mirror'],
        [32, 'cosmos'],
      ]) {
        await walk(0, z);
        await look(0.8);
        await page.waitForTimeout(250);
        await page.screenshot({ path: `${out}/mixed-20-${theme}.png` });
      }
      assert.ok((await page.evaluate(() => window.mazeDebug.snapshot().run.visited)).length >= 5);
    }
    await look(id === 13 ? 0.35 : -0.8);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/theme-${String(id).padStart(2, '0')}.png` });
    results.push({
      level: id,
      state: await page.evaluate(() => window.mazeDebug.snapshot()),
      mirrorQuality,
      verified:
        'real scene, native movement and turn; mirror additionally inspected, marked and collided',
    });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.mazeDebug.snapshot().screen === 'pause');
  }
  const cdp = await page.context().newCDPSession(page);
  const object = await cdp.send('Runtime.evaluate', { expression: 'window' });
  const listeners = await cdp.send('DOMDebugger.getEventListeners', {
    objectId: object.result.objectId,
  });
  assert.equal(
    listeners.listeners.filter((l) => l.type === 'keyup').length,
    1,
    'input listeners do not accumulate on level changes',
  );
  await cdp.detach();
  assert.deepEqual(errors, []);
} finally {
  await writeFile(
    `${out}/themes-report.json`,
    JSON.stringify(
      {
        date: new Date().toISOString(),
        browser: browser.version(),
        viewport: '1100x720',
        renderer,
        results,
        errors,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
console.log(`Theme checks: ${results.length}; errors: ${errors.length}`);

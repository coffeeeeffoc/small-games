import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const out = fileURLToPath(new URL('../docs/evidence/', import.meta.url));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true }),
  errors = [],
  results = [];
try {
  for (const viewport of [
    { width: 844, height: 390 },
    { width: 390, height: 844 },
    { width: 320, height: 640 },
  ]) {
    const context = await browser.newContext({
      viewport,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
      locale: 'zh-CN',
    });
    await context.addInitScript(() => {
      if (!localStorage.getItem('maze-wander:v1'))
        localStorage.setItem(
          'maze-wander:v1',
          JSON.stringify({ version: 1, unlocked: 1, settings: { quality: 'low' } }),
        );
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    const developerUrl = new URL(process.env.MAZE_URL || 'http://127.0.0.1:4437');
    developerUrl.searchParams.set('dev', '1');
    await page.goto(developerUrl.href);
    await page.waitForFunction(() => window.mazeDebug);
    await page.locator('#start').tap();
    await page.locator('#enter').tap();
    await page.getByRole('button', { name: '跳过教程' }).tap();
    const snap = () => page.evaluate(() => window.mazeDebug.snapshot());
    const a = await snap();
    await page.evaluate(() => {
      window.inputEvents = [];
      for (const type of [
        'pointerdown',
        'pointermove',
        'pointerup',
        'pointercancel',
        'lostpointercapture',
      ])
        document.addEventListener(type, (e) =>
          window.inputEvents.push({ type, id: e.pointerId, target: e.target.className }),
        );
    });
    const joy = await page.getByTestId('joystick').boundingBox(),
      look = await page.getByTestId('look-zone').boundingBox();
    const p1 = { id: 11, x: joy.x + joy.width / 2, y: joy.y + joy.height / 2 },
      p2 = { id: 22, x: look.x + look.width / 2, y: look.y + look.height / 2 };
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p1, p2] });
    const m1 = { ...p1, y: p1.y - 42 },
      m2 = { ...p2, x: p2.x + 55 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [m1, m2] });
    await page.waitForTimeout(500);
    const b = await snap();
    assert.ok(Math.hypot(b.run.x - a.run.x, b.run.z - a.run.z) > 0.5, 'native joystick moves');
    assert.ok(Math.abs(b.run.yaw - a.run.yaw) > 0.08, 'second pointer turns simultaneously');
    // Release the joystick contact while the second native contact stays active.
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [m1] });
    await page.waitForTimeout(120);
    const released = await snap();
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ ...m2, x: m2.x + 30 }],
    });
    await page.waitForTimeout(150);
    const still = await snap();
    assert.equal(
      await page.evaluate(
        () =>
          window.inputEvents.filter((e) => e.type === 'pointerup' && e.target === 'joystick')
            .length,
      ),
      1,
    );
    assert.equal(still.axes.forward, 0);
    assert.equal(still.run.x, released.run.x);
    assert.equal(still.run.z, released.run.z);
    assert.notEqual(still.run.yaw, released.run.yaw);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    assert.deepEqual((await snap()).axes, { forward: 0, right: 0 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p1] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [m1] });
    await page.waitForTimeout(120);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    const cancelled = await snap();
    await page.waitForTimeout(180);
    assert.equal((await snap()).run.x, cancelled.run.x);
    for (const button of await page.locator('.play-actions button, #pause').all()) {
      const box = await button.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44);
    }
    const stickBounds = await page.getByTestId('joystick').boundingBox();
    for (const button of await page.locator('.play-actions button').all()) {
      const box = await button.boundingBox();
      assert.ok(
        box.x >= stickBounds.x + stickBounds.width || box.y + box.height <= stickBounds.y,
        'touch buttons do not overlap the joystick',
      );
    }
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    const yaw = (await snap()).run.yaw;
    await page.getByRole('button', { name: '查看地图', exact: true }).tap();
    assert.equal((await snap()).run.yaw, yaw);
    const pausedTime = (await snap()).run.seconds;
    await page.waitForTimeout(200);
    assert.equal((await snap()).run.seconds, pausedTime);
    await page.getByRole('button', { name: '收起地图，继续探索' }).tap();
    await page.locator('#pause').tap();
    assert.equal(await page.locator('[role=dialog]').getByRole('button', { name: '切换全屏', exact: true }).count(), 0);
    await page.locator('#resume').tap();
    await page.getByRole('button', { name: '切换全屏', exact: true }).tap();
    assert.equal(await page.evaluate(() => !!document.fullscreenElement), true);
    await page.getByRole('button', { name: '切换全屏', exact: true }).tap();
    assert.equal(await page.evaluate(() => !!document.fullscreenElement), false);
    await page.screenshot({ path: `${out}/mobile-${viewport.width}x${viewport.height}.png` });
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal((await snap()).screen, 'pause');
    const beforeReload = (await snap()).run;
    await page.reload();
    await page.waitForFunction(() => window.mazeDebug);
    await page.locator('#continue').tap();
    assert.deepEqual((await snap()).run, beforeReload);
    results.push({
      viewport,
      passed: true,
      checks: [
        'native two-touch movement+look',
        'individual release',
        'pointercancel',
        'no button look leakage',
        '44px controls',
        'fog pause',
        'fullscreen enter/exit',
        'blur event',
        'saved pose reload',
      ],
      metrics: b.metrics,
    });
    await cdp.detach();
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await writeFile(
    `${out}/mobile-report.json`,
    JSON.stringify(
      {
        date: new Date().toISOString(),
        browser: browser.version(),
        environment: 'Chromium touch emulation, not physical phones',
        results,
        errors,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
console.log(`Mobile checks: ${results.length}; errors: ${errors.length}`);

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

// Real App, shared input, browser pointer capture and CDP touch. Isolating only
// the renderer keeps gesture ownership assertions independent of software WebGL.
const server = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)),
  server: { host: '127.0.0.1', port: 0, hmr: false },
});
await server.listen();
const appModule = await server.transformRequest('/src/main.tsx');
const reactUrl = appModule.code.match(/from ["']([^"']*deps\/react\.js[^"']*)["']/)[1];
const url = `http://127.0.0.1:${server.httpServer.address().port}/`;
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
    (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
  headless: true,
});
const output = new URL('../../../../.scratch/travel-bund-controls/', import.meta.url);
const results = [], errors = [];
await mkdir(output, { recursive: true });
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/src/Scene.tsx*', (route) => route.fulfill({
      contentType: 'text/javascript',
      body: `
        import React from '${reactUrl}';
        const {useEffect,useRef}=React;
        export function Tour({onReady,onRenderer,onTelemetry,onLifeTarget,zoom}) {
          const canvas=useRef(null);
          useEffect(()=>{
            onRenderer({domElement:canvas.current});
            onTelemetry({position:[-377,2,37],yaw:-2.9,speed:0,grounded:true,calls:0,triangles:0,fps:60});
            onLifeTarget({id:'test-visitor',kind:'visitor',name:'打招呼',position:[-377,0,37],screen:[20,35]});
            onReady();
          },[]);
          return React.createElement('canvas',{ref:canvas,'data-scene-zoom':zoom,style:{width:'100%',height:'100%'}});
        }`,
    }));
    await page.goto(url);
    await expect(page.locator('main')).toHaveAttribute('data-phase', 'intro');
    await expect(page.locator('main')).toHaveAttribute('data-quality', '0');
    await page.locator('#enter-world').tap();
    await expect(page.locator('main')).toHaveAttribute('data-phase', 'playing');
    const rotated = await page.locator('main').getAttribute('data-rotated') === 'true';
    const scenePoint = (x, y) => page.locator('main').evaluate((element, [x, y]) => {
      const rect = element.getBoundingClientRect();
      return element.dataset.rotated === 'true'
        ? { x: rect.right - rect.width * y, y: rect.top + rect.height * x }
        : { x: rect.left + rect.width * x, y: rect.top + rect.height * y };
    }, [x, y]);
    const move = (point, dx, dy = 0) => {
      point.x += rotated ? -dy : dx;
      point.y += rotated ? dx : dy;
    };
    await expect(page.getByRole('button', { name: '跳跃', exact: true })).toContainText('跳跃');
    await expect(page.getByRole('button', { name: '拍照', exact: true })).toContainText('拍照');
    await expect(page.getByRole('button', { name: '打开旅行手记' })).toContainText('手记');
    assert.equal(await page.locator('.run').count(), 0, 'Fast travel needs no speed switch');
    await page.getByRole('button', { name: '跳跃', exact: true }).tap();
    assert.equal(await page.evaluate(async () => (await import('/src/world.ts')).input.jump), true);
    const stick = page.getByRole('group', { name: '移动摇杆' });
    const box = await stick.boundingBox();
    await stick.evaluate((element) => element.addEventListener('pointerdown', (event) => {
      window.stickOwner ??= event.pointerId;
    }));
    await page.locator('.look-pad').evaluate((element) => element.addEventListener('pointerdown', (event) => {
      window.lookOwner = event.pointerId;
    }));
    const cdp = await context.newCDPSession(page);
    const dispatch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    const readInput = () => page.evaluate(async () => {
      const { input } = await import('/src/world.ts');
      return { stick: input.stick, look: input.look, active: input.active, keys: [...input.keys] };
    });
    const readZoom = async () => Number(await page.locator('main').getAttribute('data-zoom'));
    const zeroLook = () => page.evaluate(async () => { (await import('/src/world.ts')).input.look = [0, 0]; });
    const walking = { id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const looking = { id: 2, ...await scenePoint(0.55, 0.4) };
    await dispatch('touchStart', [walking]);
    await dispatch('touchStart', [walking, looking]);
    move(walking, 0, -30);
    move(looking, 35, 20);
    await dispatch('touchMove', [walking, looking]);
    assert((await readInput()).stick[1] < -0.5);
    assert((await readInput()).look[0] < -30, 'Dragging right moves the visible scene right');
    assert((await readInput()).look[1] < -15, 'Dragging down moves the visible scene down');
    assert.equal(await readZoom(), 1, 'A joystick finger and one look finger do not pinch');

    const extraStick = { id: 3, x: box.x + box.width / 2 - 15, y: box.y + box.height / 2 + 10 };
    await dispatch('touchStart', [walking, looking, extraStick]);
    await dispatch('touchEnd', [extraStick]);
    assert((await readInput()).stick[1] < -0.5, 'Releasing an extra finger preserves joystick movement');
    await zeroLook();
    const secondLook = { id: 4, ...await scenePoint(0.78, 0.4) };
    move(secondLook, 0, 20);
    await dispatch('touchStart', [walking, looking, secondLook]);
    move(looking, -15);
    move(secondLook, 20);
    await dispatch('touchMove', [walking, looking, secondLook]);
    await expect.poll(readZoom, { message: `${viewport.width}: spreading two scene fingers magnifies the view` }).toBeGreaterThan(1.15);
    const enlarged = await readZoom();
    assert((await readInput()).stick[1] < -0.5, 'Pinching preserves the independent joystick');
    assert.deepEqual((await readInput()).look, [0, 0], 'Pinching does not also rotate the camera');
    assert(Math.abs(Number(await page.locator('canvas').getAttribute('data-scene-zoom')) - enlarged) < 0.001,
      'The renderer receives the gesture zoom');
    const extraLook = { id: 14, ...await scenePoint(0.63, 0.65) };
    await dispatch('touchStart', [walking, looking, secondLook, extraLook]);
    move(extraLook, 20, -10);
    await dispatch('touchMove', [walking, looking, secondLook, extraLook]);
    assert.equal(await readZoom(), enlarged, 'A third scene finger cannot take over a pinch');
    assert.deepEqual((await readInput()).look, [0, 0]);
    await dispatch('touchEnd', [extraLook]);
    move(looking, 10);
    move(secondLook, -15);
    await dispatch('touchMove', [walking, looking, secondLook]);
    await expect.poll(readZoom, { message: 'Bringing two scene fingers together widens the view' }).toBeLessThan(enlarged);
    await dispatch('touchEnd', [secondLook]);
    const afterPinch = await readZoom();
    move(looking, 25);
    await dispatch('touchMove', [walking, looking]);
    assert.deepEqual((await readInput()).look, [0, 0], 'The finger left after a pinch cannot unexpectedly turn');
    assert.equal(await readZoom(), afterPinch, 'One remaining finger cannot continue pinching');
    await dispatch('touchCancel', []);
    assert.deepEqual((await readInput()).stick, [0, 0], 'Touch cancellation stops joystick movement');

    const freshLook = { id: 5, ...await scenePoint(0.55, 0.4) };
    await dispatch('touchStart', [freshLook]);
    move(freshLook, 20);
    await dispatch('touchMove', [freshLook]);
    assert((await readInput()).look[0] < -15, 'A fresh gesture can turn after pinch cancellation');
    await page.locator('.look-pad').evaluate((element) => element.releasePointerCapture(window.lookOwner));
    await zeroLook();
    move(freshLook, 15);
    await dispatch('touchMove', [freshLook]);
    assert.deepEqual((await readInput()).look, [0, 0], 'Losing look capture stops that gesture');
    await dispatch('touchCancel', []);

    // Lost capture must release the owner even while its physical finger stays down.
    const heldStick = { id: 6, x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await stick.evaluate((element) => element.addEventListener('pointerdown', (event) => {
      window.stickOwner = event.pointerId;
    }, { once: true }));
    await dispatch('touchStart', [heldStick]);
    move(heldStick, 0, -25);
    await dispatch('touchMove', [heldStick]);
    assert((await readInput()).stick[1] < -0.5);
    await stick.evaluate((element) => element.releasePointerCapture(window.stickOwner));
    move(heldStick, 0, 1);
    await dispatch('touchMove', [heldStick]);
    await expect.poll(async () => (await readInput()).stick).toEqual([0, 0]);
    await dispatch('touchCancel', []);

    const pauseLeft = { id: 7, ...await scenePoint(0.53, 0.4) };
    const pauseRight = { id: 8, ...await scenePoint(0.73, 0.4) };
    await dispatch('touchStart', [pauseLeft, pauseRight]);
    await page.getByRole('button', { name: '暂停', exact: true }).evaluate((element) => element.click());
    assert.deepEqual(await readInput(), { stick: [0, 0], look: [0, 0], active: false, keys: [] });
    move(pauseLeft, -10);
    move(pauseRight, 10);
    const pausedZoom = await readZoom();
    await dispatch('touchMove', [pauseLeft, pauseRight]);
    assert.equal(await readZoom(), pausedZoom, 'Touches held through pause cannot change zoom');
    await dispatch('touchCancel', []);
    assert.equal(await page.locator('select').count(), 0, 'Settings use the designed choice panel');
    const precision = page.getByRole('combobox', { name: '画面精度' });
    await precision.tap();
    await expect(precision).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(precision).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('dialog')).toBeVisible();
    await precision.tap();
    await page.getByRole('heading', { name: '游览设置' }).tap();
    await expect(precision).toHaveAttribute('aria-expanded', 'false');
    await precision.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('option', { name: '流畅', exact: true })).toBeFocused();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toHaveAttribute('data-quality', '2');
    await expect(precision).toHaveAttribute('aria-expanded', 'true');
    await page.locator('[role="option"][value="1"]').tap();
    await expect(page.locator('main')).toHaveAttribute('data-quality', '1');
    await page.locator('[role="option"][value="0"]').tap();
    await precision.tap();
    await page.getByRole('button', { name: '继续漫游', exact: true }).tap();
    assert((await readInput()).active);
    await zeroLook();
    const resumedLook = { id: 9, ...await scenePoint(0.55, 0.4) };
    await dispatch('touchStart', [resumedLook]);
    move(resumedLook, 20);
    await dispatch('touchMove', [resumedLook]);
    assert((await readInput()).look[0] < -15, 'Resume accepts a fresh single-finger gesture');
    await dispatch('touchCancel', []);

    // Interaction markers remain part of the scene for pinch gestures. A pinch
    // or its cancellation must never greet the visitor as though it were a tap.
    const marker = page.locator('.life-target');
    const markerBox = await marker.boundingBox();
    const markerCenter = { x: markerBox.x + markerBox.width / 2, y: markerBox.y + markerBox.height / 2 };
    await marker.evaluate((element) => {
      window.markerCanceled = 0;
      element.addEventListener('pointercancel', () => { window.markerCanceled += 1; });
    });
    const idleFrames = () => page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
    await zeroLook();
    const markerLeft = { id: 10, ...markerCenter };
    const markerRight = { id: 11, ...markerCenter };
    move(markerLeft, -15);
    move(markerRight, 15);
    const beforeMarkerPinch = await readZoom();
    await dispatch('touchStart', [markerLeft]);
    await dispatch('touchStart', [markerLeft, markerRight]);
    // Sustained movement crosses the browser's native pinch threshold. A short
    // move alone would miss pointer cancellation from touch-action: manipulation.
    for (let frame = 0; frame < 8; frame++) {
      move(markerLeft, -5);
      move(markerRight, 5);
      await dispatch('touchMove', [markerLeft, markerRight]);
      await idleFrames();
    }
    await expect.poll(readZoom, { message: 'Two fingers on one interaction marker can pinch' })
      .toBeGreaterThan(beforeMarkerPinch + 0.05);
    const spreadMarkerZoom = await readZoom();
    for (let frame = 0; frame < 8; frame++) {
      move(markerLeft, 2.5);
      move(markerRight, -2.5);
      await dispatch('touchMove', [markerLeft, markerRight]);
      await idleFrames();
    }
    await expect.poll(readZoom, { message: 'The same continuous marker gesture can contract after spreading' })
      .toBeLessThan(spreadMarkerZoom - 0.1);
    assert.equal(await page.evaluate(() => window.markerCanceled), 0,
      'The browser must not take over and cancel a pinch on an interaction marker');
    assert.deepEqual((await readInput()).look, [0, 0], 'Pinching on an interaction marker does not turn');
    await dispatch('touchEnd', [markerLeft, markerRight]);
    await idleFrames();
    await expect(page.locator('main')).toHaveAttribute('data-life-event', '');
    for (const markerFirst of [true, false]) {
      const markerTouch = { id: 12, ...markerCenter };
      const sceneTouch = { id: 13, ...markerCenter };
      move(sceneTouch, viewport.width > viewport.height ? viewport.width * 0.52 : viewport.height * 0.52);
      await dispatch('touchStart', [markerFirst ? markerTouch : sceneTouch]);
      await dispatch('touchStart', [markerTouch, sceneTouch]);
      const beforeMixedPinch = await readZoom();
      move(markerTouch, 18);
      move(sceneTouch, -18);
      await dispatch('touchMove', [markerTouch, sceneTouch]);
      await expect.poll(readZoom, { message: `Marker plus scene pinch works with marker ${markerFirst ? 'first' : 'second'}` })
        .toBeLessThan(beforeMixedPinch);
      assert.deepEqual((await readInput()).look, [0, 0]);
      await dispatch('touchEnd', [markerTouch, sceneTouch]);
      await idleFrames();
      await expect(page.locator('main')).toHaveAttribute('data-life-event', '');
    }
    results.push({ viewport, checks: [
      'clear jump/photo/journal labels and no speed switch',
      'right/down drag follows the visible scene',
      'joystick plus one look finger does not pinch',
      'pinch zoom in/out while joystick continues; camera does not rotate',
      'an extra third scene finger cannot take over or cancel the active pinch',
      'remaining pinch finger stays idle until a fresh gesture',
      'cancellation and lost capture release controls',
      'pause clears contacts; resume accepts fresh controls',
      'sustained same-marker spread/contract avoids native cancellation and tap interaction',
      'marker/scene pinch works in both orders without interaction',
      'accessible settings choice keyboard navigation',
    ] });
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(new URL('report.json', output), JSON.stringify({
    results, errors, scene: 'isolated renderer; real App, pointer capture and CDP touch',
  }, null, 2));
  console.log(JSON.stringify({ results, errors }, null, 2));
} finally {
  await browser.close();
  await server.close();
}

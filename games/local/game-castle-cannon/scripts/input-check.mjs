/* global window, HTMLCanvasElement */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { logicalPoint } from './screen-point.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const server = createServer(async (req, res) => {
  try {
    const p = new URL(req.url, 'http://local').pathname;
    res.setHeader(
      'Content-Type',
      p.endsWith('.js')
        ? 'text/javascript'
        : p.endsWith('.css')
          ? 'text/css'
          : p.endsWith('.wav')
            ? 'audio/wav'
            : 'text/html',
    );
    res.end(await readFile(path.join(root, 'dist', p === '/' ? 'index.html' : p)));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? '/usr/bin/chromium',
});
const records = [],
  errors = [];
try {
  for (const touch of [false, true]) {
    const context = await browser.newContext({
      viewport: touch ? { width: 390, height: 844 } : { width: 1120, height: 620 },
      hasTouch: touch,
      isMobile: touch,
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript(() => {
      window.castleInputs = [];
      for (const type of [
        'pointerdown',
        'pointermove',
        'pointerup',
        'pointercancel',
        'lostpointercapture',
      ])
        window.addEventListener(
          type,
          (e) => {
            if (e.target instanceof HTMLCanvasElement)
              window.castleInputs.push({ type, id: e.pointerId, kind: e.pointerType });
          },
          { capture: true },
        );
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/?dev=0`);
    const canvas = page.locator('#battle'),
      ui = page.locator('.castle-root');
    const click = async (id) =>
      touch
        ? page.locator(`[data-action="${id}"]`).tap()
        : page.locator(`[data-action="${id}"]`).click();
    const count = async () =>
      Number((await canvas.getAttribute('aria-label')).match(/发射 (\d+)/)[1]);
    const point = async (x, y) => {
      const { x: px, y: py } = await logicalPoint(canvas, x, y),
        b = await canvas.boundingBox();
      return (await ui.getAttribute('data-rotated')) === 'true'
        ? { x: b.x + (1 - py / 540) * b.width, y: b.y + (px / 960) * b.height }
        : { x: b.x + (px / 960) * b.width, y: b.y + (py / 540) * b.height };
    };
    const cdp = touch ? await context.newCDPSession(page) : null;
    const down = async (p) => {
      if (cdp)
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ ...p, id: 1 }],
        });
      else {
        await page.mouse.move(p.x, p.y);
        await page.mouse.down();
      }
    };
    const move = async (p) => {
      if (cdp)
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ ...p, id: 1 }],
        });
      else await page.mouse.move(p.x, p.y, { steps: 1 });
    };
    const up = async () =>
      cdp
        ? cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        : page.mouse.up();
    const ready = () =>
      expect(canvas).toHaveAttribute('aria-label', /；装填 0\.00；/, { timeout: 20000 });
    const shot = async (x, y) => {
      const [a, b] = await Promise.all([point(200, 350), point(x, y)]);
      if (cdp)
        await Promise.all([
          cdp.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [{ ...a, id: 1 }],
          }),
          cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ ...b, id: 1 }],
          }),
          cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
        ]);
      else {
        await down(a);
        await move(b);
        await up();
      }
    };
    const retry = async () => {
      await click('pause');
      await click('retry');
    };
    await click('settings');
    await click('quality');
    await click('home');
    await click('start');
    console.log('Input case started:', touch ? 'touch' : 'mouse');
    // Cache the real projected locations before the rapid pair. Re-reading layout between
    // shots on software WebGL can take the entire reload interval and is no longer rapid input.
    const quickStart = await point(200, 350),
      quickGate = await point(590, 280),
      quickTower = await point(680, 160);
    const fastCdp = cdp ?? (await context.newCDPSession(page));
    const queued = [];
    for (const p of [quickGate, quickTower]) {
      if (touch) {
        queued.push(
          fastCdp.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [{ ...quickStart, id: 1 }],
          }),
        );
        queued.push(
          fastCdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ ...p, id: 1 }],
          }),
        );
        queued.push(
          fastCdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
        );
      } else {
        queued.push(
          fastCdp.send('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            ...quickStart,
            button: 'left',
            buttons: 1,
            clickCount: 1,
          }),
        );
        queued.push(
          fastCdp.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            ...p,
            button: 'left',
            buttons: 1,
          }),
        );
        queued.push(
          fastCdp.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            ...p,
            button: 'left',
            buttons: 0,
            clickCount: 1,
          }),
        );
      }
    }
    await Promise.all(queued);
    assert.equal(await count(), 1);
    await expect(canvas).toHaveAttribute('aria-label', /正在装填/);
    await ready();
    await shot(680, 160);
    assert.equal(
      await count(),
      2,
      JSON.stringify({
        status: await canvas.getAttribute('aria-label'),
        targets: await canvas.getAttribute('data-targets'),
        recentInput: await page.evaluate(() => window.castleInputs.slice(-12)),
      }),
    );
    await retry();
    await down(await point(200, 350));
    await move(await point(590, 280));
    const b = await canvas.boundingBox();
    await move({ x: b.x + b.width + 3, y: b.y + b.height / 2 });
    await up();
    assert.equal(await count(), 1);
    await retry();
    await down(await point(200, 350));
    await move(await point(590, 280));
    const pointerId = await page.evaluate(
      () => window.castleInputs.findLast((e) => e.type === 'pointerdown').id,
    );
    await canvas.evaluate((c, id) => c.releasePointerCapture(id), pointerId);
    await page.waitForTimeout(60);
    await up();
    assert.equal(await count(), 0);
    await expect(canvas).toHaveAttribute('aria-label', /取消/);
    await shot(590, 280);
    assert.equal(await count(), 1);
    await retry();
    await down(await point(200, 350));
    await move(await point(590, 280));
    if (cdp) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      assert.equal(await count(), 0);
      await expect(canvas).toHaveAttribute('aria-label', /取消/);
    } else {
      await page.keyboard.press('Escape');
      await up();
      await click('resume');
      assert.equal(await count(), 0);
    }
    await shot(590, 280);
    assert.equal(await count(), 1);
    await retry();
    await down(await point(200, 350));
    await move(await point(590, 280));
    await page.setViewportSize(touch ? { width: 844, height: 390 } : { width: 620, height: 1120 });
    await up();
    assert.equal(await count(), 0);
    await shot(590, 280);
    assert.equal(await count(), 1);
    await click('pause');
    await page.waitForTimeout(300);
    await click('resume');
    await ready();
    await shot(680, 160);
    assert.equal(await count(), 2);
    const events = await page.evaluate(() => window.castleInputs);
    assert(events.some((e) => e.type === 'pointerup'));
    assert(events.some((e) => e.type === 'lostpointercapture'));
    if (touch) assert(events.some((e) => e.type === 'pointercancel'));
    records.push({
      touch,
      insideRelease: true,
      outsideRelease: true,
      reloadFeedback: true,
      continuousShots: true,
      captureLossCancels: true,
      cancelRecovery: true,
      rotation: true,
      pauseResume: true,
      nativeEvents: events.length,
    });
    console.log('Input case passed:', touch ? 'touch' : 'mouse');
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(root, 'docs/design/immersive/input-evidence.json'),
    JSON.stringify(
      {
        environment:
          'Chromium mouse and CDP touch, public power-saving graphics; no DOM event dispatch',
        records,
        errors,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify(records, null, 2));
} finally {
  await browser.close();
  server.close();
}

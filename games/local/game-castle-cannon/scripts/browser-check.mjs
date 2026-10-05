/* global document */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'docs/design');
const types = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.wav': 'audio/wav',
};
const server = createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname === '/fixture') {
      res.setHeader('Content-Type', 'text/html');
      res.end(
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}iframe{width:100vw;height:100vh;border:0}</style><iframe allow="fullscreen" src="/index.html?dev=0"></iframe>',
      );
      return;
    }
    let f = path.resolve(
      root,
      'dist',
      '.' + decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname),
    );
    assert(f.startsWith(path.join(root, 'dist') + path.sep));
    res.setHeader('Content-Type', types[path.extname(f)] ?? 'application/octet-stream');
    res.end(await readFile(f));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? '/usr/bin/chromium',
});
const records = [],
  errors = [];
async function play(name, viewport, touch = false, iframe = false) {
  console.log(`Begin ${name}`);
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(base + (iframe ? '/fixture' : '/index.html?dev=0'));
  const frame = iframe ? await page.locator('iframe').contentFrame() : page;
  const ui = frame.locator('.castle-root'),
    canvas = frame.locator('canvas');
  await expect(ui).toHaveAttribute('data-ready', 'true');
  const cdp = touch ? await context.newCDPSession(page) : null;
  let capturedAim = false;
  const click = async (id) => {
    const b = frame.locator(`[data-action="${id}"]`);
    if (touch) await b.tap();
    else await b.click();
  };
  const position = async (x, y) => {
    const b = await canvas.boundingBox();
    const rotated = (await ui.getAttribute('data-rotated')) === 'true';
    return rotated
      ? { x: b.x + (1 - y / 480) * b.width, y: b.y + (x / 960) * b.height }
      : { x: b.x + (x / 960) * b.width, y: b.y + (y / 480) * b.height };
  };
  const shot = async (x, y, cancel = false) => {
    const a = await position(200, 350),
      b = await position(x, y);
    if (cdp) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ ...a, id: 1 }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ ...b, id: 1 }],
      });
      if (!capturedAim && !cancel && x === 680 && y === 160) {
        await page.screenshot({ path: path.join(out, `${name}-aim.png`) });
        capturedAim = true;
      }
      await cdp.send('Input.dispatchTouchEvent', {
        type: cancel ? 'touchCancel' : 'touchEnd',
        touchPoints: [],
      });
    } else {
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 7 });
      if (!capturedAim && !cancel && x === 680 && y === 160) {
        await page.screenshot({ path: path.join(out, `${name}-aim.png`) });
        capturedAim = true;
      }
      if (cancel)
        await canvas.dispatchEvent('pointercancel', { pointerId: 1, clientX: b.x, clientY: b.y });
      await page.mouse.up();
    }
    await page.waitForTimeout(430);
  };
  if (process.env.SIEGE_LIFECYCLE_ONLY) {
    await click('start');
    const held = await position(200, 350),
      aimed = await position(590, 280);
    if (cdp) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ ...held, id: 1 }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ ...aimed, id: 1 }],
      });
    } else {
      await page.mouse.move(held.x, held.y);
      await page.mouse.down();
      await page.mouse.move(aimed.x, aimed.y);
    }
    await page.setViewportSize({ width: viewport.height, height: viewport.width });
    if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    else await page.mouse.up();
    await page.waitForTimeout(450);
    await expect(canvas).not.toHaveAttribute('aria-label', /城门破了/);
    await click('pause');
    await expect(ui).toHaveAttribute('data-screen', 'paused');
    await page.setViewportSize(viewport);
    await expect(ui).toHaveAttribute('data-screen', 'paused');
    await click('resume');
    await shot(590, 280);
    await expect(canvas).toHaveAttribute('aria-label', /城门破了/);
    await click('pause');
    await click('retry');
    await shot(590, 280);
    await expect(canvas).toHaveAttribute('aria-label', /城门破了/);
    records.push({
      name,
      touch,
      iframe,
      resizeCancelsDrag: true,
      rotationPreservesBattle: true,
      retry: true,
    });
    await context.close();
    return;
  }
  await page.screenshot({ path: path.join(out, `${name}-home.png`) });
  await click('levels');
  await expect(frame.locator('[data-action="level:1"]')).toBeDisabled();
  await page.screenshot({ path: path.join(out, `${name}-levels.png`) });
  await click('home');
  await click('settings');
  await click('sound');
  await click('motion');
  await click('home');
  await click('help');
  await click('back');
  if (!iframe && !touch) {
    await frame.locator('[data-game-fullscreen]').click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await frame.locator('[data-game-fullscreen]').click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  }
  await click('start');
  await shot(590, 280, true);
  await expect(canvas).not.toHaveAttribute('aria-label', /城门破了/);
  await shot(590, 280);
  await expect(canvas).toHaveAttribute('aria-label', /城门破了/);
  await page.screenshot({ path: path.join(out, `${name}-breach.png`) });
  // Gate-first: observe pressure during reload, then remove tower.
  await page.waitForTimeout(2500);
  await shot(680, 160);
  await expect(canvas).toHaveAttribute('aria-label', /箭塔倒下/);
  await page.screenshot({ path: path.join(out, `${name}-battle.png`) });
  await click('pause');
  console.log(`${name}: paused battle`);
  await expect(ui).toHaveAttribute('data-screen', 'paused');
  const before = await canvas.getAttribute('aria-label');
  await page.waitForTimeout(400);
  assert.equal(await canvas.getAttribute('aria-label'), before);
  await click('help');
  await click('back');
  await click('resume');
  await expect(ui).toHaveAttribute('data-screen', 'result', { timeout: 35000 });
  assert.match(await canvas.getAttribute('aria-label'), /城堡占领/);
  const gateLoss = Number((await canvas.getAttribute('aria-label')).match(/损失 (\d+)/)[1]);
  await page.screenshot({ path: path.join(out, `${name}-victory.png`) });
  if (!iframe) {
    await click('retry');
    await shot(680, 160);
    await page.waitForTimeout(2550);
    await shot(590, 280);
    await expect(ui).toHaveAttribute('data-screen', 'result', { timeout: 35000 });
    const towerLoss = Number((await canvas.getAttribute('aria-label')).match(/损失 (\d+)/)[1]);
    assert(gateLoss > towerLoss, `${name}: gate ${gateLoss}, tower ${towerLoss}`);
    await click('next');
    await click('blast');
    await shot(680, 175);
    await page.waitForTimeout(2500);
    await shot(680, 175);
    await page.waitForTimeout(2500);
    await click('solid');
    await shot(590, 280);
    await page.waitForTimeout(2500);
    await shot(590, 280);
    await page.waitForTimeout(2500);
    await shot(715, 326);
    await expect(ui).toHaveAttribute('data-screen', 'result', { timeout: 35000 });
    assert.match(await canvas.getAttribute('aria-label'), /城堡占领/);
    await click('next');
    await shot(660, 140);
    await page.waitForTimeout(2500);
    await shot(660, 140);
    await page.waitForTimeout(2500);
    await shot(590, 280);
    await page.waitForTimeout(2500);
    await shot(590, 280);
    await page.waitForTimeout(2500);
    await shot(748, 210);
    await page.waitForTimeout(2500);
    await shot(708, 326);
    await expect(ui).toHaveAttribute('data-screen', 'result', { timeout: 35000 });
    assert.match(await canvas.getAttribute('aria-label'), /城堡占领/);
    await page.screenshot({ path: path.join(out, `${name}-third-victory.png`) });
    await click('home');
    await page.reload();
    await expect(ui).toHaveAttribute('data-ready', 'true');
    await click('levels');
    await expect(frame.locator('[data-action="level:2"]')).toBeEnabled();
    await click('home');
    await click('wardrobe');
    await click('skin:1');
    await click('home');
    await click('levels');
    await click('level:0');
    // An unattended army is a reproducible loss; retry keeps input usable.
    await expect(ui).toHaveAttribute('data-screen', 'result', { timeout: 40000 });
    assert.match(await canvas.getAttribute('aria-label'), /全员撤离/);
    await page.screenshot({ path: path.join(out, `${name}-failure.png`) });
    await click('retry');
    await shot(590, 280);
    await expect(canvas).toHaveAttribute('aria-label', /城门破了/);
    await click('pause');
    await click('home');
    records.push({
      name,
      touch,
      viewport,
      gateFirstLosses: gateLoss,
      towerFirstLosses: towerLoss,
      threeCastles: true,
      storage: true,
      unattendedFailure: true,
    });
  } else records.push({ name, touch, viewport, iframe: true, firstCastle: true });
  // Resize keeps the same paused battle.
  if ((await ui.getAttribute('data-screen')) !== 'home') await click('home');
  await click('start');
  await click('pause');
  await page.setViewportSize({ width: viewport.height, height: viewport.width });
  await expect(ui).toHaveAttribute('data-screen', 'paused');
  await click('resume');
  await click('pause');
  await click('retry');
  await expect(ui).toHaveAttribute('data-screen', 'playing');
  const held = await position(200, 350),
    aimed = await position(590, 280);
  if (cdp) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...held, id: 1 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ ...aimed, id: 1 }],
    });
  } else {
    await page.mouse.move(held.x, held.y);
    await page.mouse.down();
    await page.mouse.move(aimed.x, aimed.y);
  }
  await page.setViewportSize(viewport);
  if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  else await page.mouse.up();
  await page.waitForTimeout(430);
  await expect(canvas).not.toHaveAttribute('aria-label', /城门破了/);
  records.at(-1).resizeCancelsDrag = true;
  await context.close();
}
try {
  await mkdir(out, { recursive: true });
  if (!process.env.SIEGE_TOUCH_ONLY) await play('desktop', { width: 1120, height: 620 });
  await play('touch-portrait', { width: 390, height: 844 }, true);
  await play('iframe', { width: 844, height: 390 }, true, true);
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(
      out,
      process.env.SIEGE_LIFECYCLE_ONLY ? 'lifecycle-evidence.json' : 'browser-evidence.json',
    ),
    JSON.stringify(
      {
        environment: 'Linux Chromium desktop / CDP simulated touch; not WeChat device',
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
  await new Promise((r) => server.close(r));
}

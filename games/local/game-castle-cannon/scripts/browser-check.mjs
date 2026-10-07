/* global document */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { logicalPoint } from './screen-point.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'docs/design/immersive');
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
    canvas = frame.locator('#battle');
  await expect(ui).toHaveAttribute('data-ready', 'true');
  const protocol = await context.newCDPSession(page),
    cdp = touch ? protocol : null;
  let capturedAim = false;
  const click = async (id) => {
    const b = frame.locator(`[data-action="${id}"]`);
    if (touch) {
      const rect = await b.evaluate((element) => {
        const r = element.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
      if (!rect) throw new Error(`Control unavailable: ${id}`);
      await Promise.all([
        cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, id: 1 }],
        }),
        cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
      ]);
    } else {
      const p = await b.evaluate((element) => {
        const r = element.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      await Promise.all([
        protocol.send('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          ...p,
          button: 'left',
          buttons: 1,
          clickCount: 1,
        }),
        protocol.send('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          ...p,
          button: 'left',
          buttons: 0,
          clickCount: 1,
        }),
      ]);
    }
  };
  // Software WebGL regression uses the same geometry/rules with the public power-saving option.
  if (!process.env.SIEGE_NORMAL_QUALITY) {
    await click('settings');
    await click('quality');
    await click('home');
  }
  const position = async (x, y) => {
    const p = await logicalPoint(canvas, x, y);
    x = p.x;
    y = p.y;
    const b = await canvas.boundingBox();
    const rotated = (await ui.getAttribute('data-rotated')) === 'true';
    return rotated
      ? { x: b.x + (1 - y / 540) * b.width, y: b.y + (x / 960) * b.height }
      : { x: b.x + (x / 960) * b.width, y: b.y + (y / 540) * b.height };
  };
  const ready = () =>
    expect(canvas).toHaveAttribute('aria-label', /；装填 0\.00；/, { timeout: 20000 });
  const shot = async (x, y, cancel = false) => {
    const [raw, box, rotation] = await Promise.all([
      canvas.getAttribute('data-targets'),
      canvas.evaluate((element) => {
        const r = element.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }),
      ui.getAttribute('data-rotated'),
    ]);
    const targets = raw ? JSON.parse(raw) : [];
    const endpoint = targets.find((p) => p.ruleX === x && p.ruleY === y) ?? { x: 270, y: 325 };
    const physical = (p) =>
      rotation === 'true'
        ? { x: box.x + (1 - p.y / 540) * box.width, y: box.y + (p.x / 960) * box.height }
        : { x: box.x + (p.x / 960) * box.width, y: box.y + (p.y / 540) * box.height };
    const a = physical({ x: 270, y: 325 }),
      b = physical(endpoint);
    if (cdp) {
      // One CDP connection preserves event wire order; avoid protocol round-trip delays
      // between phases of one normal gesture on the cloud software renderer.
      await Promise.all([
        cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ ...a, id: 1 }],
        }),
        cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...b, id: 1 }] }),
        cdp.send('Input.dispatchTouchEvent', {
          type: cancel ? 'touchCancel' : 'touchEnd',
          touchPoints: [],
        }),
      ]);
    } else {
      await Promise.all([
        protocol.send('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          ...a,
          button: 'left',
          buttons: 1,
          clickCount: 1,
        }),
        protocol.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          ...b,
          button: 'left',
          buttons: 1,
        }),
        ...(cancel
          ? []
          : [
              protocol.send('Input.dispatchMouseEvent', {
                type: 'mouseReleased',
                ...b,
                button: 'left',
                buttons: 0,
                clickCount: 1,
              }),
            ]),
      ]);
      if (!capturedAim && !cancel && x === 680 && y === 160) {
        // Capture the held aiming state in the artifact script; keep this timed battle uninterrupted.
        capturedAim = true;
      }
      if (cancel) await page.keyboard.press('Escape');
      if (cancel)
        await protocol.send('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          ...b,
          button: 'left',
          buttons: 0,
          clickCount: 1,
        });
      if (cancel) await click('resume');
    }
    await page.waitForTimeout(430);
    console.log(
      name,
      'shot',
      x,
      y,
      'cancel',
      cancel,
      await canvas.getAttribute('aria-label'),
      await canvas.getAttribute('data-targets'),
    );
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
    await expect
      .poll(
        async () =>
          JSON.parse(await canvas.getAttribute('data-targets')).find((m) => m.ruleX === 590).hp,
      )
      .toBe(0);
    await click('pause');
    await click('retry');
    await shot(590, 280);
    await expect
      .poll(
        async () =>
          JSON.parse(await canvas.getAttribute('data-targets')).find((m) => m.ruleX === 590).hp,
      )
      .toBe(0);
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
  assert.match(await canvas.getAttribute('data-renderer'), /three-webgl2/);
  await shot(590, 280, true);
  await expect(canvas).not.toHaveAttribute('aria-label', /城门破了/);
  // Restart through ordinary menus so cancellation time does not bias the order comparison.
  await click('pause');
  await click('home');
  await click('start');
  await shot(590, 280);
  await expect
    .poll(
      async () =>
        JSON.parse(await canvas.getAttribute('data-targets')).find((m) => m.ruleX === 590).hp,
    )
    .toBe(0);
  // Breach state is inspected separately without delaying this real-time attack sequence.
  // Gate-first: observe pressure during reload, then remove tower.
  await click('pause');
  await page.screenshot({ path: path.join(out, `${name}-battle.png`) });
  console.log(`${name}: paused battle`);
  await expect(ui).toHaveAttribute('data-screen', 'paused');
  const before = await canvas.getAttribute('aria-label');
  await page.waitForTimeout(400);
  assert.equal(await canvas.getAttribute('aria-label'), before);
  await click('help');
  await click('back');
  await click('resume');
  await ready();
  await shot(680, 160);
  await expect
    .poll(
      async () =>
        JSON.parse(await canvas.getAttribute('data-targets')).find((m) => m.ruleX === 680).hp,
    )
    .toBe(0);
  await expect(ui).toHaveAttribute('data-screen', 'result', { timeout: 35000 });
  assert.match(await canvas.getAttribute('aria-label'), /城堡占领/);
  const gateLoss = Number((await canvas.getAttribute('aria-label')).match(/损失 (\d+)/)[1]);
  await page.screenshot({ path: path.join(out, `${name}-victory.png`) });
  if (!iframe) {
    await click('retry');
    await shot(680, 160);
    await ready();
    await shot(590, 280);
    await expect(ui).toHaveAttribute('data-screen', 'result', { timeout: 35000 });
    const towerLoss = Number((await canvas.getAttribute('aria-label')).match(/损失 (\d+)/)[1]);
    assert(gateLoss > towerLoss, `${name}: gate ${gateLoss}, tower ${towerLoss}`);
    await click('next');
    await click('blast');
    await shot(680, 175);
    await ready();
    await shot(680, 175);
    await ready();
    await click('solid');
    await shot(590, 280);
    await ready();
    await shot(590, 280);
    await ready();
    await shot(715, 326);
    await expect(ui).toHaveAttribute('data-screen', 'result', { timeout: 35000 });
    assert.match(await canvas.getAttribute('aria-label'), /城堡占领/);
    await click('next');
    await shot(660, 140);
    await ready();
    await shot(660, 140);
    await ready();
    await shot(748, 210);
    await ready();
    await shot(590, 280);
    await ready();
    await shot(590, 280);
    await ready();
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
    await expect
      .poll(
        async () =>
          JSON.parse(await canvas.getAttribute('data-targets')).find((m) => m.ruleX === 590).hp,
      )
      .toBe(0);
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
  if (!process.env.SIEGE_DESKTOP_ONLY) {
    await play('touch-portrait', { width: 390, height: 844 }, true);
    await play('iframe', { width: 844, height: 390 }, true, true);
  }
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(
      out,
      process.env.SIEGE_LIFECYCLE_ONLY
        ? 'lifecycle-evidence.json'
        : process.env.SIEGE_NORMAL_QUALITY
          ? 'normal-browser-evidence.json'
          : 'browser-evidence.json',
    ),
    JSON.stringify(
      {
        environment: 'Linux Chromium desktop / CDP simulated touch; not WeChat device',
        renderer: process.env.SIEGE_NORMAL_QUALITY
          ? 'Real Three.js WebGL2 at default quality; unchanged rules'
          : 'Real Three.js WebGL2 with public power-saving setting; unchanged rules',
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

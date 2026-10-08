import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'docs/design/local-2026-10-07/actual');
await mkdir(out, { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const file = path.resolve(
      root,
      'dist',
      '.' + (req.url === '/' ? '/index.html' : req.url.split('?')[0]),
    );
    assert(file.startsWith(path.join(root, 'dist') + path.sep));
    const types = {
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.wav': 'audio/wav',
    };
    res.setHeader('Content-Type', types[path.extname(file)] ?? 'text/html');
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? '/usr/bin/chromium',
});
const records = [],
  errors = [];
try {
  for (const touch of [false, true]) {
    const context = await browser.newContext({
      viewport: touch ? { width: 390, height: 844 } : { width: 960, height: 540 },
      hasTouch: touch,
      isMobile: touch,
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html?dev=0&artView=cannon`);
    await expect(page.locator('.castle-root')).toHaveAttribute('data-ready', 'true');
    await page.locator('[data-action="start"]')[touch ? 'tap' : 'click']();
    const cdp = await context.newCDPSession(page);
    const sample = () =>
      page.locator('#battle').evaluate((c) => ({
        ...JSON.parse(c.dataset.renderer),
        targets: JSON.parse(c.dataset.targets),
        status: c.getAttribute('aria-label'),
      }));
    const rect = await page.locator('#battle').boundingBox();
    const physical = (x, y) =>
      touch
        ? { x: rect.x + (1 - y / 540) * rect.width, y: rect.y + (x / 960) * rect.height }
        : { x: rect.x + (x / 960) * rect.width, y: rect.y + (y / 540) * rect.height };
    const input = async (phase, x, y) => {
      const p = physical(x, y);
      if (touch)
        await cdp.send('Input.dispatchTouchEvent', {
          type: { down: 'touchStart', move: 'touchMove', up: 'touchEnd' }[phase],
          touchPoints: phase === 'up' ? [] : [{ ...p, id: 1 }],
        });
      else
        await cdp.send('Input.dispatchMouseEvent', {
          type: { down: 'mousePressed', move: 'mouseMoved', up: 'mouseReleased' }[phase],
          ...p,
          button: 'left',
          buttons: phase === 'up' ? 0 : 1,
          clickCount: phase === 'move' ? 0 : 1,
        });
    };
    const target = async (ruleX) => (await sample()).targets.find((t) => t.ruleX === ruleX);
    assert((await target(590)).x > 600, 'Explicit dev=0 must keep the production camera');
    const shoot = async (ruleX) => {
      const p = await target(ruleX);
      await input('down', 260, 350);
      await input('move', p.x, p.y);
      await input('up', p.x, p.y);
    };
    await shoot(590);
    await expect.poll(async () => (await target(590)).hp).toBe(0);
    await expect(page.locator('#battle')).toHaveAttribute('aria-label', /装填 0\.00/, {
      timeout: 5000,
    });
    await input('down', 430, 340);
    await expect.poll(async () => (await sample()).aim).not.toBeNull();
    const first = await sample(),
      latencies = [];
    for (const [x, y] of [
      [460, 340],
      [490, 340],
      [520, 340],
      [550, 340],
      [580, 340],
    ]) {
      const old = (await sample()).aim,
        start = performance.now();
      await input('move', x, y);
      await expect
        .poll(async () => JSON.stringify((await sample()).aim), {
          intervals: [10, 20, 30],
          timeout: 1500,
        })
        .not.toBe(JSON.stringify(old));
      latencies.push(performance.now() - start);
    }
    const last = await sample();
    assert.notDeepEqual(
      last.cannon,
      first.cannon,
      'The actual barrel must turn during the second drag',
    );
    await page.screenshot({ path: path.join(out, `${touch ? 'touch' : 'mouse'}-second-aim.png`) });
    const tower = await target(680);
    await input('move', tower.x, tower.y);
    await input('up', tower.x, tower.y);
    await expect
      .poll(async () => (await sample()).impact.flyingStone, { intervals: [10, 20, 30] })
      .toBeGreaterThan(0);
    await expect.poll(async () => (await target(680)).hp).toBe(0);
    const final = await sample();
    assert.match(final.status, /发射 2；/);
    latencies.sort((a, b) => a - b);
    records.push({
      touch,
      defaultQuality: !final.lowPower,
      freeAimMoves: latencies.length,
      aimResponseMaxMs: Math.round(latencies.at(-1)),
      firstAim: first.aim,
      lastAim: last.aim,
      firstCannon: first.cannon,
      lastCannon: last.cannon,
      secondShotDamagedTower: true,
      impactVisible: true,
      meanFrameIntervalMs: final.meanFrameIntervalMs,
    });
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(out, 'aim-evidence.json'),
    JSON.stringify(
      {
        environment:
          'Local desktop Chrome, native mouse/CDP touch, default quality, wall clock; no state edits or time mocks',
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

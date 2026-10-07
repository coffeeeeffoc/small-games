import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const gameRoot = path.join(root, 'games/local/retreat-rally');
const output = process.env.RALLY_VERIFICATION_DIR || path.join(gameRoot, 'docs/verification');
await mkdir(output, { recursive: true });
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.wav': 'audio/wav',
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const independent = url.pathname.startsWith('/independent/');
    const directory = independent
      ? path.join(gameRoot, 'dist')
      : path.join(root, 'apps/shell-web/dist');
    const pathname = independent ? url.pathname.slice('/independent'.length) : url.pathname;
    let file = path.resolve(directory, '.' + decodeURIComponent(pathname));
    assert(!path.relative(directory, file).startsWith('..'));
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    res
      .writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' })
      .end(await readFile(file));
  } catch {
    res.writeHead(404).end('Not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
    : {}),
});
const report = {
  browser: browser.version(),
  environment: 'Chromium desktop/mobile emulation, not physical devices',
  checks: [],
  errors: [],
};
const check = (name) => {
  report.checks.push(name);
  console.log('PASS', name);
};
const observe = (page) => {
  page.on('pageerror', (e) => report.errors.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400 && new URL(r.url()).origin === origin)
      report.errors.push(`${r.status()} ${r.url()}`);
  });
};
const snapshot = (page) => page.evaluate(() => window.RetreatRally.snapshot());
async function shot(page, name) {
  await page.screenshot({ path: path.join(output, name + '.png') });
}
async function toHome(page) {
  if ((await snapshot(page)).screen === 'battle') await page.locator('#pause').click();
  await page.locator('.screen:not([hidden]) [data-go="home"]').first().click();
}
const mobileOnly = process.argv.includes('--mobile-only');
try {
  if (!mobileOnly) {
    const desktop = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await desktop.newPage();
    observe(page);
    await page.goto(`${origin}/independent/`);
    await expect(page.locator('#start')).toBeVisible();
    await page.waitForFunction(() => document.querySelector('canvas').width > 0);
    await page.waitForTimeout(250);
    await shot(page, 'home-desktop');
    await page.click('#levels-open');
    await expect(page.locator('[data-level=pursuit]')).toBeDisabled();
    await shot(page, 'levels-desktop');
    await toHome(page);
    await page.click('#help-open');
    await expect(page.locator('#help')).toBeVisible();
    await toHome(page);
    check('Home, help, campaign map and initial unlocks');
    await page.click('#start');
    await page.keyboard.down('Space');
    await expect(page.locator('#retreat-blue')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.up('Space');
    await page.click('#pause');
    const pausedTime = (await snapshot(page)).battle.time;
    await page.waitForTimeout(200);
    assert.equal((await snapshot(page)).battle.time, pausedTime);
    await page.click('#resume');
    await page.keyboard.down('Space');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal((await snapshot(page)).battle.retreat.blue, false);
    await expect(page.locator('#paused')).toBeVisible();
    await page.click('#restart');
    check('Hold/release, pause/resume, blur release and restart');
    await page.clock.install({ time: new Date('2026-10-06T00:00:00Z') });
    await page.clock.pauseAt(new Date('2026-10-06T00:00:01Z'));
    async function playSmart() {
      let recovering = false,
        held = false;
      for (let i = 0; i < 1600; i++) {
        const { battle: s, screen } = await snapshot(page);
        if (screen === 'result') return s;
        const blue = s.units.filter((u) => u.side === 'blue' && u.hp > 0);
        const stamina = blue.reduce((n, u) => n + u.stamina, 0) / blue.length;
        if (stamina < 35) recovering = true;
        if (stamina > 93) recovering = false;
        const danger = ['warning', 'gap', 'impact'].includes(s.volley.phase);
        const inZone = s.volley.zones.some((z) =>
          blue.some((u) => u.x > z.x - 30 && u.x < z.x + z.width + 10),
        );
        const next = recovering || (danger && inZone);
        if (next !== held) {
          await page.keyboard[next ? 'down' : 'up']('Space');
          held = next;
        }
        if (i === 110) await shot(page, `battle-${s.level.id}`);
        await page.clock.runFor(100);
      }
      throw new Error('Campaign did not reach a result');
    }
    for (let level = 0; level < 3; level++) {
      const result = await playSmart();
      await page.keyboard.up('Space');
      assert.equal(result.status, 'won');
      assert(
        result.casualties <= 2,
        `Expected at least four survivors, got ${6 - result.casualties}`,
      );
      check(
        `Campaign ${result.level.id}: actual controls win with ${6 - result.casualties} survivors`,
      );
      await shot(page, `victory-${result.level.id}`);
      if (level < 2) await page.click('#next');
    }
    await toHome(page);
    await page.reload();
    await expect(page.locator('#start')).toBeVisible();
    assert.equal(Object.keys((await snapshot(page)).progress.medals).length, 3);
    check('Three campaign unlocks and medals survive reload');
    await page.click('#levels-open');
    await page.click('[data-level=pursuit]');
    await page.clock.runFor(40000);
    await expect(page.locator('#result')).toBeVisible();
    assert.equal((await snapshot(page)).battle.status, 'lost');
    await shot(page, 'defeat');
    await page.click('#retry');
    await expect(page.locator('#battle')).toBeVisible();
    await toHome(page);
    check('All-in failure, retry and home');
    await page.click('#random-open');
    await page.click('#prepare-start');
    await page.locator('#prepare [data-go=home]').click();
    await page.clock.runFor(3000);
    await expect(page.locator('#home')).toBeVisible();
    await page.click('#random-open');
    await page.click('#prepare-start');
    await page.clock.runFor(1900);
    await expect(page.locator('#battle')).toBeVisible();
    assert.equal((await snapshot(page)).battle.mode, 'random');
    check('Mock matchmaking starts and cancels without stale timer');
    await toHome(page);
    await desktop.close();
  }
  for (const viewport of [
    { width: 844, height: 390 },
    { width: 390, height: 844 },
    { width: 360, height: 800 },
  ]) {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
    const p = await context.newPage();
    observe(p);
    await p.goto(`${origin}/independent/`);
    await expect(p.locator('#start')).toBeVisible();
    await p.waitForTimeout(200);
    assert.equal(
      await p.locator('#game').getAttribute('data-rotated'),
      String(viewport.height > viewport.width),
    );
    await shot(p, `home-${viewport.width}x${viewport.height}`);
    await p.tap('#friend-open');
    await shot(p, `friends-${viewport.width}x${viewport.height}`);
    await p.tap('#prepare-start');
    const session = await context.newCDPSession(p);
    const b = await p.locator('#retreat-blue').boundingBox(),
      r = await p.locator('#retreat-red').boundingBox();
    const blue = { x: b.x + b.width / 2, y: b.y + b.height / 2, id: 1 },
      red = { x: r.x + r.width / 2, y: r.y + r.height / 2, id: 2 };
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [blue, red],
    });
    await expect(p.locator('#retreat-blue')).toHaveAttribute('aria-pressed', 'true');
    await expect(p.locator('#retreat-red')).toHaveAttribute('aria-pressed', 'true');
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [blue] });
    await expect(p.locator('#retreat-blue')).toHaveAttribute('aria-pressed', 'false');
    await expect(p.locator('#retreat-red')).toHaveAttribute('aria-pressed', 'true');
    await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect(p.locator('#retreat-red')).toHaveAttribute('aria-pressed', 'false');
    await p.tap('#pause');
    await p.tap('#resume');
    await toHome(p);
    await p.tap('#start');
    await p.waitForTimeout(5200);
    await shot(p, `battle-${viewport.width}x${viewport.height}`);
    const before = (await snapshot(p)).battle.time;
    await p.setViewportSize({ width: viewport.height, height: viewport.width });
    assert((await snapshot(p)).battle.time >= before);
    check(
      `${viewport.width}×${viewport.height}: rotated layout, two simultaneous touches, independent release/cancel, orientation persistence`,
    );
    await context.close();
  }
  const shellContext = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
  });
  const shell = await shellContext.newPage();
  observe(shell);
  await shell.goto(`${origin}/#/games/retreat-rally`);
  const frame = shell.frameLocator('iframe');
  await expect(frame.locator('#start')).toBeVisible();
  await frame.locator('#start').tap();
  await expect(shell.locator('[data-game-display-host]')).toHaveAttribute(
    'data-screen',
    'playing',
  );
  await expect(shell.getByRole('navigation', { name: '游戏导航' })).toBeHidden();
  await frame.locator('#pause').tap();
  await expect(shell.getByRole('navigation', { name: '游戏导航' })).toBeVisible();
  await frame.locator('#paused [data-go=home]').tap();
  await shot(shell, 'shell-home');
  await shell.getByRole('button', { name: '返回目录' }).click();
  await expect(shell.locator('iframe')).toHaveCount(0);
  check('Actual Shell production route, immersive battle, restored navigation and exit');
  await shellContext.close();
  assert.deepEqual(report.errors, []);
  report.passed = true;
} finally {
  await writeFile(
    path.join(output, mobileOnly ? 'mobile-report.json' : 'browser-report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

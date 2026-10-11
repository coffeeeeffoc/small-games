import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('../docs/qa/', import.meta.url));
const port = Number(process.env.ASHFALL_TEST_PORT || 4468);
const origin = 'http://127.0.0.1:' + port;
const report = {
  browser: '',
  checks: [],
  errors: [],
  screenshots: [],
  naturalRun: null,
  limitations: [
    'Desktop Chromium with emulated touch; no physical phone or native mini-game platform tested.',
    'Natural play uses a read-only snapshot to steer real multi-touch input; no life, enemy, damage or result state is edited.',
  ],
};
await mkdir(output, { recursive: true });
execFileSync(process.execPath, ['build.mjs'], { cwd: root, stdio: 'inherit' });
const server = spawn(process.execPath, ['server.mjs', '--dist'], {
  cwd: root,
  env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) },
  stdio: 'pipe',
});
let serverLog = '';
server.stdout.on('data', (chunk) => {
  serverLog += chunk;
});
server.stderr.on('data', (chunk) => {
  serverLog += chunk;
});
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
for (let attempt = 0; attempt < 100; attempt++) {
  try {
    if ((await fetch(origin)).ok) break;
  } catch {
    /* Wait for our server only. */
  }
  if (server.exitCode !== null || attempt === 99) throw new Error('Server failed: ' + serverLog);
  await delay(100);
}
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
  headless: true,
  args: ['--no-sandbox'],
});
let page;
const screenshot = async (name) => {
  await page.screenshot({ path: output + name + '.png' });
  report.screenshots.push(name + '.png');
};
const observe = (current) => {
  current.on('pageerror', (error) => report.errors.push(error.message));
  current.on('response', (response) => {
    if (response.url().startsWith(origin) && response.status() >= 400)
      report.errors.push(response.status() + ' ' + response.url());
  });
};
const point = async (selector) => {
  const box = await page.locator(selector).boundingBox();
  return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
};
try {
  report.browser = await browser.version();
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  page = await context.newPage();
  observe(page);
  await page.goto(origin + '/?dev=1');
  await expect(page.locator('#game')).toHaveAttribute('data-ready', 'true');
  await page.evaluate(() => window.SmallGamesDev.setPanelHidden(true));
  await screenshot('home-844x390');
  await page.getByRole('button', { name: '行动地图', exact: true }).tap();
  await expect(page.locator('.level-card:disabled')).toHaveCount(2);
  await screenshot('levels-844x390');
  await page.getByRole('button', { name: '返回主页', exact: true }).tap();
  await page.locator('#start-game').tap();
  await expect(page.locator('#game')).toHaveAttribute('data-screen', 'play');
  await screenshot('combat-844x390');
  const cdp = await context.newCDPSession(page);
  let activeTouches = false,
    activeKey = '';
  async function touch(actions) {
    const touchPoints = [];
    const ids = { fire: 1, left: 2, right: 3, jump: 4, dash: 5 };
    for (const action of actions) {
      const selector = action === 'left' || action === 'right' ? '#move-' + action : '#' + action;
      const xy = await point(selector);
      if (!xy) {
        const current = await page.evaluate(() => window.AshfallDebug.snapshot());
        assert.ok(
          ['upgrade', 'result'].includes(current.screen),
          selector + ' visible during combat',
        );
        return;
      }
      touchPoints.push({ ...xy, id: ids[action], radiusX: 7, radiusY: 7, force: 1 });
    }
    const key = [...actions].sort().join(',');
    if (activeTouches && key !== activeKey) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      activeTouches = false;
    }
    if (touchPoints.length)
      await cdp.send('Input.dispatchTouchEvent', {
        type: activeTouches ? 'touchMove' : 'touchStart',
        touchPoints,
      });
    activeTouches = Boolean(touchPoints.length);
    activeKey = key;
  }
  await touch(['right', 'fire', 'jump']);
  await page.waitForTimeout(180);
  let state = await page.evaluate(() => window.AshfallDebug.snapshot());
  assert.ok(state.player.x > 420 && state.player.y < 570, 'multi-touch moves, jumps and shoots');
  assert.ok(
    state.bullets.some((b) => b.owner === 'player'),
    'fire works while moving and jumping',
  );
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  activeTouches = false;
  await expect(page.locator('#move-right')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#fire')).toHaveAttribute('aria-pressed', 'false');
  report.checks.push('simultaneous touch movement/jump/fire and gesture cancellation');
  await page.getByRole('button', { name: '暂停', exact: true }).tap();
  const beforePause = await page.evaluate(() => window.AshfallDebug.snapshot());
  await screenshot('pause-844x390');
  await page.waitForTimeout(400);
  const afterPause = await page.evaluate(() => window.AshfallDebug.snapshot());
  assert.equal(beforePause.time, afterPause.time);
  assert.equal(beforePause.player.hp, afterPause.player.hp);
  report.checks.push('pause freezes simulation, clock and damage');
  await page.getByRole('button', { name: '重新行动', exact: true }).tap();
  let upgradeScreenshot = false,
    bossScreenshot = false,
    ticks = 0,
    lastJumpAt = -10;
  const wallStart = Date.now();
  while (Date.now() - wallStart < 150000) {
    state = await page.evaluate(() => window.AshfallDebug.snapshot());
    if (state.screen === 'result') break;
    if (state.screen === 'upgrade') {
      await touch([]);
      await expect(page.locator('#game')).toHaveAttribute('data-screen', 'upgrade');
      if (!upgradeScreenshot) {
        await screenshot('upgrade-844x390');
        upgradeScreenshot = true;
      }
      const id = state.choices.includes('scatter')
        ? 'scatter'
        : state.choices.includes('pierce')
          ? 'pierce'
          : state.choices[0];
      await page.locator('[data-upgrade="' + id + '"]').tap();
      continue;
    }
    assert.equal(state.screen, 'play', 'natural play stays active');
    const p = state.player;
    const enemy = state.enemies
      .filter((e) => e.hp > 0)
      .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
    const boss = state.enemies.find((e) => e.type === 'boss');
    if (boss && !bossScreenshot && Math.abs(boss.x - p.x) < 700) {
      await screenshot('boss-844x390');
      bossScreenshot = true;
    }
    const dx = enemy ? enemy.x - p.x : 0;
    const direction = Math.sign(dx) || p.facing;
    const actions = ['fire'];
    if (Math.abs(dx) > 350 || p.facing !== direction)
      actions.push(direction > 0 ? 'right' : 'left');
    const incomingCharge =
      boss?.state === 'telegraph' && boss.attack?.kind === 'charge' && boss.attack.remaining < 0.4;
    if ((state.time - lastJumpAt > 1.15 || incomingCharge) && p.onGround) {
      actions.push('jump');
      lastJumpAt = state.time;
    }
    if (boss?.state === 'charge' && Math.abs(boss.x - p.x) < 180 && p.dashCooldown <= 0)
      actions.push('dash');
    await touch(actions);
    await page.waitForTimeout(110);
    if (++ticks % 75 === 0)
      console.log(
        'Natural touch: room=' +
          (state.levelIndex + 1) +
          ' time=' +
          state.time.toFixed(1) +
          ' hp=' +
          state.player.hp,
      );
  }
  await touch([]);
  state = await page.evaluate(() => window.AshfallDebug.snapshot());
  assert.equal(
    state.phase,
    'won',
    'real multi-touch run reaches victory: ' +
      JSON.stringify({
        phase: state.phase,
        room: state.levelIndex,
        hp: state.player.hp,
        time: state.time,
      }),
  );
  assert.equal(state.trial, false, 'read-only steering did not enable trial rewards');
  assert.equal(state.roomsCleared.length, 3);
  await screenshot('victory-844x390');
  report.naturalRun = {
    seconds: state.time,
    health: state.player.hp,
    upgrades: state.upgrades,
    roomsCleared: state.roomsCleared,
    trial: state.trial,
  };
  report.checks.push('natural touch victory across all rooms, upgrade choices and Boss');
  await page.getByRole('button', { name: '行动地图', exact: true }).tap();
  await expect(page.locator('.level-card:disabled')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#game')).toHaveAttribute('data-ready', 'true');
  assert.equal(
    (await page.evaluate(() => window.AshfallDebug.snapshot())).progress.completed.length,
    3,
  );
  report.checks.push('normal unlocks and best run survive reload');
  await page.evaluate(() => window.SmallGamesDev.setPanelHidden(true));
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#game')).toHaveAttribute('data-rotated', 'true');
  await screenshot('home-390x844');
  await page.locator('#start-game').tap();
  await touch(['right', 'fire']);
  await page.waitForTimeout(200);
  await touch([]);
  state = await page.evaluate(() => window.AshfallDebug.snapshot());
  assert.ok(state.player.x > 420);
  await screenshot('combat-390x844');
  await page.getByRole('button', { name: '暂停', exact: true }).tap();
  await screenshot('pause-390x844');
  await page.getByRole('button', { name: '返回主页', exact: true }).tap();
  await page.getByRole('button', { name: '行动地图', exact: true }).tap();
  await screenshot('levels-390x844');
  report.checks.push('portrait rotation fallback preserves touch direction and screen flow');
  await page.getByRole('button', { name: '返回主页', exact: true }).tap();
  await page.setViewportSize({ width: 568, height: 320 });
  await screenshot('home-568x320');
  await page.locator('#start-game').tap();
  for (const selector of [
    '#move-left',
    '#move-right',
    '#jump',
    '#dash',
    '#fire',
    '#pause-button',
  ]) {
    const box = await page.locator(selector).boundingBox();
    assert.ok(
      box.width >= 44 &&
        box.height >= 44 &&
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= 568.5 &&
        box.y + box.height <= 320.5,
      'small-screen touch target ' + selector,
    );
  }
  await screenshot('combat-568x320');
  await touch(['right', 'fire']);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#game')).toHaveAttribute('data-screen', 'pause');
  await expect(page.locator('#fire')).toHaveAttribute('aria-pressed', 'false');
  await touch([]);
  report.checks.push('568x320 safe targets; blur releases touches and pauses');
  await page.getByRole('button', { name: '返回主页', exact: true }).tap();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.getByRole('button', { name: '全屏', exact: true }).tap();
  await page.waitForTimeout(150);
  const fullscreenEntered = await page.evaluate(() => Boolean(document.fullscreenElement));
  if (fullscreenEntered) {
    await page.getByRole('button', { name: '退出全屏', exact: true }).tap();
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => Boolean(document.fullscreenElement)), false);
    report.checks.push('fullscreen enters and exits without losing progress');
  } else report.checks.push('fullscreen rejected gracefully; game remained playable');
  await page.locator('#start-game').tap();
  // Remain stationary in range: defeat is produced by ordinary enemy attacks.
  await touch(['right']);
  await page.waitForTimeout(900);
  await touch([]);
  await page.waitForFunction(() => window.AshfallDebug.snapshot().phase === 'lost', null, {
    timeout: 75000,
  });
  await screenshot('defeat-844x390');
  await page.getByRole('button', { name: '再战一次', exact: true }).tap();
  state = await page.evaluate(() => window.AshfallDebug.snapshot());
  assert.equal(state.player.hp, 120);
  assert.deepEqual(state.upgrades, []);
  assert.equal(state.levelIndex, 0);
  report.checks.push('natural defeat and clean retry');
  await context.close();

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await desktop.newPage();
  observe(page);
  await page.goto(origin);
  await expect(page.locator('#game')).toHaveAttribute('data-ready', 'true');
  assert.equal(await page.evaluate(() => window.SmallGamesDev.isEnabled()), false);
  assert.equal(await page.evaluate(() => Boolean(window.AshfallDebug)), false);
  await screenshot('home-desktop');
  await page.locator('#start-game').click();
  await page.keyboard.down('d');
  await expect(page.locator('#move-right')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await page.keyboard.down('j');
  await page.waitForTimeout(200);
  await page.keyboard.up('d');
  await page.keyboard.up('j');
  await page.mouse.move(1000, 550);
  await page.mouse.down();
  await page.waitForTimeout(160);
  await page.mouse.up();
  await screenshot('combat-desktop');
  await page.keyboard.down('Escape');
  await expect(page.getByRole('button', { name: '继续战斗', exact: true })).toBeVisible();
  await page.keyboard.down('Escape');
  await expect(page.locator('#game')).toHaveAttribute('data-screen', 'pause');
  await page.keyboard.up('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('#game')).toHaveAttribute('data-screen', 'play');
  report.checks.push(
    'default production has no developer UI; desktop keyboard, mouse and Escape work',
  );
  await desktop.close();
  const blocked = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
  });
  await blocked.addInitScript(() => {
    Storage.prototype.getItem = function () {
      throw new DOMException('blocked', 'SecurityError');
    };
    Storage.prototype.setItem = function () {
      throw new DOMException('blocked', 'SecurityError');
    };
  });
  page = await blocked.newPage();
  observe(page);
  await page.goto(origin + '/?dev=0');
  await expect(page.locator('#game')).toHaveAttribute('data-ready', 'true');
  await page.locator('#start-game').tap();
  await expect(page.locator('#game')).toHaveAttribute('data-screen', 'play');
  report.checks.push('storage-blocked startup remains playable');
  await blocked.close();
  assert.deepEqual(report.errors, []);
  report.passed = true;
  console.log(
    JSON.stringify({ passed: true, checks: report.checks, naturalRun: report.naturalRun }, null, 2),
  );
} catch (error) {
  report.passed = false;
  report.failure = error.stack;
  if (page && !page.isClosed()) {
    await screenshot('failure').catch(() => {});
    report.failureState = await page
      .evaluate(() => window.AshfallDebug?.snapshot())
      .catch(() => null);
  }
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile(output + 'browser-report.json', JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  server.kill('SIGTERM');
}

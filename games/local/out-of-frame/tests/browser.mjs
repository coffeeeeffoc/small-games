import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { STORAGE_KEY } from '../progress.mjs';
import { LEVELS } from '../levels.mjs';
import { SOLUTIONS } from './solutions.mjs';

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(gameRoot, '../../../.scratch/out-of-frame');
const base = process.env.GAME_URL || 'http://127.0.0.1:4417/';
const report = { results: [], errors: [] };
let server;
let browser;

async function snapshot(page) {
  return page.evaluate(() => window.__outOfFrameSnapshot());
}
async function advance(page, milliseconds = 50) {
  await page.clock.runFor(milliseconds);
}
async function until(page, predicate, description, limit = 12000) {
  for (let elapsed = 0; elapsed <= limit; elapsed += 50) {
    const current = await snapshot(page);
    if (predicate(current.state, current)) return current.state;
    assert.notEqual(current.state.status, 'lost', `${description}: player fell`);
    await advance(page);
  }
  throw new Error(`${description}: timed out; ${JSON.stringify((await snapshot(page)).state)}`);
}
async function shot(page, name) {
  await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true });
}
async function click(page, selector, touch) {
  if (touch) await page.locator(selector).tap();
  else await page.locator(selector).click();
  await advance(page, 20);
}
async function coordinates(page, x, y) {
  const bounds = await page.locator('#board').boundingBox();
  return { x: bounds.x + (x / 960) * bounds.width, y: bounds.y + (y / 540) * bounds.height };
}
async function touchController(page) {
  const cdp = await page.context().newCDPSession(page);
  const points = new Map();
  const send = (type) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...points.values()] });
  return {
    async down(id, point) {
      points.set(id, { id, x: point.x, y: point.y, radiusX: 2, radiusY: 2, force: 1 });
      await send('touchStart');
    },
    async move(id, point) {
      points.set(id, { ...points.get(id), x: point.x, y: point.y });
      await send('touchMove');
    },
    async up(id) {
      points.delete(id);
      await send(points.size ? 'touchMove' : 'touchEnd');
    },
    async cancel() {
      points.clear();
      await send('touchCancel');
    },
    async button(id, selector) {
      const bounds = await page.locator(selector).boundingBox();
      await this.down(id, { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
    },
  };
}
async function placeFrame(page, x, y, touch) {
  await page.locator('#board').scrollIntoViewIfNeeded();
  const { frame } = (await snapshot(page)).state;
  const from = await coordinates(page, frame.x + frame.w / 2, frame.y + frame.h / 2);
  const to = await coordinates(page, x + frame.w / 2, y + frame.h / 2);
  if (touch) {
    await touch.down(9, from);
    await touch.move(9, to);
    await touch.up(9);
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 5 });
    await page.mouse.up();
  }
  await advance(page, 20);
}
async function open(context, label) {
  const page = await context.newPage();
  page.on('pageerror', (error) => report.errors.push(`${label}: ${error.message}`));
  page.on('response', (response) => {
    if (response.url().startsWith(base) && response.status() >= 400)
      report.errors.push(`${label}: ${response.status()} ${response.url()}`);
  });
  await page.clock.install({ time: new Date('2026-10-03T08:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-03T08:00:01Z'));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.__outOfFrameSnapshot === 'function');
  await advance(page);
  return page;
}
async function noOverflow(page) {
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'page has no horizontal overflow',
  );
  const bounds = await page.locator('#board').boundingBox();
  assert.ok(Math.abs(bounds.width / bounds.height - 16 / 9) < 0.015, 'world retains 16:9 geometry');
}

async function desktopSolutions(page) {
  // Replay the engine's reference routes through real DOM input. Never mutate state.
  for (const [index, actions] of SOLUTIONS.entries()) {
    await click(page, `#level-nav button[data-level="${index}"]`);
    await page.locator('#board').scrollIntoViewIfNeeded();
    for (const action of actions) {
      if (process.env.QA_TRACE) console.log(index + 1, action, (await snapshot(page)).state.player);
      if (action.kind === 'frame') await placeFrame(page, action.x, action.y);
      else if (action.kind === 'wait') await advance(page, (action.frames * 1000) / 60);
      else if (action.kind === 'watch')
        await until(
          page,
          (state) => {
            const value = state.objects.find((object) => object.id === action.object)[action.axis];
            return action.atLeast !== undefined ? value >= action.atLeast : value <= action.atMost;
          },
          `room ${index + 1}: observe ${action.object}`,
        );
      else if (action.kind === 'walk') {
        await page.keyboard.down('ArrowRight');
        await until(
          page,
          (state) => state.player.x >= action.x || state.status === 'won',
          `room ${index + 1}: walk to ${action.x}`,
        );
        await page.keyboard.up('ArrowRight');
      } else if (action.kind === 'jump') {
        await page.keyboard.down('ArrowRight');
        await page.keyboard.down('Space');
        await advance(page, 50);
        await page.keyboard.up('Space');
        await advance(page, (action.frames * 1000) / 60 - 50);
        await page.keyboard.up('ArrowRight');
        await until(
          page,
          (state) => state.player.grounded || state.status === 'won',
          `room ${index + 1}: land jump`,
          1500,
        );
      } else if (action.kind === 'ride') {
        for (let step = 0; step < 200; step++) {
          const state = (await snapshot(page)).state;
          assert.equal(state.status, 'playing', `room ${index + 1}: riding safely`);
          const actor = state.objects.find((object) => object.id === action.object);
          if (actor.x >= action.untilX) break;
          await placeFrame(page, Math.max(action.minX ?? 0, actor.x + action.offsetX), action.y);
          await advance(page, 100);
          if (step === 199) throw new Error(`room ${index + 1}: ferry timed out`);
        }
      }
    }
    assert.equal((await snapshot(page)).state.status, 'won', `room ${index + 1} completed`);
    await shot(page, `desktop-room-${index + 1}-complete`);
    report.results.push({ device: 'desktop', room: index + 1, won: true });
    console.log(`desktop room ${index + 1} completed`);
  }
}

async function mobileChecks(width, height) {
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const page = await open(context, `touch-${width}`);
  const touch = await touchController(page);
  await shot(page, `mobile-${width}-intro`);
  await noOverflow(page);
  await click(page, '#start-button', true);
  await until(page, (state) => state.objects[0].x + 21 >= 375, 'touch keeper reaches switch');
  await placeFrame(page, 620, 0, touch);
  let state = (await snapshot(page)).state;
  assert.equal(state.objects[0].active, false, 'touch drag freezes marked object');
  assert.equal(state.switches[0].pressed, true, 'frozen robot holds switch');
  const frozenX = state.objects[0].x;
  await touch.button(1, '#move-right');
  await until(page, (value) => value.player.x >= 270, 'touch walk to robot');
  await touch.button(2, '#jump');
  await advance(page, 120);
  state = (await snapshot(page)).state;
  assert.ok(
    state.player.x > 285 && state.player.y < 410,
    'simultaneous real touches move and jump',
  );
  await touch.up(2);
  await until(page, (value) => value.status === 'won', 'touch complete first room', 4000);
  await touch.up(1);
  state = (await snapshot(page)).state;
  assert.equal(
    state.objects[0].x,
    frozenX,
    'excluded robot stays exactly frozen throughout traversal',
  );
  await shot(page, `mobile-${width}-room1-complete`);
  assert.match(
    await page.locator('#progress-label').textContent(),
    new RegExp(`完成 1 / ${LEVELS.length}`),
  );
  await click(page, '#next-level', true);
  assert.equal((await snapshot(page)).levelIndex, 1);
  await touch.button(1, '#move-right');
  await until(page, (value) => value.status === 'lost', 'fall into second room gap', 5000);
  await touch.up(1);
  await click(page, '#result-undo', true);
  assert.equal((await snapshot(page)).state.status, 'playing', 'defeat can be undone');
  await touch.button(1, '#move-right');
  await until(page, (value) => value.status === 'lost', 'retry falling after undo', 5000);
  await touch.up(1);
  await click(page, '#result-retry', true);
  assert.ok((await snapshot(page)).state.time < 0.15, 'defeat retry resets room');
  await click(page, '#level-nav button[data-level="0"]', true);
  await page.locator('#board').scrollIntoViewIfNeeded();
  await advance(page, 1300);
  const beforeUndo = (await snapshot(page)).state.time;
  await click(page, '#undo', true);
  assert.ok(
    (await snapshot(page)).state.time < beforeUndo - 0.8,
    'undo restores roughly one second',
  );
  await click(page, '#restart', true);
  assert.ok((await snapshot(page)).state.time < 0.15, 'restart resets simulation');
  await page.locator('#board').scrollIntoViewIfNeeded();
  await advance(page, 50);
  await page.locator('#jump').tap();
  await advance(page, 100);
  assert.ok((await snapshot(page)).state.player.y < 410, 'quick touch tap queues a jump');
  await until(page, (value) => value.player.grounded, 'land quick tap');
  await touch.button(1, '#move-right');
  await advance(page, 250);
  await touch.cancel();
  const cancelX = (await snapshot(page)).state.player.x;
  await advance(page, 250);
  assert.equal(
    (await snapshot(page)).state.player.x,
    cancelX,
    'touch cancellation clears held movement',
  );
  const frame = (await snapshot(page)).state.frame;
  const from = await coordinates(page, frame.x + 100, frame.y + 100);
  await touch.down(9, from);
  await touch.move(9, { x: from.x + 20, y: from.y - 20 });
  await touch.cancel();
  assert.equal(
    await page.locator('#board').evaluate((node) => node.classList.contains('dragging')),
    false,
    'cancel releases frame drag',
  );
  await click(page, '#pause', true);
  const paused = (await snapshot(page)).state.time;
  await advance(page, 400);
  assert.equal((await snapshot(page)).state.time, paused, 'pause freezes simulation');
  await shot(page, `mobile-${width}-pause`);
  await click(page, '#resume', true);
  await click(page, '#help', true);
  assert.equal((await snapshot(page)).paused, true, 'instructions pause play');
  await click(page, '#close-help', true);
  await touch.button(1, '#move-right');
  await advance(page, 150);
  // Headless Chromium does not reliably emit native blur when switching pages.
  // Test the registered lifecycle handler explicitly, without changing game state.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await touch.cancel();
  assert.equal((await snapshot(page)).paused, true, 'focus loss opens pause');
  const blurX = (await snapshot(page)).state.player.x;
  await click(page, '#resume', true);
  await advance(page, 250);
  assert.equal((await snapshot(page)).state.player.x, blurX, 'focus loss clears held touch');
  await page.reload({ waitUntil: 'networkidle' });
  await advance(page, 50);
  assert.match(
    await page.locator('#progress-label').textContent(),
    new RegExp(`完成 1 / ${LEVELS.length}`),
    'completion persists after reload',
  );
  assert.ok(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).completed['first-still'] > 0,
      STORAGE_KEY,
    ),
  );
  await noOverflow(page);
  await shot(page, `mobile-${width}-layout`);
  await page.setViewportSize({ width: height, height: width });
  await advance(page, 50);
  await noOverflow(page);
  await shot(page, `mobile-${width}-landscape`);
  report.results.push({
    device: `touch-${width}x${height}`,
    room: 1,
    multitouch: true,
    cancellation: true,
    pause: true,
    undo: true,
    persistence: true,
    lifecycleEvent: 'synthetic-window-blur',
    overflow: false,
  });
  await context.close();
}

try {
  await mkdir(output, { recursive: true });
  if (!process.env.GAME_URL) {
    server = spawn(process.execPath, ['server.mjs', '--host', '127.0.0.1', '--port', '4417'], {
      cwd: gameRoot,
      stdio: 'pipe',
    });
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        if ((await fetch(base)).ok) break;
      } catch {
        /* Wait for local server. */
      }
      if (attempt === 49) throw new Error('preview server failed to start');
      await delay(100);
    }
  }
  const executablePath =
    process.env.BROWSER_EXECUTABLE ||
    (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  report.browser = await browser.version();
  if (process.env.BROWSER_SCENARIO !== 'mobile') {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await open(desktop, 'desktop');
    await shot(page, 'desktop-intro');
    await click(page, '#start-button');
    await noOverflow(page);
    await desktopSolutions(page);
    await page.reload({ waitUntil: 'networkidle' });
    assert.match(
      await page.locator('#progress-label').textContent(),
      new RegExp(`完成 ${LEVELS.length} / ${LEVELS.length}`),
    );
    await desktop.close();
  }
  if (process.env.BROWSER_SCENARIO !== 'desktop') {
    await mobileChecks(390, 844);
    await mobileChecks(360, 640);
  }
  assert.deepEqual(report.errors, [], 'no browser or network errors');
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.failure = String(error);
  if (browser)
    for (const context of browser.contexts())
      for (const page of context.pages()) await shot(page, `failure-${Date.now()}`).catch(() => {});
  throw error;
} finally {
  await writeFile(resolve(output, 'browser-report.json'), JSON.stringify(report, null, 2));
  await browser?.close();
  server?.kill();
}

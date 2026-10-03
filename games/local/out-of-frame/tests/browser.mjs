import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { STORAGE_KEY } from '../progress.mjs';
import { CHAPTERS, LEVELS } from '../levels.mjs';
import { SOLUTIONS } from './solutions.mjs';

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(gameRoot, '../../../.scratch/out-of-frame');
const base = process.env.GAME_URL || 'http://127.0.0.1:4417/';
const firstDesktopRoom = Number(process.env.BROWSER_FROM || 1);
const lastDesktopRoom = Number(process.env.BROWSER_TO || LEVELS.length);
assert.ok(
  Number.isInteger(firstDesktopRoom) &&
    Number.isInteger(lastDesktopRoom) &&
    firstDesktopRoom >= 1 &&
    firstDesktopRoom <= lastDesktopRoom &&
    lastDesktopRoom <= LEVELS.length,
  'desktop room range is valid',
);
const report = { baseURL: base, results: [], errors: [] };
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
async function shot(page, name, fullPage = true) {
  await page.screenshot({
    path: resolve(output, `${name}.png`),
    fullPage,
  });
}
async function click(page, selector, touch) {
  if (touch) await page.locator(selector).tap();
  else await page.locator(selector).click();
  await advance(page, 20);
}
async function selectLevel(page, index, touch) {
  const chapter = LEVELS[index].chapterNumber - 1;
  assert.ok(chapter >= 0, `room ${index + 1} belongs to a chapter`);
  await page.locator('#chapter-select').selectOption(String(chapter));
  await click(page, `#level-nav button[data-level="${index}"]`, touch);
  assert.equal((await snapshot(page)).levelIndex, index, `room ${index + 1} selected`);
}
async function coordinates(page, x, y) {
  const bounds = await page.locator('#board').boundingBox();
  return {
    x: bounds.x + (x / 960) * bounds.width,
    y: bounds.y + (y / 540) * bounds.height,
  };
}
async function touchController(page) {
  const cdp = await page.context().newCDPSession(page);
  const points = new Map();
  const send = (type) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: [...points.values()],
    });
  return {
    async down(id, point) {
      points.set(id, {
        id,
        x: point.x,
        y: point.y,
        radiusX: 2,
        radiusY: 2,
        force: 1,
      });
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
      await this.down(id, {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
      });
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
async function visibleTouchControls(page) {
  const targets = await page.evaluate(() =>
    ['move-left', 'move-right', 'jump'].map((id) => {
      const rect = document.getElementById(id).getBoundingClientRect();
      return {
        id,
        width: rect.width,
        height: rect.height,
        visible:
          rect.x >= 0 && rect.y >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
      };
    }),
  );
  for (const target of targets) {
    assert.ok(target.width >= 44 && target.height >= 44, `${target.id} has a 44px touch target`);
    assert.equal(target.visible, true, `${target.id} is visible in the viewport`);
  }
}

async function chapterChecks(page, touch) {
  assert.equal(await page.locator('#chapter-select option').count(), CHAPTERS.length);
  assert.equal(await page.locator('#level-nav button').count(), 10, 'route displays ten rooms');
  await page.locator('#chapter-select').selectOption('9');
  assert.equal(await page.locator('#level-nav button').count(), 10);
  assert.equal(await page.locator('#level-nav button[data-level="99"]').count(), 1);
  await click(page, '#chapter-prev', touch);
  assert.equal(await page.locator('#chapter-select').inputValue(), '8');
  await click(page, '#chapter-next', touch);
  assert.equal(await page.locator('#chapter-select').inputValue(), '9');
  assert.equal(await page.locator('#chapter-next').isDisabled(), true);
  await click(page, '#level-nav button[data-level="99"]', touch);
  assert.equal((await snapshot(page)).levelIndex, 99, 'room 100 is reachable');
  await click(page, '#pause', touch);
  await page.locator('#pause-chapter-select').selectOption('0');
  assert.equal(await page.locator('#pause-levels button').count(), 10);
  await click(page, '#pause-levels button[data-level="0"]', touch);
  assert.equal((await snapshot(page)).levelIndex, 0, 'pause chapter menu loads a room');
  assert.equal((await snapshot(page)).paused, false, 'room selection closes pause');
  assert.equal(await page.locator('#chapter-select').inputValue(), '0');
  if (!touch) {
    await page.locator('#chapter-select').focus();
    const before = (await snapshot(page)).state;
    await page.keyboard.down('ArrowRight');
    await advance(page, 200);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.press('Escape');
    const after = await snapshot(page);
    assert.equal(after.state.player.x, before.player.x, 'select keys do not move the player');
    assert.deepEqual(after.state.frame, before.frame, 'select keys do not move the frame');
    assert.equal(after.paused, false, 'native select Escape does not pause the game');
  }
  const icon = await page.locator('#pause .pause-icon').evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      left: parseFloat(style.borderLeftWidth),
      right: parseFloat(style.borderRightWidth),
      width: parseFloat(style.width),
      height: parseFloat(style.height),
      leftStyle: style.borderLeftStyle,
      rightStyle: style.borderRightStyle,
    };
  });
  assert.ok(icon.left > 0 && icon.left === icon.right, 'pause bars have equal thickness');
  assert.ok(icon.width > icon.left + icon.right, 'pause bars are separated');
  assert.ok(icon.height > icon.left, 'pause bars are vertical');
  assert.equal(icon.leftStyle, 'solid');
  assert.equal(icon.rightStyle, 'solid');
}

async function desktopSolutions(page) {
  // Replay the engine's reference routes through real DOM input. Never mutate state.
  for (const [index, actions] of SOLUTIONS.entries()) {
    if (index + 1 < firstDesktopRoom || index + 1 > lastDesktopRoom) continue;
    await selectLevel(page, index);
    await page.locator('#board').scrollIntoViewIfNeeded();
    if (index === 70) await shot(page, 'desktop-room-71-play');
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
    if (index === 0 || (index + 1) % 10 === 0)
      await shot(page, `desktop-room-${index + 1}-complete`);
    report.results.push({ device: 'desktop', room: index + 1, won: true });
    console.log(`desktop room ${index + 1} completed`);
  }
}

async function winFirstRoom(page, touch, delayBeforeTraverse = 0) {
  await until(page, (state) => state.objects[0].x + 21 >= 375, 'touch keeper reaches switch');
  await placeFrame(page, 620, 0, touch);
  let state = (await snapshot(page)).state;
  assert.equal(state.objects[0].active, false, 'touch drag freezes marked object');
  assert.equal(state.switches[0].pressed, true, 'frozen robot holds switch');
  const frozenX = state.objects[0].x;
  await advance(page, delayBeforeTraverse);
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
  await advance(page, 20);
  state = (await snapshot(page)).state;
  assert.equal(state.objects[0].x, frozenX, 'excluded robot stays exactly frozen during traversal');
  return state.time;
}

async function frameAndMovementChecks(page, touch) {
  await selectLevel(page, 0, true);
  await page.locator('#board').scrollIntoViewIfNeeded();
  await advance(page, 50);
  const before = (await snapshot(page)).state;
  const from = await coordinates(
    page,
    before.frame.x + before.frame.w / 2,
    before.frame.y + before.frame.h / 2,
  );
  await touch.button(1, '#move-right');
  await touch.down(9, from);
  await touch.move(9, { x: from.x + 20, y: from.y - 20 });
  await advance(page, 150);
  let state = (await snapshot(page)).state;
  assert.ok(state.player.x > before.player.x + 20, 'movement continues during a frame touch');
  assert.ok(state.frame.x > before.frame.x, 'second touch moves the frame');
  assert.equal(
    await page.locator('#board').evaluate((node) => node.classList.contains('dragging')),
    true,
  );
  // Full-page captures can resize the viewport and legitimately release gestures.
  await shot(page, `mobile-${page.viewportSize().width}-frame-drag`, false);
  await touch.up(9);
  const releasedX = state.player.x;
  await advance(page, 100);
  state = (await snapshot(page)).state;
  assert.ok(state.player.x > releasedX, 'releasing frame leaves held movement active');
  await touch.up(1);
  await touch.button(1, '#move-right');
  const frameFrom = await coordinates(page, state.frame.x + 100, state.frame.y + 100);
  await touch.down(9, frameFrom);
  await touch.move(9, { x: frameFrom.x + 12, y: frameFrom.y - 12 });
  await advance(page, 100);
  await touch.cancel();
  const cancelX = (await snapshot(page)).state.player.x;
  await advance(page, 250);
  assert.equal(
    (await snapshot(page)).state.player.x,
    cancelX,
    'touch cancellation clears movement',
  );
  assert.equal(
    await page.locator('#board').evaluate((node) => node.classList.contains('dragging')),
    false,
  );
  assert.equal(
    await page.locator('.touch-controls .pressed').count(),
    0,
    'cancel clears button feedback',
  );
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
  await page.locator('#board').scrollIntoViewIfNeeded();
  await visibleTouchControls(page);
  const firstTime = await winFirstRoom(page, touch);
  assert.notEqual(await page.locator('#best-time').textContent(), '—', 'room best time is visible');
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
  await selectLevel(page, 0, true);
  const slowerTime = await winFirstRoom(page, touch, 1200);
  assert.ok(slowerTime > firstTime, 'second run takes longer');
  assert.equal(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).completed['first-still'],
      STORAGE_KEY,
    ),
    firstTime,
    'slower replay preserves the best time',
  );
  await chapterChecks(page, true);
  await frameAndMovementChecks(page, touch);
  await selectLevel(page, 0, true);
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
  // Pause commits an exact checkpoint; reload and resume preserve world and history.
  await selectLevel(page, 47, true);
  await page.locator('#board').scrollIntoViewIfNeeded();
  await placeFrame(page, 0, 0, touch);
  await touch.button(1, '#move-right');
  await advance(page, 150);
  await touch.up(1);
  await advance(page, 1100);
  await click(page, '#pause', true);
  const checkpoint = await snapshot(page);
  await page.reload({ waitUntil: 'networkidle' });
  await advance(page, 50);
  const restored = await snapshot(page);
  assert.equal(restored.levelIndex, 47, 'reload retains selected room');
  assert.equal(restored.checkpointRestored, true, 'reload restores unfinished run');
  assert.equal(restored.mode, 'intro', 'resume waits for player input');
  assert.deepEqual(
    restored.state,
    checkpoint.state,
    'reload restores exact player, frame and objects',
  );
  assert.ok(restored.historyLength > 1, 'reload retains recent undo history');
  await click(page, '#start-button', true);
  const resumedTime = (await snapshot(page)).state.time;
  await click(page, '#undo', true);
  assert.ok((await snapshot(page)).state.time < resumedTime - 0.8, 'undo works after reload');
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
  await selectLevel(page, 0, true);
  await page.setViewportSize({ width: height, height: width });
  await advance(page, 50);
  await noOverflow(page);
  await page.locator('#board').scrollIntoViewIfNeeded();
  await visibleTouchControls(page);
  const landscapeX = (await snapshot(page)).state.player.x;
  await touch.button(1, '#move-right');
  await advance(page, 120);
  await touch.up(1);
  assert.ok((await snapshot(page)).state.player.x > landscapeX, 'landscape touch movement works');
  await shot(page, `mobile-${width}-landscape-play`);
  await click(page, '#pause', true);
  await noOverflow(page);
  await shot(page, `mobile-${width}-landscape`);
  report.results.push({
    device: `touch-${width}x${height}`,
    room: 1,
    multitouch: true,
    frameAndMovement: true,
    cancellation: true,
    pause: true,
    undo: true,
    persistence: true,
    resume: true,
    bestTime: true,
    room100Navigation: true,
    landscape: true,
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
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox'],
  });
  report.browser = await browser.version();
  if (process.env.BROWSER_SCENARIO !== 'desktop') {
    await mobileChecks(390, 844);
    await mobileChecks(360, 640);
  }
  if (process.env.BROWSER_SCENARIO !== 'mobile') {
    const desktop = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await open(desktop, 'desktop');
    await shot(page, 'desktop-intro');
    await click(page, '#start-button');
    await noOverflow(page);
    await chapterChecks(page);
    await desktopSolutions(page);
    await page.reload({ waitUntil: 'networkidle' });
    assert.match(
      await page.locator('#progress-label').textContent(),
      new RegExp(`完成 ${lastDesktopRoom - firstDesktopRoom + 1} / ${LEVELS.length}`),
    );
    await desktop.close();
    report.desktopRouteCoverage = {
      completed: lastDesktopRoom - firstDesktopRoom + 1,
      total: LEVELS.length,
      firstRoom: firstDesktopRoom,
      lastRoom: lastDesktopRoom,
      input: 'real DOM keyboard and frame drags',
    };
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

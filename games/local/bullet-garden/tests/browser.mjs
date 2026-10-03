/**
 * Browser acceptance uses native keyboard/mouse/CDP touch input and the game's
 * read-only snapshot. The five-minute run keeps normal health, stock, enemies,
 * upgrades, and timing. Playwright's virtual clock accelerates animation frames;
 * no simulation state is mutated and no game actions are called directly.
 *
 * PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_PATH=/usr/bin/chromium \
 *   node tests/browser.mjs
 * Optional: GAME_URL, QA_OUTPUT (defaults to /tmp/bullet-garden-browser-qa).
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : '@playwright/test');
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const output = process.env.QA_OUTPUT || '/tmp/bullet-garden-browser-qa';
await mkdir(output, { recursive: true });
const errors = [],
  checks = [],
  touchPages = new WeakSet();
const report = {
  date: new Date().toISOString(),
  browser: await browser.version(),
  url: process.env.GAME_URL || 'http://127.0.0.1:4410',
  selection: process.env.QA_ONLY || 'all',
  timing: 'Playwright virtual clock; native keyboard/mouse/touch; read-only game snapshot',
  checks,
  errors,
};
const snapshot = (page) => page.evaluate(() => window.__bulletGarden.snapshot());
const advance = (page, milliseconds) => page.clock.runFor(milliseconds);
async function click(page, selector) {
  const rect = await page.locator(selector).boundingBox();
  assert.ok(rect, `visible control ${selector}`);
  if (touchPages.has(page))
    await page.touchscreen.tap(rect.x + rect.width / 2, rect.y + rect.height / 2);
  else await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await advance(page, 32);
}
async function setup(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  const page = await context.newPage();
  if (options.hasTouch) touchPages.add(page);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.clock.install({ time: new Date('2026-10-03T00:00:00.000Z') });
  await page.clock.pauseAt(new Date('2026-10-03T00:00:01.000Z'));
  await page.goto(report.url);
  await advance(page, 64);
  return { context, page };
}
function check(name, details = {}) {
  checks.push({ name, ...details });
  console.log(`PASS ${name}`, JSON.stringify(details));
}
async function desktopControls() {
  const { context, page } = await setup();
  assert.equal((await snapshot(page)).phase, 'ready');
  await click(page, '#ready-help');
  assert.equal(await page.locator('#help-panel').isVisible(), true);
  await click(page, '#close-help');
  await click(page, '#start');
  await page.keyboard.down('d');
  await advance(page, 500);
  await page.keyboard.up('d');
  assert.ok((await snapshot(page)).player.x > 790, 'WASD movement');
  await click(page, '#pause');
  const paused = await snapshot(page);
  await advance(page, 3000);
  assert.equal((await snapshot(page)).time, paused.time, 'pause freezes simulation');
  await click(page, '#pause-help');
  await advance(page, 2000);
  assert.equal((await snapshot(page)).time, paused.time, 'manual freezes simulation');
  await page.keyboard.press('Escape');
  await advance(page, 32);
  assert.equal((await snapshot(page)).phase, 'paused', 'manual returns to pause');
  await click(page, '#resume');
  await page.keyboard.press('Escape');
  await advance(page, 32);
  assert.equal((await snapshot(page)).phase, 'paused');
  await page.keyboard.press('Escape');
  await advance(page, 32);
  assert.equal((await snapshot(page)).phase, 'playing');
  check('desktop movement, pause/resume, ready/pause help, Escape');

  // Native page focus loss must suspend and clear held keys.
  await page.keyboard.down('d');
  const sibling = await context.newPage();
  await sibling.goto('about:blank');
  await sibling.bringToFront();
  await advance(page, 64);
  let focusState = await snapshot(page);
  report.nativeBackgroundSuspension = {
    phase: focusState.phase,
    hidden: await page.evaluate(() => document.hidden),
  };
  await sibling.close();
  await page.bringToFront();
  await page.keyboard.up('d');
  if (focusState.phase === 'paused') {
    check('native focus/background suspends simulation', report.nativeBackgroundSuspension);
    await click(page, '#resume');
  } else {
    // Headless Chromium can keep every tab visible; still exercise the browser
    // blur event without altering any input state or simulation object.
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await advance(page, 32);
    assert.equal((await snapshot(page)).phase, 'paused');
    check(
      'blur event suspends simulation (headless tabs remain visible)',
      report.nativeBackgroundSuspension,
    );
    await click(page, '#resume');
  }

  await click(page, '#auto-fire');
  assert.equal(await page.locator('#auto-fire').getAttribute('aria-pressed'), 'false');
  const beforeMouse = await snapshot(page);
  await page.mouse.move(beforeMouse.player.x + 150, beforeMouse.player.y - 63);
  await page.mouse.down({ button: 'left' });
  await advance(page, 200);
  await page.mouse.click(beforeMouse.player.x + 150, beforeMouse.player.y - 63, {
    button: 'right',
  });
  await advance(page, 400);
  const withMouse = await snapshot(page);
  assert.equal(
    withMouse.stats.seedShots,
    beforeMouse.stats.seedShots + 1,
    'right-click plants while left fire is held',
  );
  assert.ok(withMouse.stats.shots > beforeMouse.stats.shots, 'left hold fires ordinary shots');
  await page.mouse.up({ button: 'left' });
  await advance(page, 50);
  const mouseReleased = await snapshot(page);
  await advance(page, 400);
  assert.equal(
    (await snapshot(page)).stats.shots,
    mouseReleased.stats.shots,
    'no ordinary ghost fire after release',
  );
  check('left hold + right click plants concurrently; release stops manual firing');
  // Idle with auto-fire disabled intentionally reaches the actual loss screen.
  let state = await snapshot(page);
  for (let count = 0; state.phase === 'playing' && count < 100; count += 1) {
    await advance(page, 1000);
    state = await snapshot(page);
  }
  assert.equal(state.phase, 'lost', 'normal combat can lose');
  await page.screenshot({ path: `${output}/desktop-loss.png` });
  check('natural combat loss', { seconds: state.time, damageTaken: state.stats.damageTaken });
  await click(page, '#play-again');
  state = await snapshot(page);
  assert.equal(state.phase, 'playing');
  assert.equal(state.player.hp, 100);
  assert.equal(state.kills, 0);
  assert.equal(state.stats.plantsGrown, 0);
  check('result replay resets health, score, terrain');
  await context.close();
}

async function touchControls(width, height) {
  const { context, page } = await setup({
    viewport: { width, height },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  });
  await click(page, '#start');
  const cdp = await context.newCDPSession(page);
  await page.evaluate(() => {
    window.__touchEvidence = { events: [], active: [], maximum: 0 };
    for (const type of ['pointerdown', 'pointerup', 'pointercancel'])
      document.addEventListener(
        type,
        (event) => {
          if (event.pointerType !== 'touch') return;
          const log = window.__touchEvidence;
          log.events.push({ type, target: event.target.id, pointer: event.pointerId });
          if (type === 'pointerdown') log.active.push(event.pointerId);
          else log.active = log.active.filter((id) => id !== event.pointerId);
          log.maximum = Math.max(log.maximum, log.active.length);
        },
        true,
      );
  });
  const stick = await page.locator('#joystick').boundingBox();
  assert.ok(stick);
  const j = {
    id: 1,
    x: stick.x + stick.width * 0.75,
    y: stick.y + stick.height * 0.5,
    radiusX: 8,
    radiusY: 8,
    force: 1,
  };
  const field =
    height > width ? { x: width * 0.7, y: height * 0.32 } : { x: width * 0.63, y: height * 0.38 };
  assert.equal(
    await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, field),
    'arena',
    'field tap is unobstructed',
  );
  const f = { id: 2, ...field, radiusX: 8, radiusY: 8, force: 1 };
  const initial = await snapshot(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [j] });
  await advance(page, 250);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [j, f] });
  await advance(page, 100);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [f] });
  await advance(page, 500);
  let state = await snapshot(page);
  assert.ok(state.player.x > initial.player.x + 50, 'joystick moves while field is tapped');
  assert.equal(
    state.stats.seedShots,
    1,
    `second touch tap plants exactly once ${JSON.stringify(await page.evaluate(() => window.__touchEvidence))}`,
  );
  assert.ok(state.stats.plantsGrown >= 1, 'the seed lands and grows');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await advance(page, 50);
  const released = await snapshot(page);
  await advance(page, 300);
  state = await snapshot(page);
  assert.equal(state.player.x, released.player.x, 'touchcancel stops joystick');
  assert.equal(state.player.y, released.player.y, 'touchcancel stops joystick');

  // Cancel the field pointer rather than committing a tap. No seed should fire.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [f] });
  await advance(page, 50);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await advance(page, 1000);
  assert.equal(
    (await snapshot(page)).stats.seedShots,
    1,
    'cancelled field gesture has no ghost seed',
  );
  const evidence = await page.evaluate(() => window.__touchEvidence);
  assert.equal(evidence.maximum, 2, 'two genuine concurrent touch pointers');
  assert.ok(evidence.events.filter((event) => event.type === 'pointercancel').length >= 2);
  await click(page, '[data-seed="ice"]');
  assert.equal((await snapshot(page)).selectedSeed, 'ice');
  await click(page, '#dash');
  assert.ok((await snapshot(page)).player.dashCooldown > 0, 'touch dash works');
  await page.screenshot({ path: `${output}/touch-${width}x${height}.png` });
  check(
    `native multi-touch ${width}×${height}: move + plant, seed growth, cancel release/no ghost seed, selection, dash`,
    { maximumConcurrentPointers: evidence.maximum, planted: state.stats.plantsGrown },
  );
  await context.close();
}

async function fullChallenge() {
  const { context, page } = await setup();
  await click(page, '#start');
  const held = new Set();
  let snapshots = 0,
    maxPlants = 0,
    maxEnemies = 0,
    captures = 0;
  const upgradeSelections = [];
  async function movement(x, y) {
    const desired = new Set();
    const threshold = Math.max(Math.abs(x), Math.abs(y)) * 0.35;
    if (x > threshold) desired.add('d');
    else if (x < -threshold) desired.add('a');
    if (y > threshold) desired.add('s');
    else if (y < -threshold) desired.add('w');
    for (const key of held)
      if (!desired.has(key)) {
        await page.keyboard.up(key);
        held.delete(key);
      }
    for (const key of desired)
      if (!held.has(key)) {
        await page.keyboard.down(key);
        held.add(key);
      }
  }
  let state = await snapshot(page);
  while (['playing', 'upgrade'].includes(state.phase) && snapshots < 1700) {
    if (state.phase === 'upgrade') {
      // Opening any panel releases all controls in-game; release the automation's
      // native keys too so the next direction gets a fresh keydown after choice.
      for (const key of held) await page.keyboard.up(key);
      held.clear();
      const preferred = ['bloom-shot', 'wild-heart', 'mushroom-heart', 'thorn-heart'];
      const selected =
        preferred.find((id) => state.upgradeChoices.includes(id)) || state.upgradeChoices[0];
      upgradeSelections.push({ beforeWave: state.wave, selected });
      await click(page, `[data-upgrade="${selected}"]`);
      state = await snapshot(page);
      continue;
    }
    const angle = state.time * 0.28;
    const target = { x: 720 + 470 * Math.cos(angle), y: 450 + 235 * Math.sin(angle) };
    let dx = target.x - state.player.x,
      dy = target.y - state.player.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    dx /= length;
    dy /= length;
    const nearest = [...state.enemies].sort(
      (a, b) =>
        Math.hypot(a.x - state.player.x, a.y - state.player.y) -
        Math.hypot(b.x - state.player.x, b.y - state.player.y),
    )[0];
    if (nearest) {
      const nx = nearest.x - state.player.x,
        ny = nearest.y - state.player.y,
        distance = Math.hypot(nx, ny);
      if (distance > 0 && distance < 125) {
        dx -= (nx / distance) * 2;
        dy -= (ny / distance) * 2;
      }
      if (state.seedCooldown <= 0 && distance < 480 && distance > 95) {
        const thorn = state.plants.some(
          (plant) =>
            plant.kind === 'thorn' && Math.hypot(plant.x - nearest.x, plant.y - nearest.y) < 170,
        );
        const kind = thorn ? 'mushroom' : 'thorn';
        const lead = kind === 'thorn' ? 70 : Math.min(160, distance - 55);
        await page.keyboard.press(kind === 'thorn' ? '1' : '3');
        // Same read-only world projection as renderer.updateCamera at 1440×900.
        const playerScreenY = state.player.y - 63;
        const offsetY = -63 + Math.min(627, Math.max(194, playerScreenY)) - playerScreenY;
        await page.mouse.click(
          nearest.x - (nx / distance) * lead,
          nearest.y - (ny / distance) * lead + offsetY,
          { button: 'right' },
        );
      }
    }
    await movement(dx, dy);
    await advance(page, 250);
    state = await snapshot(page);
    snapshots += 1;
    maxPlants = Math.max(maxPlants, state.plants.length);
    maxEnemies = Math.max(maxEnemies, state.enemies.length);
    assert.ok(state.plants.length <= state.plantCap);
    assert.ok(state.enemies.length <= 48);
    if (
      state.wave >= 5 &&
      captures === 0 &&
      state.plants.length >= 3 &&
      state.enemies.length >= 4
    ) {
      await page.screenshot({ path: `${output}/desktop-wave-${state.wave}.png` });
      captures += 1;
    }
    if (snapshots % 120 === 0)
      console.log(
        `RUN ${state.time.toFixed(1)}s wave=${state.wave} hp=${state.player.hp} kills=${state.kills} plants=${state.stats.plantsGrown}`,
      );
  }
  for (const key of held) await page.keyboard.up(key);
  report.challenge = {
    result: state.phase,
    seconds: state.time,
    hp: state.player.hp,
    wave: state.wave,
    kills: state.kills,
    stats: state.stats,
    maxPlants,
    maxEnemies,
    upgradeSelections,
  };
  await page.screenshot({ path: `${output}/desktop-result.png` });
  assert.equal(
    state.phase,
    'won',
    `full normal-health browser challenge: ${JSON.stringify(report.challenge)}`,
  );
  assert.equal(Math.round(state.time), 300);
  assert.equal(upgradeSelections.length, 3);
  // Browser acceptance proves terrain contributes; balance.mjs owns strategy
  // quality thresholds for its different per-frame analog movement policy.
  assert.ok(state.stats.plantKills >= 10);
  assert.ok(state.stats.terrainDamage > 2000);
  assert.equal(await page.locator('#result-title').textContent(), '花园，生生不息。');
  check('five-minute normal-health victory with three real upgrade choices', report.challenge);
  await context.close();
}

try {
  if (!process.env.QA_ONLY || ['desktop', 'controls'].includes(process.env.QA_ONLY))
    await desktopControls();
  if (!process.env.QA_ONLY || ['touch', 'controls'].includes(process.env.QA_ONLY)) {
    await touchControls(390, 844);
    await touchControls(844, 390);
  }
  if (!process.env.QA_ONLY || process.env.QA_ONLY === 'challenge') await fullChallenge();
  assert.deepEqual(errors, [], 'no JavaScript or console errors');
  check('no browser JavaScript or console errors');
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = error.stack;
  throw error;
} finally {
  await writeFile(`${output}/browser-report.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  console.log(`Evidence: ${output}/browser-report.json`);
}

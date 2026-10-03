/**
 * Browser acceptance uses native keyboard/mouse/CDP touch input and the game's
 * read-only snapshot. The five-minute run keeps normal health, enemies,
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
  limitations: [
    'Chromium touch emulation; physical iOS and Android devices were not tested.',
    'Virtual clock accelerates natural simulation frames without changing health, enemies, or game state.',
  ],
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

  assert.equal(await page.locator('#auto-fire, #cast, [data-seed]').count(), 0);
  const beforeMouse = await snapshot(page);
  await page.mouse.move(1050, 390);
  await page.mouse.down({ button: 'left' });
  await advance(page, 600);
  const withMouse = await snapshot(page);
  assert.equal(withMouse.controls.manualAim, true, 'held field input aims manually');
  assert.ok(withMouse.stats.shots > beforeMouse.stats.shots, 'held field fires ordinary shots');
  await page.mouse.up({ button: 'left' });
  await advance(page, 32);
  const mouseReleased = await snapshot(page);
  assert.equal(mouseReleased.controls.manualAim, false, 'release restores automatic targeting');
  await advance(page, 800);
  assert.ok(
    (await snapshot(page)).stats.shots > mouseReleased.stats.shots,
    'automatic fire continues',
  );
  await page.locator('#pause').screenshot({ path: `${output}/desktop-pause-icon.png` });
  check('optional mouse aim releases into automatic fire; no manual planting controls');

  // Deliberately hold aim away from the nearest threat to reach the real loss
  // screen with normal enemies and health, then exercise a clean replay.
  let state = await snapshot(page);
  for (let count = 0; ['playing', 'upgrade'].includes(state.phase) && count < 150; count += 1) {
    if (state.phase === 'upgrade') await click(page, `[data-upgrade="${state.upgradeChoices[0]}"]`);
    await page.mouse.move(140, 160);
    await page.mouse.down();
    await advance(page, 1000);
    await page.mouse.up();
    state = await snapshot(page);
    if (count % 30 === 0) console.log(`LOSS RUN ${state.time.toFixed(1)}s hp=${state.player.hp}`);
  }
  assert.equal(state.phase, 'lost', 'normal combat can lose');
  await page.screenshot({ path: `${output}/desktop-loss.png` });
  check('natural combat loss', {
    result: state.phase,
    seconds: state.time,
    damageTaken: state.stats.damageTaken,
  });
  await click(page, '#play-again');
  state = await snapshot(page);
  assert.equal(state.phase, 'playing');
  assert.equal(state.player.hp, 100);
  assert.equal(state.kills, 0);
  assert.equal(state.stats.plantsGrown, 0);
  assert.equal(state.progression.level, 1);
  check('result replay resets health, score, terrain and experience level');
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
  let state = await snapshot(page);
  assert.ok(state.player.x > initial.player.x + 30, 'joystick moves while field aim is held');
  assert.equal(state.controls.manualAim, true, 'second touch holds manual aim');
  assert.ok(state.stats.shots > initial.stats.shots, 'automatic gun fires during dual touch');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await advance(page, 50);
  const released = await snapshot(page);
  assert.equal(released.controls.manualAim, false, 'touchcancel restores automatic targeting');
  await advance(page, 350);
  state = await snapshot(page);
  assert.equal(state.player.x, released.player.x, 'touchcancel stops joystick');
  assert.equal(state.player.y, released.player.y, 'touchcancel stops joystick');
  assert.ok(
    state.stats.shots > released.stats.shots,
    'automatic shooting continues after cancellation',
  );
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [f] });
  await advance(page, 50);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await advance(page, 50);
  assert.equal(
    (await snapshot(page)).controls.manualAim,
    false,
    'ordinary touch release restores automatic aim',
  );
  const evidence = await page.evaluate(() => window.__touchEvidence);
  assert.equal(evidence.maximum, 2, 'two genuine concurrent touch pointers');
  assert.ok(evidence.events.filter((event) => event.type === 'pointercancel').length >= 2);
  await click(page, '#dash');
  assert.ok((await snapshot(page)).player.dashCooldown > 0, 'touch dash works');
  await page.screenshot({ path: `${output}/touch-${width}x${height}.png` });
  await page
    .locator('#pause')
    .screenshot({ path: `${output}/touch-pause-icon-${width}x${height}.png` });
  assert.equal(await page.locator('#pause').getAttribute('aria-label'), '暂停');
  const bars = await page.locator('#pause svg rect').evaluateAll((nodes) =>
    nodes.map((node) => ({
      x: Number(node.getAttribute('x')),
      y: Number(node.getAttribute('y')),
      width: Number(node.getAttribute('width')),
      height: Number(node.getAttribute('height')),
      fill: getComputedStyle(node).fill,
    })),
  );
  assert.equal(bars.length, 2, 'pause uses two drawn bars');
  assert.equal(bars[0].width, bars[1].width);
  assert.equal(bars[0].height, bars[1].height);
  assert.equal(bars[0].y, bars[1].y);
  assert.ok(bars[0].x + bars[0].width < bars[1].x, 'pause bars are separated');
  assert.ok(
    bars.every((bar) => bar.fill !== 'none'),
    'pause bars are solid',
  );
  check(
    `native multi-touch ${width}×${height}: move + aim, cancellation, automatic recovery and dash`,
    {
      maximumConcurrentPointers: evidence.maximum,
      pauseBars: bars,
    },
  );

  // Stay in native touch controls long enough to observe both automatic terrain
  // and a genuine experience choice, rather than injecting either state.
  let upgradeSeen = false,
    movementTouchActive = false;
  for (let turn = 0; turn < 180; turn += 1) {
    state = await snapshot(page);
    if (state.phase === 'upgrade') {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      movementTouchActive = false;
      const choiceCount = state.upgradeChoices.length;
      assert.ok(choiceCount >= 3 && choiceCount <= 4);
      for (const choice of await page.locator('[data-upgrade]').all()) {
        const rect = await choice.boundingBox();
        assert.ok(
          rect &&
            rect.x >= 0 &&
            rect.y >= 0 &&
            rect.x + rect.width <= width + 1 &&
            rect.y + rect.height <= height + 1,
          'touch upgrade choices fit viewport',
        );
      }
      const pausedAt = state.time;
      await advance(page, 1000);
      assert.equal((await snapshot(page)).time, pausedAt, 'touch upgrade choice freezes combat');
      if (!upgradeSeen)
        await page.screenshot({ path: `${output}/touch-upgrade-${width}x${height}.png` });
      upgradeSeen = true;
      await click(page, `[data-upgrade="${state.upgradeChoices[0]}"]`);
      state = await snapshot(page);
    }
    assert.equal(
      state.phase,
      'playing',
      'touch movement survives through the first experience choice',
    );
    if (upgradeSeen && state.stats.plantsGrown > 0) break;
    const angle = state.time * 0.28;
    const dx = 720 + 470 * Math.cos(angle) - state.player.x;
    const dy = 450 + 235 * Math.sin(angle) - state.player.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const touchPoint = {
      ...j,
      x: stick.x + stick.width / 2 + (dx / length) * stick.width * 0.32,
      y: stick.y + stick.height / 2 + (dy / length) * stick.width * 0.32,
    };
    await cdp.send('Input.dispatchTouchEvent', {
      type: movementTouchActive ? 'touchMove' : 'touchStart',
      touchPoints: [touchPoint],
    });
    movementTouchActive = true;
    await advance(page, 500);
  }
  if (movementTouchActive)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  state = await snapshot(page);
  assert.ok(state.stats.plantsGrown > 0, 'touch movement automatically grows terrain');
  assert.ok(upgradeSeen, 'touch movement earns a real experience choice');
  await page.screenshot({ path: `${output}/touch-autogrowth-${width}x${height}.png` });
  check(`touch ${width}×${height}: movement-only automatic terrain and experience choice`, {
    seconds: state.time,
    grown: state.stats.plantsGrown,
    level: state.progression.level,
  });
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
      const preferred = [
        'multishot',
        'attack-speed',
        'attack-power',
        'wild-heart',
        'bloom-shot',
        'mushroom-heart',
        'thorn-heart',
      ];
      const selected =
        preferred.find((id) => state.upgradeChoices.includes(id)) || state.upgradeChoices[0];
      assert.ok(state.upgradeChoices.length >= 3 && state.upgradeChoices.length <= 4);
      assert.equal(new Set(state.upgradeChoices).size, state.upgradeChoices.length);
      assert.equal(await page.locator('[data-upgrade]').count(), state.upgradeChoices.length);
      const pausedAt = state.time;
      await advance(page, 1600);
      assert.equal((await snapshot(page)).time, pausedAt, 'experience choice freezes combat');
      if (
        !upgradeSelections.some(
          (selection) => selection.choices.length === state.upgradeChoices.length,
        )
      ) {
        await page.screenshot({
          path: `${output}/desktop-upgrade-${state.upgradeChoices.length}-choices.png`,
        });
      }
      if (
        state.upgradeChoices.length === 4 &&
        !upgradeSelections.some((selection) => selection.choices.length === 4)
      ) {
        for (const [width, height] of [
          [390, 844],
          [844, 390],
        ]) {
          await page.setViewportSize({ width, height });
          await advance(page, 64);
          for (const choice of await page.locator('[data-upgrade]').all()) {
            const rect = await choice.boundingBox();
            assert.ok(
              rect &&
                rect.x >= 0 &&
                rect.y >= 0 &&
                rect.x + rect.width <= width + 1 &&
                rect.y + rect.height <= height + 1,
              'four upgrade choices fit the mobile viewport',
            );
          }
          assert.equal(
            (await snapshot(page)).time,
            pausedAt,
            'responsive upgrade inspection keeps combat frozen',
          );
          await page.screenshot({ path: `${output}/upgrade-4-choices-${width}x${height}.png` });
        }
        await page.setViewportSize({ width: 1440, height: 900 });
        await advance(page, 64);
        check('four-choice upgrade fits portrait and landscape mobile viewports');
      }
      upgradeSelections.push({
        time: state.time,
        beforeWave: state.wave,
        level: state.progression.level,
        choices: state.upgradeChoices,
        selected,
      });
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
  assert.ok(upgradeSelections.length >= 3, 'experience grants repeated real upgrade choices');
  assert.ok(state.stats.plantsGrown > 0, 'movement-only replay grows terrain automatically');
  // Browser acceptance proves terrain contributes; balance.mjs owns strategy
  // quality thresholds for its different per-frame analog movement policy.
  assert.ok(state.stats.plantKills > 0);
  assert.ok(state.stats.terrainDamage > 0);
  assert.equal(await page.locator('#result-title').textContent(), '花园，生生不息。');
  check(
    'five-minute normal-health movement-only victory with automatic terrain and experience upgrades',
    report.challenge,
  );
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

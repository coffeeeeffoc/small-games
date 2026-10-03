/**
 * Native-input acceptance for XP-unlocked passive boons and manually released skills.
 * Virtual time accelerates the five-minute run, with normal health, energy,
 * enemies and upgrade choices. The application exposes only a read-only snapshot;
 * this test never calls simulation actions or changes game state directly.
 *
 * PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_PATH=/usr/bin/chromium \
 *   node tests/browser.mjs
 * Optional: GAME_URL, QA_OUTPUT, QA_ONLY=desktop|touch|speed|controls|challenge.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { BOONS, SKILLS, UPGRADES } from '../src/config.mjs';

const modulePath = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : '@playwright/test');
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const output = process.env.QA_OUTPUT || '/tmp/bullet-garden-mechanisms-browser';
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
const energy = (state) => state.skillSlots.map((slot) => slot.energy);
const slotSelector = (index) => `[data-skill-slot="${index}"]`;
function check(name, details = {}) {
  checks.push({ name, ...details });
  console.log(`PASS ${name}`, JSON.stringify(details));
}
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
async function prepare(page, skills = ['blast', 'laser']) {
  assert.equal((await snapshot(page)).phase, 'ready');
  assert.equal(
    await page.locator('[data-boon]').count(),
    0,
    'preparation has no terrain selection',
  );
  assert.equal(
    await page.locator('#start').isDisabled(),
    false,
    'two active skills are enough to start',
  );
  await page.locator('#loadout-skill-0').selectOption(skills[0]);
  await page.locator('#loadout-skill-1').selectOption(skills[1]);
  assert.equal(await page.locator('#start').isDisabled(), false);
  await click(page, '#start');
  const state = await snapshot(page);
  assert.equal(state.phase, 'playing');
  assert.deepEqual(state.loadout, { skills });
  assert.deepEqual(state.boons, [], 'every run begins without terrain boons');
  assert.equal(state.plants.length, 0, 'no terrain is granted at the start');
  assert.equal(state.stats.plantsGrown, 0);
  assert.deepEqual(
    state.skillSlots.map((slot) => slot.kind),
    skills,
  );
  assert.ok(
    energy(state).every((value) => value >= 0 && value < 1),
    'new run begins with empty energy',
  );
  assertTerrainUnlocked(state);
  return state;
}
function assertTerrainUnlocked(state) {
  if (state.boons.length === 0) {
    assert.equal(state.plants.length, 0, 'no terrain exists before selecting its XP upgrade');
    assert.equal(
      state.stats.plantsGrown,
      0,
      'time, misses and non-boon upgrades never generate terrain',
    );
  }
  const allowed = new Set(state.boons.map((id) => BOONS[id].kind));
  for (const plant of state.plants)
    assert.ok(
      allowed.has(plant.kind),
      `terrain ${plant.kind} needs its acquired boon (${state.boons})`,
    );
  assert.ok(state.plants.length <= state.plantCap);
  assert.ok(state.enemies.length <= 48);
  assert.ok(state.skillEffects.length <= 12);
  assert.ok(energy(state).every((value) => Number.isFinite(value) && value >= 0 && value <= 100));
}
async function inspectExperienceChoices(page, state) {
  const rewardLevel = state.progression.queue[0] ?? state.progression.level;
  const expected = rewardLevel >= 5 ? 4 : 3;
  assert.equal(
    state.upgradeChoices.length,
    expected,
    'experience level controls three/four choices',
  );
  assert.equal(new Set(state.upgradeChoices).size, expected, 'upgrade choices are unique');
  assert.equal(await page.locator('[data-upgrade]').count(), expected);
  for (const id of state.upgradeChoices) {
    const definition = UPGRADES.find((item) => item.id === id);
    assert.ok(definition, `known upgrade ${id}`);
    const rank = state.upgrades.filter((value) => value === id).length;
    assert.ok(rank < definition.maxRank, `${id} excludes maximum-rank upgrades`);
    for (const required of definition.requires || [])
      assert.ok(state.upgrades.includes(required), `${id} requires ${required}`);
    if (id.startsWith('boon-'))
      assert.ok(!state.boons.includes(id.slice(5)), 'acquired boon cannot be offered again');
  }
  const viewport = page.viewportSize();
  for (const choice of await page.locator('[data-upgrade]').all()) {
    const rect = await choice.boundingBox();
    assert.ok(
      rect &&
        rect.x >= 0 &&
        rect.y >= 0 &&
        rect.x + rect.width <= viewport.width + 1 &&
        rect.y + rect.height <= viewport.height + 1,
      `${expected} upgrade cards fit ${viewport.width}×${viewport.height}`,
    );
  }
}
async function settleExperienceChoices(page, movement = null) {
  let state = await snapshot(page);
  while (state.phase === 'upgrade') {
    await movement?.release();
    await inspectExperienceChoices(page, state);
    const preferred = ['multishot', 'attack-power', 'attack-speed', 'wild-heart', 'terrain-heart'];
    const selected =
      preferred.find((id) => state.upgradeChoices.includes(id)) ||
      state.upgradeChoices.find((id) => id !== 'energy-cycle') ||
      state.upgradeChoices[0];
    await click(page, `[data-upgrade="${selected}"]`);
    state = await snapshot(page);
  }
  return state;
}
function steering(state) {
  const angle = state.time * 0.28;
  const target = { x: 720 + 470 * Math.cos(angle), y: 450 + 235 * Math.sin(angle) };
  let x = target.x - state.player.x,
    y = target.y - state.player.y;
  const length = Math.max(1, Math.hypot(x, y));
  x /= length;
  y /= length;
  const nearest = [...state.enemies].sort(
    (a, b) =>
      Math.hypot(a.x - state.player.x, a.y - state.player.y) -
      Math.hypot(b.x - state.player.x, b.y - state.player.y),
  )[0];
  if (nearest) {
    const nx = nearest.x - state.player.x,
      ny = nearest.y - state.player.y;
    const distance = Math.hypot(nx, ny);
    if (distance > 0 && distance < 140) {
      x -= (nx / distance) * 2;
      y -= (ny / distance) * 2;
    }
  }
  return { x, y, nearest };
}
function keyboardMovement(page) {
  const held = new Set();
  return {
    async move(x, y) {
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
    },
    async release() {
      for (const key of held) await page.keyboard.up(key);
      held.clear();
    },
  };
}
async function touchMovement(page, cdp) {
  const rect = await page.locator('#joystick').boundingBox();
  assert.ok(rect, 'visible touch joystick');
  let active = false;
  return {
    async move(x, y) {
      const length = Math.max(1, Math.hypot(x, y));
      const point = {
        id: 1,
        x: rect.x + rect.width * 0.5 + (x / length) * rect.width * 0.29,
        y: rect.y + rect.height * 0.5 + (y / length) * rect.width * 0.29,
        radiusX: 8,
        radiusY: 8,
        force: 1,
      };
      await cdp.send('Input.dispatchTouchEvent', {
        type: active ? 'touchMove' : 'touchStart',
        touchPoints: [point],
      });
      active = true;
    },
    async release() {
      if (active)
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      active = false;
    },
  };
}
async function chargeNaturally(page, movement, timeRate = null) {
  let state = await snapshot(page),
    killChargeObserved = false;
  const started = state.time;
  while (
    (!state.skillSlots.every((slot) => slot.energy >= 100) || state.phase === 'upgrade') &&
    state.time - started < 25
  ) {
    if (state.phase === 'upgrade') {
      state = await settleExperienceChoices(page, movement);
      continue;
    }
    assert.equal(state.phase, 'playing', 'normal movement survives initial charging');
    const before = state;
    const direction = steering(state);
    await movement.move(direction.x, direction.y);
    await advance(page, 250);
    state = await snapshot(page);
    assertTerrainUnlocked(state);
    assert.equal(state.stats.skillCasts, 0, 'charging never releases an automatic skill');
    if (timeRate && state.kills > before.kills && state.skillSlots[0].energy < 100) {
      const gained = state.skillSlots[0].energy - before.skillSlots[0].energy;
      if (gained > timeRate * (state.time - before.time) + 0.5) killChargeObserved = true;
    }
  }
  await movement.release();
  assert.deepEqual(energy(state), [100, 100], 'both independently fill through natural combat');
  return { state, killChargeObserved };
}
async function screenPoint(page, state, x, y) {
  // Pure camera geometry from the renderer; no live renderer or simulation state is modified.
  return page.evaluate(
    async ({ state, x, y }) => {
      const { GardenRenderer } = await import('/src/renderer.mjs');
      const rect = document.getElementById('arena').getBoundingClientRect();
      const geometry = { width: rect.width, height: rect.height, camera: { x: 720, y: 450 } };
      GardenRenderer.prototype.updateCamera.call(geometry, state);
      const point = GardenRenderer.prototype.worldToScreen.call(geometry, x, y);
      return { x: point.x + rect.left, y: point.y + rect.top };
    },
    { state, x, y },
  );
}
async function pauseAndRecovery(page) {
  await click(page, '#pause');
  const paused = await snapshot(page);
  await advance(page, 3000);
  assert.equal((await snapshot(page)).time, paused.time);
  assert.deepEqual(energy(await snapshot(page)), energy(paused), 'pause does not charge skills');
  await click(page, '#pause-help');
  await advance(page, 1000);
  assert.deepEqual(energy(await snapshot(page)), energy(paused), 'help does not charge skills');
  await page.keyboard.press('Escape');
  await advance(page, 32);
  assert.equal((await snapshot(page)).phase, 'paused');
  await click(page, '#resume');
  await page.keyboard.press('Escape');
  await advance(page, 32);
  assert.equal((await snapshot(page)).phase, 'paused');
  await page.keyboard.press('Escape');
  await advance(page, 32);
  assert.equal((await snapshot(page)).phase, 'playing');

  await page.evaluate(() =>
    document.getElementById('arena').dispatchEvent(new Event('contextlost')),
  );
  const lost = await snapshot(page);
  assert.equal(lost.phase, 'paused');
  await advance(page, 1000);
  await click(page, '#resume');
  await advance(page, 500);
  assert.equal((await snapshot(page)).phase, 'paused', 'resume waits for restoration');
  assert.equal((await snapshot(page)).time, lost.time);
  assert.deepEqual(energy(await snapshot(page)), energy(lost));
  await page.evaluate(() =>
    document.getElementById('arena').dispatchEvent(new Event('contextrestored')),
  );
  await advance(page, 32);
  await click(page, '#resume');
  assert.equal((await snapshot(page)).phase, 'playing');
  check('pause/help freeze energy; synthetic canvas loss pauses combat until restored');
}
async function speedControls() {
  const { context, page } = await setup();
  await prepare(page, ['blast', 'gale']);
  await click(page, '#auto-fire');
  const measurements = [];
  for (const speed of [1, 2, 3, 5]) {
    await page.locator('#game-speed').selectOption(String(speed));
    const before = await snapshot(page);
    assert.equal(before.controls.speed, speed, 'selected speed is observable');
    await advance(page, 400);
    const after = await snapshot(page);
    const delta = after.time - before.time;
    assert.equal(after.phase, 'playing');
    assert.ok(
      Math.abs(delta - speed * 0.4) <= 0.09,
      `${speed}× advances game time by ${speed * 0.4}s per 400ms, observed ${delta}`,
    );
    assert.ok(after.skillSlots[0].energy > before.skillSlots[0].energy);
    measurements.push({ speed, wallSeconds: 0.4, gameSeconds: delta });
  }
  await click(page, '#pause');
  const paused = await snapshot(page);
  await advance(page, 1000);
  assert.equal((await snapshot(page)).time, paused.time, '5× pause freezes time');
  assert.deepEqual(energy(await snapshot(page)), energy(paused), '5× pause freezes energy');
  await click(page, '#resume');
  await page.locator('#game-speed').selectOption('1');
  const resumed = await snapshot(page);
  await advance(page, 400);
  assert.ok(
    Math.abs((await snapshot(page)).time - resumed.time - 0.4) <= 0.04,
    'switching back to 1× has no accumulated catch-up steps',
  );

  await click(page, '#auto-fire');
  await page.locator('#game-speed').selectOption('5');
  const movement = keyboardMovement(page);
  let state = await snapshot(page);
  for (let turn = 0; state.phase === 'playing' && turn < 90; turn++) {
    const direction = steering(state);
    await movement.move(direction.x, direction.y);
    await advance(page, 100);
    state = await snapshot(page);
  }
  await movement.release();
  assert.equal(state.phase, 'upgrade', 'normal combat earns an experience choice at 5×');
  await inspectExperienceChoices(page, state);
  await advance(page, 1000);
  assert.equal((await snapshot(page)).time, state.time, '5× upgrade selection freezes time');
  assert.deepEqual(
    energy(await snapshot(page)),
    energy(state),
    '5× upgrade selection freezes energy',
  );
  await page.locator('#game-speed').selectOption('1');
  await settleExperienceChoices(page);
  const afterChoice = await snapshot(page);
  await advance(page, 400);
  assert.ok(
    Math.abs((await snapshot(page)).time - afterChoice.time - 0.4) <= 0.04,
    'upgrade resume at 1× does not replay paused time',
  );
  check(
    'native 1/2/3/5× selector, proportional time, frozen pause/XP choices and clean 1× resume',
    { measurements },
  );
  await context.close();
}
async function desktopControls() {
  const { context, page } = await setup();
  await click(page, '#ready-help');
  assert.equal(await page.locator('#help-panel').isVisible(), true);
  await click(page, '#close-help');
  const begun = await prepare(page);
  await advance(page, 1000);
  const timed = await snapshot(page);
  assert.equal(timed.kills, 0, 'first second isolates passive energy charging');
  assert.ok(timed.skillSlots[0].energy > begun.skillSlots[0].energy);
  const timeRate =
    (timed.skillSlots[0].energy - begun.skillSlots[0].energy) / (timed.time - begun.time);
  await click(page, slotSelector(0));
  assert.equal(
    await page.locator('body').getAttribute('data-armed'),
    'false',
    'uncharged slot cannot arm',
  );
  await page.keyboard.down('d');
  await advance(page, 500);
  await page.keyboard.up('d');
  assert.ok((await snapshot(page)).player.x > 790);
  await pauseAndRecovery(page);

  // Browsers may keep headless tabs visible, so record native focus behavior.
  await page.keyboard.down('d');
  const sibling = await context.newPage();
  await sibling.goto('about:blank');
  await sibling.bringToFront();
  await advance(page, 64);
  const focusState = await snapshot(page);
  report.nativeBackgroundSuspension = {
    phase: focusState.phase,
    hidden: await page.evaluate(() => document.hidden),
  };
  await sibling.close();
  await page.bringToFront();
  await page.keyboard.up('d');
  if (focusState.phase !== 'paused') {
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await advance(page, 32);
  }
  assert.equal((await snapshot(page)).phase, 'paused');
  await click(page, '#resume');

  await click(page, '#auto-fire');
  assert.equal(await page.locator('#auto-fire').getAttribute('aria-pressed'), 'false');
  const beforeFire = await snapshot(page);
  const field = await screenPoint(page, beforeFire, beforeFire.player.x + 80, beforeFire.player.y);
  await page.mouse.move(field.x, field.y);
  await page.mouse.down();
  await advance(page, 250);
  await page.mouse.up();
  await advance(page, 50);
  const released = await snapshot(page);
  assert.ok(
    released.stats.shots > beforeFire.stats.shots,
    'ordinary manual fire remains available',
  );
  assert.equal(released.controls.manualAim, false, 'mouse release restores automatic targeting');
  await advance(page, 400);
  assert.equal(
    (await snapshot(page)).stats.shots,
    released.stats.shots,
    'mouse release stops ordinary fire',
  );
  assert.equal(
    (await snapshot(page)).stats.skillCasts,
    0,
    'unarmed ground input never spends a skill',
  );
  await click(page, '#auto-fire');

  const charged = await chargeNaturally(page, keyboardMovement(page), timeRate);
  assert.ok(charged.killChargeObserved, 'a natural kill adds energy beyond elapsed-time charging');
  await advance(page, 500);
  await settleExperienceChoices(page);
  assert.deepEqual(
    energy(await snapshot(page)),
    [100, 100],
    'full charge persists until manual release',
  );
  await click(page, slotSelector(0));
  assert.equal(await page.locator('body').getAttribute('data-armed'), 'true');
  await page.keyboard.press('Escape');
  await advance(page, 32);
  assert.equal((await snapshot(page)).phase, 'playing', 'Escape cancels targeting before pausing');
  assert.equal(await page.locator('body').getAttribute('data-armed'), 'false');
  assert.deepEqual(energy(await snapshot(page)), [100, 100]);
  await click(page, slotSelector(0));
  await click(page, slotSelector(0));
  assert.equal(
    await page.locator('body').getAttribute('data-armed'),
    'false',
    'second slot click cancels',
  );
  await click(page, slotSelector(0));
  await click(page, '#cancel-cast');
  assert.deepEqual(energy(await snapshot(page)), [100, 100], 'explicit cancel preserves charge');

  let state = await snapshot(page);
  const nearest = steering(state).nearest;
  let target = await screenPoint(
    page,
    state,
    nearest?.x || state.player.x - 60,
    nearest?.y || state.player.y,
  );
  const targetElement = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.id,
    target,
  );
  // Different map collision/spawn routes may place the nearest enemy behind a
  // HUD control. This checks input release on accessible ground, independently
  // of the full challenge's enemy targeting and damage assertions.
  if (targetElement !== 'arena') {
    target = await screenPoint(page, state, state.player.x - 60, state.player.y);
    report.desktopCastTarget = {
      occludedEnemy: targetElement ?? null,
      fallback: 'ground beside player',
    };
  }
  assert.equal(
    await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, target),
    'arena',
    'manual release targets accessible battlefield',
  );
  await page.keyboard.press('1');
  await advance(page, 32);
  assert.equal(
    await page.locator('body').getAttribute('data-armed'),
    'true',
    'number key arms slot one before pointer confirmation',
  );
  assert.equal((await snapshot(page)).phase, 'playing');
  await page.mouse.move(target.x, target.y);
  await page.mouse.click(target.x, target.y, { button: 'right' });
  await advance(page, 800);
  state = await settleExperienceChoices(page);
  assert.equal(state.stats.skillCasts, 1, 'armed right-click manually releases slot one');
  assert.ok(state.skillSlots[0].energy < 100);
  assert.equal(state.skillSlots[1].energy, 100, 'other slot keeps its charge');
  await click(page, slotSelector(1));
  await click(page, '#pause');
  const paused = await snapshot(page);
  assert.equal(await page.locator('body').getAttribute('data-armed'), 'false');
  await advance(page, 1000);
  assert.deepEqual(energy(await snapshot(page)), energy(paused));
  await click(page, '#resume');
  const unarmedTarget = await screenPoint(
    page,
    await snapshot(page),
    state.player.x,
    state.player.y,
  );
  await page.mouse.click(unarmedTarget.x, unarmedTarget.y);
  await advance(page, 64);
  assert.equal(
    (await snapshot(page)).stats.skillCasts,
    1,
    'resume cannot commit abandoned targeting',
  );
  await click(page, slotSelector(1));
  await page.keyboard.press('e');
  await advance(page, 100);
  await settleExperienceChoices(page);
  assert.equal((await snapshot(page)).stats.skillCasts, 2, 'E confirms a selected charged skill');
  assertTerrainUnlocked(await snapshot(page));
  await page.screenshot({ path: `${output}/desktop-skills.png` });
  check(
    'preparation, time/kill energy, ordinary fire, two skill slots, arm/confirm/cancel and pause release',
  );

  await click(page, '#pause');
  await click(page, '#restart');
  assert.equal((await snapshot(page)).phase, 'ready', 'restart returns to preparation');
  await click(page, '#start');
  state = await snapshot(page);
  assert.equal(state.player.hp, state.player.maxHp);
  assert.equal(state.kills, 0);
  assert.equal(state.stats.skillCasts, 0);
  assert.ok(energy(state).every((value) => value < 1));
  assert.deepEqual(state.boons, [], 'restart clears every acquired terrain boon');
  assertTerrainUnlocked(state);
  check('restart retains only active skill choices and clears boons, terrain, health and energy');
  await context.close();
}

async function touchControls(width, height) {
  const { context, page } = await setup({
    viewport: { width, height },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  });
  const skills = height > width ? ['cart', 'horse'] : ['gale', 'laser'];
  await prepare(page, skills);
  const cdp = await context.newCDPSession(page);
  await chargeNaturally(page, await touchMovement(page, cdp));
  await advance(page, 50);
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
  const rect = await page.locator('#joystick').boundingBox();
  const j = {
    id: 1,
    x: rect.x + rect.width * 0.25,
    y: rect.y + rect.height * 0.5,
    radiusX: 8,
    radiusY: 8,
    force: 1,
  };
  const field =
    height > width ? { x: width * 0.68, y: height * 0.35 } : { x: width * 0.59, y: height * 0.42 };
  assert.equal(
    await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, field),
    'arena',
    'touch target is unobstructed',
  );
  const f = { id: 2, ...field, radiusX: 8, radiusY: 8, force: 1 };
  await page.touchscreen.tap(field.x, field.y);
  await advance(page, 32);
  assert.equal(
    (await snapshot(page)).stats.skillCasts,
    0,
    'unarmed field tap never auto-casts a full skill',
  );
  await click(page, slotSelector(0));
  assert.equal(await page.locator('body').getAttribute('data-armed'), 'true');
  const initial = await snapshot(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [j] });
  await advance(page, 250);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [j, f] });
  await advance(page, 100);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [j, { ...f, x: f.x + 12 }],
  });
  await advance(page, 50);
  // CDP lists the point being released here; keep the joystick contact active.
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [{ ...f, x: f.x + 12 }],
  });
  await advance(page, 300);
  let state = await snapshot(page);
  assert.ok(state.player.x < initial.player.x - 35, 'joystick continues during the field gesture');
  assert.equal(
    state.stats.skillCasts,
    1,
    `field release commits once: ${JSON.stringify(await page.evaluate(() => window.__touchEvidence))}`,
  );
  assert.ok(state.skillSlots[0].energy < 100);
  assert.equal(state.skillSlots[1].energy, 100);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await advance(page, 50);
  await settleExperienceChoices(page);
  const stopped = await snapshot(page);
  await advance(page, 200);
  state = await snapshot(page);
  assert.equal(state.player.x, stopped.player.x, 'touchcancel releases joystick');
  assert.equal(state.player.y, stopped.player.y);

  await click(page, slotSelector(1));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [f] });
  await advance(page, 64);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await advance(page, 200);
  state = await snapshot(page);
  assert.equal(state.stats.skillCasts, 1, 'cancelled aiming gesture does not spend energy');
  assert.equal(state.skillSlots[1].energy, 100);
  assert.equal(
    await page.locator('body').getAttribute('data-armed'),
    'false',
    'cancelled gesture clears targeting',
  );
  await click(page, slotSelector(1));
  await click(page, '#pause');
  const paused = await snapshot(page);
  await advance(page, 1000);
  assert.deepEqual(energy(await snapshot(page)), energy(paused));
  await click(page, '#resume');
  assert.equal(await page.locator('body').getAttribute('data-armed'), 'false');
  await click(page, slotSelector(1));
  await page.touchscreen.tap(field.x, field.y);
  await advance(page, 150);
  assert.equal(
    (await snapshot(page)).stats.skillCasts,
    2,
    'second skill has its own manual release',
  );
  await settleExperienceChoices(page);
  await click(page, '#dash');
  assert.ok((await snapshot(page)).player.dashCooldown > 0);
  const evidence = await page.evaluate(() => window.__touchEvidence);
  assert.equal(evidence.maximum, 2);
  assert.ok(evidence.events.filter((event) => event.type === 'pointercancel').length >= 2);
  assertTerrainUnlocked(await snapshot(page));
  await page.screenshot({ path: `${output}/touch-${width}x${height}.png` });
  check(
    `touch ${width}×${height}: prepare, charge, move + aim/release, cancel, pause, two skills, dash`,
    { skills, maximumConcurrentPointers: evidence.maximum },
  );
  await context.close();
}

async function fullChallenge() {
  const { context, page } = await setup();
  await prepare(page, ['blast', 'laser']);
  const movement = keyboardMovement(page);
  let snapshots = 0,
    maxPlants = 0,
    maxEnemies = 0,
    captures = 0,
    latestUnownedTime = 0;
  const upgradeSelections = [],
    seenTerrain = new Set();
  let state = await snapshot(page);
  while (['playing', 'upgrade'].includes(state.phase) && snapshots < 1700) {
    if (state.phase === 'upgrade') {
      await movement.release();
      const before = state;
      await inspectExperienceChoices(page, state);
      await advance(page, 1000);
      assert.equal((await snapshot(page)).time, before.time, 'upgrade choice freezes combat');
      assert.deepEqual(
        energy(await snapshot(page)),
        energy(before),
        'upgrade choice freezes charging',
      );
      const preferred = [
        ...(!state.upgrades.includes('multishot') ? ['multishot'] : []),
        'boon-shrub',
        'boon-poison',
        'boon-frost',
        'boon-trench',
        'attack-power',
        'attack-speed',
        'multishot',
        'burst-shot',
        'fire-shot',
        'ice-shot',
        'wild-heart',
        'terrain-heart',
        'energy-cycle',
      ];
      const eligible =
        upgradeSelections.length === 0
          ? state.upgradeChoices.filter((id) => !id.startsWith('boon-'))
          : state.upgradeChoices;
      const selected = preferred.find((id) => eligible.includes(id)) || eligible[0];
      assert.ok(selected, 'the first XP choice offers a non-boon upgrade to verify zero terrain');
      if (
        !upgradeSelections.some(
          (selection) => selection.choices.length === state.upgradeChoices.length,
        )
      ) {
        await page.screenshot({
          path: `${output}/desktop-upgrade-${state.upgradeChoices.length}-choices.png`,
        });
        if (state.upgradeChoices.length === 4) {
          for (const [width, height] of [
            [390, 844],
            [844, 390],
          ]) {
            await page.setViewportSize({ width, height });
            await advance(page, 64);
            await inspectExperienceChoices(page, state);
            assert.equal(
              (await snapshot(page)).time,
              before.time,
              'responsive upgrade inspection remains paused',
            );
            await page.screenshot({ path: `${output}/upgrade-4-choices-${width}x${height}.png` });
          }
          await page.setViewportSize({ width: 1440, height: 900 });
          await advance(page, 64);
          check('four-choice experience upgrade fits portrait and landscape viewports');
        }
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
      if (selected.startsWith('boon-'))
        assert.ok(state.boons.includes(selected.slice(5)), 'upgrade acquires its named terrain');
      if (upgradeSelections.length === 1) {
        assert.deepEqual(state.boons, [], 'selecting a non-boon XP card grants no terrain');
        assert.equal(state.stats.plantsGrown, 0);
        await page.screenshot({ path: `${output}/desktop-non-boon-upgrade.png` });
        check('first natural XP upgrade chooses a non-boon card and still grants no terrain', {
          selected,
          time: state.time,
          boons: state.boons,
          plantsGrown: state.stats.plantsGrown,
        });
      }
      assertTerrainUnlocked(state);
      continue;
    }
    const direction = steering(state);
    await movement.move(direction.x, direction.y);
    const nearest = direction.nearest;
    if (nearest && state.skillCooldown <= 0) {
      const slot = state.skillSlots.findIndex((item) => item.energy >= SKILLS[item.kind].energyMax);
      if (slot >= 0) {
        const skill = SKILLS[state.skillSlots[slot].kind];
        const nx = state.player.x - nearest.x,
          ny = state.player.y - nearest.y;
        const distance = Math.hypot(nx, ny);
        if (distance > 20 && distance <= skill.range) {
          const lead = skill.id === 'blast' ? Math.min(32, distance / 3) : 0;
          const point = await screenPoint(
            page,
            state,
            nearest.x + (nx / distance) * lead,
            nearest.y + (ny / distance) * lead,
          );
          const unobstructed = await page.evaluate(
            ({ x, y }) => document.elementFromPoint(x, y)?.id === 'arena',
            point,
          );
          if (unobstructed) {
            await page.keyboard.press(String(slot + 1));
            await page.mouse.click(point.x, point.y, { button: 'right' });
          }
        }
      }
    }
    await advance(page, 250);
    state = await snapshot(page);
    snapshots++;
    assertTerrainUnlocked(state);
    if (state.boons.length === 0) latestUnownedTime = state.time;
    state.plants.forEach((plant) => seenTerrain.add(plant.kind));
    maxPlants = Math.max(maxPlants, state.plants.length);
    maxEnemies = Math.max(maxEnemies, state.enemies.length);
    if (
      state.wave >= 5 &&
      captures === 0 &&
      state.plants.length >= 3 &&
      state.enemies.length >= 4
    ) {
      await page.screenshot({ path: `${output}/desktop-wave-${state.wave}.png` });
      captures++;
    }
    if (snapshots % 120 === 0)
      console.log(
        `RUN ${state.time.toFixed(1)}s wave=${state.wave} hp=${state.player.hp} kills=${state.kills} skills=${state.stats.skillCasts} boons=${state.boons.join(',')}`,
      );
  }
  await movement.release();
  report.challenge = {
    result: state.phase,
    seconds: state.time,
    hp: state.player.hp,
    wave: state.wave,
    kills: state.kills,
    stats: state.stats,
    maxPlants,
    maxEnemies,
    boons: state.boons,
    seenTerrain: [...seenTerrain],
    latestUnownedTime,
    upgradeSelections,
  };
  await page.screenshot({ path: `${output}/desktop-result.png` });
  assert.equal(state.phase, 'won', `natural-health victory: ${JSON.stringify(report.challenge)}`);
  assert.equal(Math.round(state.time), 300);
  assert.ok(upgradeSelections.length >= 4, 'kills grant repeated experience upgrades');
  assert.ok(upgradeSelections.some((selection) => selection.choices.length === 3));
  assert.ok(upgradeSelections.some((selection) => selection.choices.length === 4));
  assert.ok(!upgradeSelections[0].selected.startsWith('boon-'));
  assert.ok(
    latestUnownedTime > upgradeSelections[0].time + 1,
    'ordinary play after a non-boon upgrade remains terrain-free until a boon is chosen',
  );
  assert.ok(
    upgradeSelections.some(({ selected }) => selected.startsWith('boon-')),
    'only a real experience upgrade unlocks passive terrain',
  );
  assert.ok(
    state.stats.skillCasts >= 5 && state.stats.skillDamage > 0 && state.stats.skillKills > 0,
    'manual skills contribute to natural victory',
  );
  assert.ok(
    state.stats.plantsGrown > 0 && state.stats.terrainDamage > 0,
    'selected passive terrain contributes',
  );
  for (const boon of state.boons)
    assert.ok(
      seenTerrain.has(BOONS[boon].kind),
      `acquired ${boon} appears naturally after its interval`,
    );
  assert.equal(await page.locator('#result-title').textContent(), '花园，生生不息。');
  check(
    'five-minute victory, experience upgrades, manually targeted skills and acquired-only terrain',
    report.challenge,
  );
  await click(page, '#play-again');
  assert.equal((await snapshot(page)).phase, 'ready');
  await click(page, '#start');
  const replay = await snapshot(page);
  assert.equal(replay.phase, 'playing');
  assert.equal(replay.player.hp, replay.player.maxHp);
  assert.equal(replay.stats.skillCasts, 0);
  assert.ok(energy(replay).every((value) => value < 1));
  assert.deepEqual(replay.boons, [], 'replay resets all run-only boon upgrades');
  assertTerrainUnlocked(replay);
  check('result replay returns to preparation and resets run-only unlocks and energy');
  await context.close();
}

try {
  if (!process.env.QA_ONLY || ['speed', 'controls'].includes(process.env.QA_ONLY))
    await speedControls();
  if (!process.env.QA_ONLY || ['desktop', 'controls'].includes(process.env.QA_ONLY))
    await desktopControls();
  if (!process.env.QA_ONLY || ['touch', 'controls'].includes(process.env.QA_ONLY)) {
    await touchControls(390, 844);
    await touchControls(844, 390);
  }
  if (!process.env.QA_ONLY || process.env.QA_ONLY === 'challenge') await fullChallenge();
  assert.deepEqual(errors, [], 'no browser JavaScript or console errors');
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

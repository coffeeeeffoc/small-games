/** Homepage and progressive onboarding acceptance for the current campaign.
 * Native controls + virtual animation frames + read-only snapshots. The natural
 * first clear has no fixtures. An explicit advanced-save fixture exercises skills
 * that new players have not unlocked; no simulation state/actions are injected.
 * PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_PATH=/usr/bin/chromium
 * GAME_URL=http://127.0.0.1:4420 QA_ONLY=desktop|natural|touch|skills|dev
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { LEVELS, SKILLS } from '../src/config.mjs';
import { createProfile, levelFromXp } from '../src/progression.mjs';
const selection = process.env.QA_ONLY || 'all';
assert.ok(
  ['all', 'desktop', 'natural', 'touch', 'skills', 'dev'].includes(selection),
  `Unknown QA_ONLY=${selection}; use all, desktop, natural, touch, skills, or dev`,
);
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
    : '@playwright/test'
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const output = process.env.QA_OUTPUT || '/tmp/bullet-garden-home-qa';
await mkdir(output, { recursive: true });
const report = {
  date: new Date().toISOString(),
  browser: await browser.version(),
  url: process.env.GAME_URL || 'http://127.0.0.1:4420',
  selection,
  checks: [],
  errors: [],
  passed: false,
};
const campaign = Object.values(LEVELS).sort((a, b) => a.order - b.order);
const snapshot = (page) => page.evaluate(() => window.__bulletGarden.snapshot());
const saved = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('bullet-garden.profile.v1')));
const advance = (page, milliseconds) => page.clock.runFor(milliseconds);
function check(name, detail = {}) {
  report.checks.push({ name, ...detail });
  console.log(`PASS ${name}`, JSON.stringify(detail));
}
async function setup({ width = 1440, height = 900, touch = false, fixture, query = '' } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: touch,
    isMobile: touch,
    deviceScaleFactor: 1,
  });
  if (fixture)
    await context.addInitScript((profile) => {
      if (!localStorage.getItem('bullet-garden.profile.v1'))
        localStorage.setItem('bullet-garden.profile.v1', JSON.stringify(profile));
    }, fixture);
  const page = await context.newPage();
  page.on('pageerror', (error) => report.errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') report.errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`);
  });
  await page.clock.install({ time: new Date('2026-10-05T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-05T00:00:01Z'));
  await page.goto(`${report.url}/${query}`);
  await advance(page, 96);
  return { page, context, touch };
}
async function click(session, selector) {
  const locator = session.page.locator(selector);
  await locator.scrollIntoViewIfNeeded();
  const rect = await locator.boundingBox();
  assert.ok(rect, `visible control ${selector}`);
  if (session.touch)
    await session.page.touchscreen.tap(rect.x + rect.width / 2, rect.y + rect.height / 2);
  else await session.page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await advance(session.page, 64);
}
async function verifyPauseIcon(page) {
  const icon = await page.locator('#pause').evaluate((button) => ({
    label: button.getAttribute('aria-label'),
    bars: [...button.querySelectorAll('svg rect')].map((rect) => ({
      x: rect.x.baseVal.value,
      y: rect.y.baseVal.value,
      width: rect.width.baseVal.value,
      height: rect.height.baseVal.value,
      fill: getComputedStyle(rect).fill,
      renderedWidth: rect.getBoundingClientRect().width,
    })),
  }));
  assert.equal(icon.label, '暂停');
  assert.equal(icon.bars.length, 2);
  const [a, b] = icon.bars;
  assert.equal(a.width, b.width);
  assert.equal(a.height, b.height);
  assert.equal(a.y, b.y);
  assert.ok(a.height > a.width && a.x + a.width < b.x);
  for (const bar of icon.bars) {
    assert.notEqual(bar.fill, 'none');
    assert.ok(bar.renderedWidth > 0);
  }
  return icon;
}
async function inspectCampaign(session) {
  const stages = [];
  do {
    stages.push(
      ...(await session.page
        .locator('[data-level]')
        .evaluateAll((buttons) =>
          buttons.map((button) => ({ id: button.dataset.level, enabled: !button.disabled })),
        )),
    );
    if (
      !(await session.page.locator('#campaign-next').isVisible()) ||
      (await session.page.locator('#campaign-next').isDisabled())
    )
      break;
    await click(session, '#campaign-next');
  } while (stages.length <= campaign.length);
  while (
    (await session.page.locator('#campaign-previous').isVisible()) &&
    !(await session.page.locator('#campaign-previous').isDisabled())
  )
    await click(session, '#campaign-previous');
  return stages;
}
async function desktop() {
  const session = await setup(),
    { page, context } = session;
  assert.equal((await snapshot(page)).phase, 'ready');
  assert.equal(await page.locator('#dev-controls').isVisible(), false);
  for (const key of ['monsters', 'boons', 'weapons', 'skills', 'journey', 'plants']) {
    await click(session, `[data-catalog="${key}"]`);
    assert.equal(await page.locator('#catalog-panel').isVisible(), true);
    assert.ok((await page.locator('#catalog-panel').innerText()).length > 30);
    await click(session, '#close-catalog');
    assert.equal(await page.locator('#ready-panel').isVisible(), true);
  }
  await page.screenshot({ path: `${output}/desktop-home.png` });
  await click(session, '#ready-campaign');
  const stages = await inspectCampaign(session);
  assert.deepEqual(
    stages.map((stage) => stage.id),
    campaign.map((stage) => stage.id),
  );
  assert.equal(stages.filter((stage) => stage.enabled).length, 1);
  assert.equal(await page.locator(`[data-level="${campaign[0].id}"]`).isEnabled(), true);
  assert.equal(await page.locator(`[data-level="${campaign[1].id}"]`).isDisabled(), true);
  await page.screenshot({ path: `${output}/desktop-campaign.png` });
  await click(session, '#close-campaign');
  await click(session, '#ready-shop');
  assert.equal(await page.locator('[data-purchase="pet"]').isDisabled(), true);
  assert.equal(await page.locator('[data-purchase="weaponPierce"]').isDisabled(), true);
  await click(session, '#close-shop');
  assert.equal(await page.locator('#fullscreen').isVisible(), true);
  await click(session, '#fullscreen');
  assert.equal(await page.evaluate(() => Boolean(document.fullscreenElement)), true);
  await click(session, '#fullscreen');
  assert.equal(await page.evaluate(() => Boolean(document.fullscreenElement)), false);
  await click(session, '#start');
  const initial = await snapshot(page);
  assert.equal(initial.phase, 'playing');
  assert.deepEqual(initial.skillSlots, [], 'first-level player has no energy mechanics');
  assert.equal(await page.locator('.skill-dock').isVisible(), false);
  await page.keyboard.down('d');
  await advance(page, 450);
  await page.keyboard.up('d');
  assert.ok((await snapshot(page)).player.x > initial.player.x + 50);
  const pauseIcon = await verifyPauseIcon(page);
  await click(session, '#pause');
  const paused = await snapshot(page);
  await advance(page, 2000);
  assert.equal((await snapshot(page)).time, paused.time);
  await click(session, '#pause-home');
  assert.equal((await snapshot(page)).phase, 'ready');
  assert.deepEqual((await saved(page)).completed, []);
  await click(session, '#start');
  await click(session, '#battle-home');
  assert.equal((await snapshot(page)).phase, 'ready');
  check(
    'six homepage catalogs, complete campaign locks, progressive growth, fullscreen, native movement and home controls',
    { stages: campaign.length, pauseIcon },
  );
  await context.close();
}
async function chooseBasic(session) {
  const state = await snapshot(session.page);
  const id =
    ['attack-power', 'attack-speed', 'wild-heart'].find((entry) =>
      state.upgradeChoices.includes(entry),
    ) ?? state.upgradeChoices[0];
  assert.ok(id);
  await click(session, `[data-upgrade="${id}"]`);
  return { id, choices: state.upgradeChoices, time: state.time };
}
async function finishFirstStage(session) {
  const { page } = session,
    held = new Set(),
    monsters = new Set(),
    selections = [];
  let state = await snapshot(page),
    ticks = 0;
  async function release() {
    for (const key of held) await page.keyboard.up(key);
    held.clear();
  }
  async function move(x, y) {
    const desired = new Set(),
      threshold = Math.max(Math.abs(x), Math.abs(y)) * 0.35;
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
  while (['playing', 'upgrade'].includes(state.phase) && ticks < 500) {
    if (state.phase === 'upgrade') {
      await release();
      selections.push(await chooseBasic(session));
      state = await snapshot(page);
      continue;
    }
    for (const enemy of state.enemies) monsters.add(enemy.kind);
    const nearest = [...state.enemies].sort(
      (a, b) =>
        Math.hypot(a.x - state.player.x, a.y - state.player.y) -
        Math.hypot(b.x - state.player.x, b.y - state.player.y),
    )[0];
    const angle = state.time * 0.2;
    const target =
      state.time >= state.duration && nearest
        ? nearest
        : { x: 720 + 350 * Math.cos(angle), y: 450 + 170 * Math.sin(angle) };
    let x = target.x - state.player.x,
      y = target.y - state.player.y;
    const magnitude = Math.max(1, Math.hypot(x, y));
    x /= magnitude;
    y /= magnitude;
    if (nearest) {
      const nx = nearest.x - state.player.x,
        ny = nearest.y - state.player.y,
        distance = Math.hypot(nx, ny);
      if (distance > 0 && distance < 110) {
        x -= (nx / distance) * 2;
        y -= (ny / distance) * 2;
      }
    }
    await move(x, y);
    await advance(page, 250);
    state = await snapshot(page);
    ticks += 1;
  }
  await release();
  const outcome = {
    result: state.phase,
    duration: state.duration,
    time: state.time,
    hp: state.player.hp,
    kills: state.kills,
    monsters: [...monsters],
    stats: state.stats,
    selections,
  };
  assert.equal(state.phase, 'won', JSON.stringify(outcome));
  assert.equal(state.duration, 60);
  assert.ok(state.time >= state.duration);
  assert.equal(
    state.enemies.filter((enemy) => enemy.hp > 0).length,
    0,
    'all remaining enemies are cleared',
  );
  assert.deepEqual([...monsters], ['sprout']);
  return outcome;
}
async function natural() {
  const session = await setup(),
    { page, context } = session;
  assert.equal(await saved(page), null, 'natural campaign has no injected save');
  await click(session, '#start');
  const opening = await snapshot(page);
  assert.deepEqual(opening.skillSlots, []);
  const outcome = await finishFirstStage(session);
  assert.ok(outcome.selections.length <= 2, 'onboarding presents a small number of basic choices');
  assert.ok(
    outcome.selections.every((choice) =>
      choice.choices.every((id) =>
        ['attack-power', 'attack-speed', 'wild-heart', 'boon-shrub'].includes(id),
      ),
    ),
  );
  await page.screenshot({ path: `${output}/natural-result.png` });
  let profile = await saved(page);
  assert.deepEqual(profile.completed, [campaign[0].id]);
  assert.ok(levelFromXp(profile.xp).level >= 2);
  const awardedXp = profile.xp,
    awardedCoins = profile.coins;
  await click(session, '#result-home');
  await click(session, '#ready-campaign');
  assert.match(await page.locator(`[data-level="${campaign[0].id}"]`).innerText(), /已通关/);
  assert.equal(await page.locator(`[data-level="${campaign[1].id}"]`).isEnabled(), true);
  assert.equal(await page.locator(`[data-level="${campaign[2].id}"]`).isDisabled(), true);
  await page.screenshot({ path: `${output}/natural-unlocked.png` });
  await click(session, `[data-level="${campaign[1].id}"]`);
  assert.equal((await snapshot(page)).levelId, campaign[1].id);
  await page.reload();
  await advance(page, 96);
  profile = await saved(page);
  assert.deepEqual(profile.completed, [campaign[0].id]);
  assert.equal(profile.xp, awardedXp);
  assert.equal(profile.coins, awardedCoins);
  assert.equal((await snapshot(page)).levelId, campaign[1].id);
  await click(session, '#start');
  const second = await snapshot(page);
  assert.equal(second.phase, 'playing');
  assert.equal(second.levelId, campaign[1].id);
  assert.ok(second.skillSlots.length >= 1, 'earned player level introduces energy');
  check(
    'natural one-monster 60-second clear, bounded basic choices, real rewards, next unlock and reload persistence',
    { ...outcome, earnedXp: awardedXp, earnedCoins: awardedCoins },
  );
  await context.close();
}
async function touch(width, height) {
  const session = await setup({ width, height, touch: true }),
    { page, context } = session;
  const dimensions = await page.locator('#game').evaluate((game) => ({
    width: game.clientWidth,
    height: game.clientHeight,
    rotated: game.dataset.rotated === 'true',
  }));
  assert.deepEqual(dimensions, {
    width: Math.max(width, height),
    height: Math.min(width, height),
    rotated: height > width,
  });
  await page.screenshot({ path: `${output}/home-${width}x${height}.png` });
  await click(session, '[data-catalog="monsters"]');
  assert.equal(await page.locator('#catalog-panel').isVisible(), true);
  await click(session, '#close-catalog');
  await click(session, '#start');
  assert.equal((await snapshot(page)).skillSlots.length, 0);
  assert.equal(await page.locator('#fullscreen').isVisible(), true);
  const pauseIcon = await verifyPauseIcon(page);
  const cdp = await context.newCDPSession(page);
  async function points() {
    const stick = await page.locator('#joystick').boundingBox();
    const j = {
      id: 1,
      x: stick.x + stick.width * (dimensions.rotated ? 0.5 : 0.75),
      y: stick.y + stick.height * (dimensions.rotated ? 0.75 : 0.5),
      radiusX: 8,
      radiusY: 8,
      force: 1,
    };
    const field = await page.locator('#game').evaluate((game) => {
      const rect = game.getBoundingClientRect();
      for (const fx of [0.65, 0.6, 0.7])
        for (const fy of [0.43, 0.35, 0.5]) {
          const x = game.clientWidth * fx,
            y = game.clientHeight * fy;
          const point =
            game.dataset.rotated === 'true'
              ? { x: rect.right - y, y: rect.top + x }
              : { x: rect.left + x, y: rect.top + y };
          if (document.elementFromPoint(point.x, point.y)?.id === 'arena') return point;
        }
      return null;
    });
    assert.ok(field, 'battlefield directly accepts touch');
    return { j, f: { id: 2, ...field, radiusX: 8, radiusY: 8, force: 1 } };
  }
  await page.evaluate(() => {
    window.__touchEvidence = { active: [], maximum: 0, cancellations: 0 };
    for (const type of ['pointerdown', 'pointerup', 'pointercancel'])
      document.addEventListener(
        type,
        (event) => {
          if (event.pointerType !== 'touch') return;
          const log = window.__touchEvidence;
          if (type === 'pointerdown') log.active.push(event.pointerId);
          else log.active = log.active.filter((id) => id !== event.pointerId);
          if (type === 'pointercancel') log.cancellations += 1;
          log.maximum = Math.max(log.maximum, log.active.length);
        },
        true,
      );
  });
  const { j, f } = await points(),
    initial = await snapshot(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [j] });
  await advance(page, 250);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [j, f] });
  await advance(page, 100);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [f] });
  await advance(page, 250);
  const moved = await snapshot(page);
  assert.ok(moved.player.x > initial.player.x + 50);
  assert.ok(Math.abs(moved.player.y - initial.player.y) < 2);
  assert.equal(moved.stats.skillCasts, 0, 'unarmed field input does not invent skills');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await advance(page, 64);
  const released = await snapshot(page);
  await advance(page, 250);
  assert.equal((await snapshot(page)).player.x, released.player.x);
  assert.equal((await snapshot(page)).player.y, released.player.y);
  const evidence = await page.evaluate(() => window.__touchEvidence);
  assert.equal(evidence.maximum, 2);
  assert.ok(evidence.cancellations > 0);
  await click(session, '#dash');
  assert.ok((await snapshot(page)).player.dashCooldown > 0);
  await page.screenshot({ path: `${output}/battle-${width}x${height}.png` });
  await click(session, '#pause');
  await click(session, '#pause-home');
  assert.equal((await snapshot(page)).phase, 'ready');
  check(
    `native touch onboarding ${width}×${height}: rotated axes, dual touch, cancellation, dash and home`,
    { dimensions, evidence, pauseIcon },
  );
  await context.close();
}
async function unlockedSkillTouch() {
  const fixture = createProfile({
    xp: 2290,
    completed: campaign.map((level) => level.id),
    selectedLevelId: campaign[1].id,
    upgrades: { health: 6, armor: 3 },
  });
  const session = await setup({ width: 390, height: 844, touch: true, fixture }),
    { page, context } = session;
  await click(session, '#start');
  let state = await snapshot(page),
    attempts = 0;
  assert.equal(state.skillSlots.length, 2, 'advanced save has both skill slots');
  while (
    !state.skillSlots.some((slot) => slot.energy >= SKILLS[slot.kind].energyMax) &&
    attempts < 150
  ) {
    if (state.phase === 'upgrade') await chooseBasic(session);
    else await advance(page, 250);
    state = await snapshot(page);
    attempts += 1;
    assert.ok(
      ['playing', 'upgrade'].includes(state.phase),
      'native charging scene remains playable',
    );
  }
  if (state.phase === 'upgrade') {
    await chooseBasic(session);
    state = await snapshot(page);
  }
  // Stop ordinary fire through its visible control so a fresh XP modal cannot
  // interrupt the pointer sequence; already-fired shots settle normally.
  await click(session, '#auto-fire');
  for (let settle = 0; settle < 6; settle += 1) {
    if ((await snapshot(page)).phase === 'upgrade') await chooseBasic(session);
    await advance(page, 250);
  }
  if ((await snapshot(page)).phase === 'upgrade') await chooseBasic(session);
  state = await snapshot(page);
  const slot = state.skillSlots.findIndex((entry) => entry.energy >= SKILLS[entry.kind].energyMax);
  assert.ok(slot >= 0, 'skill charges through actual combat/time');
  await click(session, `[data-skill-slot="${slot}"]`);
  assert.equal((await snapshot(page)).controls.armed, true);
  const cdp = await context.newCDPSession(page);
  const point = await page.locator('#game').evaluate((game) => {
    const r = game.getBoundingClientRect();
    return { x: r.right - game.clientHeight * 0.43, y: r.top + game.clientWidth * 0.64 };
  });
  assert.equal(
    await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, point),
    'arena',
  );
  const f = { id: 2, ...point, radiusX: 8, radiusY: 8, force: 1 };
  const before = await snapshot(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [f] });
  await advance(page, 64);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await advance(page, 64);
  assert.equal(
    (await snapshot(page)).stats.skillCasts,
    before.stats.skillCasts,
    'cancelled aim preserves the charged skill',
  );
  if (!(await snapshot(page)).controls.armed) await click(session, `[data-skill-slot="${slot}"]`);
  const stick = await page.locator('#joystick').boundingBox();
  const j = {
    id: 1,
    x: stick.x + stick.width * 0.5,
    y: stick.y + stick.height * 0.75,
    radiusX: 8,
    radiusY: 8,
    force: 1,
  };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [j] });
  await advance(page, 100);
  assert.ok((await snapshot(page)).controls.moveX > 0, 'charged skill can be aimed while moving');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [j, f] });
  await advance(page, 100);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [f] });
  await advance(page, 96);
  assert.equal(
    (await snapshot(page)).stats.skillCasts,
    before.stats.skillCasts + 1,
    `charged release while moving (${(await snapshot(page)).phase})`,
  );
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await advance(page, 64);
  assert.equal((await snapshot(page)).controls.moveX, 0);
  await page.screenshot({ path: `${output}/unlocked-skill-touch.png` });
  check(
    'advanced-save fixture: real energy charging, native skill arming, cancel without spend and concurrent move/cast',
    { fixture: true, skill: before.skillSlots[slot].kind, chargedAt: before.time },
  );
  await context.close();
}
async function developer() {
  const session = await setup({ query: '?dev=1' }),
    { page, context } = session;
  assert.equal(await page.locator('#dev-controls').isVisible(), true);
  await click(session, '#ready-campaign');
  assert.equal(
    (await inspectCampaign(session)).filter((stage) => stage.enabled).length,
    campaign.length,
  );
  await click(session, '#close-campaign');
  await click(session, '#dev-controls summary');
  await page.locator('#dev-weather').selectOption('rain');
  const map = await page
    .locator('#dev-map option')
    .evaluateAll((options) => options.find((option) => option.value)?.value);
  assert.ok(map);
  await page.locator('#dev-map').selectOption(map);
  await page.locator('#loadout-skill-0').selectOption('blast');
  await page.locator('#loadout-skill-1').selectOption('laser');
  await click(session, '#start');
  const opening = await snapshot(page);
  assert.equal(opening.developerRun, true);
  assert.equal(opening.weather.kind, 'rain');
  assert.equal(opening.mapId, map, 'dev map choice configures actual terrain');
  assert.deepEqual(
    opening.skillSlots.map((slot) => slot.kind),
    ['blast', 'laser'],
  );
  const outcome = await finishFirstStage(session);
  const profile = await saved(page);
  assert.deepEqual(profile.completed, []);
  assert.equal(profile.xp, 0);
  assert.equal(profile.coins, 0);
  await click(session, '#result-home');
  await page.goto(`${report.url}/?runtime=minigame`);
  await advance(page, 96);
  assert.equal(await page.locator('#fullscreen').isVisible(), false);
  assert.equal(await page.locator('#dev-controls').isVisible(), false);
  check(
    'dev-only manual weather/map/skill settings, all-stage access, no clear rewards, and no mini-game fullscreen',
    { outcome, map },
  );
  await context.close();
}
try {
  if (selection === 'all' || selection === 'desktop') await desktop();
  if (selection === 'all' || selection === 'natural') await natural();
  if (selection === 'all' || selection === 'touch') {
    await touch(390, 844);
    await touch(844, 390);
    await unlockedSkillTouch();
  }
  if (selection === 'skills') await unlockedSkillTouch();
  if (selection === 'all' || selection === 'dev') await developer();
  assert.deepEqual(report.errors, [], 'no browser errors or missing runtime assets');
  report.passed = true;
} catch (error) {
  report.failure = error.stack;
  throw error;
} finally {
  await writeFile(`${output}/home-browser-report.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  console.log(`Evidence: ${output}/home-browser-report.json`);
}

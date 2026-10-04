// Historical manual-preparation UI regression. Current campaign/home acceptance
// is tests/home-browser.mjs (npm test:browser / test:campaign-browser).
/** Campaign browser acceptance with native controls and a read-only snapshot.
 * Saved-profile fixtures cover unlocked menus/maps and storage denial only.
 * The separate natural scenario starts without a save, wins the original level,
 * receives real rewards, purchases growth, and enters the newly unlocked map.
 * PLAYWRIGHT_MODULE=/tmp/.../@playwright/test/index.mjs CHROMIUM_PATH=/usr/bin/chromium
 * GAME_URL=http://127.0.0.1:4410 QA_OUTPUT=/tmp/... QA_ONLY=ui|natural|all
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { LEVELS, BOONS, SKILLS } from '../src/config.mjs';
import { createProfile } from '../src/progression.mjs';

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
const output = process.env.QA_OUTPUT ?? '/tmp/bullet-garden-campaign-browser';
await mkdir(output, { recursive: true });
const campaign = Object.values(LEVELS).sort((a, b) => a.order - b.order);
const storageKey = 'bullet-garden.profile.v1';
const checks = [],
  errors = [];
const report = {
  date: new Date().toISOString(),
  browser: await browser.version(),
  url: process.env.GAME_URL ?? 'http://127.0.0.1:4410',
  policy:
    'native keyboard/mouse/CDP touch; read-only simulation snapshot; fixtures explicitly separated from natural victory',
  checks,
  errors,
};
const snapshot = (page) => page.evaluate(() => window.__bulletGarden.snapshot());
const savedProfile = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
const advance = (page, ms) => page.clock.runFor(ms);
function check(name, detail = {}) {
  checks.push({ name, ...detail });
  console.log(`PASS ${name}`, JSON.stringify(detail));
}

async function setup({
  width = 1440,
  height = 900,
  touch = false,
  fixture = null,
  denySave = false,
} = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: touch,
    isMobile: touch,
    deviceScaleFactor: 1,
  });
  if (fixture || denySave)
    await context.addInitScript(
      ({ fixture, key, denySave }) => {
        if (fixture && !localStorage.getItem(key))
          localStorage.setItem(key, JSON.stringify(fixture));
        if (denySave)
          Object.defineProperty(Storage.prototype, 'setItem', {
            configurable: true,
            value() {
              throw new DOMException('QA denied persistence', 'QuotaExceededError');
            },
          });
      },
      { fixture, key: storageKey, denySave },
    );
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('requestfailed', (request) =>
    errors.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`),
  );
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.clock.install({ time: new Date('2026-10-04T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-04T00:00:01Z'));
  await page.goto(report.url);
  await advance(page, 64);
  return { context, page, touch };
}

async function click(session, selector) {
  const locator = session.page.locator(selector);
  await locator.scrollIntoViewIfNeeded();
  const rect = await locator.boundingBox();
  assert.ok(rect, `visible ${selector}`);
  if (session.touch)
    await session.page.touchscreen.tap(rect.x + rect.width / 2, rect.y + rect.height / 2);
  else await session.page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await advance(session.page, 32);
}

async function noOverflow(page) {
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true,
    'no page horizontal overflow',
  );
}

async function campAndTouch(width, height) {
  const fixture = createProfile({ xp: 115, coins: 180, completed: ['ruins'] });
  const session = await setup({ width, height, touch: true, fixture });
  const { page, context } = session;
  assert.equal((await snapshot(page)).phase, 'ready');
  await click(session, '#ready-shop');
  assert.equal(await page.locator('[data-purchase="pet"]').isDisabled(), true);
  assert.equal(await page.locator('[data-purchase="weaponPierce"]').isDisabled(), true);
  assert.equal(
    await page.locator('[data-growth="attack"] .shop-values').isVisible(),
    true,
    'current/next values visible',
  );
  await click(session, '[data-purchase="attack"]');
  await click(session, '[data-purchase="health"]');
  let saved = await savedProfile(page);
  assert.equal(saved.coins, 115);
  assert.equal(saved.upgrades.attack, 1);
  assert.equal(saved.upgrades.health, 1);
  await noOverflow(page);
  await page.screenshot({ path: `${output}/shop-${width}x${height}.png` });
  await click(session, '#close-shop');
  await page.reload();
  await advance(page, 64);
  assert.equal((await snapshot(page)).player.maxHp, 115);
  assert.equal((await snapshot(page)).profile.upgrades.attack, 1);
  await click(session, '#ready-campaign');
  assert.equal(await page.locator('[data-level]').count(), 11);
  assert.equal(await page.locator('[data-level="meadow"]').isDisabled(), false);
  assert.equal(await page.locator('[data-level="wetland"]').isDisabled(), true);
  await noOverflow(page);
  await page.screenshot({ path: `${output}/campaign-${width}x${height}.png` });
  await click(session, '[data-level="meadow"]');
  assert.equal((await snapshot(page)).levelId, 'meadow');
  assert.equal((await snapshot(page)).phase, 'ready');
  await page.locator('#loadout-skill-0').selectOption('blast');
  await page.locator('#loadout-skill-1').selectOption('laser');
  await click(session, '#start');
  assert.equal((await snapshot(page)).player.hp, 115, 'purchased health applies on departure');
  assert.deepEqual(
    (await snapshot(page)).boons,
    [],
    'departure has no automatically granted terrain',
  );
  assert.deepEqual(
    (await snapshot(page)).skillSlots.map((slot) => slot.kind),
    ['blast', 'laser'],
  );

  const cdp = await context.newCDPSession(page);
  const stick = await page.locator('#joystick').boundingBox();
  assert.ok(stick);
  const j = {
    id: 1,
    x: stick.x + stick.width * 0.76,
    y: stick.y + stick.height * 0.5,
    radiusX: 8,
    radiusY: 8,
    force: 1,
  };
  const field = await page.evaluate(() => {
    for (const x of [innerWidth * 0.7, innerWidth * 0.6, innerWidth * 0.8])
      for (const y of [innerHeight * 0.32, innerHeight * 0.4, innerHeight * 0.48])
        if (document.elementFromPoint(x, y)?.id === 'arena') return { x, y };
    return null;
  });
  assert.ok(field, 'battlefield accepts direct touch input');
  const f = { id: 2, ...field, radiusX: 8, radiusY: 8, force: 1 };
  const before = await snapshot(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [j] });
  await advance(page, 250);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [j, f] });
  await advance(page, 80);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [j] });
  await advance(page, 450);
  const planted = await snapshot(page);
  assert.ok(planted.player.x > before.player.x + 30, 'joystick moves during field tap');
  assert.equal(planted.stats.skillCasts, 0, 'unarmed second touch aims without spending a skill');
  assert.equal(planted.stats.plantsGrown, 0, 'ground tapping cannot grant passive terrain');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await advance(page, 50);
  const released = await snapshot(page);
  await advance(page, 250);
  assert.equal((await snapshot(page)).player.x, released.player.x);
  assert.equal((await snapshot(page)).player.y, released.player.y);
  await click(session, '#pause');
  const paused = await snapshot(page);
  await advance(page, 2000);
  assert.equal((await snapshot(page)).time, paused.time);
  await page.screenshot({ path: `${output}/pause-${width}x${height}.png` });
  await click(session, '#resume');
  await click(session, '[data-skill-slot="1"]');
  assert.equal((await snapshot(page)).selectedSkill, 1);
  assert.equal(
    await page.locator('body').getAttribute('data-armed'),
    'false',
    'uncharged skill cannot arm',
  );
  await click(session, '#dash');
  assert.ok((await snapshot(page)).player.dashCooldown > 0);
  await page.screenshot({ path: `${output}/battle-${width}x${height}.png` });
  await noOverflow(page);
  check(`saved-profile camp + native dual-touch ${width}x${height}`, {
    fixture: true,
    wallet: saved.coins,
    attackRank: 1,
    healthRank: 1,
  });
  await context.close();
}

async function storageFailure() {
  const session = await setup({ fixture: createProfile({ coins: 100 }), denySave: true });
  await click(session, '#ready-shop');
  await click(session, '[data-purchase="attack"]');
  assert.equal(
    (await snapshot(session.page)).profile.upgrades.attack,
    1,
    'purchase remains effective in memory',
  );
  assert.equal(
    (await savedProfile(session.page)).upgrades.attack,
    0,
    'denied save does not claim persistence',
  );
  assert.equal(await session.page.locator('#save-status').isVisible(), true);
  assert.match(await session.page.locator('#save-status').textContent(), /未保存/);
  await click(session, '#close-shop');
  await click(session, '#start');
  await advance(session.page, 1000);
  assert.equal((await snapshot(session.page)).phase, 'playing');
  check('storage denial reports unsaved progress while retaining playable memory state', {
    fixture: true,
  });
  await session.context.close();
}

async function mapPreviews() {
  const session = await setup({
    fixture: createProfile({ xp: 1000, completed: campaign.map((level) => level.id) }),
  });
  const previews = [];
  for (const level of campaign) {
    await click(session, '#ready-campaign');
    await click(session, `[data-level="${level.id}"]`);
    const state = await snapshot(session.page);
    assert.equal(state.levelId, level.id);
    assert.equal(state.phase, 'ready');
    assert.equal(state.weather.kind, level.weather.kind);
    await session.page.screenshot({
      path: `${output}/map-${String(level.order).padStart(2, '0')}-${level.id}.png`,
    });
    previews.push({
      id: level.id,
      weather: state.weather,
      encounter: level.encounter?.kind ?? null,
    });
  }
  assert.equal(previews.length, 11);
  check('all 11 unlocked-map previews render through native campaign selection', {
    fixture: true,
    previews,
  });
  await session.context.close();
}

// Use public renderer geometry on a plain object; no live canvas or state edits.
async function project(page, state, point) {
  return page.evaluate(
    async ({ state, point }) => {
      const { GardenRenderer } = await import(new URL('src/renderer.mjs', document.baseURI).href);
      const rect = document.getElementById('arena').getBoundingClientRect();
      const geometry = { width: rect.width, height: rect.height, camera: { x: 720, y: 450 } };
      GardenRenderer.prototype.updateCamera.call(geometry, state);
      const result = GardenRenderer.prototype.worldToScreen.call(geometry, point.x, point.y);
      return { x: result.x + rect.left, y: result.y + rect.top };
    },
    { state, point },
  );
}

async function playNativeBattle(session, { tickMs = 250, captureEncounter = false } = {}) {
  const { page } = session;
  const held = new Set();
  const selections = [];
  let encounterCapture = null,
    responsiveCaptured = false;
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
  let state = await snapshot(page),
    snapshots = 0;
  while (['playing', 'upgrade'].includes(state.phase) && snapshots < 1500) {
    if (state.phase === 'upgrade') {
      for (const key of held) await page.keyboard.up(key);
      held.clear();
      if (!responsiveCaptured && state.upgradeChoices.length === 4) {
        const viewport = page.viewportSize();
        for (const [width, height] of [
          [390, 844],
          [844, 390],
        ]) {
          await page.setViewportSize({ width, height });
          await advance(page, 32);
          for (const card of await page.locator('[data-upgrade]').all()) {
            const rect = await card.boundingBox();
            assert.ok(
              rect &&
                rect.x >= 0 &&
                rect.y >= 0 &&
                rect.x + rect.width <= width + 1 &&
                rect.y + rect.height <= height + 1,
              'four XP upgrade cards fit the mobile viewport',
            );
          }
          assert.equal((await snapshot(page)).time, state.time);
          await page.screenshot({
            path: `${output}/${state.levelId}-upgrade-4-${width}x${height}.png`,
          });
        }
        await page.setViewportSize(viewport);
        await advance(page, 32);
        responsiveCaptured = true;
      }
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
        selections.length === 0
          ? state.upgradeChoices.filter((id) => !id.startsWith('boon-'))
          : state.upgradeChoices;
      const id = preferred.find((id) => eligible.includes(id)) ?? eligible[0];
      selections.push({ id, time: state.time, choices: state.upgradeChoices });
      await click(session, `[data-upgrade="${id}"]`);
      state = await snapshot(page);
      continue;
    }
    const angle = state.time * 0.28;
    let dx = 720 + 470 * Math.cos(angle) - state.player.x;
    let dy = 450 + 235 * Math.sin(angle) - state.player.y;
    const distanceToTarget = Math.max(1, Math.hypot(dx, dy));
    dx /= distanceToTarget;
    dy /= distanceToTarget;
    const nearest = state.enemies.reduce(
      (best, enemy) =>
        !best ||
        Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y) <
          Math.hypot(best.x - state.player.x, best.y - state.player.y)
          ? enemy
          : best,
      null,
    );
    if (nearest) {
      const nx = nearest.x - state.player.x,
        ny = nearest.y - state.player.y;
      const distance = Math.hypot(nx, ny);
      if (distance > 0 && distance < 125) {
        dx -= (nx / distance) * 2;
        dy -= (ny / distance) * 2;
      }
      if (state.skillCooldown <= 0 && distance > 20) {
        const slot = state.skillSlots.findIndex(
          (entry) => entry.energy >= SKILLS[entry.kind].energyMax,
        );
        if (slot >= 0 && distance <= SKILLS[state.skillSlots[slot].kind].range) {
          const lead = state.skillSlots[slot].kind === 'blast' ? Math.min(32, distance / 3) : 0;
          const point = {
            x: nearest.x - (nx / distance) * lead,
            y: nearest.y - (ny / distance) * lead,
          };
          const screen = await project(page, state, point);
          if (
            await page.evaluate(
              ({ x, y }) => document.elementFromPoint(x, y)?.id === 'arena',
              screen,
            )
          ) {
            await page.keyboard.press(String(slot + 1));
            await page.mouse.click(screen.x, screen.y, { button: 'right' });
          }
        }
      }
    }
    await movement(dx, dy);
    await advance(page, tickMs);
    state = await snapshot(page);
    snapshots += 1;
    assert.ok(state.enemies.length <= LEVELS[state.levelId].spawn.maxEnemies);
    assert.ok(state.plants.length <= state.plantCap);
    assert.ok(
      state.plants.every((plant) => state.boons.some((id) => BOONS[id].kind === plant.kind)),
    );
    assert.ok(state.skillSlots.every((slot) => slot.energy >= 0 && slot.energy <= 300));
    if (
      captureEncounter &&
      !encounterCapture &&
      state.encounter.spawned &&
      !state.encounter.defeated
    ) {
      const enemy = state.enemies.find((entry) => entry.id === state.encounter.enemyId);
      if (enemy) {
        encounterCapture = {
          kind: enemy.kind,
          rank: enemy.rank,
          hp: enemy.hp,
          time: state.time,
          fixture: true,
        };
        await page.screenshot({ path: `${output}/encounter-${state.levelId}.png` });
      }
    }
    if (snapshots % 120 === 0)
      console.log(
        `NATIVE ${state.levelId} ${state.time.toFixed(1)}s hp=${state.player.hp} kills=${state.kills}`,
      );
  }
  for (const key of held) await page.keyboard.up(key);
  return { state, selections, encounterCapture, responsiveCaptured };
}

async function naturalVictoryAndProgression() {
  const session = await setup();
  const { page } = session;
  assert.equal(await savedProfile(page), null, 'natural challenge starts with no profile fixture');
  await page.locator('#loadout-skill-0').selectOption('blast');
  await page.locator('#loadout-skill-1').selectOption('laser');
  await click(session, '#start');
  const battle = await playNativeBattle(session);
  let state = battle.state;
  const selections = battle.selections;
  report.naturalRun = {
    result: state.phase,
    time: state.time,
    hp: state.player.hp,
    kills: state.kills,
    stats: state.stats,
    selections,
    runId: state.runId,
  };
  await page.screenshot({ path: `${output}/natural-result.png` });
  assert.equal(state.phase, 'won', 'normal-health native-input first-level victory');
  assert.ok(state.time >= state.duration);
  assert.equal(state.enemies.filter((enemy) => enemy.hp > 0).length, 0);
  assert.ok(selections.length >= 4, 'combat XP causes repeated real upgrade choices');
  assert.ok(selections.some((selection) => selection.choices.length === 3));
  assert.ok(selections.some((selection) => selection.choices.length === 4));
  assert.ok(!selections[0].id.startsWith('boon-'));
  assert.ok(state.stats.plantsGrown > 0 && state.stats.terrainDamage > 0);
  assert.ok(state.stats.skillCasts >= 5 && state.stats.skillDamage > 0);
  let saved = await savedProfile(page);
  assert.deepEqual(saved.completed, ['ruins']);
  assert.equal(saved.coins, LEVELS.ruins.rewards.coins + state.coins);
  assert.equal(saved.xp, LEVELS.ruins.rewards.xp);
  const beforePurchase = saved.coins;
  await click(session, '#result-home');
  await click(session, '#ready-shop');
  await click(session, '[data-purchase="attack"]');
  saved = await savedProfile(page);
  assert.equal(saved.coins, beforePurchase - 35);
  assert.equal(saved.upgrades.attack, 1);
  await page.screenshot({ path: `${output}/natural-earned-upgrade.png` });
  await click(session, '#close-shop');
  await click(session, '#ready-campaign');
  await click(session, '[data-level="meadow"]');
  state = await snapshot(page);
  assert.equal(state.levelId, 'meadow');
  assert.equal(state.phase, 'ready');
  assert.equal(state.profile.upgrades.attack, 1);
  const expectedWallet = saved.coins;
  await page.reload();
  await advance(page, 64);
  state = await snapshot(page);
  assert.equal(state.levelId, 'meadow');
  assert.equal(state.profile.coins, expectedWallet, 'reload cannot claim the completed run again');
  assert.deepEqual(state.profile.completed, ['ruins']);
  await click(session, '#start');
  await advance(page, 1000);
  assert.equal((await snapshot(page)).phase, 'playing');
  await page.screenshot({ path: `${output}/natural-next-level.png` });
  check('natural first clear → exact reward → paid growth → next map → reload persistence', {
    fixture: false,
    wallet: expectedWallet,
    kills: report.naturalRun.kills,
    hp: report.naturalRun.hp,
  });
  await session.context.close();
}

async function encounterScenes() {
  // Legitimate advanced-save fixture, explicitly distinct from the real first
  // clear. Combat still uses normal HP, energy, enemies and native input.
  const fixture = createProfile({
    xp: 2290,
    completed: campaign.map((level) => level.id),
    upgrades: {
      attack: 6,
      fireRate: 4,
      health: 6,
      armor: 3,
      seedMastery: 3,
      pet: 1,
      weaponDamage: 2,
      weaponRate: 1,
      weaponPierce: 1,
    },
  });
  report.encounters = [];
  for (const levelId of ['quarry', 'bastion', 'heartgarden']) {
    const session = await setup({ fixture: { ...fixture, selectedLevelId: levelId } });
    await session.page.locator('#loadout-skill-0').selectOption('blast');
    await session.page.locator('#loadout-skill-1').selectOption('laser');
    await click(session, '#start');
    await session.page.locator('#game-speed').selectOption('5');
    const battle = await playNativeBattle(session, { tickMs: 100, captureEncounter: true });
    assert.ok(battle.encounterCapture, 'required enemy appears in actual native-input combat');
    assert.equal(battle.state.phase, 'won');
    assert.equal(battle.state.encounter.defeated, true);
    report.encounters.push({
      levelId,
      fixture: true,
      savedProfile: fixture,
      capture: battle.encounterCapture,
      result: battle.state.phase,
      hp: battle.state.player.hp,
    });
    check(`native combat encounters ${levelId}`, {
      fixture: true,
      kind: battle.encounterCapture.kind,
      hp: battle.state.player.hp,
    });
    await session.context.close();
  }
}

try {
  if (!process.env.QA_ONLY || ['all', 'ui'].includes(process.env.QA_ONLY)) {
    await campAndTouch(390, 844);
    await campAndTouch(844, 390);
    await storageFailure();
    await mapPreviews();
  }
  if (!process.env.QA_ONLY || ['all', 'natural'].includes(process.env.QA_ONLY))
    await naturalVictoryAndProgression();
  if (['all', 'encounters'].includes(process.env.QA_ONLY)) await encounterScenes();
  assert.deepEqual(errors, [], 'no browser, resource or network errors');
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

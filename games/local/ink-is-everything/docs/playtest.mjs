import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { attachRewardHandler } from './playtest-rewards.mjs';
import {
  Player,
  snapshot,
  project,
  distance,
  sleep,
  fitsViewport,
  checkPauseIcon,
  clearSegment,
} from './playtest-driver.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const url = process.env.GAME_URL || 'http://127.0.0.1:4412/';
const pressureOnly = process.argv.includes('--pressure-only');
const desktopOnly = process.argv.includes('--desktop-only');
const output = new URL('./screenshots/', import.meta.url);
await mkdir(output, { recursive: true });
const report = {
  version: 3,
  url,
  date: new Date().toISOString(),
  mode: pressureOnly ? 'low-positive-ink-recovery' : 'real-input-chapter-regression',
  input: 'Public mouse, keyboard and native touch; snapshots and world projection read-only',
  cases: [],
  screenshots: [],
  errors: [],
  status: 'running',
};
let browser;
function monitor(page, label) {
  page.on('pageerror', (error) => report.errors.push(`${label}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') report.errors.push(`${label}: ${message.text()}`);
  });
  page.on('response', (response) => {
    if (response.url().startsWith(url) && response.status() >= 400)
      report.errors.push(`${label}: HTTP ${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', (request) => {
    if (!request.failure()?.errorText.includes('ERR_ABORTED'))
      report.errors.push(`${label}: ${request.failure()?.errorText} ${request.url()}`);
  });
}
async function capture(page, name) {
  const filename = `v3-${pressureOnly ? 'pressure-' : ''}${name}.png`;
  await page.screenshot({ path: fileURLToPath(new URL(filename, output)), fullPage: false });
  report.screenshots.push(`screenshots/${filename}`);
}
async function freshPlayer(label, mobile = false, storageDisabled = false) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 },
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: 1,
  });
  if (storageDisabled)
    await context.addInitScript(() => {
      for (const method of ['getItem', 'setItem', 'removeItem'])
        Object.defineProperty(Storage.prototype, method, {
          value() {
            throw new DOMException('Storage disabled for test', 'SecurityError');
          },
        });
    });
  const page = await context.newPage();
  monitor(page, label);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__inkGame));
  const player = new Player(page, context, mobile);
  await player.init();
  attachRewardHandler(player, report, capture);
  return player;
}
async function start(player) {
  await player.tap('#start-game');
  await fitsViewport(player.page);
  const state = await snapshot(player.page);
  assert.equal(state.version, 3, 'Do not report the previous v2 build as tested');
  assert.equal(Object.hasOwn(state.player, 'hp'), false, 'Ink is the only survival pool');
  assert.equal(Object.hasOwn(state.player, 'maxHp'), false);
  return state;
}
async function pulseShot(player) {
  await player.page.waitForFunction(() => window.__inkGame.snapshot().player.shootCd <= 0);
  const before = await snapshot(player.page);
  await player.tap('#fire');
  await player.page.waitForFunction(
    (shots) => window.__inkGame.snapshot().stats.shots > shots,
    before.stats.shots,
  );
  return { before, after: await snapshot(player.page) };
}
async function resourceLoop(player) {
  const page = player.page;
  const first = await snapshot(page);
  const shot = await pulseShot(player);
  assert.equal(
    shot.after.stats.spent.attack - shot.before.stats.spent.attack,
    first.definition.rules.attackCost,
  );
  assert.equal(shot.after.player.ink, shot.before.player.ink - first.definition.rules.attackCost);
  const projectile = shot.after.projectiles.find((projectile) => projectile.owner === 'player');
  assert.ok(projectile);
  player.baseProjectileDamage = projectile.damage;
  const initialDrops = shot.after.pickups.filter((pickup) => pickup.kind === 'reclaim');
  assert.equal(initialDrops.length, 1, 'One shot scatters one reclaimable drop');
  const beforeNova = await snapshot(page);
  await player.nova();
  await page.waitForFunction(
    (count) => window.__inkGame.snapshot().stats.skillsUsed > count,
    beforeNova.stats.skillsUsed,
  );
  const afterNova = await snapshot(page);
  assert.equal(
    afterNova.stats.spent.nova - beforeNova.stats.spent.nova,
    first.definition.rules.novaCost,
  );
  assert.equal(afterNova.player.ink, beforeNova.player.ink - first.definition.rules.novaCost);
  assert.equal(
    afterNova.pickups.filter((pickup) => pickup.kind === 'reclaim').length,
    initialDrops.length + 2,
  );
  const reclaimBefore = afterNova.stats.reclaimed;
  await sleep(page, 750);
  const stationary = await snapshot(page);
  assert.equal(
    stationary.stats.reclaimed,
    reclaimBefore,
    'Standing still must not swallow freshly generated drops',
  );
  assert.ok(
    stationary.stats.lifeStolen > first.stats.lifeStolen,
    'The actual opening projectile hit must restore ink through life steal',
  );
  const drop = stationary.pickups
    .filter((pickup) => pickup.kind === 'reclaim')
    .sort((a, b) => distance(a, stationary.player) - distance(b, stationary.player))[0];
  assert.ok(drop);
  await player.moveTo(drop, { radius: 12 });
  await sleep(page, 150);
  const reclaimed = await snapshot(page);
  assert.ok(
    reclaimed.stats.reclaimed > reclaimBefore,
    'Moving over the skill drop must restore the same survival pool',
  );
  await capture(page, player.mobile ? 'mobile-resource-loop' : 'desktop-resource-loop');
  report.cases.push({
    name: `${player.mobile ? 'Touch' : 'Desktop'} single ink/life pool: shot and nova costs, physical spill, stationary non-collection, walking reclamation and actual-hit life steal`,
    status: 'passed',
    shotCost: first.definition.rules.attackCost,
    novaCost: first.definition.rules.novaCost,
    inkAfterSkills: afterNova.player.ink,
    lifeStolen: stationary.stats.lifeStolen,
    reclaimed: reclaimed.stats.reclaimed,
  });
}
async function bridgeAndBoundary(player) {
  const page = player.page;
  await player.moveTo({ x: 480, y: 225 });
  let before = await snapshot(page);
  await player.nova();
  await page.waitForFunction(
    (count) => window.__inkGame.snapshot().stats.skillsUsed > count,
    before.stats.skillsUsed,
  );
  let after = await snapshot(page);
  const drops = after.pickups.filter(
    (pickup) => pickup.kind === 'reclaim' && pickup.skillId === 'nova',
  );
  assert.equal(drops.length, 2);
  for (const drop of drops) {
    assert.ok(
      clearSegment(after.rooms.arrival, after.player, drop, 8),
      'A pre-bridge skill drop cannot cross a pit or wall',
    );
    await player.moveTo(drop, { radius: 12 });
  }
  assert.ok((await snapshot(page)).stats.reclaimed > before.stats.reclaimed);
  await player.moveTo({ x: 480, y: 242 });
  before = await snapshot(page);
  const bridge = before.rooms.arrival.bridges[0],
    from = await project(page, bridge.from.x, bridge.from.y),
    to = await project(page, bridge.to.x, bridge.to.y);
  if (player.mobile) {
    await player.touch.down(5, from);
    await player.touch.move(5, to);
    await player.touch.cancel();
    assert.equal((await snapshot(page)).rooms.arrival.bridges[0].drawn, false);
    assert.equal((await snapshot(page)).player.ink, before.player.ink);
    await player.touch.down(5, from);
    for (let i = 1; i <= 14; i++)
      await player.touch.move(5, {
        x: from.x + ((to.x - from.x) * i) / 14,
        y: from.y + ((to.y - from.y) * i) / 14,
      });
    await player.touch.up(5);
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 14 });
    await page.mouse.up();
  }
  after = await snapshot(page);
  assert.equal(after.rooms.arrival.bridges[0].drawn, true);
  assert.equal(after.stats.spent.explore - before.stats.spent.explore, bridge.cost);
  await capture(page, player.mobile ? 'mobile-bridge' : 'desktop-bridge');
  report.cases.push({
    name: `${player.mobile ? 'Touch' : 'Desktop'} boundary skill drops stay reachable before drawing the bridge; completing the actual stroke pays ink and creates a usable route`,
    status: 'passed',
  });
}
async function journey(player, { reserve = 38, lowInkPressure = false } = {}) {
  const page = player.page;
  await player.clearRoom({ reserve });
  await player.pickupAll();
  await player.handleRewards();
  assert.ok(
    (await snapshot(page)).stats.killRestored > 0,
    'Real kills must restore ink separately from life steal',
  );
  await bridgeAndBoundary(player);
  await player.moveTo({ x: 480, y: 53 }, { expectedRoom: 'archive' });
  await player.clearRoom({ reserve });
  await player.pickupAll();
  await player.moveTo({ x: 480, y: 114 });
  await sleep(page, 250);
  await player.handleRewards();
  await player.pickupAll();
  assert.equal((await snapshot(page)).rooms.archive.objects[0].used, true);
  await player.moveTo({ x: 480, y: 546 }, { expectedRoom: 'arrival' });
  await player.moveTo({ x: 480, y: 270 });
  await player.moveTo({ x: 905, y: 300 }, { expectedRoom: 'sentinel' });
  await player.clearRoom({ reserve });
  await player.pickupAll();
  await player.handleRewards();
  assert.equal((await snapshot(page)).seals, 1);
  await player.moveTo({ x: 905, y: 300 }, { expectedRoom: 'market' });
  await player.tap('#pause');
  await player.tap('[data-menu="equipment"]');
  assert.equal(await page.locator('#modal').getAttribute('data-kind'), 'equipment');
  await capture(page, player.mobile ? 'mobile-equipment' : 'desktop-equipment');
  await player.tap('#modal-close');
  // In a cleared safe room, the actual next projectile exposes the equipped damage.
  const changedShot = await pulseShot(player);
  const equippedProjectile = changedShot.after.projectiles.find(
    (projectile) => projectile.owner === 'player',
  );
  assert.ok(equippedProjectile);
  assert.ok(
    equippedProjectile.damage > player.baseProjectileDamage,
    'Chosen equipment must alter a projectile actually fired in the game',
  );
  report.cases.push({
    name: `${player.mobile ? 'Touch' : 'Desktop'} both dropped equipment and level rewards were selected and changed actual projectile damage`,
    status: 'passed',
    beforeDamage: player.baseProjectileDamage,
    afterDamage: equippedProjectile.damage,
    rewards: player.rewardHistory,
  });
  let state = await snapshot(page);
  assert.ok(state.stats.levelsGained >= 1);
  assert.ok(player.rewardHistory.some((reward) => reward.source === 'level'));
  assert.ok(player.rewardHistory.some((reward) => reward.source !== 'level'));
  await capture(page, player.mobile ? 'mobile-growth' : 'desktop-growth');
  if (lowInkPressure) {
    // Deliberately spend down at a safe location, preserving the required one ink.
    const attackCost = state.definition.rules.attackCost;
    while ((await snapshot(page)).player.ink > attackCost + 1) {
      await pulseShot(player);
      await sleep(page, 430);
    }
    state = await snapshot(page);
    assert.ok(state.player.ink > 0 && state.player.ink <= attackCost + 1);
    await capture(page, 'mobile-low-positive-ink');
    const beforeDry = state;
    await player.controls(1, 0, null, false, true);
    await player.dash();
    await sleep(page, 300);
    await player.release();
    state = await snapshot(page);
    assert.ok(state.stats.freeAttacks > beforeDry.stats.freeAttacks);
    assert.ok(state.stats.dashes > beforeDry.stats.dashes);
    assert.equal(state.player.ink, beforeDry.player.ink);
    player.pressureStart = {
      ink: state.player.ink,
      lifeStolen: state.stats.lifeStolen,
      killRestored: state.stats.killRestored,
    };
    reserve = Infinity;
  }
  await player.moveTo({ x: 480, y: 53 }, { expectedRoom: 'warden' });
  await player.clearRoom({ reserve });
  await player.pickupAll();
  await player.handleRewards();
  assert.equal((await snapshot(page)).seals, 2);
  if (lowInkPressure) {
    state = await snapshot(page);
    assert.ok(state.stats.lifeStolen > player.pressureStart.lifeStolen);
    assert.ok(state.player.ink > player.pressureStart.ink);
    report.cases.push({
      name: 'Low positive ink pressure: free melee hits and kills recover survival ink while clearing the second guardian',
      status: 'passed',
      startingInk: player.pressureStart.ink,
      recoveredInk: state.player.ink,
    });
  }
  await player.moveTo({ x: 480, y: 546 }, { expectedRoom: 'market' });
  await player.moveTo({ x: 905, y: 300 }, { expectedRoom: 'gate' });
  await capture(page, player.mobile ? 'mobile-boss' : 'desktop-boss');
  await player.clearRoom({ reserve });
  await player.handleRewards();
  state = await snapshot(page);
  assert.equal(state.status, 'won');
  assert.ok(player.bossPhases.has(2));
  assert.ok(player.bossMoves.has('charge') && player.bossMoves.has('burst'));
  assert.ok(
    state.stats.lifeStolen > 0 && state.stats.killRestored > 0 && state.stats.reclaimed > 0,
  );
  assert.ok(state.stats.rewardsChosen >= 2 && state.stats.levelsGained >= 1);
  await fitsViewport(page);
  await capture(page, player.mobile ? 'mobile-victory' : 'desktop-victory');
  report.cases.push({
    name: `${player.mobile ? 'Touch' : 'Desktop'} full v3 chapter including resource combat, physical recovery, growth, both guardians and boss`,
    status: 'passed',
    stats: state.stats,
    finalInk: state.player.ink,
    level: state.progression.level,
    equipment: state.equipment,
    elapsedGameSeconds: state.time,
    observations: player.observations,
  });
}
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  if (!pressureOnly) {
    const desktop = await freshPlayer('desktop');
    await capture(desktop.page, 'desktop-opening');
    await checkPauseIcon(desktop.page);
    await start(desktop);
    await resourceLoop(desktop);
    await journey(desktop);
    await desktop.context.close();
  }
  if (!desktopOnly) {
    const mobile = await freshPlayer('mobile', true);
    await start(mobile);
    await resourceLoop(mobile);
    await journey(mobile, { reserve: pressureOnly ? Infinity : 42, lowInkPressure: pressureOnly });
    await mobile.context.close();
  }
  assert.deepEqual(report.errors, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack;
  process.exitCode = 1;
  if (browser)
    for (const context of browser.contexts())
      for (const page of context.pages())
        try {
          await page.screenshot({ path: '/tmp/ink-v3-playtest-failure.png' });
          report.failureSnapshot = await snapshot(page);
        } catch {}
} finally {
  await browser?.close();
  await writeFile(
    new URL(
      pressureOnly
        ? './playtest-pressure-report.json'
        : desktopOnly
          ? './playtest-desktop-report.json'
          : './playtest-report.json',
      import.meta.url,
    ),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(
    JSON.stringify(
      {
        status: report.status,
        cases: report.cases,
        errors: report.errors,
        failure: report.failure,
      },
      null,
      2,
    ),
  );
}

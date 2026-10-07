import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as Engine from '../engine.mjs';
import { getChapter } from '../content/chapters/index.mjs';
import { fight, walk } from '../tests/player-driver.mjs';
import { Player, Touches, center, distance, fitsViewport, checkPauseIcon, snapshot, project } from './playtest-driver.mjs';

// Repeatable browser checks use actual DOM / keyboard / native CDP touch input.
// Fixture saves are created with public Engine API and injected through normal storage.
// window.__inkGame is read only; no runtime state assignments or gameplay shortcuts.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const url = process.env.GAME_URL || 'http://127.0.0.1:4412/';
const output = new URL('./design/mobile-2026-10-06/', import.meta.url);
await mkdir(output, { recursive: true });
const report = {
  date: new Date().toISOString(), url,
  environment: 'Headless desktop Chromium with mobile viewport + touch emulation; not a physical phone',
  input: 'DOM taps, keyboard and CDP Input.dispatchTouchEvent; read-only snapshot/projection',
  fixtures: 'Custom chapter configurations and Engine.createGame/command/step/serializeGame; normal storage restore',
  build: process.env.QA_BUILD || 'Source files served by standalone server',
  shellUrl: process.env.SHELL_URL || null,
  cases: [], errors: [], resourceNotes: [], screenshots: [], status: 'running',
};
let browser;
const reportBasename = process.env.QA_REPORT_BASENAME || 'browser-report';
const storageKey = 'ink-is-everything:action-chapter:v3';
const neutralInput = { moveX: 0, moveY: 0, shoot: false, melee: false, drawing: false };
const monitor = (page, label) => {
  page.on('pageerror', error => report.errors.push(`${label}: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') {
      if (message.location().url.endsWith('/favicon.ico')) report.resourceNotes.push(`${label}: Optional Shell favicon.ico unavailable`);
      else report.errors.push(`${label}: ${message.text()}`);
    }
  });
};
async function capture(page, name) {
  const filename = `actual-${name}.png`;
  await page.screenshot({ path: fileURLToPath(new URL(filename, output)), fullPage: false });
  report.screenshots.push(filename);
}
async function run(name, work) {
  if (process.env.QA_CASE && !new RegExp(process.env.QA_CASE, 'i').test(name)) return;
  try {
    const detail = await work();
    report.cases.push({ name, status: 'passed', ...detail });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.cases.push({ name, status: 'failed', failure: error.stack });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}
function definition(kind) {
  const chapter = structuredClone(getChapter());
  chapter.id = `mobile-qa-${kind}`;
  chapter.title = `触屏回归 · ${kind}`;
  chapter.shortTitle = '触屏回归';
  chapter.description = '用于可重跑浏览器回归的合法测试小关。';
  chapter.requiredSeals = 0;
  chapter.start = 'qa';
  chapter.spawn = { x: 480, y: 300 };
  chapter.initial = { ink: kind === 'loss' ? 1 : 90, maxInk: 100 };
  const room = {
    id: 'qa', name: '试笔庭院', subtitle: '触屏回归', width: 960, height: 600,
    gridX: 0, gridY: 0, boundary: 33, enemySpawns: [], waves: [], objects: [],
    obstacles: [], bridges: [], portals: [], objective: '练习移动与攻击',
  };
  if (kind === 'reward' || kind === 'win') {
    room.enemySpawns = [{ type: 'blot', x: 530, y: 300, hp: 1, xp: 12,
      speed: 0, triggerRange: 0, damage: 0, ink: 0 }];
    room.clearReward = { gear: { pool: ['fine-nib', 'backflow-amber', 'ink-sac'], title: '自主拾取装备' } };
    room.rewardPosition = { x: 482, y: 300 };
    room.isFinal = kind === 'win';
  }
  if (kind === 'loss') {
    room.enemySpawns = [{ type: 'blot', x: 505, y: 300, hp: 100,
      speed: 0, damage: 100, triggerRange: 148, attackSpeed: 0,
      windupTime: 0.1, attackDuration: 0.3, recoverTime: 0.3 }];
  }
  chapter.rooms = [room];
  return chapter;
}
function saveFixture(chapter, { pending = false } = {}) {
  const state = Engine.createGame(chapter);
  assert.equal(Engine.command(state, { type: 'start' }).ok, true);
  if (pending) {
    for (let index = 0; index < 8; index++) Engine.step(state, { melee: true, aimX: 530, aimY: 300 }, 0.05);
    assert.equal(state.pendingRewards.length, 1);
    assert.equal(state.pickups.filter(item => item.kind === 'gear').length, 1);
  }
  const saved = Engine.serializeGame(state);
  assert.ok(Engine.restoreGame(saved, chapter), 'Fixture must satisfy save validation');
  return saved;
}
async function fresh(label, viewport = { width: 844, height: 390 }, options = {}) {
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  if (options.oldApi) await context.addInitScript(() => { delete Array.prototype.findLast; });
  if (options.rejectFullscreen) await context.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.reject(new DOMException('Denied by QA', 'NotAllowedError'));
    try { screen.orientation.lock = () => Promise.reject(new DOMException('Denied by QA', 'NotSupportedError')); } catch {}
  });
  if (options.noStorage) await context.addInitScript(() => {
    for (const method of ['getItem', 'setItem', 'removeItem']) Object.defineProperty(Storage.prototype, method, {
      value() { throw new DOMException('Storage unavailable for QA', 'SecurityError'); },
    });
  });
  if (options.fixture) {
    const chapter = definition(options.fixture);
    await context.route('**/content/chapters/index.mjs', async route => {
      const response = await route.fetch();
      const source = await response.text();
      assert.ok(source.includes('const definitions = [chapterOne];'));
      await route.fulfill({ response, body: source.replace('const definitions = [chapterOne];', `const definitions = [${JSON.stringify(chapter)}];`) });
    });
    if (!options.noStorage) {
      const saved = saveFixture(chapter, { pending: options.pending });
      await context.addInitScript(({ key, saved }) => {
        if (!sessionStorage.getItem('mobile-qa-initialized')) {
          localStorage.setItem(key, saved);
          sessionStorage.setItem('mobile-qa-initialized', '1');
        }
      }, { key: storageKey, saved });
    }
  }
  if (options.saved) await context.addInitScript(({ key, saved }) => { localStorage.setItem(key, saved); }, { key: storageKey, saved: options.saved });
  const page = await context.newPage();
  monitor(page, label);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__inkGame));
  return { context, page };
}
async function start(page) {
  await page.locator('#start-game').tap();
  await page.waitForFunction(() => window.__inkGame.snapshot().status === 'playing');
  await fitsViewport(page);
}
async function logicalPoint(page, selector, dx, dy) {
  return page.locator(selector).evaluate((element, { dx, dy }) => {
    const rect = element.getBoundingClientRect();
    const rotated = document.querySelector('#game-root').dataset.rotated === 'true';
    return rotated ? { x: rect.x + rect.width / 2 - dy, y: rect.y + rect.height / 2 + dx }
      : { x: rect.x + rect.width / 2 + dx, y: rect.y + rect.height / 2 + dy };
  }, { dx, dy });
}
async function assertUsableCanvasPoint(page, point, label) {
  const geometry = await page.locator('#game-canvas').boundingBox();
  const viewport = page.viewportSize();
  assert.ok(point.x >= Math.max(10, geometry.x + 10) && point.x <= Math.min(viewport.width - 10, geometry.x + geometry.width - 10),
    `${label} must be horizontally visible and touchable: ${JSON.stringify(point)}`);
  assert.ok(point.y >= Math.max(10, geometry.y + 10) && point.y <= Math.min(viewport.height - 10, geometry.y + geometry.height - 10),
    `${label} must be vertically visible and touchable: ${JSON.stringify(point)}`);
  const logical = await page.locator('#game-canvas').evaluate((canvas, { x, y }) => {
    const rect = canvas.getBoundingClientRect();
    const rotated = document.querySelector('#game-root').dataset.rotated === 'true';
    return {
      y: rotated ? (rect.right - x) * canvas.clientHeight / rect.width : (y - rect.y) * canvas.clientHeight / rect.height,
      height: canvas.clientHeight,
    };
  }, point);
  assert.ok(logical.y >= 112 && logical.y <= logical.height - 70,
    `${label} stays below HUD/first hint and above thumb controls: ${JSON.stringify(logical)}`);
  assert.equal(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, point), 'game-canvas',
    `${label} must not be covered by HUD, controls or a dialog`);
}
async function touchMovement(page, context, { name, rotated = false } = {}) {
  const touch = new Touches(await context.newCDPSession(page));
  const stick = await center(page, '#joystick');
  const before = await snapshot(page);
  await touch.down(1, stick);
  await touch.move(1, await logicalPoint(page, '#joystick', 37, 0));
  await page.waitForTimeout(220);
  const moved = await snapshot(page);
  assert.ok(moved.player.x > before.player.x + 20, `Right movement maps correctly in ${name}`);
  assert.ok(Math.abs(moved.player.y - before.player.y) < 3, `Right input must not become vertical in ${name}`);
  await touch.down(2, await center(page, '#fire'));
  await touch.move(2, await logicalPoint(page, '#fire', 0, -35));
  await touch.down(3, await center(page, '#melee'));
  await page.waitForFunction(shots => window.__inkGame.snapshot().stats.shots >= shots + 2, moved.stats.shots);
  const firing = await snapshot(page);
  assert.ok(firing.stats.shots > moved.stats.shots);
  assert.ok(firing.stats.freeAttacks > moved.stats.freeAttacks);
  const shotCount = firing.stats.shots - moved.stats.shots;
  assert.equal(firing.stats.spent.attack - moved.stats.spent.attack, shotCount * firing.definition.rules.attackCost);
  assert.equal(firing.player.ink, moved.player.ink - shotCount * firing.definition.rules.attackCost, 'Melee remains free while ranged shots spend life ink');
  assert.ok(firing.player.x > moved.player.x + 15);
  assert.ok(firing.player.aimY < -0.8, 'Shot direction follows right thumb independently from horizontal movement');
  assert.ok(Math.abs(firing.player.aimX) < 0.2);
  assert.ok(firing.projectiles.some(shot => shot.owner === 'player' && shot.vy < -100));
  await touch.cancel();
  const cancelled = await snapshot(page);
  await page.waitForTimeout(200);
  const stopped = await snapshot(page);
  assert.deepEqual(stopped.input, neutralInput);
  assert.ok(distance(cancelled.player, stopped.player) < 2);
  assert.equal(stopped.stats.shots, cancelled.stats.shots);
  assert.equal(stopped.stats.freeAttacks, cancelled.stats.freeAttacks);
  // Resume after interruption must not inherit any held action.
  await touch.down(1, await center(page, '#joystick'));
  await touch.move(1, await logicalPoint(page, '#joystick', -37, 0));
  await touch.down(2, await center(page, '#fire'));
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForFunction(() => window.__inkGame.snapshot().paused);
  assert.deepEqual((await snapshot(page)).input, neutralInput);
  await touch.cancel();
  await page.locator('#resume').tap();
  const resumed = await snapshot(page);
  await page.waitForTimeout(180);
  const afterResume = await snapshot(page);
  assert.ok(distance(resumed.player, afterResume.player) < 2);
  assert.equal(afterResume.stats.shots, resumed.stats.shots);
  await touch.close();
  return { shots: firing.stats.shots, melee: firing.stats.freeAttacks, rotated };
}

try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  await run('Landscape homepage → stage picker → help → gameplay → pause/equipment → home', async () => {
    const { page, context } = await fresh('home');
    try {
      await fitsViewport(page);
      const dimensions = await page.locator('#game-root').evaluate(node => ({ width: node.clientWidth, height: node.clientHeight }));
      assert.ok(dimensions.width > dimensions.height);
      await capture(page, 'home-landscape');
      await page.locator('#choose-chapter').tap();
      await capture(page, 'chapters-landscape');
      assert.equal(await page.locator('#modal').getAttribute('data-kind'), 'chapters');
      await page.locator('[data-play-chapter]').first().tap();
      await page.waitForFunction(() => window.__inkGame.snapshot().status === 'playing' && !window.__inkGame.snapshot().paused);
      await page.locator('#pause').tap();
      await page.locator('[data-home]').tap();
      await page.locator('#home-help').tap();
      assert.equal(await page.locator('#modal').getAttribute('data-kind'), 'help');
      await capture(page, 'help-landscape');
      await page.locator('#modal-close').tap();
      await start(page);
      await checkPauseIcon(page);
      const ink = await page.locator('.ink-hud').boundingBox();
      assert.ok(ink.y < 64, 'Life ink belongs at the top');
      await capture(page, 'gameplay-landscape');
      await page.locator('#pause').tap();
      assert.equal((await snapshot(page)).paused, true);
      await capture(page, 'pause-landscape');
      const time = (await snapshot(page)).time;
      for (const key of ['Space', 'q', 'f', 'e']) await page.keyboard.press(key);
      await page.waitForTimeout(200);
      assert.equal((await snapshot(page)).time, time);
      await page.locator('[data-menu="equipment"], #pause-equipment').first().tap();
      assert.equal(await page.locator('#modal').getAttribute('data-kind'), 'equipment');
      await capture(page, 'equipment-landscape');
      await page.locator('#modal-close').tap();
      await page.locator('#pause').tap();
      await page.locator('[data-home], #pause-home').first().tap();
      await page.locator('#start-game').waitFor({ state: 'visible' });
      assert.equal((await snapshot(page)).paused, true);
      return { viewport: '844×390' };
    } finally { await context.close(); }
  });
  for (const [name, viewport] of [
    ['landscape', { width: 844, height: 390 }],
    ['portrait-rotation', { width: 390, height: 844 }],
    ['small-screen', { width: 568, height: 320 }],
  ]) await run(`${name}: move, aim opposite direction, ranged + melee, gesture cancel and blur`, async () => {
    const { page, context } = await fresh(name, viewport, { fixture: 'combat', oldApi: true, rejectFullscreen: true });
    try {
      const dimensions = await page.locator('#game-root').evaluate(node => ({ width: node.clientWidth, height: node.clientHeight, rotated: node.dataset.rotated }));
      assert.ok(dimensions.width > dimensions.height);
      await start(page);
      const result = await touchMovement(page, context, { name, rotated: viewport.width < viewport.height });
      await fitsViewport(page);
      return { viewport, logicalDimensions: dimensions, ...result, findLastRemoved: true };
    } finally { await context.close(); }
  });
  const bridgeGame = Engine.createGame(getChapter());
  Engine.command(bridgeGame, { type: 'start' });
  fight(bridgeGame, { preference: 'fine-nib' });
  walk(bridgeGame, { x: 480, y: 242 }, 3);
  const bridgeSave = Engine.serializeGame(bridgeGame);
  assert.ok(Engine.restoreGame(bridgeSave), 'Bridge save must come from legal API-driven play');
  for (const [name, viewport] of [
    ['landscape', { width: 844, height: 390 }],
    ['portrait', { width: 390, height: 844 }],
    ['small', { width: 568, height: 320 }],
  ]) await run(`${name}: both bridge anchors visible, native stroke cancellation then successful drawing`, async () => {
    const { page, context } = await fresh(`bridge-${name}`, viewport, { saved: bridgeSave });
    try {
      await start(page);
      await page.waitForTimeout(650);
      const before = await snapshot(page);
      const bridge = before.rooms.arrival.bridges[0];
      const from = await project(page, bridge.from.x, bridge.from.y);
      const to = await project(page, bridge.to.x, bridge.to.y);
      await assertUsableCanvasPoint(page, from, 'Bridge start anchor');
      await assertUsableCanvasPoint(page, to, 'Bridge destination anchor');
      const touch = new Touches(await context.newCDPSession(page));
      await touch.down(1, from);
      await touch.move(1, to);
      await touch.cancel();
      assert.equal((await snapshot(page)).rooms.arrival.bridges[0].drawn, false);
      assert.equal((await snapshot(page)).player.ink, before.player.ink);
      await touch.down(1, from);
      for (let index = 1; index <= 14; index++) await touch.move(1, {
        x: from.x + (to.x - from.x) * index / 14, y: from.y + (to.y - from.y) * index / 14,
      });
      await touch.up(1);
      await page.waitForFunction(() => window.__inkGame.snapshot().rooms.arrival.bridges[0].drawn);
      assert.equal((await snapshot(page)).stats.spent.explore - before.stats.spent.explore, bridge.cost);
      await capture(page, `bridge-${name}`);
      await touch.close();
      await fitsViewport(page);
      return { viewport, from, to, fixture: 'Original chapter encounter cleared and walked to bridge through Engine public inputs', cost: bridge.cost };
    } finally { await context.close(); }
  });
  await run('Rewards continue simulation, ground gear requires deliberate pickup, later choice and save restore', async () => {
    const { page, context } = await fresh('rewards', { width: 844, height: 390 }, { fixture: 'reward' });
    try {
      await start(page);
      const touch = new Touches(await context.newCDPSession(page));
      await touch.down(1, await center(page, '#melee'));
      await page.waitForFunction(() => window.__inkGame.snapshot().pendingRewards.length === 1);
      await touch.cancel();
      const reward = await snapshot(page);
      assert.equal(reward.paused, false);
      assert.equal(await page.locator('#modal').evaluate(node => node.open), false);
      assert.equal(reward.pickups.filter(item => item.kind === 'gear').length, 1);
      await page.waitForTimeout(300);
      assert.ok((await snapshot(page)).time > reward.time + 0.15);
      assert.equal((await snapshot(page)).pendingRewards.length, 1);
      assert.equal((await snapshot(page)).pickups.filter(item => item.kind === 'gear').length, 1);
      await capture(page, 'reward-waits-on-ground');
      await touch.down(1, await center(page, '#joystick'));
      await touch.move(1, await logicalPoint(page, '#joystick', 37, 0));
      await touch.down(2, await center(page, '#fire'));
      await page.waitForTimeout(120);
      const stillFighting = await snapshot(page);
      assert.ok(stillFighting.player.x > reward.player.x + 10);
      assert.ok(stillFighting.stats.shots > reward.stats.shots);
      assert.equal(stillFighting.paused, false);
      await touch.cancel();
      await page.locator('#pause').tap();
      await page.locator('#resume').tap();
      await page.reload({ waitUntil: 'networkidle' });
      await start(page);
      assert.equal((await snapshot(page)).pendingRewards.length, 1);
      assert.equal((await snapshot(page)).pickups.filter(item => item.kind === 'gear').length, 1);
      assert.equal(await page.locator('#modal').evaluate(node => node.open), false);
      await page.locator('#interact').tap();
      await page.waitForFunction(() => window.__inkGame.snapshot().pendingRewards.length === 2);
      assert.equal(await page.locator('#modal').evaluate(node => node.open), false);
      const afterPickup = await snapshot(page);
      assert.equal(afterPickup.pickups.filter(item => item.kind === 'gear').length, 0);
      await capture(page, 'reward-pending-notice');
      await page.locator('#pause').tap();
      await page.locator('#resume').tap();
      await page.reload({ waitUntil: 'networkidle' });
      await start(page);
      assert.equal((await snapshot(page)).pendingRewards.length, 2);
      assert.equal((await snapshot(page)).pickups.filter(item => item.kind === 'gear').length, 0);
      const noticeTime = (await snapshot(page)).time;
      await page.locator('#reward').tap();
      assert.equal((await snapshot(page)).paused, true);
      await capture(page, 'reward-player-opens-choice');
      await page.locator('#modal-close').tap();
      await page.waitForTimeout(180);
      assert.equal((await snapshot(page)).pendingRewards.length, 2);
      assert.ok((await snapshot(page)).time > noticeTime);
      for (let index = 0; index < 2; index++) {
        if (!(await page.locator('#modal').evaluate(node => node.open))) await page.locator('#reward').tap();
        await page.locator('[data-reward]').first().tap();
      }
      assert.equal((await snapshot(page)).pendingRewards.length, 0);
      assert.ok(Object.keys((await snapshot(page)).equipment).length > 0);
      await page.reload({ waitUntil: 'networkidle' });
      await start(page);
      assert.equal((await snapshot(page)).pendingRewards.length, 0);
      assert.ok(Object.keys((await snapshot(page)).equipment).length > 0);
      await touch.close();
      return { generatedBy: 'Enemy defeated by native dry-melee input; normal level + clear reward', reloads: 3 };
    } finally { await context.close(); }
  });
  await run('Low ink enemy damage → result → retry → result → home remains responsive without findLast', async () => {
    const { page, context } = await fresh('loss', { width: 390, height: 844 }, { fixture: 'loss', oldApi: true });
    try {
      await start(page);
      await page.waitForFunction(() => window.__inkGame.snapshot().status === 'lost');
      assert.ok((await snapshot(page)).stats.damageTaken > 0);
      await capture(page, 'ink-exhausted-result-portrait');
      await page.locator('#result-restart').tap();
      await page.waitForFunction(() => window.__inkGame.snapshot().status === 'playing');
      await page.waitForFunction(() => window.__inkGame.snapshot().status === 'lost');
      await page.locator('[data-home], #result-home').first().tap();
      await page.locator('#start-game').waitFor({ state: 'visible' });
      await page.locator('#home-help').tap();
      assert.equal(await page.locator('#modal').getAttribute('data-kind'), 'help');
      await page.locator('#modal-close').tap();
      await start(page);
      return { viewport: '390×844', resultRetry: true, homeInteractive: true, findLastRemoved: true };
    } finally { await context.close(); }
  });
  await run('Final encounter victory result provides replay and home navigation', async () => {
    const { page, context } = await fresh('win', { width: 568, height: 320 }, { fixture: 'win' });
    try {
      await start(page);
      const touch = new Touches(await context.newCDPSession(page));
      await touch.down(1, await center(page, '#melee'));
      await page.waitForFunction(() => window.__inkGame.snapshot().status === 'won');
      await touch.cancel();
      await capture(page, 'victory-result-small');
      await fitsViewport(page);
      await page.locator('[data-home], #result-home').first().tap();
      await page.locator('#start-game').waitFor({ state: 'visible' });
      await touch.close();
      return { viewport: '568×320' };
    } finally { await context.close(); }
  });
  await run('Resize and fullscreen/orientation rejection preserve run and landscape fallback', async () => {
    const { page, context } = await fresh('resize', { width: 844, height: 390 }, { fixture: 'combat', rejectFullscreen: true });
    try {
      await page.locator('#home-fullscreen').tap();
      await start(page);
      const before = await snapshot(page);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(180);
      await fitsViewport(page);
      assert.equal((await snapshot(page)).roomId, before.roomId);
      assert.equal((await snapshot(page)).player.ink, before.player.ink);
      await touchMovement(page, context, { name: 'after-resize' });
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(180);
      await fitsViewport(page);
      assert.equal(await page.locator('#game-root').evaluate(node => node.clientWidth > node.clientHeight), true);
      return { fullscreen: 'request explicitly rejected', sizes: ['844×390', '390×844', '844×390'] };
    } finally { await context.close(); }
  });
  await run('Fullscreen entry and exit preserve normal portrait landscape fallback', async () => {
    const { page, context } = await fresh('fullscreen', { width: 390, height: 844 }, { fixture: 'combat' });
    try {
      await page.locator('#home-fullscreen').tap();
      await page.waitForFunction(() => Boolean(document.fullscreenElement));
      await start(page);
      const before = await snapshot(page);
      await page.locator('#pause').tap();
      await page.locator('#modal-fullscreen').tap();
      await page.waitForFunction(() => !document.fullscreenElement);
      await page.locator('#resume').tap();
      assert.equal((await snapshot(page)).roomId, before.roomId);
      assert.equal((await snapshot(page)).player.ink, before.player.ink);
      await fitsViewport(page);
      await touchMovement(page, context, { name: 'fullscreen-exit' });
      return { fullscreen: 'Actual browser Fullscreen API entry and exit', viewport: '390×844' };
    } finally { await context.close(); }
  });
  await run('Storage unavailable still permits touch gameplay and pause/resume', async () => {
    const { page, context } = await fresh('storage-disabled', { width: 844, height: 390 }, { fixture: 'combat', noStorage: true });
    try {
      await start(page);
      await touchMovement(page, context, { name: 'storage-disabled' });
      return { storage: 'getItem/setItem/removeItem throw SecurityError' };
    } finally { await context.close(); }
  });
  await run('Sandbox iframe landscape/portrait entry and touch remain playable', async () => {
    const { page, context } = await fresh('iframe', { width: 390, height: 844 }, { fixture: 'combat', rejectFullscreen: true });
    try {
      await context.route('**/mobile-qa-host.html', route => route.fulfill({ contentType: 'text/html', body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><iframe src="${url}?dev=0" style="width:100vw;height:100dvh;border:0" sandbox="allow-scripts allow-same-origin" allow="fullscreen" allowfullscreen></iframe></body></html>` }));
      await page.goto(new URL('mobile-qa-host.html', url).href, { waitUntil: 'networkidle' });
      const frame = page.frames().find(frame => frame !== page.mainFrame());
      await frame.waitForFunction(() => Boolean(window.__inkGame));
      await frame.locator('#start-game').tap();
      await page.waitForTimeout(180);
      const dimensions = await frame.locator('#game-root').evaluate(node => ({ width: node.clientWidth, height: node.clientHeight }));
      assert.ok(dimensions.width > dimensions.height);
      const touch = new Touches(await context.newCDPSession(page));
      const stick = await frame.locator('#joystick').boundingBox();
      const origin = { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 };
      const before = await frame.evaluate(() => window.__inkGame.snapshot());
      await touch.down(1, origin);
      await touch.move(1, { x: origin.x, y: origin.y + 37 });
      await page.waitForTimeout(220);
      assert.ok((await frame.evaluate(() => window.__inkGame.snapshot())).player.x > before.player.x + 20);
      await touch.cancel();
      await frame.locator('#pause').tap();
      assert.equal(await frame.evaluate(() => window.__inkGame.snapshot().paused), true);
      await capture(page, 'iframe-portrait-pause');
      await frame.locator('#resume').tap();
      await touch.close();
      return { host: 'Local sandbox fixture iframe', viewport: '390×844', permissions: 'allow-scripts allow-same-origin; fullscreen' };
    } finally { await context.close(); }
  });
  if (process.env.SHELL_URL) await run('Real production Shell iframe entry, fullscreen boundary, landscape fallback and touch pause', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    monitor(page, 'shell');
    try {
      const shell = new URL(process.env.SHELL_URL);
      shell.hash = '/games/ink-is-everything?dev=0';
      await page.goto(shell.href, { waitUntil: 'networkidle' });
      const frame = page.frames().find(frame => frame.url().includes('/games/ink-is-everything/'));
      assert.ok(frame, 'Real Shell route must load its registered game iframe');
      await frame.waitForFunction(() => Boolean(window.__inkGame));
      await frame.locator('#home-fullscreen').tap();
      await page.waitForFunction(() => Boolean(document.fullscreenElement));
      assert.equal(await page.evaluate(() => document.fullscreenElement.hasAttribute('data-game-display-host')), true);
      await frame.waitForFunction(() => {
        const rect = document.querySelector('#start-game').getBoundingClientRect();
        return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest('#start-game');
      });
      await frame.locator('#start-game').tap();
      await page.waitForFunction(() => document.querySelector('.standalone-page')?.dataset.screen === 'playing');
      assert.equal(await page.locator('.standalone-page > nav').isVisible(), false, 'Shell webpage navigation must collapse during play');
      const frameBounds = await page.locator('iframe').boundingBox();
      assert.ok(frameBounds.height >= 843 && frameBounds.width >= 389, 'Immersive Shell iframe must occupy the full mobile viewport');
      const before = await frame.evaluate(() => window.__inkGame.snapshot());
      const touch = new Touches(await context.newCDPSession(page));
      const stick = await frame.locator('#joystick').boundingBox();
      const origin = { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 };
      await touch.down(1, origin);
      await touch.move(1, { x: origin.x, y: origin.y + 37 });
      await page.waitForTimeout(180);
      assert.ok((await frame.evaluate(() => window.__inkGame.snapshot())).player.x > before.player.x + 15);
      await touch.cancel();
      await frame.locator('#pause').tap();
      assert.equal(await frame.evaluate(() => window.__inkGame.snapshot().paused), true);
      await capture(page, 'shell-portrait-fullscreen-pause');
      await frame.locator('#modal-fullscreen').tap();
      await page.waitForFunction(() => !document.fullscreenElement);
      await frame.locator('#resume').tap();
      assert.equal(await frame.locator('#game-root').evaluate(node => node.clientWidth > node.clientHeight), true);
      await capture(page, 'shell-portrait-playing');
      await frame.locator('#pause').tap();
      await frame.locator('[data-home]').tap();
      await frame.locator('#start-game').waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.querySelector('.standalone-page')?.dataset.screen === 'home');
      assert.equal(await page.locator('.standalone-page > nav').isVisible(), true);
      assert.equal(await page.locator('.standalone-page > nav button:visible').count(), 1, 'Home keeps only the Shell return control');
      await touch.close();
      return { url: shell.href, viewport: '390×844', fullscreenTarget: '[data-game-display-host]', source: 'Production Shell with registered bundled game' };
    } finally { await context.close(); }
  });
  await run('Actual first chapter completed through native touch, deliberate rewards, bridge and two-phase boss', async () => {
    const { page, context } = await fresh('chapter', { width: 844, height: 390 });
    const player = new Player(page, context, true);
    try {
      await player.init();
      player.rewardHistory = [];
      player.handleRewards = async () => {
        if (!(await snapshot(page)).pendingRewards.length) return;
        await player.release();
        const modalKind = await page.locator('#modal').getAttribute('data-kind');
        if (modalKind === 'result') await player.tap('[data-menu="reward"]');
        else if (!(await page.locator('#modal').evaluate(node => node.open))) await player.tap('#reward');
        for (let index = 0; index < 20; index++) {
          const state = await snapshot(page);
          if (!state.pendingRewards.length) break;
          const pending = state.pendingRewards[0];
          const preferred = ['fine-nib', 'backflow-amber', 'splash-sigil', 'ink-sac', 'swift-boots', 'gather-ring'];
          const choice = preferred.find(id => pending.choices.includes(id)) || pending.choices[0];
          player.rewardHistory.push({ source: pending.source, itemId: choice });
          await player.tap(`[data-reward="${choice}"]`);
        }
      };
      player.pickupAll = async () => {
        const state = await snapshot(page);
        for (const pickup of state.pickups.filter(item => ['ink', 'seal', 'gear'].includes(item.kind))) {
          await player.moveTo(pickup, { radius: 22 });
          if (pickup.kind === 'gear' && (await snapshot(page)).pickups.some(item => item.id === pickup.id)) {
            await page.waitForTimeout(120);
            await player.tap('#interact');
          }
          await player.handleRewards();
        }
      };
      await start(page);
      await player.clearRoom({ reserve: 42 });
      await player.pickupAll();
      await player.moveTo({ x: 480, y: 242 });
      const bridge = (await snapshot(page)).rooms.arrival.bridges[0];
      const from = await project(page, bridge.from.x, bridge.from.y);
      const to = await project(page, bridge.to.x, bridge.to.y);
      await assertUsableCanvasPoint(page, from, 'Bridge start anchor');
      await assertUsableCanvasPoint(page, to, 'Bridge destination anchor');
      await player.touch.down(5, from);
      for (let index = 1; index <= 14; index++) await player.touch.move(5, {
        x: from.x + (to.x - from.x) * index / 14,
        y: from.y + (to.y - from.y) * index / 14,
      });
      await player.touch.up(5);
      assert.equal((await snapshot(page)).rooms.arrival.bridges[0].drawn, true);
      await capture(page, 'chapter-bridge');
      await player.moveTo({ x: 480, y: 53 }, { expectedRoom: 'archive' });
      await player.clearRoom({ reserve: 42 });
      await player.pickupAll();
      await player.moveTo({ x: 480, y: 114 });
      await page.waitForTimeout(200);
      await player.pickupAll();
      await player.moveTo({ x: 480, y: 546 }, { expectedRoom: 'arrival' });
      await player.moveTo({ x: 480, y: 270 });
      await player.moveTo({ x: 905, y: 300 }, { expectedRoom: 'sentinel' });
      await player.clearRoom({ reserve: 42 });
      await player.pickupAll();
      assert.equal((await snapshot(page)).seals, 1);
      await player.moveTo({ x: 905, y: 300 }, { expectedRoom: 'market' });
      await capture(page, 'chapter-growth');
      await player.moveTo({ x: 480, y: 53 }, { expectedRoom: 'warden' });
      await player.clearRoom({ reserve: 42 });
      await player.pickupAll();
      assert.equal((await snapshot(page)).seals, 2);
      await player.moveTo({ x: 480, y: 546 }, { expectedRoom: 'market' });
      await player.moveTo({ x: 905, y: 300 }, { expectedRoom: 'gate' });
      await capture(page, 'chapter-boss');
      await player.clearRoom({ reserve: 42 });
      const final = await snapshot(page);
      assert.equal(final.status, 'won');
      assert.ok(player.bossPhases.has(2));
      assert.ok(player.bossMoves.has('charge') && player.bossMoves.has('burst'));
      assert.ok(final.stats.rewardsChosen >= 2);
      assert.ok(final.stats.lifeStolen > 0 && final.stats.killRestored > 0 && final.stats.reclaimed > 0);
      await fitsViewport(page);
      await capture(page, 'chapter-victory');
      return { viewport: '844×390', time: final.time, finalInk: final.player.ink,
        stats: final.stats, equipment: final.equipment, rewards: player.rewardHistory };
    } finally { await player.release(); await player.touch?.close(); await context.close(); }
  });
} catch (error) {
  report.failure = error.stack;
} finally {
  await browser?.close();
  report.status = report.failure || report.cases.some(item => item.status === 'failed') || report.errors.length ? 'failed' : 'passed';
  if (report.status === 'failed') process.exitCode = 1;
  await writeFile(new URL(`${reportBasename}.json`, output), JSON.stringify(report, null, 2) + '\n');
  const source = report.build.includes('Source');
  const list = cases => cases.map(item => `- ${item.status === 'passed' ? '通过' : '失败'}：${item.name}${item.failure ? `\n  ${item.failure.split('\n')[0]}` : ''}`).join('\n');
  await writeFile(new URL(`${reportBasename}.md`, output), `# 移动端浏览器回归\n\n环境：${report.environment}。\n\n构建：${report.build}。\n\n输入：${report.input}。仅通过只读 snapshot / worldToScreen 观察运行状态。\n\n源码与夹具：${report.fixtures}。真实第一章通关直接使用章节原配置，移动、战斗、拾取与绘桥均通过浏览器原生触屏输入完成。\n\n结果：${report.status}，${report.cases.filter(item => item.status === 'passed').length}/${report.cases.length} 项通过，${report.errors.length} 个运行错误。\n\n## ${source ? '独立源码入口' : '独立生产构建与 sandbox iframe'}\n\n入口：${report.url}\n\n${list(report.cases.filter(item => !item.name.startsWith('Real production Shell')))}\n\n## Shell 生产构建\n\n${report.shellUrl ? `入口：${report.shellUrl}#/games/ink-is-everything\n\n${list(report.cases.filter(item => item.name.startsWith('Real production Shell')))}` : '本次未启用。设置 SHELL_URL 可复验真实 Shell。'}\n\n## 实际运行截图\n\n${report.screenshots.map(name => `- [${name}](./${name})`).join('\n')}\n\n尚未验证：真实 iOS/Android 手机、Safari 真机、原生小游戏宿主。\n`);
  console.log(JSON.stringify(report, null, 2));
}

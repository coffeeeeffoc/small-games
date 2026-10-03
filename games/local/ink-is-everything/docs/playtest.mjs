import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Integration checks use only browser mouse, keyboard and native touch events.
// The debug snapshot/projection API is read-only; no state or engine commands are injected.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const url = process.env.GAME_URL || 'http://127.0.0.1:4412/';
const pressureOnly = process.argv.includes('--pressure-only');
const output = new URL('./screenshots/', import.meta.url);
await mkdir(output, { recursive: true });
const report = {
  url,
  date: new Date().toISOString(),
  input: 'Public mouse, keyboard and native multi-touch events; snapshots read-only',
  cases: [],
  screenshots: [],
  errors: [],
  status: 'running',
};
let browser;
const sleep = (page, milliseconds) => page.waitForTimeout(milliseconds);
const snapshot = (page) => page.evaluate(() => window.__inkGame.snapshot());
const project = (page, x, y) =>
  page.evaluate(({ x, y }) => window.__inkGame.worldToScreen(x, y), { x, y });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

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
async function screenshot(page, name) {
  if (pressureOnly) name = name.replace('mobile-', 'mobile-pressure-');
  await page.screenshot({
    path: fileURLToPath(new URL(name, output)),
    fullPage: false,
    animations: 'disabled',
  });
  report.screenshots.push(`screenshots/${name}`);
}
async function fitsViewport(page) {
  const bounds = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  assert.ok(
    bounds.scrollWidth <= bounds.width + 1,
    `Horizontal overflow: ${JSON.stringify(bounds)}`,
  );
  assert.ok(
    bounds.scrollHeight <= bounds.height + 1,
    `Gameplay must fit one viewport: ${JSON.stringify(bounds)}`,
  );
}
async function center(page, selector) {
  const bounds = await page.locator(selector).boundingBox();
  assert.ok(bounds, `Missing visible control: ${selector}`);
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}
async function checkPauseIcon(page) {
  const bars = await page.locator('#pause svg rect').evaluateAll((nodes) =>
    nodes.map((node) => ({
      x: +node.getAttribute('x'),
      y: +node.getAttribute('y'),
      width: +node.getAttribute('width'),
      height: +node.getAttribute('height'),
    })),
  );
  assert.equal(bars.length, 2, 'Pause must have two real solid bars');
  assert.equal(bars[0].width, bars[1].width);
  assert.equal(bars[0].height, bars[1].height);
  assert.equal(bars[0].y, bars[1].y);
  assert.ok(bars[1].x > bars[0].x + bars[0].width, 'Pause bars must remain separate');
  assert.equal(await page.locator('#pause').getAttribute('aria-label'), '暂停');
}

class Keyboard {
  constructor(page) {
    this.page = page;
    this.held = new Set();
  }
  async set(keys = []) {
    const next = new Set(keys);
    for (const key of this.held) if (!next.has(key)) await this.page.keyboard.up(key);
    for (const key of next) if (!this.held.has(key)) await this.page.keyboard.down(key);
    this.held = next;
  }
  async release() {
    await this.set();
  }
}

class Touches {
  constructor(session) {
    this.session = session;
    this.points = new Map();
  }
  async dispatch(type) {
    await this.session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: [...this.points].map(([id, point]) => ({
        id,
        ...point,
        radiusX: 5,
        radiusY: 5,
        force: 1,
      })),
    });
  }
  async down(id, point) {
    this.points.set(id, point);
    await this.dispatch('touchStart');
  }
  async move(id, point) {
    assert.ok(this.points.has(id));
    this.points.set(id, point);
    await this.dispatch('touchMove');
  }
  async up(id) {
    const point = this.points.get(id);
    if (!point) return;
    this.points.delete(id);
    await this.session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [{ id, ...point, radiusX: 5, radiusY: 5, force: 1 }],
    });
  }
  async cancel() {
    if (!this.points.size) return;
    this.points.clear();
    await this.dispatch('touchCancel');
  }
  async close() {
    await this.cancel();
    await this.session.detach();
  }
}

function clearSegment(room, a, b, radius = 20) {
  const walls = room.obstacles.filter(
    (obstacle) =>
      !obstacle.bridgeId || !room.bridges.find((bridge) => bridge.id === obstacle.bridgeId)?.drawn,
  );
  const steps = Math.max(1, Math.ceil(distance(a, b) / 10));
  for (let i = 0; i <= steps; i++) {
    const x = a.x + ((b.x - a.x) * i) / steps,
      y = a.y + ((b.y - a.y) * i) / steps;
    if (x < 50 || x > 910 || y < 50 || y > 550) return false;
    if (
      walls.some(
        (wall) =>
          Math.hypot(
            x - Math.max(wall.x, Math.min(wall.x + wall.w, x)),
            y - Math.max(wall.y, Math.min(wall.y + wall.h, y)),
          ) < radius,
      )
    )
      return false;
  }
  return true;
}
function waypoint(state, target) {
  const room = state.rooms[state.roomId],
    p = state.player;
  target = { x: Math.max(51, Math.min(909, target.x)), y: Math.max(51, Math.min(549, target.y)) };
  if (clearSegment(room, p, target)) return target;
  const nodes = [];
  for (let y = 50; y <= 550; y += 25)
    for (let x = 50; x <= 900; x += 25)
      if (clearSegment(room, { x, y }, { x, y })) nodes.push({ x, y });
  const nearest = (point, requireSight) =>
    nodes
      .map((node, i) => [distance(point, node), i])
      .filter(([, i]) => !requireSight || clearSegment(room, point, nodes[i]))
      .sort((a, b) => a[0] - b[0])[0]?.[1];
  const start = nearest(p, true),
    end = nearest(target, false);
  if (start === undefined || end === undefined) return target;
  const queue = [start],
    previous = new Map([[start, null]]),
    byPos = new Map(nodes.map((point, i) => [`${point.x},${point.y}`, i]));
  for (let head = 0; head < queue.length && !previous.has(end); head++) {
    const index = queue[head],
      node = nodes[index];
    for (const [dx, dy] of [
      [25, 0],
      [-25, 0],
      [0, 25],
      [0, -25],
      [25, 25],
      [-25, 25],
      [25, -25],
      [-25, -25],
    ]) {
      const next = byPos.get(`${node.x + dx},${node.y + dy}`);
      if (next !== undefined && !previous.has(next) && clearSegment(room, node, nodes[next])) {
        previous.set(next, index);
        queue.push(next);
      }
    }
  }
  if (!previous.has(end)) return nodes[start];
  const path = [];
  for (let at = end; at !== null; at = previous.get(at)) path.unshift(nodes[at]);
  return path.filter((node) => clearSegment(room, p, node)).at(-1) || nodes[start];
}

class Player {
  constructor(page, context, mobile) {
    this.page = page;
    this.context = context;
    this.mobile = mobile;
    this.keyboard = new Keyboard(page);
    this.shooting = false;
    this.bossPhases = new Set();
    this.bossMoves = new Set();
  }
  async init() {
    if (this.mobile) {
      this.touch = new Touches(await this.context.newCDPSession(this.page));
      this.stick = await center(this.page, '#joystick');
      this.fire = await center(this.page, '#fire');
      this.melee = await center(this.page, '#melee');
    }
  }
  async tap(selector) {
    await this.page.locator(selector)[this.mobile ? 'tap' : 'click']();
  }
  async controls(dx, dy, target, shoot = false, melee = false) {
    const length = Math.hypot(dx, dy),
      mx = length ? dx / length : 0,
      my = length ? dy / length : 0;
    if (this.mobile) {
      if (length) {
        if (!this.touch.points.has(1)) await this.touch.down(1, this.stick);
        await this.touch.move(1, { x: this.stick.x + mx * 38, y: this.stick.y + my * 38 });
      } else if (this.touch.points.has(1)) await this.touch.up(1);
      if (shoot && !this.touch.points.has(2)) await this.touch.down(2, this.fire);
      if (!shoot && this.touch.points.has(2)) await this.touch.up(2);
      if (melee && !this.touch.points.has(3)) await this.touch.down(3, this.melee);
      if (!melee && this.touch.points.has(3)) await this.touch.up(3);
    } else {
      const keys = [];
      if (mx > 0.25) keys.push('d');
      if (mx < -0.25) keys.push('a');
      if (my > 0.25) keys.push('s');
      if (my < -0.25) keys.push('w');
      if (melee) keys.push('f');
      await this.keyboard.set(keys);
      if (target) {
        const screen = await project(this.page, target.x, target.y);
        await this.page.mouse.move(screen.x, screen.y);
      }
      if (shoot && !this.shooting) await this.page.mouse.down();
      if (!shoot && this.shooting) await this.page.mouse.up();
      this.shooting = shoot;
    }
  }
  async release() {
    await this.keyboard.release();
    if (this.shooting) await this.page.mouse.up();
    this.shooting = false;
    if (this.touch) await this.touch.cancel();
  }
  async dash() {
    if (this.mobile) {
      await this.touch.down(4, await center(this.page, '#dash'));
      await this.touch.up(4);
    } else await this.page.keyboard.press('Space');
  }
  async heal() {
    if (this.mobile) {
      await this.touch.down(4, await center(this.page, '#heal'));
      await this.touch.up(4);
    } else await this.page.keyboard.press('q');
  }
  async moveTo(target, { radius = 24, expectedRoom, timeout = 20000 } = {}) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const state = await snapshot(this.page);
      assert.equal(state.status, 'playing', 'Journey ended while moving');
      if (expectedRoom && state.roomId === expectedRoom) {
        await this.release();
        return state;
      }
      if (!expectedRoom && distance(state.player, target) < radius) {
        await this.release();
        return state;
      }
      const next = waypoint(state, target);
      await this.controls(next.x - state.player.x, next.y - state.player.y, target);
      await sleep(this.page, 110);
    }
    await this.release();
    const state = await snapshot(this.page);
    throw new Error(
      `Navigation timed out in ${state.roomId} at ${state.player.x.toFixed(1)},${state.player.y.toFixed(1)} toward ${JSON.stringify(target)}`,
    );
  }
  async clearRoom({ reserve = 22, timeout = 150000 } = {}) {
    const deadline = Date.now() + timeout;
    let tick = 0;
    while (Date.now() < deadline) {
      const state = await snapshot(this.page),
        p = state.player,
        room = state.rooms[state.roomId];
      for (const foe of state.enemies)
        if (foe.type === 'boss') {
          this.bossPhases.add(foe.phase);
          if (foe.state === 'windup') this.bossMoves.add(foe.attackKind);
        }
      assert.notEqual(
        state.status,
        'lost',
        `Lost in ${state.roomId}: ${JSON.stringify({ player: p, stats: state.stats })}`,
      );
      if (state.status === 'won' || room.cleared) {
        await this.release();
        return state;
      }
      const enemy = state.enemies
        .filter((enemy) => enemy.hp > 0)
        .sort((a, b) => distance(p, a) - distance(p, b))[0];
      if (!enemy) {
        await this.controls(0, 0);
        await sleep(this.page, 150);
        continue;
      }
      let target = enemy;
      const threats = state.enemies.filter(
        (e) => (e.state === 'windup' && e.timer < 0.5) || e.state === 'attack',
      );
      let dodging = false;
      for (const threat of threats) {
        const rx = p.x - threat.x,
          ry = p.y - threat.y,
          along = rx * threat.aimX + ry * threat.aimY,
          cross = rx * -threat.aimY + ry * threat.aimX;
        if (
          along > -65 &&
          along < (threat.range || 430) + 45 &&
          Math.abs(cross) < (threat.attackKind === 'burst' ? 110 : threat.r + 40)
        ) {
          let direction = cross >= 0 ? 1 : -1;
          const alternative = (sign) => ({
            x: p.x - threat.aimY * sign * 140,
            y: p.y + threat.aimX * sign * 140,
          });
          if (!clearSegment(room, p, alternative(direction))) direction *= -1;
          target = alternative(direction);
          dodging = true;
          break;
        }
      }
      // Walking out of a projectile's current line also exercises real positional play.
      if (!dodging)
        for (const shot of state.projectiles.filter((shot) => shot.owner === 'enemy')) {
          const speed = Math.hypot(shot.vx, shot.vy),
            rx = p.x - shot.x,
            ry = p.y - shot.y;
          const along = (rx * shot.vx + ry * shot.vy) / speed,
            cross = (rx * -shot.vy + ry * shot.vx) / speed;
          if (along > 0 && along < 95 && Math.abs(cross) < 34) {
            const sign = cross >= 0 ? 1 : -1;
            target = {
              x: p.x - (shot.vy / speed) * sign * 95,
              y: p.y + (shot.vx / speed) * sign * 95,
            };
            dodging = true;
            break;
          }
        }
      const next = waypoint(state, target),
        d = distance(p, enemy);
      const near = d < 58 + enemy.r;
      await this.controls(
        !dodging && near ? 0 : next.x - p.x,
        !dodging && near ? 0 : next.y - p.y,
        enemy,
        p.ink > reserve && d > 95 && clearSegment(room, p, enemy, 3),
        true,
      );
      if (dodging && p.dashCd <= 0) await this.dash();
      if (p.hp <= Math.min(3, p.maxHp - 3) && p.ink >= 10 && p.healCd <= 0) await this.heal();
      if (++tick % 50 === 0)
        console.log(
          `${this.mobile ? 'touch' : 'desktop'} ${state.roomId}: ${state.enemies.length} foes, hp ${p.hp}, ink ${p.ink}`,
        );
      await sleep(this.page, 120);
    }
    await this.release();
    throw new Error(`Combat timed out: ${JSON.stringify(await snapshot(this.page))}`);
  }
  async pickupAll() {
    const state = await snapshot(this.page);
    for (const pickup of state.pickups) await this.moveTo(pickup, { radius: 58 });
    await sleep(this.page, 300);
  }
}

async function makePlayer(label, mobile = false, storageDisabled = false) {
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
  const driver = new Player(page, context, mobile);
  await driver.init();
  return driver;
}
async function drawBridge(driver, cancelled = false) {
  const page = driver.page;
  await driver.moveTo({ x: 480, y: 242 });
  const before = await snapshot(page),
    bridge = before.rooms.arrival.bridges[0];
  const from = await project(page, bridge.from.x, bridge.from.y),
    to = await project(page, bridge.to.x, bridge.to.y);
  if (driver.mobile) {
    await driver.touch.down(5, from);
    for (let step = 1; step <= 14; step++)
      await driver.touch.move(5, {
        x: from.x + ((to.x - from.x) * step) / 14,
        y: from.y + ((to.y - from.y) * step) / 14,
      });
    if (cancelled) await driver.touch.cancel();
    else await driver.touch.up(5);
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 14 });
    await page.mouse.up();
  }
  await sleep(page, 120);
  const after = await snapshot(page);
  assert.equal(
    after.rooms.arrival.bridges[0].drawn,
    !cancelled,
    'Only a completed bridge stroke may create traversable geometry',
  );
  assert.equal(after.player.ink, before.player.ink - (cancelled ? 0 : bridge.cost));
  assert.equal(
    after.stats.spent.explore,
    before.stats.spent.explore + (cancelled ? 0 : bridge.cost),
  );
}
async function journey(driver, { reserve = 22, bridge = true, drainAfterShop = false } = {}) {
  const page = driver.page;
  await driver.clearRoom({ reserve });
  await driver.pickupAll();
  if (bridge) {
    if (driver.mobile) await drawBridge(driver, true);
    await drawBridge(driver);
    await screenshot(page, driver.mobile ? 'mobile-bridge.png' : 'desktop-bridge.png');
    await driver.moveTo({ x: 480, y: 53 }, { expectedRoom: 'archive' });
    await driver.clearRoom({ reserve });
    await driver.pickupAll();
    const beforeCache = await snapshot(page);
    await driver.moveTo({ x: 480, y: 114 });
    await sleep(page, 500);
    const cacheState = await snapshot(page);
    assert.equal(
      cacheState.rooms.archive.objects[0].used,
      true,
      'Walking up to a cleared chest opens it',
    );
    assert.equal(
      cacheState.player.ink,
      Math.min(beforeCache.player.maxInk, beforeCache.player.ink + 34),
      'Side-route ink reward respects the shared-pool capacity',
    );
    await driver.moveTo({ x: 480, y: 546 }, { expectedRoom: 'arrival' });
    await driver.moveTo({ x: 480, y: 270 });
  }
  await driver.moveTo({ x: 905, y: 300 }, { expectedRoom: 'sentinel' });
  await driver.clearRoom({ reserve });
  await driver.pickupAll();
  await sleep(page, 250);
  assert.equal((await snapshot(page)).seals, 1);
  await driver.moveTo({ x: 905, y: 300 }, { expectedRoom: 'market' });
  await driver.moveTo({ x: 681, y: 235 });
  await driver.tap('#interact');
  await page.waitForFunction(() => document.querySelector('#modal').open);
  const beforeTrade = await snapshot(page);
  await driver.tap('[data-buy="fine-nib"]');
  const afterTrade = await snapshot(page);
  assert.ok(afterTrade.contracts.includes('fine-nib'));
  assert.equal(afterTrade.player.ink, beforeTrade.player.ink - 18);
  assert.equal(afterTrade.stats.spent.trade, 18);
  if (await page.locator('#modal').evaluate((dialog) => dialog.open))
    await driver.tap('#modal-close');
  await screenshot(page, driver.mobile ? 'mobile-market.png' : 'desktop-market.png');
  // Reload at a safe room and use the public Continue control.
  await driver.release();
  await sleep(page, 1100);
  const beforeReload = await snapshot(page);
  await page.reload({ waitUntil: 'networkidle' });
  await driver.init();
  assert.match(await page.locator('#start-game').textContent(), /继续/);
  await driver.tap('#start-game');
  const restored = await snapshot(page);
  assert.equal(restored.roomId, 'market');
  assert.equal(restored.seals, 1);
  assert.equal(restored.player.ink, beforeReload.player.ink);
  assert.deepEqual(restored.contracts, beforeReload.contracts);
  if (drainAfterShop) {
    await driver.controls(0, 0, null, true);
    await page.waitForFunction(() => window.__inkGame.snapshot().player.ink === 0, null, {
      timeout: 20000,
    });
    await driver.release();
    const empty = await snapshot(page);
    await driver.controls(1, 0, null, false, true);
    await driver.dash();
    await sleep(page, 350);
    await driver.release();
    const stillPlaying = await snapshot(page);
    assert.equal(stillPlaying.player.ink, 0);
    assert.ok(distance(empty.player, stillPlaying.player) > 30);
    assert.ok(stillPlaying.stats.freeAttacks > empty.stats.freeAttacks);
    assert.ok(stillPlaying.stats.dashes > empty.stats.dashes);
    await screenshot(page, 'mobile-empty-ink.png');
    report.cases.push({
      name: 'Pressure test: intentionally empty the bottle in the safe station, then move, dry attack and dash at zero ink',
      status: 'passed',
    });
  }
  await driver.moveTo({ x: 480, y: 53 }, { expectedRoom: 'warden' });
  await driver.clearRoom({ reserve });
  await driver.pickupAll();
  await sleep(page, 250);
  assert.equal((await snapshot(page)).seals, 2);
  await driver.moveTo({ x: 480, y: 546 }, { expectedRoom: 'market' });
  let state = await snapshot(page);
  if (state.player.hp < state.player.maxHp) {
    await driver.moveTo({ x: 278, y: 420 });
    await driver.tap('#interact');
  }
  await driver.moveTo({ x: 905, y: 300 }, { expectedRoom: 'gate' });
  await screenshot(page, driver.mobile ? 'mobile-boss.png' : 'desktop-boss.png');
  await driver.clearRoom({ reserve: reserve >= 100 ? reserve : 10 });
  state = await snapshot(page);
  assert.equal(state.status, 'won');
  assert.equal(state.stats.bridgesDrawn, bridge ? 1 : 0);
  assert.ok(state.stats.freeAttacks > 0);
  assert.ok(state.stats.hits > 0);
  assert.ok(state.stats.dashes > 0);
  assert.equal(state.stats.enemiesDefeated, bridge ? 20 : 17);
  assert.ok(driver.bossPhases.has(2), 'Boss must enter phase two during real combat');
  assert.ok(
    driver.bossMoves.has('charge') && driver.bossMoves.has('burst'),
    'Both boss attacks must be encountered',
  );
  await fitsViewport(page);
  await screenshot(page, driver.mobile ? 'mobile-victory.png' : 'desktop-victory.png');
  report.cases.push({
    name: `${driver.mobile ? 'Touch' : 'Desktop'} full chapter: ${reserve >= 100 ? 'free melee focused' : 'mixed ranged / melee'} combat, ${bridge ? 'drawn bridge + archive reward, ' : ''}contract, save/resume, both seals and boss`,
    status: 'passed',
    stats: state.stats,
    elapsedGameSeconds: state.time,
    finalInk: state.player.ink,
    finalHp: state.player.hp,
  });
}

try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  let before, after;
  if (!pressureOnly) {
    const desktop = await makePlayer('desktop');
    await screenshot(desktop.page, 'desktop-opening.png');
    await checkPauseIcon(desktop.page);
    await desktop.tap('#start-game');
    await fitsViewport(desktop.page);
    before = await snapshot(desktop.page);
    await desktop.page.keyboard.down('d');
    await sleep(desktop.page, 240);
    await desktop.page.keyboard.up('d');
    after = await snapshot(desktop.page);
    assert.ok(after.player.x > before.player.x + 35, 'Keyboard input must move the actual player');
    await desktop.tap('#pause');
    before = await snapshot(desktop.page);
    await desktop.page.keyboard.press('f');
    await desktop.page.keyboard.press('q');
    await desktop.page.keyboard.press('Space');
    await sleep(desktop.page, 600);
    after = await snapshot(desktop.page);
    assert.deepEqual(after, before, 'Pause must stop the simulation and ignore combat input');
    await desktop.tap('#modal-close');
    report.cases.push({
      name: 'Desktop direct movement, one-viewport layout, real pause bars, complete simulation/input pause',
      status: 'passed',
    });
    await journey(desktop);
    await desktop.context.close();
  }

  const mobile = await makePlayer('mobile', true);
  await mobile.tap('#start-game');
  await fitsViewport(mobile.page);
  before = await snapshot(mobile.page);
  await mobile.controls(1, 0, null, true, true);
  await sleep(mobile.page, 350);
  after = await snapshot(mobile.page);
  assert.ok(
    after.player.x > before.player.x + 30,
    'Touch joystick must move the player while attacking',
  );
  assert.ok(after.stats.shots > before.stats.shots);
  assert.ok(after.stats.freeAttacks > before.stats.freeAttacks);
  await mobile.touch.cancel();
  const cancelled = await snapshot(mobile.page);
  await sleep(mobile.page, 250);
  const stopped = await snapshot(mobile.page);
  assert.ok(distance(cancelled.player, stopped.player) < 2, 'Cancelled movement must not stick');
  assert.equal(stopped.stats.shots, cancelled.stats.shots);
  assert.equal(stopped.stats.freeAttacks, cancelled.stats.freeAttacks);
  await screenshot(mobile.page, 'mobile-combat.png');
  report.cases.push({
    name: '390×844 native three-finger movement / fire / melee and touchcancel releases every held input',
    status: 'passed',
  });
  await journey(mobile, { reserve: 100, drainAfterShop: pressureOnly });
  await mobile.context.close();
  if (!pressureOnly) {
    const failure = await makePlayer('failure');
    await failure.tap('#start-game');
    // Remain exposed until the actual enemies defeat the player.
    await failure.moveTo({ x: 555, y: 365 });
    await failure.release();
    await failure.page.waitForFunction(() => window.__inkGame.snapshot().player.hp <= 3, null, {
      timeout: 35000,
    });
    const wounded = await snapshot(failure.page);
    await failure.page.keyboard.press('q');
    const healed = await snapshot(failure.page);
    assert.equal(healed.stats.heals, 1);
    assert.equal(healed.player.ink, wounded.player.ink - 10);
    assert.ok(healed.player.hp > wounded.player.hp);
    await failure.page.waitForFunction(() => window.__inkGame.snapshot().status === 'lost', null, {
      timeout: 65000,
    });
    await screenshot(failure.page, 'desktop-defeat.png');
    await failure.tap('#result-restart');
    const restarted = await snapshot(failure.page);
    assert.equal(restarted.status, 'playing');
    assert.equal(restarted.player.hp, 6);
    assert.equal(restarted.player.ink, 64);
    assert.equal(restarted.seals, 0);
    report.cases.push({
      name: 'Real enemy damage, shared-pool healing, eventual defeat and public restart with fresh resources',
      status: 'passed',
    });
    await failure.context.close();

    const blocked = await makePlayer('storage-disabled', true, true);
    await blocked.tap('#start-game');
    await blocked.controls(1, 0, null, true);
    await sleep(blocked.page, 300);
    await blocked.release();
    assert.ok((await snapshot(blocked.page)).stats.shots > 0);
    await fitsViewport(blocked.page);
    report.cases.push({
      name: 'Unavailable browser storage does not prevent native touch movement and shooting',
      status: 'passed',
    });
    await blocked.context.close();
  }
  assert.deepEqual(report.errors, [], 'No browser exceptions, console errors or failed requests');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack;
  if (browser)
    for (const context of browser.contexts())
      for (const page of context.pages()) {
        try {
          await page.screenshot({ path: '/tmp/ink-playtest-failure.png', fullPage: true });
          report.failureSnapshot = await snapshot(page);
        } catch {}
      }
  process.exitCode = 1;
} finally {
  await browser?.close();
  await writeFile(
    new URL(
      pressureOnly ? './playtest-pressure-report.json' : './playtest-report.json',
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

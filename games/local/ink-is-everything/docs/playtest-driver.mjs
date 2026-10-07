import assert from 'node:assert/strict';

// Browser input adapter: no simulation calls, state assignments or hidden shortcuts.
const sleep = (page, milliseconds) => page.waitForTimeout(milliseconds);
const snapshot = (page) => page.evaluate(() => window.__inkGame.snapshot());
const project = (page, x, y) =>
  page.evaluate(({ x, y }) => window.__inkGame.worldToScreen(x, y), { x, y });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

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
async function logicalPoint(page, selector, dx, dy) {
  return page.locator(selector).evaluate(
    (element, { dx, dy }) => {
      const rect = element.getBoundingClientRect();
      const rotated = document.querySelector('#game-root').dataset.rotated === 'true';
      return {
        x: rect.x + rect.width / 2 + (rotated ? -dy : dx),
        y: rect.y + rect.height / 2 + (rotated ? dx : dy),
      };
    },
    { dx, dy },
  );
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
    this.observations = { minInk: Infinity, maxInk: 0, sampleCount: 0, fullSamples: 0, rooms: [] };
    this.handleRewards = null;
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
        if (!this.touch.points.has(1)) {
          this.stick = await center(this.page, '#joystick');
          await this.touch.down(1, this.stick);
        }
        await this.touch.move(1, await logicalPoint(this.page, '#joystick', mx * 38, my * 38));
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
  async nova() {
    if (this.mobile) {
      await this.touch.down(4, await center(this.page, '#nova'));
      await this.touch.up(4);
    } else await this.page.keyboard.press('q');
  }
  async moveTo(target, { radius = 24, expectedRoom, timeout = 20000 } = {}) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      await this.handleRewards?.();
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
  async clearRoom({ reserve = 38, timeout = 180000 } = {}) {
    const deadline = Date.now() + timeout;
    let tick = 0;
    while (Date.now() < deadline) {
      await this.handleRewards?.();
      const state = await snapshot(this.page),
        p = state.player,
        room = state.rooms[state.roomId];
      this.observations.minInk = Math.min(this.observations.minInk, p.ink);
      this.observations.maxInk = Math.max(this.observations.maxInk, p.ink);
      this.observations.sampleCount++;
      if (p.ink >= p.maxInk - 0.01) this.observations.fullSamples++;
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
        this.observations.rooms.push({
          id: state.roomId,
          ink: p.ink,
          maxInk: p.maxInk,
          time: state.time,
          damageTaken: state.stats.damageTaken,
          lifeStolen: state.stats.lifeStolen,
          killRestored: state.stats.killRestored,
          reclaimed: state.stats.reclaimed,
          spent: { ...state.stats.spent },
        });
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
      if (
        reserve !== Infinity &&
        p.ink > 35 &&
        state.enemies.filter((e) => distance(p, e) < 165).length >= 2 &&
        p.novaCd <= 0
      )
        await this.nova();
      if (++tick % 50 === 0)
        console.log(
          `${this.mobile ? 'touch' : 'desktop'} ${state.roomId}: ${state.enemies.length} foes, ink ${p.ink.toFixed(1)}`,
        );
      await sleep(this.page, 120);
    }
    await this.release();
    throw new Error(`Combat timed out: ${JSON.stringify(await snapshot(this.page))}`);
  }
  async pickupAll() {
    const state = await snapshot(this.page);
    for (const pickup of state.pickups) {
      if (!['gear', 'seal', 'ink'].includes(pickup.kind)) continue;
      await this.moveTo(pickup, { radius: 20 });
      if (pickup.kind === 'gear') {
        const point = await project(this.page, pickup.x, pickup.y);
        if (this.mobile) await this.page.touchscreen.tap(point.x, point.y);
        else await this.page.mouse.click(point.x, point.y);
        await this.page.waitForFunction(
          (id) => !window.__inkGame.snapshot().pickups.some((item) => item.id === id),
          pickup.id,
        );
      }
      await this.handleRewards?.();
    }
    await sleep(this.page, 300);
  }
}

export {
  Player,
  Touches,
  Keyboard,
  snapshot,
  project,
  distance,
  sleep,
  fitsViewport,
  center,
  logicalPoint,
  checkPauseIcon,
  clearSegment,
  waypoint,
};

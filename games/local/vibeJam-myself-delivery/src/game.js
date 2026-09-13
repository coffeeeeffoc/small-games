import { SHORE_RADIUS, DOCK } from './map-data.js';

export const MARKET = { x: -5, z: 0, name: '橘风集市' };
export const GOODS = [
  { x: -17, z: -5, name: '橘子' },
  { x: -8, z: -5, name: '面包' },
  { x: -12, z: 5, name: '牛奶' },
];
export const ORDERS = [
  { x: 28, z: -28, name: '海风咖啡', title: '海边的下午茶', reward: 38 },
  { x: -28, z: -28, name: '灯塔管理员', title: '给灯塔的一份暖意', reward: 52 },
  { x: 28, z: 28, name: '面包花园', title: '花园野餐计划', reward: 46 },
];

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const near = (s, point, radius) => Math.hypot(s.x - point.x, s.z - point.z) <= radius;
const active = s => ['pickup', 'collect', 'deliver'].includes(s.phase);
const progressNumber = n => Number.isFinite(n) && n >= 0 ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(n)) : 0;
const axis = n => Number.isFinite(n) ? clamp(n, -1, 1) : 0;

function notify(s, message, type) {
  s.message = message;
  s.messageTime = 3;
  if (type) {
    s.events.push({ type, x: s.x, z: s.z });
    if (s.events.length > 24) s.events.shift();
  }
}

export function createGame(progress = {}) {
  progress = progress && typeof progress === 'object' ? progress : {};
  const completed = progressNumber(progress.completed);
  return {
    x: 0, z: 16, angle: 0, speed: 0, steer: 0, boosting: false,
    jumpY: 0, jumpV: 0, mode: 'ride', phase: 'ready', cargo: 0,
    items: [false, false, false], integrity: 100, energy: 100,
    timeLeft: 180, elapsed: 0, coins: progressNumber(progress.coins), completed,
    orderIndex: completed % ORDERS.length, result: null, message: '', messageTime: 0,
    events: [], crashCooldown: 0, warned: false, boostLocked: false,
    bikeX: 0, bikeZ: 16, bikeAngle: 0,
  };
}

export function startOrder(s, index = s.orderIndex) {
  s.orderIndex = ((Math.trunc(Number.isFinite(index) ? index : 0) % ORDERS.length) + ORDERS.length) % ORDERS.length;
  Object.assign(s, {
    phase: 'pickup', mode: 'ride', speed: 0, steer: 0, boosting: false,
    jumpY: 0, jumpV: 0, cargo: 0, items: [false, false, false],
    integrity: 100, energy: 100, timeLeft: 180, elapsed: 0, result: null,
    crashCooldown: 0, warned: false, boostLocked: false,
  });
  notify(s, '先去橘风集市，停稳后下车取货', 'start');
  return s;
}

export function restart(s) {
  Object.assign(s, { x: 0, z: 16, angle: 0, bikeX: 0, bikeZ: 16, bikeAngle: 0 });
  return startOrder(s, s.orderIndex);
}

export function target(s) {
  if (s.phase === 'deliver' || s.phase === 'result') return ORDERS[s.orderIndex];
  if (s.phase === 'collect' && s.cargo < GOODS.length) {
    return GOODS.filter((_, i) => !s.items[i]).sort((a, b) =>
      Math.hypot(s.x - a.x, s.z - a.z) - Math.hypot(s.x - b.x, s.z - b.z))[0];
  }
  if (s.phase === 'collect') return { x: s.bikeX, z: s.bikeZ, name: '小摩托' };
  return MARKET;
}

export function contextAction(s) {
  if (s.phase === 'pickup' && near(s, MARKET, 3.3))
    return Math.abs(s.speed) <= 2.2 ? '下车取货' : '刹车停稳';
  if (s.phase === 'collect') {
    const i = GOODS.findIndex((g, i) => !s.items[i] && near(s, g, 2.4));
    if (i >= 0) return `拿起${GOODS[i].name}`;
    if (s.cargo === GOODS.length && near(s, target(s), 2.8)) return '上车出发';
  }
  if (s.phase === 'deliver' && near(s, ORDERS[s.orderIndex], 3.8))
    return Math.abs(s.speed) <= 2.2 ? '完成配送' : '刹车停稳';
  return null;
}

function finish(s, delivered, reason = '') {
  if (!active(s)) return;
  const stars = delivered ? s.integrity >= 85 && s.timeLeft >= 60 ? 3 : s.integrity >= 55 ? 2 : 1 : 0;
  const tip = delivered ? Math.round(s.integrity / 100 * Math.max(0, s.timeLeft) / 180 * 20) : 0;
  const reward = delivered ? ORDERS[s.orderIndex].reward + tip : 0;
  s.result = { stars, reward, tip, elapsed: Math.round(s.elapsed), delivered, failed: !delivered, reason };
  s.coins = Math.min(Number.MAX_SAFE_INTEGER, s.coins + reward);
  if (delivered) s.completed = Math.min(Number.MAX_SAFE_INTEGER, s.completed + 1);
  Object.assign(s, { phase: 'result', speed: 0, boosting: false, jumpY: 0, jumpV: 0 });
  notify(s, delivered ? '配送完成！又是被治愈的一天' : reason, delivered ? 'delivery' : 'fail');
}

export function interact(s) {
  if (s.phase === 'pickup' && near(s, MARKET, 3.3) && Math.abs(s.speed) <= 2.2) {
    Object.assign(s, { phase: 'collect', mode: 'walk', speed: 0, jumpY: 0, jumpV: 0,
      bikeX: s.x, bikeZ: s.z, bikeAngle: s.angle });
    notify(s, '走到摊位旁，收集橘子、面包和牛奶', 'pickup');
    return true;
  }
  if (s.phase === 'collect') {
    const i = GOODS.findIndex((g, i) => !s.items[i] && near(s, g, 2.4));
    if (i >= 0) {
      s.items[i] = true;
      s.cargo = s.items.filter(Boolean).length;
      notify(s, s.cargo === GOODS.length ? '都拿齐了！回集市门口上车' : `${GOODS[i].name}已装好 · ${s.cargo}/3`, 'pickup');
      return true;
    }
    if (s.cargo === GOODS.length && near(s, target(s), 2.8)) {
      Object.assign(s, { phase: 'deliver', mode: 'ride', speed: 0, jumpY: 0, jumpV: 0,
        x: s.bikeX, z: s.bikeZ, angle: s.bikeAngle });
      notify(s, `出发！送往${ORDERS[s.orderIndex].name}`, 'start');
      return true;
    }
  }
  if (s.phase === 'deliver' && near(s, ORDERS[s.orderIndex], 3.8) && Math.abs(s.speed) <= 2.2) {
    finish(s, true);
    return true;
  }
  return false;
}

function collide(s, colliders, radius) {
  let hit = false;
  for (const c of colliders) {
    const minX = c.minX ?? c.x - (c.w ?? c.width) / 2;
    const maxX = c.maxX ?? c.x + (c.w ?? c.width) / 2;
    const minZ = c.minZ ?? c.z - (c.d ?? c.depth) / 2;
    const maxZ = c.maxZ ?? c.z + (c.d ?? c.depth) / 2;
    if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) continue;
    const dx = s.x - clamp(s.x, minX, maxX), dz = s.z - clamp(s.z, minZ, maxZ);
    const distance = Math.hypot(dx, dz);
    if (distance >= radius) continue;
    hit = true;
    if (distance > 0) {
      s.x += dx / distance * (radius - distance);
      s.z += dz / distance * (radius - distance);
    } else {
      const exits = [s.x - minX, maxX - s.x, s.z - minZ, maxZ - s.z];
      const side = exits.indexOf(Math.min(...exits));
      if (side === 0) s.x = minX - radius;
      if (side === 1) s.x = maxX + radius;
      if (side === 2) s.z = minZ - radius;
      if (side === 3) s.z = maxZ + radius;
    }
  }
  const limit = SHORE_RADIUS - radius, distance = Math.hypot(s.x, s.z);
  const dockX = clamp(s.x, DOCK.x - DOCK.w / 2 + radius, DOCK.x + DOCK.w / 2 - radius);
  const dockZ = clamp(s.z, DOCK.z - DOCK.d / 2 + radius, DOCK.z + DOCK.d / 2 - radius);
  if (distance > limit && (s.x !== dockX || s.z !== dockZ)) {
    hit = true;
    const shoreX = s.x / distance * limit, shoreZ = s.z / distance * limit;
    if (Math.hypot(s.x - dockX, s.z - dockZ) < distance - limit) {
      s.x = dockX; s.z = dockZ;
    } else {
      s.x = shoreX; s.z = shoreZ;
    }
  }
  return hit;
}

export function tick(s, input = {}, dt = 0, colliders = []) {
  if (!Number.isFinite(dt) || dt <= 0 || !active(s)) return s;
  dt = Math.min(dt, 0.1);
  input = input || {};
  const throttle = axis(input.throttle), steering = axis(input.steer);
  if (input.jump && s.jumpY === 0) {
    s.jumpV = s.mode === 'ride' ? 5.8 : 5;
    s.jumpY = 0.001;
    notify(s, '起跳！落地前松开加速更稳', 'jump');
  }
  const steps = Math.ceil(dt / 0.016), step = dt / steps;
  for (let i = 0; i < steps && active(s); i++) {
    const riding = s.mode === 'ride';
    s.elapsed += step;
    s.timeLeft = Math.max(0, 180 - s.elapsed);
    s.messageTime = Math.max(0, s.messageTime - step);
    s.crashCooldown = Math.max(0, s.crashCooldown - step);
    if (!s.warned && s.timeLeft <= 30) {
      s.warned = true;
      notify(s, '还剩 30 秒，把最后一程送稳！');
    }
    if (s.timeLeft <= 0) { finish(s, false, '超时了，休息一下再出发吧'); break; }
    if (!input.boost && s.energy >= 12) s.boostLocked = false;
    s.boosting = Boolean(riding && input.boost && !input.brake && throttle > 0 && s.energy > 0 && !s.boostLocked);
    s.energy = clamp(s.energy + (s.boosting ? -25 : 13) * step, 0, 100);
    if (s.energy === 0) { s.boostLocked = true; s.boosting = false; }
    const maxSpeed = riding ? s.boosting ? 23 : 15 : 4.8;
    const desired = throttle * (throttle >= 0 ? maxSpeed : riding ? 5 : 3);
    const acceleration = input.brake ? 32 : riding ? throttle ? 11 : 6 : 24;
    s.speed += clamp((input.brake ? 0 : desired) - s.speed, -acceleration * step, acceleration * step);
    s.steer += (steering - s.steer) * Math.min(1, step * 12);
    const turnRate = riding ? 2.5 - Math.min(Math.abs(s.speed) / 23, 1) * 1.25 : 3.8;
    // Arcade heading control: preserve left/right in reverse and while stopped against a wall.
    const turnGrip = riding ? .65 + .35 * Math.min(Math.abs(s.speed) / 2, 1) : 1;
    s.angle += s.steer * turnRate * turnGrip * step;
    s.angle = Math.atan2(Math.sin(s.angle), Math.cos(s.angle));
    s.x += Math.sin(s.angle) * s.speed * step;
    s.z -= Math.cos(s.angle) * s.speed * step;
    const impactSpeed = Math.abs(s.speed);
    if (collide(s, colliders, riding ? 0.7 : 0.42)) {
      s.speed *= 0.25;
      if (riding && impactSpeed > 3 && s.crashCooldown === 0) {
        if (s.phase === 'deliver') s.integrity = Math.max(0, s.integrity - impactSpeed * 1.2);
        s.crashCooldown = 0.8;
        notify(s, s.phase === 'deliver' ? '哎呀！货物颠了一下，慢点过弯' : '前面有障碍，换个方向吧', 'crash');
      }
    }
    if (s.jumpY > 0 || s.jumpV > 0) {
      s.jumpV -= 16 * step;
      s.jumpY = Math.max(0, s.jumpY + s.jumpV * step);
      if (s.jumpY === 0) {
        if (riding && s.phase === 'deliver' && Math.abs(s.speed) > 18) {
          s.integrity = Math.max(0, s.integrity - 3);
          notify(s, '落地有点急，货物需要温柔对待', 'crash');
        }
        s.jumpV = 0;
      }
    }
    if (riding && s.phase === 'deliver' && Math.abs(s.speed) > 12 && Math.abs(s.steer) > 0.68)
      s.integrity = Math.max(0, s.integrity - (Math.abs(s.speed) - 12) * Math.abs(s.steer) * 0.35 * step);
    if (riding) { s.bikeX = s.x; s.bikeZ = s.z; s.bikeAngle = s.angle; }
    if (s.integrity === 0) finish(s, false, '货物损坏了，重新准备一份吧');
  }
  return s;
}

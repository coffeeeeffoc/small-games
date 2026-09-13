const TAU = Math.PI * 2;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const length = (x, y, z) => Math.hypot(x, y, z);
const direction = (p) => ({ x: -Math.sin(p.yaw) * Math.cos(p.pitch), y: Math.sin(p.pitch), z: -Math.cos(p.yaw) * Math.cos(p.pitch) });
const angleDelta = (a, b) => ((a - b + Math.PI) % TAU + TAU) % TAU - Math.PI;

export function terrainHeight(x, z) {
  const hills = 23 + 15 * Math.sin(x * 0.005 + 0.9) * Math.cos(z * 0.004)
    + 13 * Math.sin(z * 0.009 - x * 0.003) + 7 * Math.cos(x * 0.017 + z * 0.011);
  return Math.max(3, hills);
}

function random(s) {
  s._seed = (Math.imul(s._seed, 1664525) + 1013904223) >>> 0;
  return s._seed / 4294967296;
}

function initialState(difficulty = 'normal') {
  return {
    mode: 'menu', difficulty: difficulty === 'easy' ? 'easy' : 'normal', weapon: 'pulse',
    player: { x: 0, y: 105, z: 0, yaw: 0, pitch: 0, roll: 0, speed: 94, hull: 100, shield: 70, energy: 100 },
    enemies: [], shots: [], pickups: [], effects: [], wave: 1, kills: 0, score: 0, time: 0,
    missiles: 6, missileCooldown: 0, scanCooldown: 0, scanTime: 0, shotCooldown: 0, heat: 0,
    notice: '', noticeTime: 0, events: [], _pendingEvents: [], _seed: 20260912, _nextId: 1,
    _waveDelay: 0, _invulnerable: 0, _damageAgo: 100, _overheated: false, _boosting: false,
  };
}

function notice(s, message, seconds = 2.5) {
  s.notice = message;
  s.noticeTime = seconds;
}

function spawnWave(s) {
  const p = s.player;
  const forward = { x: -Math.sin(p.yaw), z: -Math.cos(p.yaw) };
  const right = { x: Math.cos(p.yaw), z: -Math.sin(p.yaw) };
  for (let i = 0; i < s.wave + 2; i++) {
    const ahead = 240 + i * 70;
    const side = i === 0 ? 0 : (i % 2 ? -1 : 1) * (35 + random(s) * 45);
    const x = p.x + forward.x * ahead + right.x * side;
    const z = p.z + forward.z * ahead + right.z * side;
    const y = Math.max(terrainHeight(x, z) + 40, p.y + (random(s) - 0.5) * 30);
    s.enemies.push({ id: s._nextId++, x, y, z, hp: s.difficulty === 'easy' ? 32 : 44,
      yaw: p.yaw + Math.PI, kind: i % 3 === 2 ? 'interceptor' : 'drone',
      fireCooldown: 2.2 + i * 0.7 + random(s), phase: random(s) * TAU });
  }
  notice(s, `第 ${s.wave} 波 · ${s.wave + 2} 架敌机来袭`, 3);
}

export function createGame() {
  const s = initialState();
  spawnWave(s);
  return s;
}

export function startGame(s, { difficulty = 'normal' } = {}) {
  Object.assign(s, initialState(difficulty));
  s.mode = 'running';
  spawnWave(s);
  s._pendingEvents.push('wave');
  return s;
}

function targetInCone(s, cone, range) {
  const p = s.player;
  const d = direction(p);
  let result = null;
  let best = -Infinity;
  for (const enemy of s.enemies) {
    if (enemy.hp <= 0) continue;
    const dx = enemy.x - p.x, dy = enemy.y - p.y, dz = enemy.z - p.z;
    const distance = length(dx, dy, dz);
    if (distance < 1 || distance > range) continue;
    const dot = (dx * d.x + dy * d.y + dz * d.z) / distance;
    const rank = dot - distance * 0.00006;
    if (dot >= cone && rank > best) { result = enemy; best = rank; }
  }
  return result;
}

/** The pulse assistance cone is 12 degrees; missiles acquire a wider cone. */
export function aimTarget(s) {
  return targetInCone(s, Math.cos(Math.PI / 15), 760);
}

function shot(s, owner, kind, from, to, speed, targetId = null) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const distance = length(dx, dy, dz) || 1;
  s.shots.push({ id: s._nextId++, x: from.x, y: from.y, z: from.z,
    vx: dx / distance * speed, vy: dy / distance * speed, vz: dz / distance * speed,
    owner, kind, targetId, life: kind === 'missile' ? 5 : 3 });
  if (s.shots.length > 120) s.shots.splice(0, s.shots.length - 120);
}

export function action(s, name) {
  if (s.mode !== 'running') return false;
  if (name === 'missile') {
    if (s.missileCooldown > 0 || s.missiles <= 0) {
      if (s.missiles <= 0) notice(s, '导弹已耗尽 · 使用脉冲炮');
      return false;
    }
    const target = targetInCone(s, Math.cos(Math.PI * 0.23), 1000);
    if (!target) { notice(s, '前方没有可锁定的敌机'); return false; }
    const d = direction(s.player);
    const muzzle = { x: s.player.x + d.x * 12, y: s.player.y + d.y * 12 - 1, z: s.player.z + d.z * 12 };
    shot(s, 'player', 'missile', muzzle, target, 235, target.id);
    s.missiles--;
    s.missileCooldown = 3;
    s._pendingEvents.push('missile');
    notice(s, '导弹发射 · 追踪已锁定', 1.5);
    return true;
  }
  if (name === 'scan') {
    if (s.scanCooldown > 0) return false;
    s.scanTime = 6;
    s.scanCooldown = 10;
    s._pendingEvents.push('scan');
    notice(s, '扫描开启 · 雷达增强 / 磁吸回收', 3);
    return true;
  }
  return false;
}

function effect(s, point, kind, life) {
  s.effects.push({ id: s._nextId++, x: point.x, y: point.y, z: point.z, life, maxLife: life, kind });
  if (s.effects.length > 60) s.effects.shift();
}

function damagePlayer(s, amount) {
  if (s._invulnerable > 0 || s.mode !== 'running') return;
  const blocked = Math.min(s.player.shield, amount);
  s.player.shield -= blocked;
  s.player.hull = Math.max(0, s.player.hull - amount + blocked);
  s._invulnerable = 0.55;
  s._damageAgo = 0;
  s.events.push('damage');
  effect(s, s.player, 'damage', 0.35);
  if (s.player.hull <= 0) {
    s.mode = 'lost';
    s.events.push('lost');
    effect(s, s.player, 'explosion', 1.5);
    notice(s, '机体失联 · 本次行动结束', 20);
  }
}

function hitEnemy(s, enemy, amount) {
  if (enemy.hp <= 0) return;
  enemy.hp = Math.max(0, enemy.hp - amount);
  s.events.push('hit');
  effect(s, enemy, 'hit', 0.22);
  if (enemy.hp > 0) return;
  s.kills++;
  s.score += 100;
  s.events.push('kill');
  effect(s, enemy, 'explosion', 1.2);
  s.pickups.push({ id: s._nextId++, x: enemy.x, y: enemy.y, z: enemy.z, life: 40 });
}

// Swept collision keeps fast projectiles from skipping small targets at low frame rates.
function segmentDistance(ax, ay, az, bx, by, bz, point) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const square = dx * dx + dy * dy + dz * dz;
  const t = square ? clamp(((point.x - ax) * dx + (point.y - ay) * dy + (point.z - az) * dz) / square, 0, 1) : 0;
  return length(ax + dx * t - point.x, ay + dy * t - point.y, az + dz * t - point.z);
}

export function updateGame(s, input = {}, dt = 0) {
  s.events = s._pendingEvents.splice(0);
  if (s.mode !== 'running' || !Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, 0.05);
  s.time += dt;
  s._damageAgo += dt;
  for (const key of ['missileCooldown', 'scanCooldown', 'scanTime', 'shotCooldown', 'noticeTime', '_invulnerable']) {
    s[key] = Math.max(0, s[key] - dt);
  }
  s.heat = Math.max(0, s.heat - dt * (input.fire ? 0.23 : 0.5));
  if (s._overheated && s.heat < 0.3) s._overheated = false;

  const p = s.player;
  const ix = Number.isFinite(input.x) ? clamp(input.x, -1, 1) : 0;
  const iy = Number.isFinite(input.y) ? clamp(input.y, -1, 1) : 0;
  p.yaw -= ix * 1.42 * dt;
  p.pitch = clamp(p.pitch - iy * 0.9 * dt - p.pitch * dt * (Math.abs(iy) < 0.05 ? 0.7 : 0.15), -0.65, 0.7);
  p.roll += (-ix * 0.65 - p.roll) * Math.min(1, dt * 7);
  s._boosting = Boolean(input.boost) && p.energy > (s._boosting ? 0 : 12);
  p.energy = clamp(p.energy + dt * (s._boosting ? -29 : 20), 0, 100);
  p.speed += ((s._boosting ? 170 : 94) - p.speed) * Math.min(1, dt * 3);
  const d = direction(p);
  p.x += d.x * p.speed * dt;
  p.y += d.y * p.speed * dt;
  p.z += d.z * p.speed * dt;
  const floor = terrainHeight(p.x, p.z) + 9;
  if (p.y < floor) {
    p.y = floor + 1;
    p.pitch = Math.max(p.pitch, 0.35);
    damagePlayer(s, s.difficulty === 'easy' ? 16 : 26);
    if (s.mode === 'running') notice(s, '地形碰撞 · 拉升机头', 1.8);
  }
  if (p.y > 430) { p.y = 430; p.pitch = Math.min(p.pitch, -0.15); notice(s, '抵达空域上限 · 降低高度', 1.5); }
  if (s.mode !== 'running') return;
  if (s._damageAgo > 5) p.shield = Math.min(70, p.shield + dt * 7);

  if (input.fire && s.shotCooldown <= 0 && !s._overheated) {
    const muzzle = { x: p.x + d.x * 13, y: p.y + d.y * 13, z: p.z + d.z * 13 };
    const target = aimTarget(s) || { x: muzzle.x + d.x * 500, y: muzzle.y + d.y * 500, z: muzzle.z + d.z * 500 };
    shot(s, 'player', 'pulse', muzzle, target, 420);
    s.shotCooldown = 0.135;
    s.heat = Math.min(1, s.heat + 0.1);
    s.events.push('shoot');
    if (s.heat >= 0.99) { s._overheated = true; notice(s, '脉冲炮过热 · 松开发射冷却', 2); }
  }

  for (const enemy of s.enemies) {
    const dx = p.x - enemy.x, dy = p.y - enemy.y, dz = p.z - enemy.z;
    const distance = length(dx, dy, dz);
    const lead = distance > 130 ? Math.min(1.5, distance / 210) : 0;
    const desiredYaw = Math.atan2(-(dx + d.x * p.speed * lead), -(dz + d.z * p.speed * lead));
    enemy.yaw += clamp(angleDelta(desiredYaw, enemy.yaw), -dt * 0.88, dt * 0.88);
    const speed = distance > 260 ? 145 : enemy.kind === 'interceptor' ? 78 : 65;
    enemy.x -= Math.sin(enemy.yaw) * speed * dt;
    enemy.z -= Math.cos(enemy.yaw) * speed * dt;
    enemy.y += clamp(dy + Math.sin(s.time * 0.8 + enemy.phase) * 18, -22, 22) * dt;
    enemy.y = Math.max(terrainHeight(enemy.x, enemy.z) + 24, enemy.y);
    enemy.fireCooldown -= dt;
    if (enemy.fireCooldown <= 0 && distance < 600 && distance > 38) {
      // The small, seeded spread and modest lead leave incoming fire dodgeable.
      const leadTime = Math.min(1.1, distance / 230) * 0.6;
      const spread = s.difficulty === 'easy' ? 28 : 15;
      const target = { x: p.x + d.x * p.speed * leadTime + (random(s) - 0.5) * spread,
        y: p.y + d.y * p.speed * leadTime + (random(s) - 0.5) * spread,
        z: p.z + d.z * p.speed * leadTime + (random(s) - 0.5) * spread };
      shot(s, 'enemy', 'pulse', enemy, target, 190);
      enemy.fireCooldown = (s.difficulty === 'easy' ? 3.7 : 2.45) + random(s) * 1.2;
    }
    if (distance < 15) {
      damagePlayer(s, s.difficulty === 'easy' ? 10 : 18);
      enemy.y += 14;
      enemy.yaw += 0.6;
    }
  }

  for (const projectile of s.shots) {
    if (projectile.life <= 0 || s.mode !== 'running') continue;
    const ax = projectile.x, ay = projectile.y, az = projectile.z;
    if (projectile.kind === 'missile') {
      const target = s.enemies.find((enemy) => enemy.id === projectile.targetId && enemy.hp > 0);
      if (target) {
        const dx = target.x - ax, dy = target.y - ay, dz = target.z - az;
        const distance = length(dx, dy, dz) || 1;
        const turn = Math.min(1, dt * 5);
        projectile.vx += (dx / distance * 250 - projectile.vx) * turn;
        projectile.vy += (dy / distance * 250 - projectile.vy) * turn;
        projectile.vz += (dz / distance * 250 - projectile.vz) * turn;
      }
    }
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.z += projectile.vz * dt;
    projectile.life -= dt;
    const candidates = projectile.owner === 'player' ? s.enemies : [p];
    for (const target of candidates) {
      if (projectile.owner === 'player' && target.hp <= 0) continue;
      if (segmentDistance(ax, ay, az, projectile.x, projectile.y, projectile.z, target) > (projectile.owner === 'player' ? 12 : 7)) continue;
      projectile.life = 0;
      if (projectile.owner === 'player') hitEnemy(s, target, projectile.kind === 'missile' ? 90 : 17);
      else damagePlayer(s, s.difficulty === 'easy' ? 8 : 14);
      break;
    }
    if (projectile.y < terrainHeight(projectile.x, projectile.z)) projectile.life = 0;
  }
  s.enemies = s.enemies.filter((enemy) => enemy.hp > 0);
  s.shots = s.shots.filter((projectile) => projectile.life > 0);

  for (const pickup of s.pickups) {
    pickup.life -= dt;
    const dx = p.x - pickup.x, dy = p.y - pickup.y, dz = p.z - pickup.z;
    const distance = length(dx, dy, dz);
    if (distance < (s.scanTime > 0 ? 340 : 65)) {
      const move = Math.min(1, dt * ((s.scanTime > 0 ? 260 : 185) / Math.max(1, distance) + 2.6));
      pickup.x += dx * move;
      pickup.y += dy * move;
      pickup.z += dz * move;
    }
    if (distance < 16) {
      pickup.life = 0;
      s.score += 50;
      p.shield = Math.min(70, p.shield + 14);
      p.energy = Math.min(100, p.energy + 18);
      s.events.push('pickup');
      effect(s, pickup, 'pickup', 0.7);
    }
  }
  s.pickups = s.pickups.filter((pickup) => pickup.life > 0);
  for (const burst of s.effects) burst.life -= dt;
  s.effects = s.effects.filter((burst) => burst.life > 0);

  if (s.mode === 'running' && s.enemies.length === 0) {
    if (s.wave === 3 && s.kills >= 12) {
      s.mode = 'won';
      s.score += Math.round(p.hull * 5);
      s.events.push('won');
      notice(s, '空域已肃清 · 行动完成', 20);
    } else {
      if (s._waveDelay === 0) { s._waveDelay = 2.6; notice(s, '空域暂时安全 · 下一波接近中', 2.6); }
      s._waveDelay -= dt;
      if (s._waveDelay <= 0) {
        s.wave++;
        s._waveDelay = 0;
        spawnWave(s);
        s.events.push('wave');
      }
    }
  }
}

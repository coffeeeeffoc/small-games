import { WEAPONS, SPECIAL_WEAPONS } from './weapons.mjs';
export { WEAPONS };
import { LEVELS, validateLevels } from './levels.mjs';
export { LEVELS, validateLevels };

export const UPGRADES = [
  {
    id: 'power',
    name: '强化弹药',
    short: '伤害+10%',
    icon: 'pierce',
    description: '所有武器伤害提升 10%，最多提升至 3 倍。',
  },
  {
    id: 'medical',
    name: '战地急救',
    short: '回复25生命',
    icon: 'salvage',
    description: '回复 25 生命，生命上限增加 5。',
  },
  {
    id: 'rapid',
    name: '快速扳机',
    short: '射速+8%',
    icon: 'rapid',
    description: '射击间隔缩短 8%，可叠加。',
  },
  {
    id: 'mobility',
    name: '机动推进器',
    short: '冲刺更快恢复',
    icon: 'mobility',
    description: '冲刺冷却缩短 12%，并回复 10 生命。',
  },
  {
    id: 'overdrive',
    name: '超载强化',
    short: '伤害+30% / 生命+30',
    icon: 'scatter',
    rewarded: true,
    description: '伤害提升 30%，生命上限增加 30 并回复 30。需完整观看广告。',
  },
];

const GRAVITY = 1900;
const ENEMY_STATS = {
  shooter: { w: 36, h: 60, hp: 100 },
  chaser: { w: 40, h: 58, hp: 80 },
  drone: { w: 48, h: 32, hp: 60 },
  turret: { w: 64, h: 62, hp: 300 },
  boss: { w: 112, h: 140, hp: 900 },
};
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const centreY = (actor) => actor.y - actor.h * 0.55;
const distance = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const nextId = (run, prefix) => `${prefix}${++run._entitySeq}`;

function random(run) {
  run.seed = (Math.imul(run.seed, 1664525) + 1013904223) >>> 0;
  return run.seed / 4294967296;
}

function emit(run, type, data = {}) {
  run.events.push({ ...data, type, id: ++run._eventSeq });
}

function spawnEnemy(run, config, waveIndex = run.waveIndex) {
  const stats = ENEMY_STATS[config.type];
  return {
    id: nextId(run, 'e'),
    type: config.type,
    waveIndex,
    ...stats,
    maxHp: stats.hp,
    fired: false,
    engaged: false,
    x: config.x,
    y: config.y,
    baseY: config.y,
    vx: 0,
    vy: 0,
    facing: -1,
    onGround: config.type !== 'drone',
    hitFlash: 0,
    fireFlash: 0,
    aimAngle: Math.PI,
    state: config.type === 'boss' ? 'idle' : 'patrol',
    timer: config.type === 'boss' ? 0.85 : 0.35 + random(run) * 0.12,
    phase: 1,
    attack: null,
    nextAttack: 'charge',
    volleyPulses: 0,
    knockback: 0,
    contactCooldown: 0,
    floatOffset: random(run) * Math.PI * 2,
  };
}

function activateEncounter(run, index, bosses = false) {
  const encounter = run.encounters[index];
  const configs = run.level.waves[index].enemies.filter((enemy) =>
    enemy.type === 'boss' ? bosses && !encounter.boss : !encounter.guards,
  );
  run.enemies.push(...configs.map((config) => spawnEnemy(run, config, index)));
  encounter.guards = true;
  if (bosses) encounter.boss = true;
}

function spawnWave(run, index) {
  // Reinforcements can arrive near the player's current position. Give a visible
  // grace period so their first contact is always avoidable with ordinary movement.
  if (index > 0) run.player.invulnerable = Math.max(run.player.invulnerable, 1.2);
  run.waveIndex = index;
  run.capture = 0;
  run.reinforcementTime = 0;
  run.checkpointComplete = false;
  run.nextWaveDelay = null;
  activateEncounter(run, index, true);
  emit(run, 'wave', { waveIndex: index, wavesTotal: run.wavesTotal });
}

function loadRoom(run, levelIndex) {
  run.levelIndex = levelIndex;
  run.level = LEVELS[levelIndex];
  run.phase = 'playing';
  run.roomTime = 0;
  run.rewardUsed = { supply: false, revive: false };
  run.roomEpoch++;
  run.choices = [];
  run.exitOpen = false;
  run.supplyUsed = false;
  run.pickups = run.level.pickups.map((item) => ({ ...item, id: nextId(run, 'loot') }));
  run.bullets = [];
  run.enemies = [];
  run.encounters = run.level.waves.map(() => ({ guards: false, boss: false }));
  run.contested = false;
  run.barrels = run.level.barrels.map((config) => ({
    id: nextId(run, 'b'),
    ...config,
    w: 32,
    h: 46,
    hp: 20,
    active: true,
    hitFlash: 0,
  }));
  Object.assign(run.player, {
    ...run.level.spawn,
    vx: 0,
    vy: 0,
    facing: 1,
    onGround: true,
    dashTime: 0,
    dashCooldown: 0,
    invulnerable: 0.4,
    fireCooldown: 0,
    hitFlash: 0,
    fireFlash: 0,
    aimAngle: 0,
    coyoteTime: 0.1,
    jumpBuffer: 0,
    climbing: null,
    burstLeft: 0,
    spin: 0,
  });
  run.wavesTotal = run.level.waves.length;
  spawnWave(run, 0);
}

export function createRun(
  startIndex = 0,
  { seed = Math.floor(Math.random() * 4294967296), singleLevel = false } = {},
) {
  const errors = validateLevels();
  if (errors.length) throw new Error(errors.join('\n'));
  const index = clamp(Math.trunc(Number(startIndex) || 0), 0, LEVELS.length - 1);
  const run = {
    startIndex: index,
    singleLevel,
    assisted: false,
    retried: false,
    roomEpoch: 0,
    phase: 'playing',
    levelIndex: index,
    level: LEVELS[index],
    player: { x: 0, y: 0, w: 34, h: 62, hp: 120, maxHp: 120 },
    enemies: [],
    bullets: [],
    barrels: [],
    events: [],
    upgrades: [],
    xp: 0,
    xpNext: 60,
    rank: 1,
    upgradeReason: null,
    weapon: 'rifle',
    ammo: 0,
    choices: [],
    roomsCleared: [],
    time: 0,
    roomTime: 0,
    kills: 0,
    shots: 0,
    score: 0,
    damageTaken: 0,
    largestChain: 0,
    tick: 0,
    seed: Number.isFinite(seed) ? seed >>> 0 : 0x41a5f00d,
    _entitySeq: 0,
    _eventSeq: 0,
    nextWaveDelay: null,
    stats: {
      damage: 20,
      damageMultiplier: 1,
      rateMultiplier: 1,
      fireInterval: 0.15,
      moveSpeed: 300,
      jumpSpeed: 780,
      dashSpeed: 960,
      dashDuration: 0.15,
      dashCooldown: 0.85,
      pellets: 1,
      pierce: 0,
      salvage: false,
    },
  };
  loadRoom(run, index);
  return run;
}

/** Inclusive slab intersection also catches a projectile born inside a target. */
function segmentBox(x1, y1, x2, y2, target, padding = 0) {
  const minX = target.x - target.w / 2 - padding;
  const maxX = target.x + target.w / 2 + padding;
  const minY = target.y - target.h - padding;
  const maxY = target.y + padding;
  let near = 0,
    far = 1;
  for (const [start, delta, low, high] of [
    [x1, x2 - x1, minX, maxX],
    [y1, y2 - y1, minY, maxY],
  ]) {
    if (Math.abs(delta) < 1e-9) {
      if (start < low || start > high) return null;
      continue;
    }
    let a = (low - start) / delta,
      b = (high - start) / delta;
    if (a > b) [a, b] = [b, a];
    near = Math.max(near, a);
    far = Math.min(far, b);
    if (near > far) return null;
  }
  return near;
}

function heal(run, amount) {
  if (run.player.hp <= 0) return;
  run.player.hp = Math.min(run.player.maxHp, run.player.hp + amount);
}

function hurtPlayer(run, damage, cause) {
  const p = run.player;
  if (p.hp <= 0 || p.invulnerable > 0 || p.dashTime > 0) return false;
  const taken = Math.min(p.hp, damage);
  p.hp -= taken;
  p.invulnerable = 0.75;
  p.hitFlash = 0.15;
  run.damageTaken += taken;
  emit(run, 'hurt', { x: p.x, y: centreY(p), damage: taken, cause });
  if (p.hp <= 0) {
    run.phase = 'lost';
    emit(run, 'lose', { x: p.x, y: p.y, time: run.time, levelId: run.level.id });
  }
  return true;
}

function hurtEnemy(run, enemy, damage, cause, direction = 0) {
  if (enemy.hp <= 0) return false;
  const armour =
    enemy.type === 'boss' && enemy.state !== 'recover' ? 0.16 : enemy.type === 'turret' ? 0.55 : 1;
  enemy.engaged = true;
  const taken = Math.min(enemy.hp, Math.max(1, Math.round(damage * armour)));
  // A visible first-volley shield prevents an entire encounter dying before it can fire.
  enemy.hp =
    enemy.type !== 'boss' && !enemy.fired ? Math.max(1, enemy.hp - taken) : enemy.hp - taken;
  enemy.hitFlash = 0.065;
  if (!['boss', 'turret'].includes(enemy.type)) enemy.knockback += direction * 85;
  emit(run, 'hit', {
    x: enemy.x,
    y: centreY(enemy),
    damage: taken,
    target: 'enemy',
    enemyType: enemy.type,
    cause,
  });
  if (enemy.hp > 0) return false;
  run.kills++;
  run.xp += enemy.type === 'boss' ? 100 : enemy.type === 'turret' ? 40 : 20;
  if (enemy.type === 'turret' || run.kills % 5 === 0) {
    const weapon = SPECIAL_WEAPONS[(run.kills + run.levelIndex) % SPECIAL_WEAPONS.length];
    run.pickups.push({ id: nextId(run, 'loot'), weapon, x: enemy.x, y: enemy.y });
  }
  run.score += enemy.type === 'boss' ? 1000 : 100;
  heal(run, 3);
  emit(run, 'kill', { x: enemy.x, y: centreY(enemy), enemyType: enemy.type, cause });
  return true;
}

function explode(run, initialBarrel) {
  const queue = [initialBarrel];
  let chainCount = 0;
  while (queue.length) {
    const barrel = queue.shift();
    if (!barrel.active) continue;
    barrel.active = false;
    barrel.hp = 0;
    const x = barrel.x,
      y = barrel.y - barrel.h / 2,
      radius = 182;
    emit(run, 'explode', { x, y, radius, chain: chainCount > 0 });
    chainCount++;
    let salvageHealing = 0;
    for (const enemy of run.enemies) {
      if (enemy.hp <= 0 || distance(x, y, enemy.x, centreY(enemy)) > radius + enemy.w / 3) continue;
      if (hurtEnemy(run, enemy, 150, 'explosion', Math.sign(enemy.x - x)) && run.stats.salvage)
        salvageHealing += 15;
    }
    heal(run, Math.min(30, salvageHealing));
    if (distance(x, y, run.player.x, centreY(run.player)) < radius * 0.62)
      hurtPlayer(run, 12, 'explosion');
    for (const other of run.barrels) {
      if (other.active && distance(x, y, other.x, other.y - other.h / 2) <= radius)
        queue.push(other);
    }
  }
  run.largestChain = Math.max(run.largestChain, chainCount);
}

function addBullet(run, owner, x, y, angle, damage, speed, pierce = 0) {
  run.bullets.push({
    id: nextId(run, 's'),
    owner,
    x,
    y,
    px: x,
    py: y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    damage,
    radius: owner === 'player' ? 2.5 : 5,
    life: 2,
    pierce,
    hitIds: [],
    dead: false,
  });
}

function playerAim(run, input) {
  const p = run.player;
  const x = p.x,
    y = p.y - p.h * 0.61;
  if (input.aim && Number.isFinite(input.aim.x) && Number.isFinite(input.aim.y))
    return Math.atan2(input.aim.y - y, input.aim.x - x);
  const direction = input.aimDirection;
  if (
    direction &&
    Number.isFinite(direction.x) &&
    Number.isFinite(direction.y) &&
    (direction.x !== 0 || direction.y !== 0)
  )
    return Math.atan2(direction.y, direction.x);
  return p.facing > 0 ? 0 : Math.PI;
}

function shootPlayer(run) {
  const p = run.player,
    angle = p.aimAngle;
  // Start inside the player silhouette, so overlapping enemies cannot evade the muzzle.
  const x = p.x + Math.cos(angle) * 6,
    y = p.y - p.h * 0.61 + Math.sin(angle) * 6;
  const weapon = WEAPONS[run.weapon];
  for (const offset of weapon.spread) {
    addBullet(
      run,
      'player',
      x,
      y,
      angle + offset,
      weapon.damage * run.stats.damageMultiplier,
      weapon.speed,
      weapon.pierce || run.stats.pierce,
    );
    Object.assign(run.bullets.at(-1), {
      life: weapon.life,
      weapon: run.weapon,
      blast: weapon.blast || 0,
      radius: run.weapon === 'flame' ? 10 : run.weapon === 'cannon' ? 7 : 2.5,
    });
  }
  if (run.weapon !== 'rifle' && --run.ammo <= 0) {
    run.weapon = 'rifle';
    run.ammo = 0;
    p.burstLeft = 0;
    emit(run, 'weapon', { weapon: 'rifle' });
  }
  run.shots++;
  p.fireFlash = 0.08;
  emit(run, 'shoot', {
    x: p.x + Math.cos(angle) * 28,
    y: p.y - p.h * 0.61 + Math.sin(angle) * 28,
    angle,
    owner: 'player',
  });
}

function moveBody(body, level, dt) {
  const previousY = body.y;
  const underground = level.tunnels.find(
    (t) => body.y > level.ground + 1 && body.x >= t.x && body.x <= t.x + t.w,
  );
  body.x = clamp(body.x + body.vx * dt, body.w / 2 + 8, level.width - body.w / 2 - 8);
  if (underground)
    body.x = clamp(body.x, underground.x + body.w / 2, underground.x + underground.w - body.w / 2);
  body.vy += GRAVITY * dt;
  body.y += body.vy * dt;
  if (underground && body.vy < 0 && body.y - body.h < level.ground + 12) {
    body.y = level.ground + body.h + 12;
    body.vy = 0;
  }
  body.onGround = false;
  if (body.vy >= 0) {
    const tunnel = level.tunnels.find(
      (t) => body.x >= t.x && body.x <= t.x + t.w && previousY > level.ground + 1,
    );
    let floor = tunnel ? tunnel.floor : level.ground;
    for (const platform of level.platforms) {
      if (
        body.x + body.w * 0.36 > platform.x &&
        body.x - body.w * 0.36 < platform.x + platform.w &&
        previousY <= platform.y + 0.5 &&
        body.y >= platform.y
      )
        floor = Math.min(floor, platform.y);
    }
    if (body.y >= floor) {
      body.y = floor;
      body.vy = 0;
      body.onGround = true;
    }
  }
}

function updatePlayer(run, input, dt) {
  const p = run.player,
    move = clamp(Number(input.move) || 0, -1, 1);
  for (const field of [
    'dashCooldown',
    'invulnerable',
    'hitFlash',
    'fireFlash',
    'fireCooldown',
    'jumpBuffer',
  ])
    p[field] = Math.max(0, p[field] - dt);
  p.coyoteTime = p.onGround ? 0.1 : Math.max(0, p.coyoteTime - dt);
  if (Math.abs(move) > 0.1 && p.dashTime <= 0) p.facing = Math.sign(move);
  if (p.jumpBuffer > 0 && p.coyoteTime > 0) {
    p.vy = -run.stats.jumpSpeed;
    p.onGround = false;
    p.coyoteTime = 0;
    p.jumpBuffer = 0;
    emit(run, 'jump', { x: p.x, y: p.y });
  }
  if (p.dashTime > 0) {
    p.vx = p.dashDirection * run.stats.dashSpeed;
    p.dashTime = Math.max(0, p.dashTime - dt);
  } else p.vx = move * run.stats.moveSpeed;
  const climb = clamp(Number(input.climb) || 0, -1, 1);
  const ladder = run.level.ladders.find(
    (l) => Math.abs(p.x - l.x) < 28 && p.y >= l.top - 3 && p.y <= l.bottom + 3,
  );
  if (ladder && Math.abs(climb) > 0.2 && p.dashTime <= 0) p.climbing = ladder;
  if (p.climbing && (input.jump || input.dash || Math.abs(move) > 0.6)) p.climbing = null;
  if (p.climbing) {
    const l = p.climbing;
    p.x = l.x;
    p.vx = 0;
    p.vy = 0;
    p.y = clamp(p.y + climb * 210 * dt, l.top, l.bottom);
    p.onGround = true;
    if ((p.y === l.top && climb < 0) || (p.y === l.bottom && climb > 0)) p.climbing = null;
  } else moveBody(p, run.level, dt);
  p.aimAngle = playerAim(run, input);
  const weapon = WEAPONS[run.weapon];
  p.spin = input.fire ? Math.min(1, p.spin + dt) : 0;
  if (
    (input.fire || p.burstLeft > 0) &&
    p.fireCooldown <= 0 &&
    (!weapon.spinup || p.spin >= weapon.spinup)
  ) {
    if (!p.burstLeft) p.burstLeft = weapon.burst || 1;
    p.burstLeft--;
    shootPlayer(run);
    p.fireCooldown = (p.burstLeft > 0 ? 0.065 : weapon.interval) * run.stats.rateMultiplier;
  }
  for (const item of run.pickups) {
    if (!item.taken && distance(p.x, p.y - 22, item.x, item.y - 22) < 48) {
      equipWeapon(run, item.weapon);
      item.taken = true;
    }
  }
  run.pickups = run.pickups.filter((item) => !item.taken);
}

function enemyShot(run, enemy, angles, damage = 10, speed = 340) {
  enemy.fired = true;
  const x = enemy.x,
    y = enemy.y - enemy.h * 0.62;
  for (const angle of angles) addBullet(run, 'enemy', x, y, angle, damage, speed);
  enemy.aimAngle = angles[Math.floor(angles.length / 2)];
  enemy.fireFlash = 0.08;
  emit(run, 'shoot', {
    x: x + Math.cos(enemy.aimAngle) * enemy.w * 0.6,
    y,
    angle: enemy.aimAngle,
    owner: 'enemy',
  });
}

function beginBossAttack(run, boss) {
  const kind = boss.nextAttack;
  boss.nextAttack = kind === 'charge' ? 'volley' : 'charge';
  const duration = boss.phase === 2 ? 0.72 : 0.92;
  const direction = Math.sign(run.player.x - boss.x) || -1;
  const targetX = clamp(run.player.x + direction * 130, 100, run.level.width - 100);
  boss.facing = direction;
  boss.state = 'telegraph';
  boss.timer = duration;
  boss.attack = {
    kind,
    remaining: duration,
    duration,
    targetX,
    targetY: centreY(run.player),
    direction,
  };
  emit(run, 'warning', { x: boss.x, y: boss.y, kind, duration, targetX, enemyId: boss.id });
}

function bossVolley(run, boss) {
  const angle = Math.atan2(centreY(run.player) - (boss.y - boss.h * 0.62), run.player.x - boss.x);
  const count = boss.phase === 2 ? 9 : 7,
    spread = boss.phase === 2 ? 0.75 : 0.58;
  const angles = Array.from(
    { length: count },
    (_, i) => angle - spread + (i / (count - 1)) * spread * 2,
  );
  enemyShot(run, boss, angles, 12, boss.phase === 2 ? 355 : 305);
}

function updateBoss(run, boss, dt) {
  if (boss.hp <= boss.maxHp / 2 && boss.phase === 1) {
    boss.phase = 2;
    emit(run, 'warning', {
      x: boss.x,
      y: boss.y,
      kind: 'phase2',
      duration: 0.75,
      enemyId: boss.id,
    });
  }
  boss.timer -= dt;
  const dx = run.player.x - boss.x;
  if (boss.state !== 'charge') boss.facing = Math.sign(dx) || boss.facing;
  boss.aimAngle = Math.atan2(centreY(run.player) - (boss.y - boss.h * 0.62), dx);
  if (boss.state === 'idle') {
    if (Math.abs(dx) > 820) {
      boss.x += Math.sign(dx) * 80 * dt;
      boss.timer = Math.max(0.3, boss.timer);
    } else if (boss.timer <= 0) beginBossAttack(run, boss);
  } else if (boss.state === 'telegraph') {
    boss.attack.remaining = Math.max(0, boss.timer);
    if (boss.timer <= 0) {
      boss.state = boss.attack.kind;
      if (boss.state === 'charge') {
        boss.vx = boss.attack.direction * (boss.phase === 2 ? 850 : 690);
        boss.timer = clamp(Math.abs(boss.attack.targetX - boss.x) / Math.abs(boss.vx), 0.38, 1.05);
      } else {
        boss.timer = boss.phase === 2 ? 0.72 : 0.4;
        boss.volleyPulses = 1;
        bossVolley(run, boss);
      }
    }
  } else if (boss.state === 'charge') {
    boss.x = clamp(boss.x + boss.vx * dt, 80, run.level.width - 80);
    if (boss.timer <= 0) {
      boss.vx = 0;
      boss.state = 'recover';
      boss.timer = 1.15;
      boss.attack = null;
    }
  } else if (boss.state === 'volley') {
    if (boss.phase === 2 && boss.volleyPulses === 1 && boss.timer < 0.32) {
      bossVolley(run, boss);
      boss.volleyPulses++;
    }
    if (boss.timer <= 0) {
      boss.state = 'recover';
      boss.timer = 1.15;
      boss.attack = null;
    }
  } else if (boss.state === 'recover' && boss.timer <= 0) beginBossAttack(run, boss);
}

function updateEnemies(run, dt) {
  for (const enemy of run.enemies) {
    if (enemy.hp <= 0) continue;
    enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
    enemy.fireFlash = Math.max(0, enemy.fireFlash - dt);
    enemy.contactCooldown = Math.max(0, enemy.contactCooldown - dt);
    if (enemy.type === 'boss') {
      updateBoss(run, enemy, dt);
      continue;
    }
    const dx = run.player.x - enemy.x,
      range = Math.abs(dx);
    enemy.facing = Math.sign(dx) || enemy.facing;
    enemy.aimAngle = Math.atan2(centreY(run.player) - (enemy.y - enemy.h * 0.62), dx);
    if (range < 750 || enemy.engaged) enemy.timer -= dt;
    enemy.knockback *= Math.pow(0.035, dt);
    if (!enemy.fired && enemy.timer <= 0 && (range < 750 || enemy.engaged)) {
      enemyShot(run, enemy, [enemy.aimAngle], 12, 360);
      enemy.timer = 1.25;
    }
    if (enemy.type === 'turret') {
      enemy.state = enemy.timer < 0.45 ? 'aim' : 'guard';
      if (range < 850 && enemy.timer <= 0) {
        enemyShot(
          run,
          enemy,
          [-0.18, 0, 0.18].map((a) => a + enemy.aimAngle),
          14,
          385,
        );
        enemy.timer = 1.45;
      }
    } else if (enemy.type === 'chaser') {
      enemy.state = 'chase';
      enemy.vx = (range > 30 ? enemy.facing * 132 : 0) + enemy.knockback;
      if (enemy.onGround && run.player.y < enemy.y - 85 && range < 310 && enemy.timer <= 0) {
        enemy.vy = -700;
        enemy.timer = 1.2;
      }
      moveBody(enemy, run.level, dt);
    } else if (enemy.type === 'drone') {
      enemy.state = enemy.timer < 0.4 ? 'aim' : 'hover';
      enemy.vx =
        (range > 425 ? enemy.facing * 92 : range < 180 ? -enemy.facing * 58 : 0) + enemy.knockback;
      enemy.x = clamp(enemy.x + enemy.vx * dt, 45, run.level.width - 45);
      enemy.y = enemy.baseY + Math.sin(run.roomTime * 2.1 + enemy.floatOffset) * 24;
      if (range < 600 && enemy.timer <= 0) {
        enemyShot(run, enemy, [enemy.aimAngle], 8, 310);
        enemy.timer = 1.4;
      }
    } else {
      enemy.vx = (range > 590 ? enemy.facing * 58 : 0) + enemy.knockback;
      enemy.state = range < 720 && enemy.timer < 0.5 ? 'aim' : 'patrol';
      moveBody(enemy, run.level, dt);
      if (range < 670 && enemy.timer <= 0) {
        enemyShot(run, enemy, [enemy.aimAngle], 10, 335);
        enemy.timer = 1.15 + random(run) * 0.25;
      }
    }
    if (range > 850 && !enemy.engaged) enemy.timer = Math.max(enemy.timer, 0.35);
  }
}

export function crossesFloor(level, x1, y1, x2, y2) {
  if (y1 <= level.ground === y2 <= level.ground) return false;
  const x = x1 + ((x2 - x1) * (level.ground - y1)) / (y2 - y1);
  return !level.ladders.some(
    (l) => l.top === level.ground && l.bottom > level.ground && Math.abs(x - l.x) < 23,
  );
}

function updateBullets(run, dt) {
  for (const bullet of run.bullets) {
    if (bullet.dead) continue;
    bullet.px = bullet.x;
    bullet.py = bullet.y;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
    if (crossesFloor(run.level, bullet.px, bullet.py, bullet.x, bullet.y)) {
      bullet.dead = true;
      continue;
    }
    if (bullet.owner === 'player') {
      const hits = [];
      for (const target of [...run.enemies, ...run.barrels]) {
        if (target.hp <= 0 || target.active === false || bullet.hitIds.includes(target.id))
          continue;
        const t = segmentBox(bullet.px, bullet.py, bullet.x, bullet.y, target, bullet.radius);
        if (t !== null) hits.push({ t, target });
      }
      hits.sort((a, b) => a.t - b.t);
      for (const { target } of hits) {
        if (target.hp <= 0 || target.active === false) continue;
        bullet.hitIds.push(target.id);
        if (target.active === true) {
          target.hp -= bullet.damage;
          target.hitFlash = 0.08;
          emit(run, 'hit', {
            x: target.x,
            y: target.y - target.h / 2,
            damage: bullet.damage,
            target: 'barrel',
          });
          if (target.hp <= 0) explode(run, target);
        } else hurtEnemy(run, target, bullet.damage, 'bullet', Math.sign(bullet.vx));
        if (bullet.blast) {
          emit(run, 'explode', { x: target.x, y: centreY(target), radius: bullet.blast });
          for (const other of run.enemies)
            if (
              other !== target &&
              distance(target.x, centreY(target), other.x, centreY(other)) < bullet.blast
            )
              hurtEnemy(run, other, bullet.damage * 0.7, 'explosion');
        }
        if (bullet.pierce <= 0) {
          bullet.dead = true;
          break;
        }
        bullet.pierce--;
      }
    } else if (
      segmentBox(bullet.px, bullet.py, bullet.x, bullet.y, run.player, bullet.radius) !== null
    ) {
      hurtPlayer(run, bullet.damage, 'bullet');
      bullet.dead = true;
    }
    if (
      bullet.life <= 0 ||
      bullet.x < -80 ||
      bullet.x > run.level.width + 80 ||
      bullet.y < -100 ||
      bullet.y > Math.max(run.level.ground, ...run.level.tunnels.map((t) => t.floor)) + 120
    )
      bullet.dead = true;
  }
  run.bullets = run.bullets.filter((bullet) => !bullet.dead);
}

function contactDamage(run) {
  const p = run.player;
  for (const enemy of run.enemies) {
    if (enemy.hp <= 0 || enemy.contactCooldown > 0 || enemy.type === 'drone') continue;
    if (
      Math.abs(p.x - enemy.x) < (p.w + enemy.w) / 2 - 5 &&
      p.y > enemy.y - enemy.h + 6 &&
      p.y - p.h < enemy.y - 6
    ) {
      if (
        hurtPlayer(
          run,
          enemy.type === 'boss' && enemy.state === 'charge' ? 22 : 10,
          enemy.state === 'charge' ? 'charge' : 'contact',
        )
      )
        enemy.contactCooldown = 0.9;
    }
  }
}

function upgradeChoices(run) {
  return [run.rank % 2 ? 'power' : 'rapid', run.rank % 2 ? 'medical' : 'mobility', 'overdrive'];
}

export function equipWeapon(run, id) {
  if (!WEAPONS[id]) return false;
  run.weapon = id;
  run.ammo = WEAPONS[id].ammo;
  run.player.burstLeft = 0;
  run.player.spin = 0;
  emit(run, 'weapon', { weapon: id });
  return true;
}

export function grantSupply(run) {
  if (run.phase !== 'playing' || run.supplyUsed) return false;
  run.supplyUsed = true;
  heal(run, 40);
  equipWeapon(run, 'machine');
  return true;
}

function checkProgress(run, dt) {
  if (run.phase !== 'playing') return;
  const wave = run.level.waves[run.waveIndex];
  const defenders = run.enemies.filter(
    (enemy) => enemy.waveIndex === run.waveIndex && enemy.hp > 0,
  );
  if (wave.captureSeconds && !run.checkpointComplete) {
    const nearby = Math.abs(run.player.x - wave.checkpointX) <= wave.radius;
    const contested = run.enemies.some(
      (e) => e.hp > 0 && Math.abs(e.x - wave.checkpointX) < wave.contestRadius,
    );
    run.contested = contested;
    if (nearby && !contested) run.capture = Math.min(wave.captureSeconds, run.capture + dt);
    if (nearby) run.reinforcementTime += dt;
    if (
      run.capture < wave.captureSeconds &&
      run.reinforcementTime >= wave.reinforcementInterval &&
      nearby &&
      defenders.length < 12
    ) {
      run.reinforcementTime = 0;
      run.enemies.push(...wave.reinforcements.map((config) => spawnEnemy(run, config)));
      emit(run, 'reinforcements', { x: wave.checkpointX, y: run.level.ground });
    }
    if (run.capture < wave.captureSeconds || defenders.length) return;
    run.checkpointComplete = true;
    heal(run, 18);
    emit(run, 'checkpoint', { x: wave.checkpointX, y: run.level.ground });
  }
  if (defenders.length) return;
  if (run.waveIndex + 1 < run.wavesTotal) {
    const next = run.level.waves[run.waveIndex + 1];
    if (next.checkpointX && run.player.x < next.checkpointX - 620) return;
    if (run.nextWaveDelay === null)
      run.nextWaveDelay = run.level.waves[run.waveIndex + 1].delay ?? 0.9;
    run.nextWaveDelay -= dt;
    if (run.nextWaveDelay <= 0) spawnWave(run, run.waveIndex + 1);
    return;
  }
  if (run.enemies.some((enemy) => enemy.hp > 0)) return;
  run.exitOpen = true;
  if (run.player.x < run.level.exitX - 35 || Math.abs(run.player.y - run.level.ground) > 4) return;
  if (!run.roomsCleared.includes(run.level.id)) {
    run.roomsCleared.push(run.level.id);
    heal(run, run.level.reward.heal);
    emit(run, 'room-clear', {
      levelIndex: run.levelIndex,
      levelId: run.level.id,
      time: run.roomTime,
    });
  }
  if (!run.singleLevel && run.level.unlocks.length && run.level.reward.upgrade) {
    run.phase = 'upgrade';
    run.upgradeReason = 'room';
    run.choices = upgradeChoices(run);
  } else {
    run.phase = 'won';
    emit(run, 'win', { time: run.time, kills: run.kills, score: run.score });
  }
}

/** Mutates and returns run. UI owns pause; all durations are seconds. */
export function stepRun(run, input = {}, dt = 1 / 60) {
  run.events = [];
  run.tick++;
  if (run.phase !== 'playing' || !Number.isFinite(dt) || dt <= 0) return run;
  const elapsed = Math.min(dt, 0.1);
  const p = run.player;
  if (input.jump) p.jumpBuffer = 0.11;
  if (input.dash && p.dashCooldown <= 0) {
    p.dashDirection = Math.abs(Number(input.move) || 0) > 0.1 ? Math.sign(input.move) : p.facing;
    p.facing = p.dashDirection;
    p.dashTime = run.stats.dashDuration;
    p.dashCooldown = run.stats.dashCooldown;
    p.invulnerable = Math.max(p.invulnerable, run.stats.dashDuration + 0.035);
    emit(run, 'dash', { x: p.x, y: centreY(p), facing: p.facing });
  }
  let remaining = elapsed;
  while (remaining > 1e-7 && run.phase === 'playing') {
    const slice = Math.min(remaining, 1 / 120);
    remaining -= slice;
    run.time += slice;
    run.roomTime += slice;
    updatePlayer(run, input, slice);
    const width = Number.isFinite(input.viewWidth) ? clamp(input.viewWidth, 720, 2400) : 1280;
    const right = Math.max(0, Math.min(run.level.width - width, p.x - width * 0.34)) + width;
    for (const [index, wave] of run.level.waves.entries()) {
      if (wave.checkpointX && wave.checkpointX <= right && !run.encounters[index].guards)
        activateEncounter(run, index);
    }
    updateEnemies(run, slice);
    updateBullets(run, slice);
    if (run.phase === 'playing') contactDamage(run);
    run.enemies = run.enemies.filter((enemy) => enemy.hp > 0);
    for (const barrel of run.barrels) barrel.hitFlash = Math.max(0, barrel.hitFlash - slice);
    if (run.phase === 'playing' && run.xp >= run.xpNext) {
      run.xp -= run.xpNext;
      run.xpNext = Math.min(120, run.xpNext + 30);
      run.rank++;
      run.phase = 'upgrade';
      run.upgradeReason = 'experience';
      run.choices = upgradeChoices(run);
    }
    checkProgress(run, slice);
  }
  return run;
}

/** Returns true only once, when a displayed upgrade is successfully applied. */
export function chooseUpgrade(run, id, { rewarded = false } = {}) {
  if (run.phase !== 'upgrade' || !run.choices.includes(id)) return false;
  const upgrade = UPGRADES.find((item) => item.id === id);
  if (!upgrade || (upgrade.rewarded && !rewarded)) return false;
  run.upgrades.push(id);
  if (id === 'power') run.stats.damageMultiplier = Math.min(3, run.stats.damageMultiplier * 1.1);
  if (id === 'medical') {
    run.player.maxHp += 5;
    heal(run, 25);
  }
  if (id === 'rapid') run.stats.rateMultiplier = Math.max(0.5, run.stats.rateMultiplier * 0.92);
  if (id === 'mobility') {
    run.stats.dashCooldown = Math.max(0.35, run.stats.dashCooldown * 0.88);
    heal(run, 10);
  }
  if (id === 'overdrive') {
    run.stats.damageMultiplier = Math.min(3, run.stats.damageMultiplier * 1.3);
    run.player.maxHp += 30;
    heal(run, 30);
  }
  emit(run, 'upgrade', { upgradeId: id });
  run.choices = [];
  if (run.upgradeReason === 'experience') {
    run.phase = 'playing';
    return true;
  }
  return continueRun(run);
}

/** A fully modified build still advances for free. */
export function continueRun(run) {
  if (run.phase !== 'upgrade') return false;
  if (run.choices.length) return false;
  const nextIndex = LEVELS.findIndex((level) => level.id === run.level.unlocks[0]);
  if (nextIndex >= 0) loadRoom(run, nextIndex);
  else {
    run.phase = 'won';
    emit(run, 'win', { time: run.time, kills: run.kills, score: run.score });
  }
  return true;
}

/** Retry only the current sector; keep earned modifications, never a clean-run record. */
export function retryRoom(run) {
  run.retried = true;
  run.roomsCleared = run.roomsCleared.filter((id) => id !== run.level.id);
  run.player.hp = run.player.maxHp;
  run.events = [];
  loadRoom(run, run.levelIndex);
}

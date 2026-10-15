import { LEVELS, validateLevels } from './levels.mjs';
export { LEVELS, validateLevels };

export const UPGRADES = [
  {
    id: 'scatter',
    name: '散射弹匣',
    short: '三发齐射',
    icon: 'scatter',
    description: '每次射出 3 发子弹，单发伤害降为 9。',
  },
  {
    id: 'pierce',
    name: '穿甲弹芯',
    short: '贯穿目标',
    icon: 'pierce',
    description: '子弹额外贯穿 1 个目标，可连续命中 2 名敌人。',
  },
  {
    id: 'salvage',
    name: '战地回收',
    short: '爆破回血',
    icon: 'salvage',
    description: '爆炸击杀额外回复 15 生命，每次爆炸最多回复 30。',
  },
  {
    id: 'rapid',
    name: '快速扳机',
    short: '更快连射',
    icon: 'rapid',
    description: '缩短射击间隔，让火力持续压制敌人。',
  },
  {
    id: 'mobility',
    name: '机动推进器',
    short: '灵活闪避',
    icon: 'mobility',
    description: '冲刺冷却缩短至 0.55 秒，移动速度提升 15%。',
  },
];

const GRAVITY = 1900;
const ENEMY_STATS = {
  shooter: { w: 36, h: 60, hp: 100 },
  chaser: { w: 40, h: 58, hp: 80 },
  drone: { w: 48, h: 32, hp: 60 },
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

function spawnEnemy(run, config) {
  const stats = ENEMY_STATS[config.type];
  return {
    id: nextId(run, 'e'),
    type: config.type,
    ...stats,
    maxHp: stats.hp,
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
    timer: config.type === 'boss' ? 0.85 : 0.9 + random(run) * 0.9,
    phase: 1,
    attack: null,
    nextAttack: 'charge',
    volleyPulses: 0,
    knockback: 0,
    contactCooldown: 0,
    floatOffset: random(run) * Math.PI * 2,
  };
}

function spawnWave(run, index) {
  // Reinforcements can arrive near the player's current position. Give a visible
  // grace period so their first contact is always avoidable with ordinary movement.
  if (index > 0) run.player.invulnerable = Math.max(run.player.invulnerable, 1.2);
  run.waveIndex = index;
  run.nextWaveDelay = null;
  run.enemies = run.level.waves[index].enemies.map((config) => spawnEnemy(run, config));
  emit(run, 'wave', { waveIndex: index, wavesTotal: run.wavesTotal });
}

function loadRoom(run, levelIndex) {
  run.levelIndex = levelIndex;
  run.level = LEVELS[levelIndex];
  run.phase = 'playing';
  run.roomTime = 0;
  run.choices = [];
  run.bullets = [];
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
  });
  run.wavesTotal = run.level.waves.length;
  spawnWave(run, 0);
}

export function createRun(startIndex = 0, { seed = Math.floor(Math.random() * 4294967296) } = {}) {
  const errors = validateLevels();
  if (errors.length) throw new Error(errors.join('\n'));
  const index = clamp(Math.trunc(Number(startIndex) || 0), 0, LEVELS.length - 1);
  const run = {
    startIndex: index,
    phase: 'playing',
    levelIndex: index,
    level: LEVELS[index],
    player: { x: 0, y: 0, w: 34, h: 62, hp: 120, maxHp: 120 },
    enemies: [],
    bullets: [],
    barrels: [],
    events: [],
    upgrades: [],
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
  const armour = enemy.type === 'boss' && enemy.state !== 'recover' ? 0.16 : 1;
  const taken = Math.min(enemy.hp, Math.max(1, Math.round(damage * armour)));
  enemy.hp -= taken;
  enemy.hitFlash = 0.065;
  if (enemy.type !== 'boss') enemy.knockback += direction * 85;
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
  run.score += enemy.type === 'boss' ? 1000 : 100;
  heal(run, 2);
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
  let target = null,
    best = 950;
  for (const enemy of run.enemies) {
    if (enemy.hp <= 0 || (enemy.x - p.x) * p.facing < -12) continue;
    const d = distance(x, y, enemy.x, centreY(enemy));
    if (d < best) {
      best = d;
      target = enemy;
    }
  }
  return target ? Math.atan2(centreY(target) - y, target.x - x) : p.facing > 0 ? 0 : Math.PI;
}

function shootPlayer(run) {
  const p = run.player,
    angle = p.aimAngle;
  // Start inside the player silhouette, so overlapping enemies cannot evade the muzzle.
  const x = p.x + Math.cos(angle) * 6,
    y = p.y - p.h * 0.61 + Math.sin(angle) * 6;
  const spread = run.stats.pellets === 3 ? [-0.115, 0, 0.115] : [0];
  for (const offset of spread)
    addBullet(
      run,
      'player',
      x,
      y,
      angle + offset,
      run.stats.pellets === 3 ? 9 : run.stats.damage,
      1260,
      run.stats.pierce,
    );
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
  body.x = clamp(body.x + body.vx * dt, body.w / 2 + 8, level.width - body.w / 2 - 8);
  body.vy += GRAVITY * dt;
  body.y += body.vy * dt;
  body.onGround = false;
  if (body.vy >= 0) {
    let floor = level.ground;
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
  moveBody(p, run.level, dt);
  p.aimAngle = playerAim(run, input);
  if (input.fire && p.fireCooldown <= 0) {
    shootPlayer(run);
    p.fireCooldown = run.stats.fireInterval;
  }
}

function enemyShot(run, enemy, angles, damage = 10, speed = 340) {
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
    enemy.timer -= dt;
    enemy.knockback *= Math.pow(0.035, dt);
    if (enemy.type === 'chaser') {
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
        enemy.timer = 2.25;
      }
    } else {
      enemy.vx = (range > 590 ? enemy.facing * 58 : 0) + enemy.knockback;
      enemy.state = range < 720 && enemy.timer < 0.5 ? 'aim' : 'patrol';
      moveBody(enemy, run.level, dt);
      if (range < 670 && enemy.timer <= 0) {
        enemyShot(run, enemy, [enemy.aimAngle], 10, 335);
        enemy.timer = 1.75 + random(run) * 0.35;
      }
    }
    if (range > 760) enemy.timer = Math.max(enemy.timer, 0.5);
  }
}

function updateBullets(run, dt) {
  for (const bullet of run.bullets) {
    if (bullet.dead) continue;
    bullet.px = bullet.x;
    bullet.py = bullet.y;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
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
      bullet.y > run.level.ground + 120
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
  const available = UPGRADES.filter((upgrade) => !run.upgrades.includes(upgrade.id));
  // The first clear introduces all three core builds; the second never repeats a choice already owned.
  const core = available.filter((upgrade) => ['scatter', 'pierce', 'salvage'].includes(upgrade.id));
  const support = available.filter(
    (upgrade) => !['scatter', 'pierce', 'salvage'].includes(upgrade.id),
  );
  const choices = !run.upgrades.length
    ? core
    : [...core, support[Math.floor(random(run) * support.length)]].filter(Boolean).slice(0, 3);
  for (let index = choices.length - 1; index > 0; index--) {
    const other = Math.floor(random(run) * (index + 1));
    [choices[index], choices[other]] = [choices[other], choices[index]];
  }
  return choices.map((upgrade) => upgrade.id);
}

function checkProgress(run, dt) {
  if (run.phase !== 'playing' || run.enemies.some((enemy) => enemy.hp > 0)) return;
  if (run.waveIndex + 1 < run.wavesTotal) {
    if (run.nextWaveDelay === null)
      run.nextWaveDelay = run.level.waves[run.waveIndex + 1].delay ?? 0.9;
    run.nextWaveDelay -= dt;
    if (run.nextWaveDelay <= 0) spawnWave(run, run.waveIndex + 1);
    return;
  }
  if (!run.roomsCleared.includes(run.level.id)) {
    run.roomsCleared.push(run.level.id);
    heal(run, run.level.reward.heal);
    emit(run, 'room-clear', {
      levelIndex: run.levelIndex,
      levelId: run.level.id,
      time: run.roomTime,
    });
  }
  if (run.level.unlocks.length && run.level.reward.upgrade) {
    run.phase = 'upgrade';
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
    updateEnemies(run, slice);
    updateBullets(run, slice);
    if (run.phase === 'playing') contactDamage(run);
    run.enemies = run.enemies.filter((enemy) => enemy.hp > 0);
    for (const barrel of run.barrels) barrel.hitFlash = Math.max(0, barrel.hitFlash - slice);
    checkProgress(run, slice);
  }
  return run;
}

/** Returns true only once, when a displayed upgrade is successfully applied. */
export function chooseUpgrade(run, id) {
  if (run.phase !== 'upgrade' || !run.choices.includes(id) || run.upgrades.includes(id))
    return false;
  const upgrade = UPGRADES.find((item) => item.id === id);
  if (!upgrade) return false;
  run.upgrades.push(id);
  if (id === 'scatter') run.stats.pellets = 3;
  if (id === 'pierce') run.stats.pierce = 1;
  if (id === 'salvage') run.stats.salvage = true;
  if (id === 'rapid') run.stats.fireInterval = 0.11;
  if (id === 'mobility') {
    run.stats.dashCooldown = 0.55;
    run.stats.moveSpeed = 345;
  }
  emit(run, 'upgrade', { upgradeId: id });
  const nextIndex = LEVELS.findIndex((level) => level.id === run.level.unlocks[0]);
  if (nextIndex >= 0) loadRoom(run, nextIndex);
  else {
    run.phase = 'won';
    emit(run, 'win', { time: run.time, kills: run.kills, score: run.score });
  }
  return true;
}

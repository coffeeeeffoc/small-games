import { ENEMIES, LEVELS, SEEDS, UPGRADES } from './config.mjs';

const TAU = Math.PI * 2;
const PLAYER_SPEED = 202;
const NORMAL_RANGE = 535;
const SEED_SPEED = 620;
const SEED_COOLDOWN = 0.42;
const DASH_DURATION = 0.15;
const MAX_PARTICLES = 240;
const MAX_FLOATERS = 60;
const MAX_BULLETS = 120;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const levelOf = (state) => LEVELS[state.levelId];
const id = (state) => ++state.nextId;
const countUpgrade = (state, key) => state.upgrades.filter((value) => value === key).length;

function random(state) {
  state.randomState = (Math.imul(1664525, state.randomState) + 1013904223) >>> 0;
  return state.randomState / 4294967296;
}

function event(state, type, detail = {}) {
  state.events.push({ type, ...detail });
  if (state.events.length > 48) state.events.splice(0, state.events.length - 48);
}

function floater(state, x, y, text, color = '#ffffff') {
  state.floaters.push({ x, y: y - 30, text: String(text), color, life: 0.85 });
  if (state.floaters.length > MAX_FLOATERS) state.floaters.shift();
}

function particles(state, x, y, color, count = 7, speed = 100) {
  for (let i = 0; i < count && state.particles.length < MAX_PARTICLES; i += 1) {
    const angle = random(state) * TAU;
    const magnitude = speed * (0.25 + random(state) * 0.75);
    const life = 0.25 + random(state) * 0.35;
    state.particles.push({
      x,
      y: y - 10,
      vx: Math.cos(angle) * magnitude,
      vy: Math.sin(angle) * magnitude,
      life,
      maxLife: life,
      color,
      size: 2 + random(state) * 3,
    });
  }
}

function newEnemy(state, kind, x, y, preview = false) {
  const definition = ENEMIES[kind];
  const scaling = preview ? 1 : 1 + (state.wave - 1) * 0.035;
  const maxHp = Math.round(definition.hp * scaling);
  return {
    id: id(state),
    kind,
    x,
    y,
    hp: maxHp,
    maxHp,
    radius: definition.radius,
    angle: 0,
    hit: 0,
    attackCooldown: 0.5,
    biteCooldown: 0,
    slow: 1,
    age: 0,
    stuck: 0,
  };
}

function newPlant(state, kind, x, y) {
  const definition = SEEDS[kind];
  const iceUpgrades = countUpgrade(state, 'ice-heart');
  const maxHp = definition.health * (kind === 'ice' ? 1 + iceUpgrades * 0.7 : 1);
  return {
    id: id(state),
    kind,
    x,
    y,
    radius:
      definition.radius * (kind === 'thorn' ? 1 + countUpgrade(state, 'thorn-heart') * 0.15 : 1),
    age: 0,
    life: definition.life + (kind === 'ice' ? iceUpgrades * 4 : 0),
    hp: maxHp,
    maxHp,
  };
}

/** A fresh serializable simulation; the ready scene is an inert visual preview. */
export function createGame(levelId = 'ruins', seed = 42) {
  const level = LEVELS[levelId];
  if (!level) throw new RangeError(`Unknown Bullet Garden level: ${levelId}`);
  const initialSeed = finite(seed, 42) >>> 0 || 42;
  const state = {
    levelId,
    phase: 'ready',
    time: 0,
    duration: level.duration,
    wave: 1,
    waveProgress: 0,
    coins: 0,
    kills: 0,
    selectedSeed: 'thorn',
    player: {
      ...level.playerStart,
      hp: 100,
      maxHp: 100,
      radius: 18,
      angle: -0.15,
      invulnerable: 0,
      dashCooldown: 0,
      dashTime: 0,
      dashX: 0,
      dashY: 0,
    },
    seeds: Object.fromEntries(Object.entries(SEEDS).map(([key, value]) => [key, value.capacity])),
    seedRegen: { thorn: 0, ice: 0, mushroom: 0 },
    seedCooldown: 0,
    plantCap: level.plantCap,
    enemies: [],
    plants: [],
    bullets: [],
    particles: [],
    floaters: [],
    telegraphs: [],
    stats: {
      shots: 0,
      seedShots: 0,
      plantsGrown: 0,
      plantKills: 0,
      terrainDamage: 0,
      seedHits: 0,
      damageTaken: 0,
      castsAtGround: 0,
    },
    upgradeChoices: [],
    upgrades: [],
    events: [],
    initialSeed,
    randomState: initialSeed,
    nextId: 0,
    spawnTimer: level.spawn.initialDelay,
    shotCooldown: 0,
    offeredUpgrades: [],
    cameraShake: 0,
  };
  for (const [kind, x, y, age] of [
    ['thorn', 340, 490, 1],
    ['thorn', 905, 325, 1],
    ['thorn', 1060, 585, 1],
    ['thorn', 590, 650, 1],
    ['ice', 490, 280, 1],
    ['ice', 985, 505, 1],
    ['ice', 1120, 310, 1],
    ['mushroom', 850, 420, 0.7],
    ['mushroom', 470, 580, 1.2],
    ['mushroom', 1220, 470, 0.5],
  ])
    state.plants.push({ ...newPlant(state, kind, x, y), age });
  for (const [kind, x, y] of [
    ['sprout', 340, 300],
    ['sprout', 565, 355],
    ['sprout', 1190, 570],
    ['sprout', 1030, 205],
    ['runner', 260, 590],
    ['runner', 800, 645],
    ['brute', 1050, 385],
  ])
    state.enemies.push(newEnemy(state, kind, x, y, true));
  return state;
}

export function startGame(state) {
  const fresh = createGame(state.levelId, state.initialSeed);
  fresh.phase = 'playing';
  fresh.enemies = [];
  fresh.plants = [];
  fresh.nextId = 0;
  fresh.randomState = fresh.initialSeed;
  Object.assign(state, fresh);
  event(state, 'start');
  return state;
}

export function selectSeed(state, kind) {
  if (!SEEDS[kind]) return false;
  state.selectedSeed = kind;
  return true;
}

export function pauseGame(state) {
  if (state.phase !== 'playing') return false;
  state.phase = 'paused';
  event(state, 'pause');
  return true;
}

export function resumeGame(state) {
  if (state.phase !== 'paused') return false;
  state.phase = 'playing';
  event(state, 'resume');
  return true;
}

function constrainPoint(state, point, radius = 0) {
  const { left, right, top, bottom } = levelOf(state).bounds;
  return {
    x: clamp(finite(point?.x, state.player.x), left + radius, right - radius),
    y: clamp(finite(point?.y, state.player.y), top + radius, bottom - radius),
  };
}

/** Seeds stop at the chosen ground point. Only a miss can grow terrain. */
export function castSeed(state, target) {
  const kind = state.selectedSeed;
  if (
    state.phase !== 'playing' ||
    !SEEDS[kind] ||
    state.seedCooldown > 0 ||
    state.seeds[kind] < 1 ||
    !Number.isFinite(target?.x) ||
    !Number.isFinite(target?.y)
  )
    return false;
  const point = constrainPoint(state, target, SEEDS[kind].radius);
  let dx = point.x - state.player.x;
  let dy = point.y - state.player.y;
  let length = Math.hypot(dx, dy);
  if (length < 1) {
    dx = Math.cos(state.player.angle);
    dy = Math.sin(state.player.angle);
    length = 1;
  }
  const travel = length;
  const targetX = state.player.x + (dx / length) * travel;
  const targetY = state.player.y + (dy / length) * travel;
  state.bullets.push({
    id: id(state),
    kind,
    x: state.player.x,
    y: state.player.y,
    vx: (dx / length) * SEED_SPEED,
    vy: (dy / length) * SEED_SPEED,
    targetX,
    targetY,
    remaining: travel,
    radius: 6,
    damage: SEEDS[kind].damage,
    life: travel / SEED_SPEED + 0.2,
  });
  state.seeds[kind] -= 1;
  state.seedCooldown = SEED_COOLDOWN;
  state.stats.seedShots += 1;
  state.player.angle = Math.atan2(dy, dx);
  event(state, 'shoot', { kind, x: state.player.x, y: state.player.y });
  return true;
}

export function dash(state, direction = {}) {
  if (state.phase !== 'playing' || state.player.dashCooldown > 0) return false;
  let dx = finite(direction.x),
    dy = finite(direction.y);
  let length = Math.hypot(dx, dy);
  if (length < 0.01) {
    dx = Math.cos(state.player.angle);
    dy = Math.sin(state.player.angle);
    length = 1;
  }
  state.player.dashX = dx / length;
  state.player.dashY = dy / length;
  state.player.dashTime = DASH_DURATION;
  state.player.dashCooldown = Math.max(1.45, 3 - countUpgrade(state, 'wild-heart') * 0.4);
  state.player.invulnerable = Math.max(state.player.invulnerable, 0.34);
  particles(state, state.player.x, state.player.y, '#e3fbe6', 12, 110);
  event(state, 'dash');
  return true;
}

export function chooseUpgrade(state, upgradeId) {
  if (
    state.phase !== 'upgrade' ||
    !state.upgradeChoices.includes(upgradeId) ||
    !UPGRADES.some((upgrade) => upgrade.id === upgradeId)
  )
    return false;
  state.upgrades.push(upgradeId);
  if (upgradeId === 'wild-heart') {
    state.player.maxHp += 25;
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 40);
  }
  if (upgradeId === 'seed-cycle') {
    for (const kind of Object.keys(SEEDS)) {
      state.seeds[kind] = SEEDS[kind].capacity;
      state.seedRegen[kind] = 0;
    }
  }
  state.upgradeChoices = [];
  state.phase = 'playing';
  state.player.invulnerable = Math.max(state.player.invulnerable, 1.2);
  event(state, 'upgrade', { id: upgradeId });
  return true;
}

function hurtEnemy(state, enemy, damage, source = 'normal', showNumber = true) {
  if (enemy.hp <= 0) return;
  const actual = Math.min(enemy.hp, damage);
  enemy.hp -= damage;
  enemy.hit = 0.13;
  if (source === 'plant') state.stats.terrainDamage += actual;
  if (showNumber)
    floater(
      state,
      enemy.x,
      enemy.y,
      Math.round(damage),
      source === 'plant' ? '#ffe18d' : '#fff8e7',
    );
  if (enemy.hp <= 0) {
    state.kills += 1;
    const coins = ENEMIES[enemy.kind]?.coins ?? 2;
    state.coins += coins;
    if (source === 'plant') state.stats.plantKills += 1;
    particles(state, enemy.x, enemy.y, '#edc45e', 6, 88);
    event(state, 'kill', { kind: enemy.kind, x: enemy.x, y: enemy.y, source, coins });
  }
}

function hurtPlayer(state, damage) {
  if (state.player.invulnerable > 0 || state.player.hp <= 0) return;
  state.player.hp = Math.max(0, state.player.hp - damage);
  state.player.invulnerable = 0.72;
  state.stats.damageTaken += damage;
  state.cameraShake = 0.18;
  floater(state, state.player.x, state.player.y, `−${damage}`, '#ff8d8d');
  particles(state, state.player.x, state.player.y, '#ff7891', 8);
  event(state, 'hit', { damage });
  if (state.player.hp <= 0) {
    state.phase = 'lost';
    event(state, 'lose');
  }
}

function spawnEnemy(state) {
  const level = levelOf(state);
  const bounds = level.bounds;
  const tier = level.spawn.composition.filter((entry) => entry.fromWave <= state.wave).at(-1);
  const weights = Object.entries(tier.weights);
  let roll = random(state) * weights.reduce((sum, [, weight]) => sum + weight, 0);
  let kind = weights.at(-1)[0];
  for (const [candidate, weight] of weights) {
    roll -= weight;
    if (roll <= 0) {
      kind = candidate;
      break;
    }
  }
  const radius = ENEMIES[kind].radius;
  let point;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const edge = Math.floor(random(state) * 4),
      along = random(state);
    point =
      edge < 2
        ? {
            x: edge === 0 ? bounds.left + radius : bounds.right - radius,
            y: bounds.top + radius + along * (bounds.bottom - bounds.top - radius * 2),
          }
        : {
            x: bounds.left + radius + along * (bounds.right - bounds.left - radius * 2),
            y: edge === 2 ? bounds.top + radius : bounds.bottom - radius,
          };
    if (distance(point, state.player) > 250) break;
  }
  state.enemies.push(newEnemy(state, kind, point.x, point.y));
  state.telegraphs.push({ ...point, radius: radius + 12, life: 0.65, kind: 'spawn' });
}

function closestEnemy(state, maximumRange = NORMAL_RANGE) {
  let best = null,
    bestDistance = maximumRange;
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    const separation = distance(state.player, enemy);
    if (separation < bestDistance) {
      bestDistance = separation;
      best = enemy;
    }
  }
  return best;
}

function shootNormal(state, target) {
  const dx = target.x - state.player.x,
    dy = target.y - state.player.y;
  const length = Math.hypot(dx, dy);
  if (length < 1 || state.bullets.length >= MAX_BULLETS) return;
  const speed = 850;
  const power = countUpgrade(state, 'bloom-shot');
  state.bullets.push({
    id: id(state),
    kind: 'normal',
    x: state.player.x,
    y: state.player.y,
    vx: (dx / length) * speed,
    vy: (dy / length) * speed,
    targetX: state.player.x + (dx / length) * NORMAL_RANGE,
    targetY: state.player.y + (dy / length) * NORMAL_RANGE,
    remaining: NORMAL_RANGE,
    radius: 4,
    damage: 19 * (1 + power * 0.25),
    life: NORMAL_RANGE / speed,
  });
  state.player.angle = Math.atan2(dy, dx);
  state.shotCooldown = 0.245 / (1 + power * 0.15);
  state.stats.shots += 1;
  event(state, 'shoot', { kind: 'normal', x: state.player.x, y: state.player.y });
}

function solidPlants(state) {
  return state.plants.filter(
    (plant) => plant.kind === 'ice' && plant.hp > 0 && plant.age < plant.life,
  );
}

function canOccupy(state, x, y, radius, obstacles) {
  const bounds = levelOf(state).bounds;
  return (
    x >= bounds.left + radius &&
    x <= bounds.right - radius &&
    y >= bounds.top + radius &&
    y <= bounds.bottom - radius &&
    !obstacles.some((plant) => Math.hypot(x - plant.x, y - plant.y) < radius + plant.radius + 1)
  );
}

/** Axis sliding and short swept steps prevent even dashes tunnelling through ice. */
function moveBody(state, body, dx, dy, obstacles) {
  const segments = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 8));
  const oldX = body.x,
    oldY = body.y;
  for (let i = 0; i < segments; i += 1) {
    const point = constrainPoint(
      state,
      { x: body.x + dx / segments, y: body.y + dy / segments },
      body.radius,
    );
    if (canOccupy(state, point.x, point.y, body.radius, obstacles)) {
      body.x = point.x;
      body.y = point.y;
    } else {
      if (canOccupy(state, point.x, body.y, body.radius, obstacles)) body.x = point.x;
      if (canOccupy(state, body.x, point.y, body.radius, obstacles)) body.y = point.y;
    }
  }
  return Math.hypot(body.x - oldX, body.y - oldY);
}

function pushOut(state, body, obstacles) {
  for (let pass = 0; pass < 3; pass += 1)
    for (const obstacle of obstacles) {
      const dx = body.x - obstacle.x,
        dy = body.y - obstacle.y;
      const length = Math.hypot(dx, dy),
        minimum = body.radius + obstacle.radius + 2;
      if (length >= minimum) continue;
      const angle = length > 0.001 ? Math.atan2(dy, dx) : (((body.id ?? 0) % 8) * TAU) / 8;
      const point = constrainPoint(
        state,
        { x: obstacle.x + Math.cos(angle) * minimum, y: obstacle.y + Math.sin(angle) * minimum },
        body.radius,
      );
      body.x = point.x;
      body.y = point.y;
    }
}

function growPlant(state, bullet) {
  const point = constrainPoint(
    state,
    { x: bullet.targetX, y: bullet.targetY },
    SEEDS[bullet.kind].radius,
  );
  // Avoid a stack of solid obstacles trapping a character or wasting seed casts.
  const existing = state.plants.find(
    (plant) =>
      plant.kind === bullet.kind &&
      distance(plant, point) < (plant.kind === 'ice' ? plant.radius * 2 + 5 : 23),
  );
  if (existing) {
    existing.age = 0;
    existing.hp = existing.maxHp;
    particles(state, existing.x, existing.y, SEEDS[bullet.kind].color, 10);
    event(state, 'plant', { kind: bullet.kind, x: existing.x, y: existing.y, refreshed: true });
    return;
  }
  if (state.plants.length >= state.plantCap) {
    const oldest = state.plants.reduce((best, plant) => (plant.age > best.age ? plant : best));
    state.plants.splice(state.plants.indexOf(oldest), 1);
    particles(state, oldest.x, oldest.y, '#b1c891', 4, 45);
  }
  const plant = newPlant(state, bullet.kind, point.x, point.y);
  state.plants.push(plant);
  state.stats.plantsGrown += 1;
  state.stats.castsAtGround += 1;
  particles(state, point.x, point.y, SEEDS[bullet.kind].color, 12, 80);
  if (plant.kind === 'ice') {
    const obstacles = solidPlants(state);
    pushOut(state, state.player, obstacles);
    for (const enemy of state.enemies) pushOut(state, enemy, obstacles);
  }
  event(state, 'plant', { kind: bullet.kind, x: point.x, y: point.y });
}

function segmentHit(x1, y1, x2, y2, enemy, radius) {
  const dx = x2 - x1,
    dy = y2 - y1;
  const squared = dx * dx + dy * dy;
  const t = squared > 0 ? clamp(((enemy.x - x1) * dx + (enemy.y - y1) * dy) / squared, 0, 1) : 0;
  return Math.hypot(x1 + dx * t - enemy.x, y1 + dy * t - enemy.y) <= enemy.radius + radius
    ? t
    : null;
}

function updateBullets(state, dt) {
  const remaining = [];
  for (const bullet of state.bullets) {
    const speed = Math.hypot(bullet.vx, bullet.vy);
    const available = finite(
      bullet.remaining,
      Math.hypot(bullet.targetX - bullet.x, bullet.targetY - bullet.y),
    );
    const travel = Math.min(available, speed * dt);
    const endX = bullet.x + (speed > 0 ? (bullet.vx / speed) * travel : 0);
    const endY = bullet.y + (speed > 0 ? (bullet.vy / speed) * travel : 0);
    let target = null,
      nearest = Infinity;
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) continue;
      const intersection = segmentHit(bullet.x, bullet.y, endX, endY, enemy, bullet.radius ?? 5);
      if (intersection !== null && intersection < nearest) {
        target = enemy;
        nearest = intersection;
      }
    }
    if (target) {
      hurtEnemy(state, target, bullet.damage ?? SEEDS[bullet.kind]?.damage ?? 19);
      if (bullet.kind !== 'normal') state.stats.seedHits += 1;
      particles(state, target.x, target.y, SEEDS[bullet.kind]?.color ?? '#ff84da', 4, 80);
      continue;
    }
    bullet.x = endX;
    bullet.y = endY;
    bullet.remaining = available - travel;
    bullet.life = finite(bullet.life, 2) - dt;
    if (bullet.remaining <= 0.001 || bullet.life <= 0) {
      if (SEEDS[bullet.kind]) growPlant(state, bullet);
    } else remaining.push(bullet);
  }
  state.bullets = remaining;
}

function updatePlants(state, dt) {
  const remaining = [];
  for (const plant of state.plants) {
    plant.age += dt;
    if (plant.kind === 'thorn') {
      const damage =
        SEEDS.thorn.damagePerSecond * (1 + countUpgrade(state, 'thorn-heart') * 0.5) * dt;
      for (const enemy of state.enemies) {
        if (enemy.hp > 0 && distance(plant, enemy) < plant.radius + enemy.radius * 0.5) {
          enemy.slow = Math.min(enemy.slow ?? 1, SEEDS.thorn.slow);
          hurtEnemy(state, enemy, damage, 'plant', false);
        }
      }
    }
    if (plant.hp <= 0 || plant.age >= plant.life) {
      if (plant.kind === 'mushroom') {
        const power = countUpgrade(state, 'mushroom-heart');
        const radius = SEEDS.mushroom.blastRadius * (1 + power * 0.15);
        const damage = SEEDS.mushroom.blastDamage * (1 + power * 0.4);
        for (const enemy of state.enemies)
          if (enemy.hp > 0 && distance(plant, enemy) < radius + enemy.radius)
            hurtEnemy(state, enemy, damage, 'plant');
        particles(state, plant.x, plant.y, '#ffc35b', 24, 240);
        state.telegraphs.push({ x: plant.x, y: plant.y, radius, life: 0.38, kind: 'explosion' });
        state.cameraShake = 0.16;
        event(state, 'explode', { x: plant.x, y: plant.y, radius });
      } else
        particles(state, plant.x, plant.y, plant.kind === 'ice' ? '#97e8ff' : '#8fbe65', 5, 65);
    } else remaining.push(plant);
  }
  state.plants = remaining;
}

function updateEnemies(state, dt, obstacles) {
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    const definition = ENEMIES[enemy.kind] ?? ENEMIES.sprout;
    enemy.hit = Math.max(0, finite(enemy.hit) - dt);
    enemy.attackCooldown = Math.max(0, finite(enemy.attackCooldown) - dt);
    enemy.biteCooldown = Math.max(0, finite(enemy.biteCooldown) - dt);
    enemy.age = finite(enemy.age) + dt;
    let dx = state.player.x - enemy.x,
      dy = state.player.y - enemy.y;
    const length = Math.hypot(dx, dy);
    enemy.angle = Math.atan2(dy, dx);
    const speed = definition.speed * (enemy.slow ?? 1) * (1 + (state.wave - 1) * 0.016);
    dx = length > 0 ? dx / length : 0;
    dy = length > 0 ? dy / length : 0;
    const obstructing = obstacles.find((plant) => {
      const projection = (plant.x - enemy.x) * dx + (plant.y - enemy.y) * dy;
      const sideDistance = Math.abs((plant.x - enemy.x) * dy - (plant.y - enemy.y) * dx);
      return (
        projection > -enemy.radius &&
        projection < enemy.radius + plant.radius + 65 &&
        sideDistance < enemy.radius + plant.radius + 5
      );
    });
    if (obstructing) {
      // Keep the chosen side until clear, avoiding left/right oscillation at pillars.
      if (enemy.obstacleId !== obstructing.id) {
        enemy.obstacleId = obstructing.id;
        const cross = dx * (obstructing.y - enemy.y) - dy * (obstructing.x - enemy.x);
        enemy.routeSide = cross > 0 ? -1 : 1;
      }
      const offset = obstructing.radius + enemy.radius + 17;
      const waypoint = constrainPoint(
        state,
        {
          x: obstructing.x - dy * offset * enemy.routeSide,
          y: obstructing.y + dx * offset * enemy.routeSide,
        },
        enemy.radius,
      );
      const pathX = waypoint.x - enemy.x,
        pathY = waypoint.y - enemy.y,
        pathLength = Math.hypot(pathX, pathY);
      if (pathLength > 1) {
        dx = pathX / pathLength;
        dy = pathY / pathLength;
      }
      if (
        distance(enemy, obstructing) < enemy.radius + obstructing.radius + 14 &&
        enemy.biteCooldown <= 0
      ) {
        obstructing.hp -= definition.bite;
        enemy.biteCooldown = 0.65;
        particles(state, obstructing.x, obstructing.y, '#78d8ff', 2, 60);
      }
    } else {
      enemy.obstacleId = null;
    }
    // Soft separation keeps silhouettes readable without pinning enemies into walls.
    let separationX = 0,
      separationY = 0;
    for (const other of state.enemies) {
      if (other === enemy || other.hp <= 0) continue;
      const sx = enemy.x - other.x,
        sy = enemy.y - other.y;
      const separation = Math.hypot(sx, sy),
        minimum = (enemy.radius + other.radius) * 0.8;
      if (separation > 0.01 && separation < minimum) {
        separationX += (sx / separation) * (minimum - separation) * 2.5;
        separationY += (sy / separation) * (minimum - separation) * 2.5;
      }
    }
    const movement = moveBody(
      state,
      enemy,
      (dx * speed + clamp(separationX, -55, 55)) * dt,
      (dy * speed + clamp(separationY, -55, 55)) * dt,
      obstacles,
    );
    enemy.stuck = movement < speed * dt * 0.15 ? finite(enemy.stuck) + dt : 0;
    if (enemy.stuck > 0.55) {
      const nearest = obstacles.reduce(
        (best, plant) => (!best || distance(enemy, plant) < distance(enemy, best) ? plant : best),
        null,
      );
      if (
        nearest &&
        distance(enemy, nearest) < enemy.radius + nearest.radius + 28 &&
        enemy.biteCooldown <= 0
      ) {
        nearest.hp -= definition.bite * 1.5;
        enemy.biteCooldown = 0.5;
      }
      const direction = enemy.id % 2 ? 1 : -1;
      moveBody(state, enemy, -dy * speed * dt * direction, dx * speed * dt * direction, obstacles);
    }
    if (
      distance(state.player, enemy) < state.player.radius + enemy.radius + 3 &&
      enemy.attackCooldown <= 0
    ) {
      hurtPlayer(state, definition.damage);
      enemy.attackCooldown = 0.9;
    }
    enemy.slow = 1;
  }
  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);
}

function updateEffects(state, dt) {
  for (const particle of state.particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= Math.max(0, 1 - dt * 2);
    particle.vy += 110 * dt;
    particle.life -= dt;
  }
  state.particles = state.particles.filter((particle) => particle.life > 0);
  for (const item of state.floaters) {
    item.y -= 33 * dt;
    item.life -= dt;
  }
  state.floaters = state.floaters.filter((item) => item.life > 0);
  for (const item of state.telegraphs) item.life -= dt;
  state.telegraphs = state.telegraphs.filter((item) => item.life > 0).slice(-60);
  state.cameraShake = Math.max(0, state.cameraShake - dt);
}

function advanceWave(state) {
  const level = levelOf(state);
  const nextWave = Math.min(level.waves, Math.floor((state.time + 1e-8) / level.waveDuration) + 1);
  if (nextWave !== state.wave) {
    const completed = state.wave;
    state.wave = nextWave;
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 7);
    for (const kind of Object.keys(SEEDS))
      state.seeds[kind] = Math.min(SEEDS[kind].capacity, state.seeds[kind] + 1);
    event(state, 'wave', { wave: nextWave });
    if (level.upgradeAfter.includes(completed) && !state.offeredUpgrades.includes(completed)) {
      state.offeredUpgrades.push(completed);
      const pool = UPGRADES.map((upgrade) => upgrade.id);
      state.upgradeChoices = [];
      while (state.upgradeChoices.length < 3)
        state.upgradeChoices.push(pool.splice(Math.floor(random(state) * pool.length), 1)[0]);
      state.phase = 'upgrade';
      event(state, 'upgrade-ready', { wave: completed });
    }
  }
  state.waveProgress =
    state.time >= state.duration ? 1 : (state.time % level.waveDuration) / level.waveDuration;
}

function tick(state, dt, input) {
  const level = levelOf(state);
  state.time = Math.min(state.duration, state.time + dt);
  const player = state.player;
  player.invulnerable = Math.max(0, player.invulnerable - dt);
  player.dashCooldown = Math.max(0, player.dashCooldown - dt);
  state.seedCooldown = Math.max(0, state.seedCooldown - dt);
  state.shotCooldown = Math.max(0, state.shotCooldown - dt);
  for (const kind of Object.keys(SEEDS)) {
    if (state.seeds[kind] >= SEEDS[kind].capacity) {
      state.seedRegen[kind] = 0;
      continue;
    }
    state.seedRegen[kind] += dt * (1 + countUpgrade(state, 'seed-cycle') * 0.3);
    if (state.seedRegen[kind] >= SEEDS[kind].regenSeconds) {
      state.seedRegen[kind] -= SEEDS[kind].regenSeconds;
      state.seeds[kind] += 1;
      event(state, 'seed-ready', { kind });
    }
  }
  updateEffects(state, dt);
  const obstacles = solidPlants(state);
  let moveX = clamp(finite(input.moveX), -1, 1),
    moveY = clamp(finite(input.moveY), -1, 1);
  const moveLength = Math.hypot(moveX, moveY);
  if (moveLength > 1) {
    moveX /= moveLength;
    moveY /= moveLength;
  }
  if (player.dashTime > 0) {
    moveBody(state, player, player.dashX * 860 * dt, player.dashY * 860 * dt, obstacles);
    player.dashTime = Math.max(0, player.dashTime - dt);
  } else moveBody(state, player, moveX * PLAYER_SPEED * dt, moveY * PLAYER_SPEED * dt, obstacles);
  if (state.shotCooldown <= 0) {
    if (input.firing && Number.isFinite(input.aimX) && Number.isFinite(input.aimY))
      shootNormal(state, { x: input.aimX, y: input.aimY });
    else if (input.autoFire !== false) {
      const target = closestEnemy(state);
      if (target) shootNormal(state, target);
    }
  }
  updateBullets(state, dt);
  for (const enemy of state.enemies) enemy.slow = 1;
  updatePlants(state, dt);
  updateEnemies(state, dt, solidPlants(state));
  if (state.phase !== 'playing') return;
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    if (state.enemies.length < level.spawn.maxEnemies) spawnEnemy(state);
    state.spawnTimer =
      Math.max(
        level.spawn.minimumInterval,
        level.spawn.interval - (state.wave - 1) * level.spawn.acceleration,
      ) *
      (0.84 + random(state) * 0.3);
  }
  advanceWave(state);
  if (state.time >= state.duration && state.player.hp > 0) {
    state.phase = 'won';
    state.waveProgress = 1;
    event(state, 'win');
  }
}

/** Use bounded, small steps so lag cannot tunnel through collisions or erase a run. */
export function step(state, dt, input = {}) {
  if (state.phase !== 'playing' || !Number.isFinite(dt) || dt <= 0) return state;
  let remaining = Math.min(dt, 0.1);
  while (remaining > 1e-9 && state.phase === 'playing') {
    const slice = Math.min(remaining, 1 / 60);
    tick(state, slice, input);
    remaining -= slice;
  }
  return state;
}

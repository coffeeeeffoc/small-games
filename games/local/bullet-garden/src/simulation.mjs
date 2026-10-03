import { ENEMIES, LEVELS, SEEDS, UPGRADES } from './config.mjs';

const TAU = Math.PI * 2;
const PLAYER_SPEED = 202;
const NORMAL_RANGE = 535;
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
const upgradeById = new Map(UPGRADES.map((upgrade) => [upgrade.id, upgrade]));
const bonus = (state, key) =>
  state.upgrades.reduce((sum, upgrade) => sum + (upgradeById.get(upgrade)?.effects[key] ?? 0), 0);

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
  const maxHp = definition.health * (kind === 'ice' ? 1 + bonus(state, 'iceHealth') : 1);
  return {
    id: id(state),
    kind,
    x,
    y,
    radius: definition.radius * (kind === 'thorn' ? 1 + bonus(state, 'thornRadius') : 1),
    age: 0,
    life: definition.life * (kind === 'mushroom' ? 1 : 1 + bonus(state, 'terrainLife')),
    hp: maxHp,
    maxHp,
  };
}

function refillTerrainBag(state) {
  const bag = [...levelOf(state).growth.kinds];
  for (let index = bag.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random(state) * (index + 1));
    [bag[index], bag[swap]] = [bag[swap], bag[index]];
  }
  state.growth.bag = bag;
  state.growth.nextKind = bag[0];
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
    growth: {
      misses: 0,
      threshold: level.growth.missThreshold,
      cooldown: 0,
      nextKind: level.growth.kinds[0],
      pending: false,
      pendingAngle: 0,
      retryCooldown: 0,
      bag: [],
    },
    progression: { level: 1, xp: 0, nextXp: level.progression.firstXp, pending: 0, queue: [] },
    plantCap: level.plantCap,
    enemies: [],
    plants: [],
    bullets: [],
    particles: [],
    floaters: [],
    telegraphs: [],
    stats: {
      shots: 0,
      misses: 0,
      autoPlants: 0,
      reflections: 0,
      splitShots: 0,
      plantsGrown: 0,
      plantKills: 0,
      terrainDamage: 0,
      damageTaken: 0,
    },
    upgradeChoices: [],
    upgrades: [],
    events: [],
    initialSeed,
    randomState: initialSeed,
    nextId: 0,
    spawnTimer: level.spawn.initialDelay,
    shotCooldown: 0,
    burstQueue: [],
    cameraShake: 0,
  };
  refillTerrainBag(state);
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
  refillTerrainBag(fresh);
  Object.assign(state, fresh);
  event(state, 'start');
  return state;
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
  state.player.dashCooldown = Math.max(1.45, 3 - bonus(state, 'dashReduction'));
  state.player.invulnerable = Math.max(state.player.invulnerable, 0.34);
  particles(state, state.player.x, state.player.y, '#e3fbe6', 12, 110);
  event(state, 'dash');
  return true;
}

function eligibleUpgrades(state) {
  const allowed = levelOf(state).progression.upgradePool;
  return UPGRADES.filter(
    (upgrade) =>
      (!allowed || allowed.includes(upgrade.id)) &&
      countUpgrade(state, upgrade.id) < upgrade.maxRank &&
      (upgrade.requires ?? []).every((required) => countUpgrade(state, required) > 0),
  );
}

function takeWeighted(state, pool) {
  let roll = random(state) * pool.reduce((sum, upgrade) => sum + upgrade.weight, 0);
  let selected = pool.at(-1);
  for (const upgrade of pool) {
    roll -= upgrade.weight;
    if (roll <= 0) {
      selected = upgrade;
      break;
    }
  }
  return selected;
}

function offerUpgrade(state) {
  if (state.phase !== 'playing' || state.progression.pending <= 0) return;
  const pool = eligibleUpgrades(state);
  if (!pool.length) {
    // Finite pools never leave a future, longer level stuck on an empty chooser.
    state.player.hp = Math.min(
      state.player.maxHp,
      state.player.hp + state.progression.pending * 20,
    );
    state.progression.pending = 0;
    state.progression.queue = [];
    return;
  }
  const rewardLevel = state.progression.queue[0] ?? state.progression.level;
  const size = rewardLevel >= levelOf(state).progression.fourChoicesAt ? 4 : 3;
  const choices = [];
  const add = (candidates) => {
    if (!candidates.length) return;
    const selected = takeWeighted(state, candidates);
    choices.push(selected.id);
    pool.splice(pool.indexOf(selected), 1);
  };
  for (const category of ['weapon', 'terrain'])
    add(pool.filter((upgrade) => upgrade.category === category));
  while (choices.length < size && pool.length) add(pool);
  // The guaranteed categories do not occupy predictable card positions.
  for (let index = choices.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random(state) * (index + 1));
    [choices[index], choices[swap]] = [choices[swap], choices[index]];
  }
  state.upgradeChoices = choices;
  state.phase = 'upgrade';
  event(state, 'upgrade-ready', { level: rewardLevel });
}

function gainExperience(state, amount) {
  const progression = state.progression;
  progression.xp += amount;
  while (progression.xp >= progression.nextXp) {
    progression.xp -= progression.nextXp;
    progression.level += 1;
    progression.nextXp += levelOf(state).progression.xpStep;
    progression.pending += 1;
    progression.queue.push(progression.level);
  }
}

function queueGrowth(state, angle) {
  const growth = state.growth;
  if (growth.misses < growth.threshold) return;
  // Keep one waiting trigger and the exact remainder; high fire rates cannot stockpile a burst.
  growth.misses %= growth.threshold;
  growth.pending = true;
  growth.pendingAngle = angle;
  event(state, 'growth-ready', { kind: growth.nextKind });
}

export function chooseUpgrade(state, upgradeId) {
  const upgrade = upgradeById.get(upgradeId);
  if (
    state.phase !== 'upgrade' ||
    !state.upgradeChoices.includes(upgradeId) ||
    !upgrade ||
    !eligibleUpgrades(state).includes(upgrade)
  )
    return false;
  state.upgrades.push(upgradeId);
  if (upgrade.effects.maxHp) state.player.maxHp += upgrade.effects.maxHp;
  if (upgrade.effects.heal)
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + upgrade.effects.heal);
  state.growth.threshold = Math.max(
    levelOf(state).growth.minimumThreshold,
    levelOf(state).growth.missThreshold - bonus(state, 'missReduction'),
  );
  queueGrowth(state, state.growth.lastMissAngle ?? state.player.angle);
  state.progression.pending = Math.max(0, state.progression.pending - 1);
  state.progression.queue.shift();
  state.upgradeChoices = [];
  state.phase = 'playing';
  state.player.invulnerable = Math.max(state.player.invulnerable, 1.2);
  event(state, 'upgrade', { id: upgradeId });
  offerUpgrade(state);
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
    gainExperience(state, ENEMIES[enemy.kind]?.xp ?? 2);
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

function fireVolley(state, angle, damageScale = 1) {
  const extra = bonus(state, 'projectiles');
  const count = 1 + extra;
  const speed = 850;
  for (let index = 0; index < count && state.bullets.length < MAX_BULLETS; index += 1) {
    const direction = angle + (index - (count - 1) / 2) * 0.16;
    const chill = bonus(state, 'chill'),
      burn = bonus(state, 'burn');
    const explosion = bonus(state, 'explosion');
    state.bullets.push({
      id: id(state),
      kind: 'normal',
      generation: 0,
      missEligible: true,
      reflected: false,
      originalAngle: direction,
      bouncesRemaining: bonus(state, 'bounces'),
      x: state.player.x,
      y: state.player.y,
      vx: Math.cos(direction) * speed,
      vy: Math.sin(direction) * speed,
      targetX: state.player.x + Math.cos(direction) * NORMAL_RANGE,
      targetY: state.player.y + Math.sin(direction) * NORMAL_RANGE,
      remaining: NORMAL_RANGE,
      radius: 4,
      damage: (19 * (1 + bonus(state, 'damage')) * damageScale) / (1 + extra * 0.12),
      life: NORMAL_RANGE / speed + 0.05,
      element: explosion ? 'explosive' : burn ? 'fire' : chill ? 'ice' : 'normal',
      chill,
      burn,
      explosion,
      split: bonus(state, 'split'),
      splitExplosion: bonus(state, 'splitExplosion'),
    });
    state.stats.shots += 1;
  }
  event(state, 'shoot', { kind: 'normal', x: state.player.x, y: state.player.y });
}

function shootNormal(state, target) {
  const dx = target.x - state.player.x,
    dy = target.y - state.player.y;
  const angle = Math.hypot(dx, dy) < 1 ? state.player.angle : Math.atan2(dy, dx);
  fireVolley(state, angle);
  state.player.angle = angle;
  const burstCount = bonus(state, 'burst');
  const interval = Math.max(0.12, 0.245 / (1 + bonus(state, 'fireRate')));
  state.shotCooldown = interval + burstCount * 0.085;
  for (let index = 0; index < burstCount; index += 1)
    state.burstQueue.push({ delay: (index + 1) * 0.085, angle });
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

/** Axis sliding and swept steps keep enemies outside solid ice and bodies inside bounds. */
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

function findGrowthPoint(state, kind, angle) {
  const config = levelOf(state).growth;
  const radius = SEEDS[kind].radius * (kind === 'thorn' ? 1 + bonus(state, 'thornRadius') : 1);
  const bounds = levelOf(state).bounds;
  const safeDistance = state.player.radius + radius + 24;
  const valid = (point) =>
    point.x >= bounds.left + radius &&
    point.x <= bounds.right - radius &&
    point.y >= bounds.top + radius &&
    point.y <= bounds.bottom - radius &&
    distance(point, state.player) >= safeDistance &&
    !state.plants.some(
      (plant) => plant.kind === kind && distance(plant, point) < radius + plant.radius + 8,
    );
  // Intersect rays in the requested sector with radius-inset bounds. Near walls,
  // shorten the distance but never turn the trigger behind the last missed shot.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const direction = angle + (random(state) * 2 - 1) * config.sector;
    const ux = Math.cos(direction),
      uy = Math.sin(direction);
    let enter = 0,
      leave = config.maxDistance;
    for (const [origin, velocity, low, high] of [
      [state.player.x, ux, bounds.left + radius, bounds.right - radius],
      [state.player.y, uy, bounds.top + radius, bounds.bottom - radius],
    ]) {
      if (Math.abs(velocity) < 1e-9) {
        if (origin < low || origin > high) {
          leave = -1;
          break;
        }
      } else {
        const near = (low - origin) / velocity,
          far = (high - origin) / velocity;
        enter = Math.max(enter, Math.min(near, far));
        leave = Math.min(leave, Math.max(near, far));
      }
    }
    const minimum = Math.max(
      enter,
      safeDistance,
      leave >= config.minDistance ? config.minDistance : safeDistance,
    );
    if (leave < minimum) continue;
    const length = minimum + random(state) * (leave - minimum);
    const point = { x: state.player.x + ux * length, y: state.player.y + uy * length };
    if (valid(point)) return point;
  }
  return null; // Preserve the pending direction until movement opens a valid area.
}

function updateGrowth(state) {
  const growth = state.growth;
  if (!growth.pending || growth.cooldown > 0 || growth.retryCooldown > 0) return;
  const kind = growth.nextKind;
  const point = findGrowthPoint(state, kind, growth.pendingAngle);
  if (!point) {
    growth.retryCooldown = 0.15;
    return;
  }
  if (state.plants.length >= state.plantCap) {
    const oldest = state.plants.reduce((best, plant) =>
      plant.age / plant.life > best.age / best.life ? plant : best,
    );
    state.plants.splice(state.plants.indexOf(oldest), 1);
  }
  const plant = newPlant(state, kind, point.x, point.y);
  state.plants.push(plant);
  state.stats.plantsGrown += 1;
  state.stats.autoPlants += 1;
  growth.pending = false;
  growth.cooldown = levelOf(state).growth.triggerInterval;
  growth.bag.shift();
  if (!growth.bag.length) refillTerrainBag(state);
  else growth.nextKind = growth.bag[0];
  particles(state, point.x, point.y, SEEDS[kind].color, 12, 80);
  floater(state, point.x, point.y, SEEDS[kind].name, SEEDS[kind].color);
  if (kind === 'ice') for (const enemy of state.enemies) pushOut(state, enemy, solidPlants(state));
  event(state, 'plant', { kind, x: point.x, y: point.y, automatic: true });
}

function recordMiss(state, bullet) {
  if (
    bullet.missRecorded ||
    bullet.kind !== 'normal' ||
    bullet.generation > 0 ||
    bullet.missEligible === false ||
    bullet.reflected
  )
    return;
  bullet.missRecorded = true;
  state.stats.misses += 1;
  state.growth.misses += 1;
  state.growth.lastMissAngle = finite(bullet.originalAngle, Math.atan2(bullet.vy, bullet.vx));
  queueGrowth(state, state.growth.lastMissAngle);
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

function bulletExplosion(state, bullet, fraction) {
  if (fraction <= 0) return;
  const radius = bullet.generation > 0 ? 45 : 60;
  for (const enemy of state.enemies)
    if (enemy.hp > 0 && distance(bullet, enemy) < radius + enemy.radius)
      hurtEnemy(state, enemy, bullet.damage * fraction, 'normal', false);
  particles(state, bullet.x, bullet.y, '#ffc35b', 6, 110);
  state.telegraphs.push({ x: bullet.x, y: bullet.y, radius, life: 0.2, kind: 'explosion' });
}

function splitBullet(state, bullet, fragments) {
  if (bullet.generation > 0 || !bullet.split) return;
  const count = 1 + bullet.split;
  const angle = Math.atan2(bullet.vy, bullet.vx);
  for (
    let index = 0;
    index < count && fragments.length + state.bullets.length < MAX_BULLETS;
    index += 1
  ) {
    const direction = angle + (index - (count - 1) / 2) * 0.6;
    fragments.push({
      id: id(state),
      kind: 'split',
      generation: 1,
      missEligible: false,
      reflected: false,
      x: bullet.x,
      y: bullet.y,
      vx: Math.cos(direction) * 690,
      vy: Math.sin(direction) * 690,
      remaining: 225,
      life: 225 / 690 + 0.05,
      radius: 3,
      damage: bullet.damage * 0.4,
      bouncesRemaining: 0,
      explosion: bullet.splitExplosion ?? 0,
      element: bullet.splitExplosion ? 'explosive' : bullet.element,
    });
    state.stats.splitShots += 1;
  }
}

function updateBullets(state, dt) {
  const survivors = [],
    fragments = [];
  const bounds = levelOf(state).bounds;
  for (const bullet of state.bullets) {
    const speed = Math.hypot(bullet.vx, bullet.vy);
    bullet.remaining = finite(bullet.remaining, NORMAL_RANGE);
    bullet.life = finite(bullet.life, 2) - dt;
    let travel = Math.min(bullet.remaining, speed * dt),
      ended = false,
      hit = false;
    for (let segment = 0; segment < 5 && travel > 1e-8 && !ended; segment += 1) {
      const ux = bullet.vx / speed,
        uy = bullet.vy / speed;
      const wallX =
        ux > 0 ? (bounds.right - bullet.x) / ux : ux < 0 ? (bounds.left - bullet.x) / ux : Infinity;
      const wallY =
        uy > 0 ? (bounds.bottom - bullet.y) / uy : uy < 0 ? (bounds.top - bullet.y) / uy : Infinity;
      const wallDistance = Math.max(0, Math.min(wallX, wallY));
      const length = Math.min(travel, wallDistance);
      const endX = bullet.x + ux * length,
        endY = bullet.y + uy * length;
      let target = null,
        nearest = Infinity;
      for (const enemy of state.enemies) {
        if (enemy.hp <= 0) continue;
        const intersection = segmentHit(bullet.x, bullet.y, endX, endY, enemy, bullet.radius ?? 4);
        if (intersection !== null && intersection < nearest) {
          target = enemy;
          nearest = intersection;
        }
      }
      if (target) {
        bullet.x += ux * length * nearest;
        bullet.y += uy * length * nearest;
        if (bullet.chill) {
          target.chillTime = 1.5;
          target.chillSlow = Math.min(
            target.chillSlow ?? 1,
            Math.max(0.35, 0.85 - bullet.chill * 0.1),
          );
        }
        if (bullet.burn) {
          target.burnTime = 2;
          target.burnDps = Math.max(target.burnDps ?? 0, bullet.burn * 6);
        }
        hurtEnemy(state, target, bullet.damage ?? 19);
        bulletExplosion(state, bullet, bullet.explosion ?? 0);
        particles(
          state,
          target.x,
          target.y,
          bullet.element === 'ice' ? '#92e4ff' : '#ffb18c',
          3,
          80,
        );
        ended = true;
        hit = true;
        break;
      }
      bullet.x = endX;
      bullet.y = endY;
      bullet.remaining -= length;
      travel -= length;
      if (wallDistance <= length + 1e-8) {
        if (bullet.bouncesRemaining > 0 && bullet.remaining > 0.001) {
          if (wallX <= wallY + 1e-8) bullet.vx *= -1;
          if (wallY <= wallX + 1e-8) bullet.vy *= -1;
          bullet.bouncesRemaining -= 1;
          bullet.remaining += NORMAL_RANGE;
          bullet.life += NORMAL_RANGE / speed;
          bullet.reflected = true;
          bullet.missEligible = false;
          state.stats.reflections += 1;
          particles(state, bullet.x, bullet.y, '#a9e6fa', 2, 50);
          event(state, 'reflect', { x: bullet.x, y: bullet.y });
        } else ended = true;
      }
    }
    ended ||= bullet.remaining <= 0.001 || bullet.life <= 0 || speed <= 0;
    if (ended) {
      if (!hit) recordMiss(state, bullet);
      splitBullet(state, bullet, fragments);
    } else survivors.push(bullet);
  }
  state.bullets = survivors.concat(fragments).slice(0, MAX_BULLETS);
}

function updatePlants(state, dt) {
  const remaining = [];
  for (const plant of state.plants) {
    plant.age += dt;
    if (plant.kind === 'thorn') {
      const damage = SEEDS.thorn.damagePerSecond * (1 + bonus(state, 'thornDamage')) * dt;
      for (const enemy of state.enemies) {
        if (enemy.hp > 0 && distance(plant, enemy) < plant.radius + enemy.radius * 0.5) {
          enemy.slow = Math.min(enemy.slow ?? 1, SEEDS.thorn.slow);
          hurtEnemy(state, enemy, damage, 'plant', false);
        }
      }
    }
    if (plant.kind === 'ice' && plant.hp > 0) {
      const radius = SEEDS.ice.auraRadius * (1 + bonus(state, 'iceRadius'));
      for (const enemy of state.enemies)
        if (enemy.hp > 0 && distance(plant, enemy) < radius + enemy.radius)
          enemy.slow = Math.min(
            enemy.slow ?? 1,
            Math.max(0.4, SEEDS.ice.slow - bonus(state, 'iceSlow')),
          );
    }
    if (plant.hp <= 0 || plant.age >= plant.life) {
      if (plant.kind === 'mushroom') {
        const radius = SEEDS.mushroom.blastRadius * (1 + bonus(state, 'mushroomRadius'));
        const damage = SEEDS.mushroom.blastDamage * (1 + bonus(state, 'mushroomDamage'));
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
    if (enemy.chillTime > 0) {
      enemy.slow = Math.min(enemy.slow ?? 1, enemy.chillSlow ?? 1);
      enemy.chillTime = Math.max(0, enemy.chillTime - dt);
      if (!enemy.chillTime) enemy.chillSlow = 1;
    }
    if (enemy.burnTime > 0) {
      hurtEnemy(state, enemy, enemy.burnDps * Math.min(dt, enemy.burnTime), 'normal', false);
      enemy.burnTime = Math.max(0, enemy.burnTime - dt);
      if (enemy.hp <= 0) continue;
    }
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
    state.wave = nextWave;
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 7);
    event(state, 'wave', { wave: nextWave });
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
  state.growth.cooldown = Math.max(0, state.growth.cooldown - dt);
  state.growth.retryCooldown = Math.max(0, state.growth.retryCooldown - dt);
  state.shotCooldown = Math.max(0, state.shotCooldown - dt);
  updateEffects(state, dt);
  let moveX = clamp(finite(input.moveX), -1, 1),
    moveY = clamp(finite(input.moveY), -1, 1);
  const moveLength = Math.hypot(moveX, moveY);
  if (moveLength > 1) {
    moveX /= moveLength;
    moveY /= moveLength;
  }
  // Automatically grown ice never blocks or pushes its owner, including during a dash.
  if (player.dashTime > 0) {
    moveBody(state, player, player.dashX * 860 * dt, player.dashY * 860 * dt, []);
    player.dashTime = Math.max(0, player.dashTime - dt);
  } else moveBody(state, player, moveX * PLAYER_SPEED * dt, moveY * PLAYER_SPEED * dt, []);
  for (const burst of state.burstQueue) {
    burst.delay -= dt;
    if (burst.delay <= 0) fireVolley(state, burst.angle, 0.65);
  }
  state.burstQueue = state.burstQueue.filter((burst) => burst.delay > 0);
  if (state.shotCooldown <= 0) {
    if (
      (input.aimActive ?? input.firing) &&
      Number.isFinite(input.aimX) &&
      Number.isFinite(input.aimY)
    )
      shootNormal(state, { x: input.aimX, y: input.aimY });
    else if (input.autoFire !== false)
      shootNormal(
        state,
        closestEnemy(state) ?? {
          x: player.x + Math.cos(player.angle) * 100,
          y: player.y + Math.sin(player.angle) * 100,
        },
      );
  }
  updateBullets(state, dt);
  for (const enemy of state.enemies) enemy.slow = 1;
  updatePlants(state, dt);
  updateGrowth(state);
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
  } else offerUpgrade(state);
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

import { BOONS, ENEMIES, LEVELS, SKILLS, UPGRADES } from './config.mjs';

const TAU = Math.PI * 2;
const PLAYER_SPEED = 202;
const NORMAL_RANGE = 535;
const DASH_DURATION = 0.15;
const MAX_PARTICLES = 240;
const MAX_FLOATERS = 60;
const MAX_BULLETS = 120;
const MAX_TELEGRAPHS = 40;
const MAX_EXPLOSION_TELEGRAPHS = 24;
const MAX_SKILL_EFFECTS = 12;
const ENERGY_PER_SECOND = 6;
const ENERGY_PER_KILL = 8;
const terrainDefinition = (kind) => Object.values(BOONS).find((boon) => boon.kind === kind);

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

function addTelegraph(state, item) {
  // Derived weapon explosions can hit many times in one tick. Limit their
  // visual rings independently of damage, and keep spawn warnings visible.
  if (item.kind === 'explosion') {
    let explosions = 0;
    for (const existing of state.telegraphs) if (existing.kind === 'explosion') explosions += 1;
    if (explosions >= MAX_EXPLOSION_TELEGRAPHS) return;
  }
  if (state.telegraphs.length >= MAX_TELEGRAPHS) {
    const oldestExplosion = state.telegraphs.findIndex((existing) => existing.kind === 'explosion');
    if (oldestExplosion >= 0) state.telegraphs.splice(oldestExplosion, 1);
    else if (item.kind === 'explosion') return;
    else state.telegraphs.shift();
  }
  state.telegraphs.push(item);
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
    frozen: 0,
    freezeCooldown: 0,
    poison: 0,
    poisonDps: 0,
    stunned: 0,
    feared: 0,
    fearX: x,
    fearY: y,
    vulnerable: 0,
    windSlow: 0,
  };
}

function newPlant(state, kind, x, y) {
  const definition = terrainDefinition(kind);
  return {
    id: id(state),
    kind,
    x,
    y,
    radius: definition.radius * (1 + bonus(state, 'terrainRadius')),
    age: 0,
    life: definition.life * (1 + bonus(state, 'terrainLife')),
    hp: 1,
    maxHp: 1,
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
    loadout: { boon: null, skills: ['blast', 'gale'] },
    boons: [],
    boonTimers: {},
    skillSlots: [
      { kind: 'blast', energy: 0 },
      { kind: 'gale', energy: 0 },
    ],
    selectedSkill: 0,
    skillCooldown: 0,
    skillEffects: [],
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
      reflections: 0,
      splitShots: 0,
      autoPlants: 0,
      skillCasts: 0,
      skillDamage: 0,
      skillKills: 0,
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

/** Loadouts can only change between runs; invalid choices never partly apply. */
export function configureLoadout(state, { boon = null, skills } = {}) {
  if (
    !['ready', 'won', 'lost'].includes(state.phase) ||
    (boon !== null && !BOONS[boon]) ||
    !Array.isArray(skills) ||
    skills.length !== 2 ||
    skills[0] === skills[1] ||
    skills.some((kind) => !SKILLS[kind])
  )
    return false;
  state.loadout = { boon, skills: [...skills] };
  state.skillSlots = skills.map((kind) => ({ kind, energy: 0 }));
  state.selectedSkill = 0;
  return true;
}

export function startGame(state) {
  const loadout = {
    boon: state.loadout?.boon ?? null,
    skills: [...(state.loadout?.skills ?? ['blast', 'gale'])],
  };
  const fresh = createGame(state.levelId, state.initialSeed);
  configureLoadout(fresh, loadout);
  fresh.phase = 'playing';
  fresh.enemies = [];
  fresh.nextId = 0;
  fresh.randomState = fresh.initialSeed;
  if (fresh.loadout.boon) acquireBoon(fresh, fresh.loadout.boon);
  Object.assign(state, fresh);
  event(state, 'start');
  return state;
}

export function selectSkill(state, index) {
  if (!Number.isInteger(index) || !state.skillSlots[index]) return false;
  state.selectedSkill = index;
  return true;
}

// Old integrations cannot bypass boon ownership with a seed projectile.
export function selectSeed() {
  return false;
}
export function castSeed() {
  return false;
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

/** Manual energy release. Positions and line paths stay inside the arena. */
export function castSkill(state, target, index = state.selectedSkill) {
  const slot = state.skillSlots[index];
  const definition = SKILLS[slot?.kind];
  if (
    state.phase !== 'playing' ||
    !Number.isInteger(index) ||
    !definition ||
    slot.energy < definition.energyMax ||
    state.skillCooldown > 0 ||
    state.skillEffects.length >= MAX_SKILL_EFFECTS ||
    !Number.isFinite(target?.x) ||
    !Number.isFinite(target?.y)
  )
    return false;
  const origin = state.player;
  let dx = target.x - origin.x,
    dy = target.y - origin.y;
  let length = Math.hypot(dx, dy);
  const targetDistance = length;
  if (length < 0.001) {
    dx = Math.cos(origin.angle);
    dy = Math.sin(origin.angle);
    length = 1;
  }
  dx /= length;
  dy /= length;
  const requested =
    definition.shape === 'line' ? definition.range : Math.min(targetDistance, definition.range);
  const bounds = levelOf(state).bounds;
  // Clip along the ray so diagonal line targets retain their chosen direction.
  let travel = requested;
  if (dx > 0) travel = Math.min(travel, (bounds.right - origin.x) / dx);
  if (dx < 0) travel = Math.min(travel, (bounds.left - origin.x) / dx);
  if (dy > 0) travel = Math.min(travel, (bounds.bottom - origin.y) / dy);
  if (dy < 0) travel = Math.min(travel, (bounds.top - origin.y) / dy);
  const point = { x: origin.x + dx * travel, y: origin.y + dy * travel };
  state.skillEffects.push({
    id: id(state),
    kind: slot.kind,
    x: definition.shape === 'circle' ? point.x : origin.x,
    y: definition.shape === 'circle' ? point.y : origin.y,
    startX: origin.x,
    startY: origin.y,
    targetX: point.x,
    targetY: point.y,
    dx,
    dy,
    age: 0,
    life: definition.duration,
    radius: definition.radius,
    width: definition.width,
    length: travel,
    hitIds: [],
    travelled: 0,
    delay: definition.delay ?? 0,
    triggered: false,
  });
  slot.energy = 0;
  state.selectedSkill = index;
  state.skillCooldown = 0.3;
  state.player.angle = Math.atan2(dy, dx);
  state.stats.skillCasts += 1;
  event(state, 'skill', { kind: slot.kind, x: point.x, y: point.y });
  return true;
}

function chargeEnergy(state, amount) {
  const multiplier = 1 + bonus(state, 'energy');
  for (const slot of state.skillSlots)
    slot.energy = Math.min(SKILLS[slot.kind].energyMax, slot.energy + amount * multiplier);
}

function acquireBoon(state, boonId) {
  if (!BOONS[boonId] || state.boons.includes(boonId)) return;
  state.boons.push(boonId);
  state.boonTimers[boonId] = 0.6;
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
      (!upgrade.id.startsWith('boon-') || !state.boons.includes(upgrade.id.slice(5))) &&
      (!(upgrade.id === 'terrain-heart' || upgrade.id === 'terrain-duration') ||
        state.boons.length > 0) &&
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
  if (upgradeId.startsWith('boon-')) acquireBoon(state, upgradeId.slice(5));
  if (upgradeId === 'energy-cycle') {
    for (const slot of state.skillSlots)
      slot.energy = Math.min(SKILLS[slot.kind].energyMax, slot.energy + 25);
  }
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
  damage *= enemy.vulnerable > 0 ? 1.35 : 1;
  const actual = Math.min(enemy.hp, damage);
  enemy.hp -= damage;
  enemy.hit = 0.13;
  if (source === 'plant') state.stats.terrainDamage += actual;
  if (source === 'skill') state.stats.skillDamage += actual;
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
    if (source === 'skill') state.stats.skillKills += 1;
    chargeEnergy(state, ENERGY_PER_KILL);
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
  addTelegraph(state, { ...point, radius: radius + 12, life: 0.65, kind: 'spawn' });
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

function growTerrain(state, boonId) {
  const definition = BOONS[boonId];
  const target = closestEnemy(state, Infinity);
  const heading = target
    ? Math.atan2(target.y - state.player.y, target.x - state.player.x)
    : state.player.angle;
  // Put the patch on the incoming route, so passive terrain still has a readable purpose.
  const offset = target ? Math.max(45, Math.min(300, distance(target, state.player) - 45)) : 95;
  const point = constrainPoint(
    state,
    {
      x: state.player.x + Math.cos(heading) * offset,
      y: state.player.y + Math.sin(heading) * offset,
    },
    definition.radius * (1 + bonus(state, 'terrainRadius')),
  );
  const plant = newPlant(state, definition.kind, point.x, point.y);
  if (state.plants.length >= state.plantCap) {
    const oldest = state.plants.reduce((best, item) => (item.age > best.age ? item : best));
    state.plants.splice(state.plants.indexOf(oldest), 1);
  }
  state.plants.push(plant);
  state.stats.plantsGrown += 1;
  state.stats.autoPlants += 1;
  particles(state, plant.x, plant.y, definition.color, 8, 70);
  event(state, 'plant', { kind: plant.kind, x: plant.x, y: plant.y });
}

function updateBoons(state, dt) {
  for (const boonId of state.boons) {
    state.boonTimers[boonId] -= dt;
    if (state.boonTimers[boonId] <= 0) {
      growTerrain(state, boonId);
      state.boonTimers[boonId] += BOONS[boonId].interval;
    }
  }
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
}

function bulletExplosion(state, bullet, fraction) {
  if (fraction <= 0) return;
  const radius = bullet.generation > 0 ? 45 : 60;
  for (const enemy of state.enemies)
    if (enemy.hp > 0 && distance(bullet, enemy) < radius + enemy.radius)
      hurtEnemy(state, enemy, bullet.damage * fraction, 'normal', false);
  particles(state, bullet.x, bullet.y, '#ffc35b', 6, 110);
  addTelegraph(state, { x: bullet.x, y: bullet.y, radius, life: 0.2, kind: 'explosion' });
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
      const radius = bullet.radius ?? 4;
      const left = Math.min(bullet.x, endX) - radius,
        right = Math.max(bullet.x, endX) + radius;
      const top = Math.min(bullet.y, endY) - radius,
        bottom = Math.max(bullet.y, endY) + radius;
      let target = null,
        nearest = Infinity;
      for (const enemy of state.enemies) {
        if (enemy.hp <= 0) continue;
        if (
          enemy.x + enemy.radius < left ||
          enemy.x - enemy.radius > right ||
          enemy.y + enemy.radius < top ||
          enemy.y - enemy.radius > bottom
        )
          continue;
        const intersection = segmentHit(bullet.x, bullet.y, endX, endY, enemy, radius);
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

function terrainTouches(plant, enemy) {
  if (plant.kind === 'trench') {
    const dx = (enemy.x - plant.x) / (plant.radius + enemy.radius);
    const dy = (enemy.y - plant.y) / (plant.radius * 0.45 + enemy.radius);
    return dx * dx + dy * dy < 1;
  }
  return distance(plant, enemy) < plant.radius + enemy.radius * 0.5;
}

function updatePlants(state, dt) {
  const remaining = [];
  const power = 1 + bonus(state, 'terrainDamage');
  for (const plant of state.plants) {
    plant.age += dt;
    const definition = terrainDefinition(plant.kind);
    if (plant.hp <= 0 || plant.age >= plant.life || !definition) continue;
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0 || !terrainTouches(plant, enemy)) continue;
      if (plant.kind === 'thorn') {
        enemy.slow = Math.min(enemy.slow, definition.slow);
        hurtEnemy(state, enemy, definition.damagePerSecond * power * dt, 'plant', false);
      } else if (plant.kind === 'trench') enemy.slow = Math.min(enemy.slow, definition.slow);
      else if (plant.kind === 'frost' && !(enemy.freezeCooldown > 0)) {
        enemy.frozen = definition.freezeDuration;
        enemy.freezeCooldown = definition.freezeCooldown;
      } else if (plant.kind === 'poison') {
        enemy.poison = definition.poisonDuration;
        enemy.poisonDps = definition.damagePerSecond * power;
      }
    }
    remaining.push(plant);
  }
  state.plants = remaining;
}

function updateStatuses(state, dt) {
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    if (enemy.poison > 0)
      hurtEnemy(state, enemy, finite(enemy.poisonDps) * Math.min(dt, enemy.poison), 'plant', false);
    for (const key of [
      'frozen',
      'freezeCooldown',
      'poison',
      'stunned',
      'feared',
      'vulnerable',
      'windSlow',
    ])
      enemy[key] = Math.max(0, finite(enemy[key]) - dt);
    if (enemy.poison <= 0) enemy.poisonDps = 0;
    enemy.slow = enemy.windSlow > 0 ? SKILLS.gale.slow : 1;
  }
}

function effectHitsSegment(effect, enemy, fromX, fromY, toX, toY) {
  const radius = effect.width / 2;
  if (
    enemy.x + enemy.radius < Math.min(fromX, toX) - radius ||
    enemy.x - enemy.radius > Math.max(fromX, toX) + radius ||
    enemy.y + enemy.radius < Math.min(fromY, toY) - radius ||
    enemy.y - enemy.radius > Math.max(fromY, toY) + radius
  )
    return false;
  return segmentHit(fromX, fromY, toX, toY, enemy, radius) !== null;
}

function updateSkills(state, dt) {
  const remaining = [];
  for (const effect of state.skillEffects) {
    const definition = SKILLS[effect.kind];
    const activeDt = Math.min(dt, Math.max(0, effect.life - effect.age));
    effect.age += dt;
    if (effect.kind === 'blast' && !effect.triggered && effect.age >= effect.delay) {
      effect.triggered = true;
      for (const enemy of state.enemies) {
        if (enemy.hp <= 0 || distance(effect, enemy) > effect.radius + enemy.radius) continue;
        hurtEnemy(state, enemy, definition.damage, 'skill');
        enemy.stunned = Math.max(enemy.stunned, definition.stunDuration);
        effect.hitIds.push(enemy.id);
      }
      particles(state, effect.x, effect.y, definition.color, 24, 235);
      state.cameraShake = 0.16;
      event(state, 'explode', { x: effect.x, y: effect.y, radius: effect.radius });
    } else if (effect.kind === 'gale') {
      for (const enemy of state.enemies) {
        if (enemy.hp <= 0 || distance(effect, enemy) > effect.radius + enemy.radius) continue;
        hurtEnemy(state, enemy, definition.damagePerSecond * activeDt, 'skill', false);
        const dx = enemy.x - effect.x,
          dy = enemy.y - effect.y;
        const length = Math.hypot(dx, dy);
        const pushX = length > 0.001 ? dx / length : effect.dx;
        const pushY = length > 0.001 ? dy / length : effect.dy;
        if (!(enemy.frozen > 0) && !(enemy.stunned > 0))
          moveBody(
            state,
            enemy,
            pushX * definition.pushSpeed * activeDt,
            pushY * definition.pushSpeed * activeDt,
            [],
          );
        enemy.windSlow = definition.slowDuration;
        enemy.slow = Math.min(enemy.slow, definition.slow);
      }
    } else if (effect.kind === 'cart' || effect.kind === 'horse') {
      const fromX = effect.x,
        fromY = effect.y;
      effect.travelled = Math.min(effect.length, effect.travelled + definition.speed * activeDt);
      effect.x = effect.startX + effect.dx * effect.travelled;
      effect.y = effect.startY + effect.dy * effect.travelled;
      for (const enemy of state.enemies) {
        if (
          enemy.hp <= 0 ||
          effect.hitIds.includes(enemy.id) ||
          !effectHitsSegment(effect, enemy, fromX, fromY, effect.x, effect.y)
        )
          continue;
        effect.hitIds.push(enemy.id);
        hurtEnemy(state, enemy, definition.damage, 'skill');
        if (effect.kind === 'cart')
          enemy.stunned = Math.max(enemy.stunned, definition.stunDuration);
        else {
          enemy.feared = Math.max(enemy.feared, definition.fearDuration);
          enemy.fearX = effect.startX;
          enemy.fearY = effect.startY;
        }
      }
    } else if (effect.kind === 'laser' && !effect.triggered) {
      effect.triggered = true;
      for (const enemy of state.enemies) {
        if (
          enemy.hp <= 0 ||
          !effectHitsSegment(
            effect,
            enemy,
            effect.startX,
            effect.startY,
            effect.targetX,
            effect.targetY,
          )
        )
          continue;
        hurtEnemy(state, enemy, definition.damage, 'skill');
        enemy.vulnerable = definition.vulnerableDuration;
        effect.hitIds.push(enemy.id);
      }
    }
    if (effect.age < effect.life) remaining.push(effect);
  }
  state.skillEffects = remaining;
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
    if (enemy.frozen > 0 || enemy.stunned > 0) continue;
    let dx = enemy.feared > 0 ? enemy.x - enemy.fearX : state.player.x - enemy.x,
      dy = enemy.feared > 0 ? enemy.y - enemy.fearY : state.player.y - enemy.y;
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
      const minimum = (enemy.radius + other.radius) * 0.8;
      // The crowd is bounded, but evaluating a square root for every pair made
      // late waves expensive. Only nearby pairs need the exact separation.
      if (Math.abs(sx) >= minimum || Math.abs(sy) >= minimum) continue;
      const separation = Math.hypot(sx, sy);
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
      !(enemy.feared > 0) &&
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
  state.telegraphs = state.telegraphs.filter((item) => item.life > 0).slice(-MAX_TELEGRAPHS);
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
  state.skillCooldown = Math.max(0, state.skillCooldown - dt);
  chargeEnergy(state, ENERGY_PER_SECOND * dt);
  state.shotCooldown = Math.max(0, state.shotCooldown - dt);
  updateEffects(state, dt);
  const obstacles = [];
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
  updateStatuses(state, dt);
  updateBullets(state, dt);
  updateBoons(state, dt);
  updatePlants(state, dt);
  updateSkills(state, dt);
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

import {
  ENEMIES,
  LEVELS,
  SEEDS,
  UPGRADES,
  WEATHER,
  WEATHER_MODIFIERS,
  BOONS,
  SKILLS,
} from './config.mjs';
import { createProfile, profileStats } from './progression.mjs';
import {
  ability,
  canHit,
  enemyDamage,
  playerDamage,
  controlledSpeed,
  resolveStat,
} from './combat.mjs';
import {
  createRunLoadout,
  configureLoadout,
  selectSkill,
  upgradeBonus,
  eligibleUpgrades,
  gainRunExperience,
  drawUpgradeChoices,
  acquireBoon,
} from './loadout.mjs';
export { configureLoadout, selectSkill };
import { terrainSolids, terrainPointBlocked, terrainMovement, weatherStats } from './world.mjs';

const TAU = Math.PI * 2;
const PLAYER_SPEED = 202;
const NORMAL_RANGE = 535;
const DASH_DURATION = 0.15;
const MAX_PARTICLES = 240;
const MAX_FLOATERS = 60;
const MAX_BULLETS = 120;
const MAX_SKILL_EFFECTS = 12;
const ENERGY_PER_SECOND = 6;
const ENERGY_PER_KILL = 8;
const bonus = upgradeBonus;
const terrainDefinition = (kind) => Object.values(BOONS).find((boon) => boon.kind === kind);

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const levelOf = (state) => LEVELS[state.levelId];
const id = (state) => ++state.nextId;
const playerLevel = (state) => state.permanent.level;
const enemyCapacity = (state, reserve = true) =>
  Math.max(
    1,
    levelOf(state).spawn.maxEnemies -
      (reserve && levelOf(state).encounter?.required && !state.encounter.spawned ? 1 : 0),
  );
const aliveEnemies = (state) => state.enemies.filter((enemy) => enemy.hp > 0).length;
const weatherOf = (state) => weatherStats(state);

function buffStat(state, stat, base, fallbackId, fallbackValue) {
  const effects = [];
  for (const key of state.upgrades) {
    const definition = UPGRADES.find((entry) => entry.id === key);
    if (definition?.effects?.length) {
      effects.push(...definition.effects.filter((effect) => effect.stat === stat));
    } else if (
      definition?.effects &&
      Number.isFinite(definition.effects[stat]) &&
      !['maxHp'].includes(stat)
    ) {
      effects.push({
        op: ['iceDuration', 'dashCooldown'].includes(stat) ? 'add' : 'addPercent',
        value: definition.effects[stat],
      });
    } else if (key === fallbackId) effects.push({ op: 'addPercent', value: fallbackValue });
  }
  return resolveStat(base, effects);
}

function telegraph(state, kind, x, y, radius, life, detail = {}) {
  if (
    kind === 'explosion' &&
    state.telegraphs.filter((item) => item.kind === 'explosion').length >= 24
  )
    return;
  state.telegraphs.push({ kind, x, y, radius, life, maxLife: life, ...detail });
  if (state.telegraphs.length > 40) {
    const decorative = state.telegraphs.findIndex((item) => item.kind === 'explosion');
    if (decorative >= 0) state.telegraphs.splice(decorative, 1);
    else {
      const disposable = state.telegraphs.findIndex((item) => !item.dangerous);
      if (disposable >= 0) state.telegraphs.splice(disposable, 1);
    }
  }
}

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
  const rank = definition.rank ?? 'normal';
  const scaling =
    preview || rank !== 'normal'
      ? 1
      : (1 + (state.wave - 1) * 0.035) * (levelOf(state).difficulty?.healthScale ?? 1);
  const maxHp = Math.round(definition.hp * scaling);
  return {
    id: id(state),
    kind,
    x,
    y,
    hp: maxHp,
    maxHp,
    radius: definition.radius,
    rank,
    armor: definition.armor ?? 0,
    controlResistance: clamp(finite(definition.controlResistance), 0, 0.95),
    shield: definition.shield ?? 0,
    maxShield: definition.shield ?? 0,
    layer: 'ground',
    height: 0,
    abilityState: {},
    bossPhase: 1,
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
  const definition = SEEDS[kind] ?? { ...terrainDefinition(kind), health: 1 };
  const weather = weatherOf(state);
  const maxHp =
    (kind === 'ice'
      ? buffStat(state, 'iceHealth', definition.health, 'ice-heart', 0.7)
      : definition.health) *
    state.permanent.seedPower *
    weather.plantHealth *
    (kind === 'ice' ? weather.iceHealth : 1);
  return {
    id: id(state),
    kind,
    x,
    y,
    radius:
      (kind === 'thorn'
        ? buffStat(state, 'thornRange', definition.radius, 'thorn-heart', 0.15)
        : definition.radius) *
      (1 + bonus(state, 'terrainRadius')),
    age: 0,
    life:
      (kind === 'ice' ? buffStat(state, 'iceDuration', definition.life) : definition.life) *
      weather.plantDuration *
      (1 + bonus(state, 'terrainLife')),
    hp: maxHp,
    maxHp,
    actionCooldown: 0,
  };
}

/** A fresh serializable simulation; the ready scene is an inert visual preview. */
export function createGame(levelId = 'ruins', seed = 42, profile = null) {
  const level = LEVELS[levelId];
  if (!level) throw new RangeError(`Unknown Bullet Garden level: ${levelId}`);
  const initialSeed = finite(seed, 42) >>> 0 || 42;
  const cleanProfile = createProfile(profile);
  const permanent = profileStats(cleanProfile);
  const state = {
    levelId,
    profile: cleanProfile,
    permanent,
    weather: { kind: 'sunny', wind: 0, thunder: false, ...level.weather },
    weatherTimers: {
      hail: WEATHER.hail.hazard.interval,
      thunder: WEATHER_MODIFIERS.thunder.hazard.interval,
    },
    terrain: structuredClone(level.terrain ?? []),
    encounter: {
      kind: level.encounter?.kind ?? null,
      spawned: false,
      defeated: false,
      enemyId: null,
    },
    pet: permanent.petUnlocked
      ? {
          kind: 'sprout-helper',
          x: level.playerStart.x + 35,
          y: level.playerStart.y - 28,
          angle: 0,
          shotCooldown: 0,
        }
      : null,
    phase: 'ready',
    time: 0,
    duration: level.duration,
    wave: 1,
    waveProgress: 0,
    coins: 0,
    kills: 0,
    ...createRunLoadout(undefined, level.progression?.firstXp ?? 12),
    skillEffects: [],
    burstQueue: [],
    player: {
      ...level.playerStart,
      hp: permanent.maxHp,
      maxHp: permanent.maxHp,
      armor: permanent.armor,
      layer: 'ground',
      radius: 18,
      angle: -0.15,
      invulnerable: 0,
      dashCooldown: 0,
      dashTime: 0,
      dashX: 0,
      dashY: 0,
    },
    plantCap: level.plantCap,
    enemies: [],
    plants: [],
    bullets: [],
    particles: [],
    floaters: [],
    telegraphs: [],
    stats: {
      shots: 0,
      plantsGrown: 0,
      plantKills: 0,
      terrainDamage: 0,
      damageTaken: 0,
      misses: 0,
      reflections: 0,
      splitShots: 0,
      autoPlants: 0,
      skillCasts: 0,
      skillDamage: 0,
      skillKills: 0,
      petShots: 0,
      petKills: 0,
      hostileShots: 0,
      shieldDamage: 0,
    },
    upgradeChoices: [],
    upgrades: [],
    events: [],
    initialSeed,
    randomState: initialSeed,
    nextId: 0,
    spawnTimer: level.spawn.initialDelay,
    shotCooldown: 0,
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

export function startGame(state) {
  const fresh = createGame(state.levelId, state.initialSeed, state.profile);
  fresh.runId = state.runId ?? null;
  configureLoadout(fresh, { skills: [...(state.loadout?.skills ?? ['blast', 'gale'])] });
  fresh.phase = 'playing';
  fresh.enemies = [];
  fresh.plants = [];
  fresh.nextId = 0;
  fresh.randomState = fresh.initialSeed;
  Object.assign(state, fresh);
  event(state, 'start');
  return state;
}

export function selectSeed() {
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

/** Seeds stop at the chosen ground point. Only a miss can grow terrain. */
export function castSeed() {
  return false;
}

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
    layers:
      definition.layers ?? (['laser', 'gale'].includes(slot.kind) ? ['ground', 'air'] : ['ground']),
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
  state.player.dashCooldown = Math.max(
    1.45,
    buffStat(state, 'dashCooldown', 3) - bonus(state, 'dashReduction'),
  );
  state.player.invulnerable = Math.max(state.player.invulnerable, 0.34);
  particles(state, state.player.x, state.player.y, '#e3fbe6', 12, 110);
  event(state, 'dash');
  return true;
}

function offerUpgrade(state) {
  if (state.phase !== 'playing' || state.progression.pending <= 0) return;
  const choices = drawUpgradeChoices(state, () => random(state));
  if (!choices.length) {
    state.player.hp = Math.min(
      state.player.maxHp,
      state.player.hp + state.progression.pending * 20,
    );
    state.progression.pending = 0;
    state.progression.queue = [];
    return;
  }
  state.upgradeChoices = choices;
  state.phase = 'upgrade';
  event(state, 'upgrade-ready', { level: state.progression.queue[0] ?? state.progression.level });
}

export function chooseUpgrade(state, upgradeId) {
  const upgrade = UPGRADES.find((entry) => entry.id === upgradeId);
  if (
    state.phase !== 'upgrade' ||
    !state.upgradeChoices.includes(upgradeId) ||
    !upgrade ||
    !eligibleUpgrades(state).includes(upgrade)
  )
    return false;
  state.upgrades.push(upgradeId);
  const growth = Array.isArray(upgrade.effects)
    ? upgrade.effects.find((effect) => effect.stat === 'maxHp' && effect.op === 'add')?.value
    : upgrade.effects.maxHp;
  if (growth) state.player.maxHp += growth;
  const heal = upgrade.effects.heal ?? (upgrade.id === 'wild-heart' ? 40 : 0);
  if (heal) state.player.hp = Math.min(state.player.maxHp, state.player.hp + heal);
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

function summon(state, parent, kind, count) {
  let created = 0;
  for (let index = 0; index < count && aliveEnemies(state) < enemyCapacity(state); index += 1) {
    if (!ENEMIES[kind]) break;
    const angle = parent.angle + (index * TAU) / Math.max(count, 1);
    const radius = parent.radius + ENEMIES[kind].radius + 12;
    const point = constrainPoint(
      state,
      { x: parent.x + Math.cos(angle) * radius, y: parent.y + Math.sin(angle) * radius },
      ENEMIES[kind].radius,
    );
    const child = newEnemy(state, kind, point.x, point.y);
    pushOut(state, child, solidPlants(state));
    if (!canOccupy(state, child.x, child.y, child.radius, solidPlants(state))) continue;
    state.enemies.push(child);
    created += 1;
    telegraph(state, 'spawn', child.x, child.y, child.radius + 10, 0.55);
  }
  if (created) event(state, 'summon', { kind, count: created, parentId: parent.id });
  return created;
}

function hurtEnemy(state, enemy, damage, source = 'normal', showNumber = true, options = {}) {
  if (!canHit(enemy, options.layers ?? ['ground', 'air'])) return;
  const definition = ENEMIES[enemy.kind] ?? ENEMIES.sprout;
  const timeScale = Math.max(0, finite(options.timeScale, 1));
  if (timeScale <= 0 || !Number.isFinite(damage) || damage <= 0) return;
  let effective = damage * timeScale * (enemy.vulnerable > 0 ? 1.35 : 1);
  enemy.lastHitAge = finite(enemy.age);
  const shield = enemy.shield ?? definition.shield ?? 0;
  if (shield > 0) {
    const multiplier = options.explosion ? 1.3 : 1;
    const absorbed = Math.min(shield, effective * multiplier);
    enemy.shield = shield - absorbed;
    effective = Math.max(0, effective - absorbed / multiplier);
    state.stats.shieldDamage += absorbed;
    if (showNumber) floater(state, enemy.x, enemy.y, `盾 −${Math.round(absorbed)}`, '#87e9ff');
    if (enemy.shield <= 0) {
      enemy.shieldBrokenAge = finite(enemy.age);
      const stun = ability(definition, 'shieldBreakStun');
      if (stun) enemy.stun = stun.duration ?? 1;
      event(state, 'shield-break', { id: enemy.id, kind: enemy.kind });
    }
  }
  // Shields absorb the incoming hit; only the unabsorbed portion reaches armor.
  if (effective > 0)
    effective = enemyDamage(
      effective / timeScale,
      enemy.armor ?? 0,
      options.armorPierce ?? 0,
      timeScale,
    );
  const actual = Math.min(enemy.hp, effective);
  enemy.hp = Math.max(0, enemy.hp - effective);
  enemy.hit = 0.13;
  if (source === 'plant') state.stats.terrainDamage += actual;
  if (source === 'skill') state.stats.skillDamage += actual;
  if (showNumber && actual > 0)
    floater(
      state,
      enemy.x,
      enemy.y,
      Math.round(actual),
      source === 'plant' ? '#ffe18d' : '#fff8e7',
    );
  const brood = ability(definition, 'brood');
  if (brood) {
    enemy.abilityState ??= {};
    const memory = (enemy.abilityState.brood ??= { crossed: [], summoned: 0 });
    for (const threshold of brood.thresholds ?? [0.7, 0.35]) {
      if (enemy.hp / enemy.maxHp > threshold || memory.crossed.includes(threshold)) continue;
      memory.crossed.push(threshold);
      const count = Math.min(brood.count ?? 2, (brood.cap ?? 4) - memory.summoned);
      memory.summoned += summon(state, enemy, brood.kind ?? 'minion', count);
    }
  }
  if (enemy.hp <= 0) {
    state.kills += 1;
    const coins = definition.coins ?? 2;
    state.coins += coins;
    gainRunExperience(state, definition.xp ?? definition.experience ?? 2);
    chargeEnergy(state, ENERGY_PER_KILL);
    if (source === 'plant') state.stats.plantKills += 1;
    if (source === 'pet') state.stats.petKills += 1;
    if (source === 'skill') state.stats.skillKills += 1;
    if (enemy.id === state.encounter.enemyId) {
      state.encounter.defeated = true;
      event(state, 'encounter-defeated', { kind: enemy.kind, rank: enemy.rank });
    }
    particles(state, enemy.x, enemy.y, '#edc45e', 6, 88);
    event(state, 'kill', { kind: enemy.kind, x: enemy.x, y: enemy.y, source, coins });
  }
}

function hurtPlayer(state, damage) {
  if (state.player.invulnerable > 0 || state.player.hp <= 0) return;
  const actual = Math.min(
    state.player.hp,
    playerDamage(damage, buffStat(state, 'armor', state.player.armor)),
  );
  state.player.hp = Math.max(0, state.player.hp - actual);
  state.player.invulnerable = 0.72;
  state.stats.damageTaken += actual;
  state.cameraShake = 0.18;
  floater(state, state.player.x, state.player.y, `−${Math.round(actual)}`, '#ff8d8d');
  particles(state, state.player.x, state.player.y, '#ff7891', 8);
  event(state, 'hit', { damage: actual });
  if (state.player.hp <= 0) {
    state.phase = 'lost';
    event(state, 'lose');
  }
}

function spawnEnemy(state, forcedKind = null) {
  const level = levelOf(state);
  const bounds = level.bounds;
  const tier = level.spawn.composition.filter((entry) => entry.fromWave <= state.wave).at(-1);
  const weights = Object.entries(tier.weights).filter(
    ([kind, weight]) =>
      weight > 0 &&
      ENEMIES[kind] &&
      (forcedKind ||
        ((ENEMIES[kind].unlockStage ?? 1) <= (level.order ?? 1) &&
          (ENEMIES[kind].unlockLevel ?? 1) <= playerLevel(state))),
  );
  if (!forcedKind && !weights.length) return null;
  let roll = random(state) * weights.reduce((sum, [, weight]) => sum + weight, 0);
  let kind = forcedKind ?? weights.at(-1)?.[0];
  for (const [candidate, weight] of weights) {
    roll -= weight;
    if (roll <= 0) {
      if (!forcedKind) kind = candidate;
      break;
    }
  }
  if (!ENEMIES[kind]) return null;
  const radius = ENEMIES[kind].radius;
  const obstacles = solidPlants(state);
  const safeDistance = state.player.radius + radius + 12;
  const legal = (point) =>
    point &&
    distance(point, state.player) > safeDistance &&
    canOccupy(state, point.x, point.y, radius, obstacles);
  let point = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const edge = Math.floor(random(state) * 4),
      along = random(state);
    const candidate =
      edge < 2
        ? {
            x: edge === 0 ? bounds.left + radius : bounds.right - radius,
            y: bounds.top + radius + along * (bounds.bottom - bounds.top - radius * 2),
          }
        : {
            x: bounds.left + radius + along * (bounds.right - bounds.left - radius * 2),
            y: edge === 2 ? bounds.top + radius : bounds.bottom - radius,
          };
    if (distance(candidate, state.player) > 250 && legal(candidate)) {
      point = candidate;
      break;
    }
  }
  if (!point) {
    // A finite deterministic scan recovers from crowded or highly altered edges.
    const xSpan = bounds.right - bounds.left - radius * 2;
    const ySpan = bounds.bottom - bounds.top - radius * 2;
    const columns = Math.max(1, Math.ceil(xSpan / 32)),
      rows = Math.max(1, Math.ceil(ySpan / 32));
    let bestDistance = -1;
    const consider = (x, y) => {
      const candidate = { x, y },
        separation = distance(candidate, state.player);
      if (separation > bestDistance && legal(candidate)) {
        point = candidate;
        bestDistance = separation;
      }
    };
    for (let column = 0; column <= columns; column += 1) {
      const x = bounds.left + radius + (xSpan * column) / columns;
      consider(x, bounds.top + radius);
      consider(x, bounds.bottom - radius);
    }
    for (let row = 0; row <= rows; row += 1) {
      const y = bounds.top + radius + (ySpan * row) / rows;
      consider(bounds.left + radius, y);
      consider(bounds.right - radius, y);
    }
    if (!point)
      for (let row = 1; row < rows; row += 1)
        for (let column = 1; column < columns; column += 1)
          consider(
            bounds.left + radius + (xSpan * column) / columns,
            bounds.top + radius + (ySpan * row) / rows,
          );
  }
  if (!point) return null;
  const enemy = newEnemy(state, kind, point.x, point.y);
  state.enemies.push(enemy);
  telegraph(state, 'spawn', enemy.x, enemy.y, radius + 12, 0.65);
  return enemy;
}

function closestEnemy(
  state,
  maximumRange = NORMAL_RANGE,
  origin = state.player,
  layers = ['ground', 'air'],
) {
  let best = null,
    bestDistance = maximumRange;
  for (const enemy of state.enemies) {
    if (!canHit(enemy, layers)) continue;
    const separation = distance(origin, enemy);
    if (separation < bestDistance) {
      bestDistance = separation;
      best = enemy;
    }
  }
  return best;
}

function projectile(state, origin, target, params) {
  if (state.bullets.length >= MAX_BULLETS) return false;
  const dx = target.x - origin.x,
    dy = target.y - origin.y;
  const angle = Math.atan2(dy, dx) + (params.angleOffset ?? 0);
  const range = params.range ?? NORMAL_RANGE,
    speed = params.speed ?? 850;
  state.bullets.push({
    id: id(state),
    kind: params.kind ?? 'normal',
    source: params.source ?? 'normal',
    ownerId: origin.id ?? null,
    x: origin.x,
    y: origin.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    targetX: origin.x + Math.cos(angle) * range,
    targetY: origin.y + Math.sin(angle) * range,
    remaining: range,
    radius: params.radius ?? 4,
    damage: params.damage,
    life: range / speed,
    remainingPierce: params.pierce ?? 0,
    hitIds: [],
    layers: params.layers ?? ['ground', 'air'],
  });
  return true;
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
      source: 'normal',
      layers: ['ground', 'air'],
      remainingPierce: state.permanent.pierce,
      hitIds: [],
      generation: 0,
      missEligible: true,
      reflected: false,
      originalAngle: direction,
      bouncesRemaining: bonus(state, 'bounces'),
      x: state.player.x,
      y: state.player.y,
      vx: Math.cos(direction) * speed,
      vy: Math.sin(direction) * speed,
      targetX: state.player.x + Math.cos(direction) * NORMAL_RANGE * weatherOf(state).gunRange,
      targetY: state.player.y + Math.sin(direction) * NORMAL_RANGE * weatherOf(state).gunRange,
      remaining: NORMAL_RANGE * weatherOf(state).gunRange,
      radius: 4,
      damage:
        (buffStat(state, 'damage', state.permanent.damage) * damageScale) / (1 + extra * 0.12),
      life: (NORMAL_RANGE * weatherOf(state).gunRange) / speed + 0.05,
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
  const interval = Math.max(0.12, state.permanent.fireInterval / buffStat(state, 'fireRate', 1));
  state.shotCooldown = interval + burstCount * 0.085;
  for (let index = 0; index < burstCount; index += 1)
    state.burstQueue.push({ delay: (index + 1) * 0.085, angle });
}

function updatePet(state, dt) {
  if (!state.pet) return;
  const pet = state.pet;
  pet.angle = state.time * 1.1;
  const desiredX = state.player.x + Math.cos(pet.angle) * 38;
  const desiredY = state.player.y - 24 + Math.sin(pet.angle) * 18;
  pet.x += (desiredX - pet.x) * Math.min(1, dt * 8);
  pet.y += (desiredY - pet.y) * Math.min(1, dt * 8);
  pet.shotCooldown = Math.max(0, pet.shotCooldown - dt);
  if (pet.shotCooldown > 0) return;
  const target = closestEnemy(state, 360, pet);
  if (
    target &&
    projectile(state, pet, target, {
      source: 'pet',
      damage: state.permanent.petDamage,
      range: 360,
      speed: 700,
      radius: 4,
    })
  ) {
    pet.shotCooldown = state.permanent.petInterval;
    state.stats.petShots += 1;
    event(state, 'pet-shoot', { x: pet.x, y: pet.y });
  }
}

function solidPlants(state) {
  return [
    ...terrainSolids(state),
    ...state.plants.filter(
      (plant) =>
        plantEffects(plant).some((effect) => effect.type === 'block') &&
        plant.hp > 0 &&
        plant.age < plant.life,
    ),
  ];
}

function canOccupy(state, x, y, radius, obstacles, layer = 'ground') {
  const bounds = levelOf(state).bounds;
  return (
    x >= bounds.left + radius &&
    x <= bounds.right - radius &&
    y >= bounds.top + radius &&
    y <= bounds.bottom - radius &&
    !terrainPointBlocked(state, x, y, radius, layer) &&
    (layer !== 'ground' ||
      !obstacles.some((plant) => Math.hypot(x - plant.x, y - plant.y) < radius + plant.radius + 1))
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
    if (canOccupy(state, point.x, point.y, body.radius, obstacles, body.layer)) {
      body.x = point.x;
      body.y = point.y;
    } else {
      if (canOccupy(state, point.x, body.y, body.radius, obstacles, body.layer)) body.x = point.x;
      if (canOccupy(state, body.x, point.y, body.radius, obstacles, body.layer)) body.y = point.y;
    }
  }
  return Math.hypot(body.x - oldX, body.y - oldY);
}

function pushOut(state, body, obstacles) {
  if ((body.layer ?? 'ground') !== 'ground') return;
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
  if (terrainPointBlocked(state, point.x, point.y, definition.radius)) return;
  const plant = newPlant(state, definition.kind, point.x, point.y);
  if (state.plants.length >= state.plantCap) {
    const oldest = state.plants.reduce((best, item) => (item.age > best.age ? item : best));
    state.plants.splice(state.plants.indexOf(oldest), 1);
  }
  state.plants.push(plant);
  if (plantEffects(plant).some((effect) => effect.type === 'block')) {
    pushOut(state, state.player, solidPlants(state));
    for (const enemy of state.enemies) pushOut(state, enemy, solidPlants(state));
  }
  state.stats.plantsGrown += 1;
  state.stats.autoPlants += 1;
  particles(state, plant.x, plant.y, definition.color, 8, 70);
  event(state, 'plant', { kind: plant.kind, x: plant.x, y: plant.y });
}

function updateBoons(state, dt) {
  for (const boonId of state.boons) {
    state.boonTimers[boonId] -= dt * weatherOf(state).seedRegen;
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
    if (canHit(enemy, ['ground', 'air']) && distance(bullet, enemy) < radius + enemy.radius)
      hurtEnemy(state, enemy, bullet.damage * fraction, 'normal', false);
  particles(state, bullet.x, bullet.y, '#ffc35b', 6, 110);
  telegraph(state, 'explosion', bullet.x, bullet.y, radius, 0.2);
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
      source: 'normal',
      layers: ['ground', 'air'],
      hitIds: [],
      remainingPierce: 0,
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
    bullet.hitIds ??= [];
    const hostile = bullet.source === 'enemy' || bullet.kind === 'hostile';
    let travel = Math.min(bullet.remaining, speed * dt),
      ended = false,
      hit = bullet.hitIds.length > 0;
    for (let segment = 0; segment < 5 && (travel > 1e-8 || segment === 0) && !ended; segment += 1) {
      const ux = speed > 0 ? bullet.vx / speed : 0,
        uy = speed > 0 ? bullet.vy / speed : 0;
      const wallX =
        ux > 0 ? (bounds.right - bullet.x) / ux : ux < 0 ? (bounds.left - bullet.x) / ux : Infinity;
      const wallY =
        uy > 0 ? (bounds.bottom - bullet.y) / uy : uy < 0 ? (bounds.top - bullet.y) / uy : Infinity;
      const wallDistance = Math.max(0, Math.min(wallX, wallY));
      const length = Math.min(travel, wallDistance);
      const startX = bullet.x,
        startY = bullet.y;
      const endX = startX + ux * length,
        endY = startY + uy * length;
      const collisions = [];
      for (const obstacle of solidPlants(state)) {
        if (obstacle.blocksProjectiles === false) continue;
        const t = segmentHit(startX, startY, endX, endY, obstacle, bullet.radius ?? 4);
        if (t !== null)
          collisions.push({
            t,
            target: obstacle,
            type: obstacle.permanent || !hostile ? 'wall' : 'plant',
          });
      }
      if (hostile) {
        const t = segmentHit(startX, startY, endX, endY, state.player, bullet.radius ?? 5);
        if (t !== null) collisions.push({ t, target: state.player, type: 'player' });
        for (const plant of state.plants) {
          if (
            plant.hp <= 0 ||
            (SEEDS[plant.kind]?.health ?? 1) <= 1 ||
            plantEffects(plant).some((effect) => effect.type === 'block')
          )
            continue;
          const t = segmentHit(startX, startY, endX, endY, plant, bullet.radius ?? 5);
          if (t !== null) collisions.push({ t, target: plant, type: 'plant' });
        }
      } else {
        for (const enemy of state.enemies) {
          if (
            !canHit(enemy, bullet.layers ?? ['ground', 'air']) ||
            bullet.hitIds.includes(enemy.id)
          )
            continue;
          const radius = bullet.radius ?? 4;
          if (
            enemy.x + enemy.radius < Math.min(startX, endX) - radius ||
            enemy.x - enemy.radius > Math.max(startX, endX) + radius ||
            enemy.y + enemy.radius < Math.min(startY, endY) - radius ||
            enemy.y - enemy.radius > Math.max(startY, endY) + radius
          )
            continue;
          const t = segmentHit(startX, startY, endX, endY, enemy, radius);
          if (t !== null) collisions.push({ t, target: enemy, type: 'enemy' });
        }
      }
      collisions.sort((first, second) => first.t - second.t);
      for (const { t, target, type } of collisions) {
        if (type === 'enemy' && !canHit(target, bullet.layers ?? ['ground', 'air'])) continue;
        bullet.x = startX + ux * length * t;
        bullet.y = startY + uy * length * t;
        if (type === 'enemy') {
          bullet.hitIds.push(target.id);
          hit = true;
          bullet.missEligible = false;
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
          hurtEnemy(state, target, bullet.damage ?? 19, bullet.source ?? 'normal', true, {
            layers: bullet.layers,
          });
          if (bullet.source === 'normal' || !bullet.source)
            bulletExplosion(state, bullet, bullet.explosion ?? 0);
          particles(
            state,
            target.x,
            target.y,
            bullet.element === 'ice' ? '#92e4ff' : '#ffb18c',
            3,
            80,
          );
          if (finite(bullet.remainingPierce) > 0) {
            bullet.remainingPierce -= 1;
            continue;
          }
        } else if (type === 'player') hurtPlayer(state, bullet.damage ?? 7);
        else if (type === 'plant') {
          target.hp = Math.max(0, target.hp - (bullet.damage ?? 7));
          particles(state, target.x, target.y, SEEDS[target.kind]?.color ?? '#a0e5fa', 3, 65);
        }
        ended = true;
        break;
      }
      if (ended) break;
      bullet.x = endX;
      bullet.y = endY;
      bullet.remaining -= length;
      travel -= length;
      if (wallDistance <= length + 1e-8) {
        if (bullet.bouncesRemaining > 0 && bullet.remaining > 0.001 && !hostile) {
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
      if (!hostile && (!bullet.source || bullet.source === 'normal')) {
        if (!hit) recordMiss(state, bullet);
        splitBullet(state, bullet, fragments);
      }
    } else survivors.push(bullet);
  }
  state.bullets = survivors.concat(fragments).slice(0, MAX_BULLETS);
}

function plantEffects(plant) {
  const definition = SEEDS[plant.kind] ?? terrainDefinition(plant.kind);
  if (!definition) return [];
  if (definition.effects) return definition.effects;
  // Old content remains valid while content packs migrate to declarative effects.
  return (
    {
      thorn: [
        { type: 'slowAura', range: definition.radius, slow: definition.slow },
        {
          type: 'damageAura',
          range: definition.radius,
          damagePerSecond: definition.damagePerSecond,
        },
      ],
      ice: [{ type: 'block' }],
      mushroom: [
        { type: 'explode', range: definition.blastRadius, damage: definition.blastDamage },
      ],
      trench: [{ type: 'trench', slow: definition.slow }],
      frost: [
        {
          type: 'freezeAura',
          duration: definition.freezeDuration,
          cooldown: definition.freezeCooldown,
        },
      ],
      poison: [
        {
          type: 'poisonAura',
          duration: definition.poisonDuration,
          damagePerSecond: definition.damagePerSecond,
        },
      ],
    }[plant.kind] ?? []
  );
}

const PLANT_HANDLERS = {
  block() {},
  trench(state, plant, effect) {
    for (const enemy of state.enemies)
      if (canHit(enemy, ['ground']) && terrainTouches(plant, enemy))
        enemy.slow = Math.min(enemy.slow, controlledSpeed(effect.slow, enemy.controlResistance));
  },
  freezeAura(state, plant, effect) {
    for (const enemy of state.enemies)
      if (
        canHit(enemy, ['ground']) &&
        terrainTouches(plant, enemy) &&
        !(enemy.freezeCooldown > 0)
      ) {
        enemy.frozen = effect.duration * (1 - (enemy.controlResistance ?? 0));
        enemy.freezeCooldown = effect.cooldown;
      }
  },
  poisonAura(state, plant, effect) {
    for (const enemy of state.enemies)
      if (canHit(enemy, ['ground']) && terrainTouches(plant, enemy)) {
        enemy.poison = effect.duration;
        enemy.poisonDps =
          effect.damagePerSecond * state.permanent.seedPower * (1 + bonus(state, 'terrainDamage'));
      }
  },
  slowAura(state, plant, effect) {
    const slow = state.weather.kind === 'rain' ? 1 - (1 - effect.slow) * 1.1 : effect.slow;
    for (const enemy of state.enemies)
      if (canHit(enemy, ['ground']) && distance(plant, enemy) < plant.radius + enemy.radius * 0.5) {
        const resistance = enemy.controlResistance ?? ENEMIES[enemy.kind]?.controlResistance ?? 0;
        enemy.slow = Math.min(enemy.slow ?? 1, controlledSpeed(slow, resistance));
      }
  },
  damageAura(state, plant, effect, dt) {
    const damage =
      buffStat(state, 'thornDamage', effect.damagePerSecond, 'thorn-heart', 0.5) *
      state.permanent.seedPower *
      (1 + bonus(state, 'terrainDamage'));
    for (const enemy of state.enemies)
      if (canHit(enemy, ['ground']) && distance(plant, enemy) < plant.radius + enemy.radius * 0.5)
        hurtEnemy(state, enemy, damage, 'plant', false, { layers: ['ground'], timeScale: dt });
  },
  healAura(state, plant, effect, dt, healing) {
    const range = buffStat(state, 'sunflowerRange', effect.range, 'sunflower-heart', 0.1);
    plant.effectRadius = range;
    if (distance(plant, state.player) < range + state.player.radius) {
      healing.power += buffStat(
        state,
        'sunflowerHeal',
        effect.healPerSecond,
        'sunflower-heart',
        0.4,
      );
      healing.cap = Math.max(healing.cap, effect.maxStackHeal ?? 5);
    }
  },
  shoot(state, plant, effect) {
    if (plant.actionCooldown > 0) return;
    const target = closestEnemy(
      state,
      effect.range,
      plant,
      effect.antiAir ? ['ground', 'air'] : ['ground'],
    );
    const weather = weatherOf(state);
    const damage =
      buffStat(state, 'turretDamage', effect.damage, 'turret-heart', 0.3) *
      state.permanent.seedPower *
      weather.plantDamage;
    if (
      target &&
      projectile(state, plant, target, {
        source: 'plant',
        damage,
        range: effect.range,
        speed: (effect.projectileSpeed ?? 640) * weather.projectileSpeed,
        layers: effect.antiAir ? ['ground', 'air'] : ['ground'],
      })
    ) {
      plant.actionCooldown =
        effect.interval / buffStat(state, 'turretFireRate', 1, 'turret-heart', 0.2);
      plant.targetX = target.x;
      plant.targetY = target.y;
      plant.angle = Math.atan2(target.y - plant.y, target.x - plant.x);
      plant.flash = 0.16;
      event(state, 'plant-shoot', { kind: plant.kind, x: plant.x, y: plant.y });
    }
  },
  chainLightning(state, plant, effect) {
    if (plant.actionCooldown > 0) return;
    const layers = effect.antiAir ? ['ground', 'air'] : ['ground'];
    const first = closestEnemy(state, effect.range, plant, layers);
    if (!first) return;
    const damage =
      buffStat(state, 'stormDamage', effect.damage, 'storm-heart', 0.35) *
      state.permanent.seedPower *
      weatherOf(state).electricDamage;
    hurtEnemy(state, first, damage, 'plant', true, { layers });
    telegraph(state, 'lightning', plant.x, plant.y, 0, 0.16, {
      targetX: first.x,
      targetY: first.y,
    });
    const chainRange = buffStat(state, 'stormChainRange', effect.chainRange, 'storm-heart', 0.15);
    const next = state.enemies
      .filter(
        (enemy) => enemy !== first && canHit(enemy, layers) && distance(first, enemy) < chainRange,
      )
      .sort((a, b) => distance(first, a) - distance(first, b));
    for (const enemy of next.slice(0, effect.chainCount ?? 1)) {
      hurtEnemy(state, enemy, damage * (effect.chainMultiplier ?? 0.5), 'plant', true, { layers });
      telegraph(state, 'lightning', first.x, first.y, 0, 0.16, {
        targetX: enemy.x,
        targetY: enemy.y,
      });
    }
    plant.actionCooldown = effect.interval;
    plant.targetX = first.x;
    plant.targetY = first.y;
    plant.flash = 0.16;
    event(state, 'lightning', { x: plant.x, y: plant.y });
  },
  explode(state, plant, effect, dt, healing, expired) {
    if (!expired) return;
    const radius = buffStat(state, 'mushroomRange', effect.range, 'mushroom-heart', 0.15);
    const damage =
      buffStat(state, 'mushroomDamage', effect.damage, 'mushroom-heart', 0.4) *
      state.permanent.seedPower;
    for (const enemy of [...state.enemies])
      if (canHit(enemy, ['ground']) && distance(plant, enemy) < radius + enemy.radius)
        hurtEnemy(state, enemy, damage, 'plant', true, {
          layers: ['ground'],
          armorPierce: effect.armorPierce ?? 0,
          explosion: true,
        });
    particles(state, plant.x, plant.y, '#ffc35b', 24, 240);
    telegraph(state, 'explosion', plant.x, plant.y, radius, 0.38);
    state.cameraShake = 0.16;
    event(state, 'explode', { x: plant.x, y: plant.y, radius });
  },
};

function updatePlants(state, dt) {
  const remaining = [],
    healing = { power: 0, cap: 0 };
  for (const plant of state.plants) {
    plant.age += dt;
    plant.actionCooldown = Math.max(0, finite(plant.actionCooldown) - dt);
    plant.flash = Math.max(0, finite(plant.flash) - dt);
    const expired = plant.hp <= 0 || plant.age >= plant.life;
    const effects = plantEffects(plant);
    for (const effect of effects) {
      if (expired && effect.type !== 'explode') continue;
      PLANT_HANDLERS[effect.type]?.(state, plant, effect, dt, healing, expired);
    }
    if (expired) {
      if (!effects.some((effect) => effect.type === 'explode'))
        particles(
          state,
          plant.x,
          plant.y,
          SEEDS[plant.kind]?.color ?? terrainDefinition(plant.kind)?.color ?? '#a0e5fa',
          5,
          65,
        );
    } else remaining.push(plant);
  }
  if (healing.power > 0) {
    state.player.hp = Math.min(
      state.player.maxHp,
      state.player.hp +
        Math.min(healing.power, healing.cap) *
          state.permanent.seedPower *
          weatherOf(state).healPower *
          dt,
    );
  }
  state.plants = remaining;
}

function terrainTouches(plant, enemy) {
  if (plant.kind === 'trench') {
    const dx = (enemy.x - plant.x) / (plant.radius + enemy.radius);
    const dy = (enemy.y - plant.y) / (plant.radius * 0.45 + enemy.radius);
    return dx * dx + dy * dy < 1;
  }
  return distance(plant, enemy) < plant.radius + enemy.radius * 0.5;
}

function updateStatuses(state, dt) {
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    if (enemy.poison > 0)
      hurtEnemy(state, enemy, finite(enemy.poisonDps), 'plant', false, {
        layers: ['ground'],
        timeScale: Math.min(dt, enemy.poison),
      });
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
    enemy.slow =
      enemy.windSlow > 0 ? controlledSpeed(SKILLS.gale.slow, enemy.controlResistance) : 1;
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
        if (
          !canHit(enemy, effect.layers ?? ['ground', 'air']) ||
          distance(effect, enemy) > effect.radius + enemy.radius
        )
          continue;
        hurtEnemy(state, enemy, definition.damage, 'skill', true, { layers: effect.layers });
        enemy.stunned = Math.max(
          finite(enemy.stunned),
          definition.stunDuration * (1 - (enemy.controlResistance ?? 0)),
        );
        effect.hitIds.push(enemy.id);
      }
      particles(state, effect.x, effect.y, definition.color, 24, 235);
      state.cameraShake = 0.16;
      event(state, 'explode', { x: effect.x, y: effect.y, radius: effect.radius });
    } else if (effect.kind === 'gale') {
      for (const enemy of state.enemies) {
        if (
          !canHit(enemy, effect.layers ?? ['ground', 'air']) ||
          distance(effect, enemy) > effect.radius + enemy.radius
        )
          continue;
        hurtEnemy(state, enemy, definition.damagePerSecond, 'skill', false, {
          timeScale: activeDt,
          layers: effect.layers,
        });
        const dx = enemy.x - effect.x,
          dy = enemy.y - effect.y;
        const length = Math.hypot(dx, dy);
        const pushX = length > 0.001 ? dx / length : effect.dx;
        const pushY = length > 0.001 ? dy / length : effect.dy;
        if (!(enemy.frozen > 0) && !(enemy.stunned > 0) && !(enemy.stun > 0))
          moveBody(
            state,
            enemy,
            pushX * definition.pushSpeed * activeDt * (1 - (enemy.controlResistance ?? 0)),
            pushY * definition.pushSpeed * activeDt * (1 - (enemy.controlResistance ?? 0)),
            solidPlants(state),
          );
        enemy.windSlow = definition.slowDuration;
        enemy.slow = Math.min(
          enemy.slow,
          controlledSpeed(definition.slow, enemy.controlResistance),
        );
      }
    } else if (effect.kind === 'cart' || effect.kind === 'horse') {
      const fromX = effect.x,
        fromY = effect.y;
      effect.travelled = Math.min(effect.length, effect.travelled + definition.speed * activeDt);
      effect.x = effect.startX + effect.dx * effect.travelled;
      effect.y = effect.startY + effect.dy * effect.travelled;
      for (const enemy of state.enemies) {
        if (
          !canHit(enemy, effect.layers ?? ['ground', 'air']) ||
          effect.hitIds.includes(enemy.id) ||
          !effectHitsSegment(effect, enemy, fromX, fromY, effect.x, effect.y)
        )
          continue;
        effect.hitIds.push(enemy.id);
        hurtEnemy(state, enemy, definition.damage, 'skill', true, { layers: effect.layers });
        if (effect.kind === 'cart')
          enemy.stunned = Math.max(
            finite(enemy.stunned),
            definition.stunDuration * (1 - (enemy.controlResistance ?? 0)),
          );
        else {
          enemy.feared = Math.max(
            finite(enemy.feared),
            definition.fearDuration * (1 - (enemy.controlResistance ?? 0)),
          );
          enemy.fearX = effect.startX;
          enemy.fearY = effect.startY;
        }
      }
    } else if (effect.kind === 'laser' && !effect.triggered) {
      effect.triggered = true;
      for (const enemy of state.enemies) {
        if (
          !canHit(enemy, effect.layers ?? ['ground', 'air']) ||
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
        hurtEnemy(state, enemy, definition.damage, 'skill', true, { layers: effect.layers });
        enemy.vulnerable = definition.vulnerableDuration;
        effect.hitIds.push(enemy.id);
      }
    }
    if (effect.age < effect.life) remaining.push(effect);
  }
  state.skillEffects = remaining;
}

const ENEMY_HANDLERS = {
  controlResist(state, enemy, params) {
    enemy.controlResistance = clamp(
      Math.max(enemy.controlResistance, params.resistance ?? 0),
      0,
      0.95,
    );
  },
  shield(state, enemy, params) {
    if (
      enemy.shield > 0 ||
      enemy.age - finite(enemy.shieldBrokenAge, enemy.age) < (params.cooldown ?? 6) ||
      enemy.age - finite(enemy.lastHitAge) < (params.quietTime ?? 3)
    )
      return;
    enemy.shield = params.restore ?? enemy.maxShield * 0.5;
    enemy.shieldBrokenAge = enemy.age;
    event(state, 'shield-restore', { id: enemy.id });
  },
  shieldBreakStun() {},
  brood() {}, // Damage thresholds are handled once in hurtEnemy.
  bossPhases(state, enemy, params, dt, motion) {
    const thresholds = params.thresholds ?? [0.65, 0.3];
    const ratio = enemy.hp / enemy.maxHp;
    const phase = ratio <= thresholds[1] ? 3 : ratio <= thresholds[0] ? 2 : 1;
    if (phase !== enemy.bossPhase) {
      enemy.bossPhase = phase;
      enemy.stun = Math.max(finite(enemy.stun), 1);
      enemy.abilityState.charger = { phase: 'ready', timer: 0.8 };
      enemy.abilityState.spitter = { phase: 'ready', timer: 0.8 };
      telegraph(state, 'boss-phase', enemy.x, enemy.y, enemy.radius + 45, 1, { phase });
      if (phase === 3) {
        enemy.shield = params.shield ?? 120;
        enemy.maxShield = Math.max(enemy.maxShield, enemy.shield);
      }
      event(state, 'boss-phase', { phase, kind: enemy.kind });
    }
    const memory = (enemy.abilityState.bossPhases ??= {
      summonTimer: params.summonInterval ?? 8,
      shieldTimer: 6,
    });
    if (phase === 2) {
      memory.summonTimer -= dt;
      if (memory.summonTimer <= 0) {
        summon(state, enemy, params.summonKind ?? 'minion', params.summonCount ?? 3);
        memory.summonTimer = params.summonInterval ?? 8;
      }
    }
    if (phase === 3) {
      memory.shieldTimer -= dt;
      if (memory.shieldTimer <= 0) {
        enemy.shield = params.shield ?? 120;
        enemy.maxShield = Math.max(enemy.maxShield, enemy.shield);
        memory.shieldTimer = params.shieldInterval ?? 7;
        event(state, 'shield-restore', { id: enemy.id });
      }
    }
  },
  charger(state, enemy, params, dt, motion) {
    if (ability(ENEMIES[enemy.kind], 'bossPhases') && enemy.bossPhase !== 2) return;
    const memory = (enemy.abilityState.charger ??= {
      phase: 'ready',
      timer: params.cooldown ?? 4.8,
      angle: enemy.angle,
    });
    memory.timer -= dt;
    if (memory.timer <= 0) {
      if (memory.phase === 'ready') {
        memory.phase = 'windup';
        memory.timer = params.windup ?? 0.65;
        memory.angle = enemy.angle;
        telegraph(state, 'charge', enemy.x, enemy.y, enemy.radius + 10, memory.timer, {
          angle: memory.angle,
          length: (params.speed ?? 320) * (params.duration ?? 0.45),
        });
        event(state, 'charge-ready', { id: enemy.id });
      } else if (memory.phase === 'windup') {
        memory.phase = 'charge';
        memory.timer = params.duration ?? 0.45;
      } else if (memory.phase === 'charge') {
        memory.phase = 'recover';
        memory.timer = params.recover ?? (enemy.rank === 'leader' ? 0.8 : 0.35);
      } else {
        memory.phase = 'ready';
        memory.timer = params.cooldown ?? 4.8;
      }
    }
    if (memory.phase === 'windup' || memory.phase === 'recover') motion.locked = true;
    if (memory.phase === 'charge') {
      motion.dx = Math.cos(memory.angle);
      motion.dy = Math.sin(memory.angle);
      motion.speed = params.speed ?? 320;
      motion.charging = true;
    }
  },
  burrower(state, enemy, params, dt, motion) {
    const memory = (enemy.abilityState.burrower ??= {
      phase: 'ground',
      timer: params.groundTime ?? 3.5,
    });
    memory.timer -= dt;
    if (memory.timer <= 0) {
      if (memory.phase === 'ground') {
        memory.phase = 'windup';
        memory.timer = params.windup ?? 0.55;
        telegraph(state, 'burrow', enemy.x, enemy.y, enemy.radius + 12, memory.timer);
      } else if (memory.phase === 'windup') {
        memory.phase = 'underground';
        memory.timer = params.duration ?? 1.8;
        enemy.layer = 'underground';
      } else if (memory.phase === 'underground') {
        memory.phase = 'emerge';
        memory.timer = params.emerge ?? 0.65;
        const separation = distance(enemy, state.player);
        if (separation < 65) {
          const point = constrainPoint(
            state,
            {
              x: state.player.x - Math.cos(enemy.angle) * 65,
              y: state.player.y - Math.sin(enemy.angle) * 65,
            },
            enemy.radius,
          );
          enemy.x = point.x;
          enemy.y = point.y;
        }
        telegraph(state, 'emerge', enemy.x, enemy.y, enemy.radius + 20, memory.timer);
      } else {
        memory.phase = 'ground';
        memory.timer = params.groundTime ?? 3.5;
        enemy.layer = 'ground';
        pushOut(state, enemy, solidPlants(state));
      }
    }
    if (memory.phase === 'windup' || memory.phase === 'emerge') motion.locked = true;
  },
  glider(state, enemy, params, dt) {
    const memory = (enemy.abilityState.glider ??= {
      phase: 'ground',
      timer: params.groundTime ?? 2.7,
    });
    memory.timer -= dt;
    if (memory.timer <= 0) {
      memory.phase = memory.phase === 'ground' ? 'air' : 'ground';
      memory.timer = memory.phase === 'air' ? (params.duration ?? 2.4) : (params.groundTime ?? 2.7);
      enemy.layer = memory.phase;
      if (enemy.layer === 'ground') pushOut(state, enemy, solidPlants(state));
      event(state, 'flight', { id: enemy.id, layer: enemy.layer });
    }
    enemy.height = memory.phase === 'air' ? (params.height ?? 32) : 0;
  },
  spitter(state, enemy, params, dt, motion) {
    if (ability(ENEMIES[enemy.kind], 'bossPhases') && enemy.bossPhase === 2) return;
    const range = params.range ?? 340;
    const separation = distance(enemy, state.player);
    if (enemy.rank === 'normal') {
      if (separation < range * 0.72) {
        motion.dx *= -1;
        motion.dy *= -1;
      } else if (separation < range) motion.locked = true;
    }
    const memory = (enemy.abilityState.spitter ??= {
      phase: 'ready',
      timer: params.cooldown ?? 2.6,
    });
    memory.timer -= dt;
    if (memory.phase === 'ready' && memory.timer <= 0 && separation < range + 50) {
      memory.phase = 'windup';
      memory.timer = params.windup ?? 0.6;
      memory.targetX = state.player.x;
      memory.targetY = state.player.y;
      telegraph(state, 'ranged', enemy.x, enemy.y, enemy.radius + 10, memory.timer, {
        angle: Math.atan2(memory.targetY - enemy.y, memory.targetX - enemy.x),
      });
      event(state, 'ranged-ready', { id: enemy.id });
    } else if (memory.phase === 'windup' && memory.timer <= 0) {
      const pellets = Math.max(1, params.pellets ?? 1);
      for (let index = 0; index < pellets; index += 1) {
        if (
          projectile(
            state,
            enemy,
            { x: memory.targetX, y: memory.targetY },
            {
              kind: 'hostile',
              source: 'enemy',
              damage: params.damage ?? ENEMIES[enemy.kind].damage,
              range: range + 140,
              speed: params.speed ?? 220,
              radius: 7,
              angleOffset: pellets > 1 ? (index / (pellets - 1) - 0.5) * (params.spread ?? 0.5) : 0,
            },
          )
        )
          state.stats.hostileShots += 1;
      }
      memory.phase = 'ready';
      memory.timer = (params.cooldown ?? 2.6) / weatherOf(state).enemyFireRate;
      event(state, 'enemy-shoot', { kind: enemy.kind, x: enemy.x, y: enemy.y });
    }
    if (memory.phase === 'windup') motion.locked = true;
  },
};

function updateEnemies(state, dt, obstacles) {
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    const definition = ENEMIES[enemy.kind] ?? ENEMIES.sprout;
    if (enemy.chillTime > 0) {
      enemy.slow = Math.min(
        enemy.slow ?? 1,
        controlledSpeed(enemy.chillSlow ?? 1, enemy.controlResistance),
      );
      enemy.chillTime = Math.max(0, enemy.chillTime - dt);
      if (!enemy.chillTime) enemy.chillSlow = 1;
    }
    if (enemy.burnTime > 0) {
      hurtEnemy(state, enemy, enemy.burnDps, 'normal', false, {
        timeScale: Math.min(dt, enemy.burnTime),
      });
      enemy.burnTime = Math.max(0, enemy.burnTime - dt);
      if (enemy.hp <= 0) continue;
    }
    enemy.hit = Math.max(0, finite(enemy.hit) - dt);
    enemy.attackCooldown = Math.max(0, finite(enemy.attackCooldown) - dt);
    enemy.biteCooldown = Math.max(0, finite(enemy.biteCooldown) - dt);
    enemy.age = finite(enemy.age) + dt;
    enemy.rank ??= definition.rank ?? 'normal';
    enemy.layer ??= 'ground';
    enemy.abilityState ??= {};
    enemy.bossPhase ??= 1;
    enemy.armor ??= definition.armor ?? 0;
    enemy.shield ??= definition.shield ?? 0;
    enemy.maxShield ??= definition.shield ?? 0;
    enemy.controlResistance ??= definition.controlResistance ?? 0;
    enemy.stun = Math.max(0, finite(enemy.stun) - dt);
    let dx = enemy.feared > 0 ? enemy.x - enemy.fearX : state.player.x - enemy.x,
      dy = enemy.feared > 0 ? enemy.y - enemy.fearY : state.player.y - enemy.y;
    const length = Math.hypot(dx, dy);
    enemy.angle = Math.atan2(dy, dx);
    const weather = weatherOf(state);
    let speed =
      definition.speed *
      (1 + (state.wave - 1) * 0.016) *
      (enemy.rank === 'normal' ? (levelOf(state).difficulty?.speedScale ?? 1) : 1);
    const movementTerrain = terrainMovement(state, enemy, dt);
    if (movementTerrain.slip) {
      moveBody(state, enemy, movementTerrain.slip.dx, movementTerrain.slip.dy, obstacles);
      event(state, 'slip', { id: enemy.id, x: enemy.x, y: enemy.y });
    }
    dx = length > 0 ? dx / length : 0;
    dy = length > 0 ? dy / length : 0;
    const motion = { dx, dy, speed, locked: false, charging: false };
    const abilities = definition.abilities ?? [];
    // Phase transitions run before the skills whose availability they control.
    const phaseAbility = ability(definition, 'bossPhases');
    if (phaseAbility) ENEMY_HANDLERS.bossPhases(state, enemy, phaseAbility, dt, motion);
    for (const item of enemy.stun > 0 || enemy.frozen > 0 || enemy.stunned > 0 ? [] : abilities) {
      const params = typeof item === 'string' ? { type: item } : item;
      if (params.type !== 'bossPhases')
        ENEMY_HANDLERS[params.type]?.(state, enemy, params, dt, motion);
    }
    dx = motion.dx;
    dy = motion.dy;
    speed = motion.speed;
    if (enemy.layer === 'ground')
      speed *=
        weather.enemySpeed *
        (enemy.slow ?? 1) *
        controlledSpeed(movementTerrain.speedMultiplier, enemy.controlResistance);
    if (enemy.layer === 'air') speed *= weather.airSpeed;
    if (enemy.stun > 0 || enemy.frozen > 0 || enemy.stunned > 0) motion.locked = true;
    if (motion.locked) speed = 0;
    const enemyObstacles = enemy.layer === 'ground' ? obstacles : [];
    const obstructing =
      !motion.charging &&
      enemyObstacles.find((plant) => {
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
        enemy.biteCooldown <= 0 &&
        !motion.locked
      ) {
        if (!obstructing.permanent) obstructing.hp -= definition.bite;
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
      if (
        other === enemy ||
        other.hp <= 0 ||
        (other.layer ?? 'ground') !== enemy.layer ||
        motion.charging ||
        motion.locked
      )
        continue;
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
      enemyObstacles,
    );
    if (motion.charging && movement < speed * dt * 0.35) {
      enemy.abilityState.charger.phase = 'recover';
      enemy.abilityState.charger.timer = 0.4;
    }
    enemy.stuck = movement < speed * dt * 0.15 ? finite(enemy.stuck) + dt : 0;
    if (enemy.stuck > 0.55 && !motion.charging && !motion.locked && enemy.stun <= 0) {
      const nearest = enemyObstacles.reduce(
        (best, plant) => (!best || distance(enemy, plant) < distance(enemy, best) ? plant : best),
        null,
      );
      if (
        nearest &&
        distance(enemy, nearest) < enemy.radius + nearest.radius + 28 &&
        enemy.biteCooldown <= 0 &&
        !motion.locked
      ) {
        if (!nearest.permanent) nearest.hp -= definition.bite * 1.5;
        enemy.biteCooldown = 0.5;
      }
      const direction = enemy.id % 2 ? 1 : -1;
      moveBody(
        state,
        enemy,
        -dy * speed * dt * direction,
        dx * speed * dt * direction,
        enemyObstacles,
      );
    }
    if (
      enemy.layer === 'ground' &&
      !motion.locked &&
      !(enemy.feared > 0) &&
      distance(state.player, enemy) < state.player.radius + enemy.radius + 3 &&
      enemy.attackCooldown <= 0
    ) {
      hurtPlayer(
        state,
        definition.damage *
          (enemy.rank === 'normal' ? (levelOf(state).difficulty?.damageScale ?? 1) : 1),
      );
      enemy.attackCooldown = 0.9;
    }
    enemy.slow = 1;
  }
  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);
}

function updateWeather(state, dt) {
  const hazards = [];
  if (WEATHER[state.weather.kind]?.hazard)
    hazards.push(['hail', WEATHER[state.weather.kind].hazard]);
  if (state.weather.thunder) hazards.push(['thunder', WEATHER_MODIFIERS.thunder.hazard]);
  const { left, right, top, bottom } = levelOf(state).bounds;
  for (const [key, hazard] of hazards) {
    state.weatherTimers[key] -= dt;
    if (state.weatherTimers[key] > 0) continue;
    const x = left + hazard.radius + random(state) * (right - left - hazard.radius * 2);
    const y = top + hazard.radius + random(state) * (bottom - top - hazard.radius * 2);
    telegraph(state, hazard.kind, x, y, hazard.radius, hazard.windup, {
      dangerous: true,
      damage: hazard.damage,
      plantDamage: hazard.plantDamage,
    });
    state.weatherTimers[key] = hazard.interval;
    event(state, 'weather-warning', { kind: hazard.kind, x, y });
  }
}

function updateEncounter(state) {
  const encounter = levelOf(state).encounter;
  if (
    !encounter ||
    state.encounter.spawned ||
    state.wave < encounter.atWave ||
    finite(state.encounter.retryIn) > 0
  )
    return;
  const limit = levelOf(state).spawn.maxEnemies;
  // A direct content-injected full arena still cannot hide the required objective.
  if (aliveEnemies(state) >= limit) {
    const index = state.enemies.findIndex(
      (enemy) => (enemy.rank ?? ENEMIES[enemy.kind]?.rank ?? 'normal') === 'normal',
    );
    if (index >= 0) state.enemies.splice(index, 1);
  }
  const enemy = spawnEnemy(state, encounter.kind);
  if (!enemy) {
    state.encounter.retryIn = 0.5;
    return;
  }
  state.encounter.spawned = true;
  state.encounter.enemyId = enemy.id;
  telegraph(state, 'boss-phase', enemy.x, enemy.y, enemy.radius + 36, 1.2, {
    rank: encounter.rank,
  });
  event(state, 'encounter-start', { kind: encounter.kind, rank: encounter.rank });
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
  for (const item of [...state.telegraphs]) {
    item.life -= dt;
    if (item.life > 0 || !item.dangerous) continue;
    item.dangerous = false;
    if (distance(item, state.player) < item.radius + state.player.radius)
      hurtPlayer(state, item.damage);
    for (const enemy of [...state.enemies])
      if (canHit(enemy, ['ground']) && distance(item, enemy) < item.radius + enemy.radius)
        hurtEnemy(state, enemy, item.damage, 'weather', true, { layers: ['ground'] });
    for (const plant of state.plants)
      if (distance(item, plant) < item.radius + plant.radius)
        plant.hp = Math.max(0, plant.hp - finite(item.plantDamage));
    particles(state, item.x, item.y, item.kind === 'hail' ? '#d8f7ff' : '#baf1ff', 16, 150);
    event(state, 'weather-impact', { kind: item.kind, x: item.x, y: item.y });
  }
  state.telegraphs = state.telegraphs.filter((item) => item.life > 0).slice(-40);
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
  state.encounter.retryIn = Math.max(0, finite(state.encounter.retryIn) - dt);
  player.invulnerable = Math.max(0, player.invulnerable - dt);
  player.dashCooldown = Math.max(0, player.dashCooldown - dt);
  state.skillCooldown = Math.max(0, state.skillCooldown - dt);
  chargeEnergy(state, ENERGY_PER_SECOND * dt);
  state.shotCooldown = Math.max(0, state.shotCooldown - dt);
  updateWeather(state, dt);
  updateEffects(state, dt);
  if (state.phase !== 'playing') return;
  const obstacles = solidPlants(state);
  let moveX = clamp(finite(input.moveX), -1, 1),
    moveY = clamp(finite(input.moveY), -1, 1);
  const moveLength = Math.hypot(moveX, moveY);
  if (moveLength > 1) {
    moveX /= moveLength;
    moveY /= moveLength;
  }
  const movementTerrain = terrainMovement(state, player, dt);
  if (movementTerrain.slip) {
    moveBody(state, player, movementTerrain.slip.dx, movementTerrain.slip.dy, obstacles);
    event(state, 'slip', { x: player.x, y: player.y });
  }
  const terrainSpeed = movementTerrain.speedMultiplier;
  if (player.dashTime > 0) {
    moveBody(
      state,
      player,
      player.dashX * 860 * dt * Math.max(0.8, terrainSpeed),
      player.dashY * 860 * dt * Math.max(0.8, terrainSpeed),
      obstacles,
    );
    player.dashTime = Math.max(0, player.dashTime - dt);
  } else
    moveBody(
      state,
      player,
      moveX * PLAYER_SPEED * dt * terrainSpeed,
      moveY * PLAYER_SPEED * dt * terrainSpeed,
      obstacles,
    );
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
    else if (input.autoFire !== false) {
      const target = closestEnemy(state, NORMAL_RANGE * weatherOf(state).gunRange);
      shootNormal(
        state,
        target ?? {
          x: player.x + Math.cos(player.angle) * 100,
          y: player.y + Math.sin(player.angle) * 100,
        },
      );
    }
  }
  updatePet(state, dt);
  updateStatuses(state, dt);
  updateBullets(state, dt);
  updateBoons(state, dt);
  updatePlants(state, dt);
  updateSkills(state, dt);
  updateEnemies(state, dt, solidPlants(state));
  if (state.phase !== 'playing') return;
  updateEncounter(state);
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0 && state.time < state.duration) {
    if (aliveEnemies(state) < enemyCapacity(state)) spawnEnemy(state);
    state.spawnTimer =
      Math.max(
        level.spawn.minimumInterval,
        level.spawn.interval - (state.wave - 1) * level.spawn.acceleration,
      ) *
      (0.84 + random(state) * 0.3);
  }
  advanceWave(state);
  updateEncounter(state);
  if (
    state.phase === 'playing' &&
    state.time >= state.duration &&
    state.player.hp > 0 &&
    (!level.encounter?.required || state.encounter.defeated)
  ) {
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

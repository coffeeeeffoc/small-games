import { HEROES, WEAPONS, OFFERS, SYNERGY_NAMES } from './content.mjs';

const HERO_STATS = {
  nezha: { hp: 460, damage: 30, interval: 0.75, range: 215, speed: 31, splash: 43 },
  wukong: { hp: 680, damage: 46, interval: 1.05, range: 125, speed: 32, splash: 62 },
  erlang: { hp: 340, damage: 30, interval: 0.6, range: 360, speed: 26, splash: 0 },
};
const WEAPON_STATS = {
  fire: { hp: 280, damage: 17, interval: 0.4, range: 200, speed: 21, splash: 45 },
  cannon: { hp: 370, damage: 63, interval: 2.05, range: 370, speed: 17, splash: 90 },
  drone: { hp: 230, damage: 23, interval: 0.65, range: 320, speed: 37, splash: 0 },
};
const ROW_Y = [90, 196, 302];
const TERMINAL = new Set(['won', 'lost']);

function id(state) {
  return ++state.nextId;
}
function random(state) {
  state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
  return state.seed / 4294967296;
}
function answer(state, ok, message) {
  state.message = message;
  return { ok, message };
}
function event(state, type, text, x = 500, y = 190) {
  state.events.push({ id: id(state), type, text, x, y });
  if (state.events.length > 35) state.events.shift();
}
function effect(state, type, x, y, tx = x, ty = y, color = '#f4cf69', duration = 0.5) {
  const fx = { id: id(state), type, x, y, tx, ty, color, life: duration, maxLife: duration };
  state.effects.push(fx);
  if (state.effects.length > 180) state.effects.shift();
  return fx;
}
function animate(entity, anim, duration = 0) {
  entity.anim = anim;
  entity.animTime = 0;
  entity.animDuration = duration;
}
function canEdit(state) {
  return !TERMINAL.has(state.phase) && !state.paused;
}
function slot(state, loc) {
  return loc &&
    ['board', 'reserve'].includes(loc.zone) &&
    Number.isInteger(loc.index) &&
    loc.index >= 0 &&
    loc.index < state[loc.zone].length
    ? state[loc.zone]
    : null;
}
function makeItem(state, offer) {
  return {
    id: id(state),
    kind: offer.kind,
    key: offer.key,
    parts: offer.part ? [offer.part] : [],
    level: 1,
    progress: 0,
    recovery: 0,
    value: offer.cost,
    anim: offer.kind === 'hero' ? 'sleep' : 'enter',
    animTime: 0,
    animDuration: 0.5,
  };
}

export function isAwake(item) {
  return Boolean(
    item &&
      (item.kind === 'weapon' ||
        (HEROES[item.key] && HEROES[item.key].parts.every((part) => item.parts.includes(part)))),
  );
}
export function itemName(item) {
  if (!item) return '空位';
  if (item.kind === 'weapon') return WEAPONS[item.key]?.name || '机关';
  return isAwake(item)
    ? item.weapon
      ? SYNERGY_NAMES[item.key]
      : HEROES[item.key].name
    : HEROES[item.key].parts.filter((part) => item.parts.includes(part)).join('') + ' · 沉睡';
}
export function createGame(mode = 'defense', difficulty = 'normal', seed = Date.now()) {
  const state = {
    version: 1,
    mode: mode === 'attack' ? 'attack' : 'defense',
    difficulty: difficulty === 'hard' ? 'hard' : 'normal',
    phase: 'setup',
    paused: false,
    time: 0,
    wave: 0,
    maxWaves: 8,
    coins: 180,
    coreHp: 1600,
    coreMax: 1600,
    enemyCoreHp: 6000,
    enemyCoreMax: 6000,
    kills: 0,
    board: Array(12).fill(null),
    reserve: Array(6).fill(null),
    units: [],
    effects: [],
    events: [],
    cooldowns: { surge: 0 },
    surgeTime: 0,
    nextId: 0,
    seed: (Number(seed) || 1) >>> 0,
    spawnTimer: 0,
    wavePending: 0,
    waveSpawned: 0,
    intermission: 0,
    attackSpawnTimer: 4,
    message: '把「吒」拖到「哪」上唤醒哪吒，再把离火铳拖上去合体。',
  };
  state.board[4] = makeItem(
    state,
    OFFERS.find((offer) => offer.id === 'nezha:哪'),
  );
  state.reserve[0] = makeItem(
    state,
    OFFERS.find((offer) => offer.id === 'nezha:吒'),
  );
  state.reserve[1] = makeItem(
    state,
    OFFERS.find((offer) => offer.id === 'weapon:fire'),
  );
  state.reserve[2] = makeItem(
    state,
    OFFERS.find((offer) => offer.id === 'wukong:孙'),
  );
  return state;
}

export function recruit(state, offerKey) {
  if (!canEdit(state)) return answer(state, false, '请先继续战局。');
  const offer = OFFERS.find((candidate) => candidate.id === offerKey);
  if (!offer) return answer(state, false, '没有这份征召令。');
  const index = state.reserve.indexOf(null);
  if (index < 0) return answer(state, false, '备战席已满，先部署或合成。');
  if (state.coins < offer.cost) return answer(state, false, '灵石不足，击败敌军可获得灵石。');
  state.coins -= offer.cost;
  state.reserve[index] = makeItem(state, offer);
  event(state, 'recruit', `征召 ${offer.name}`);
  return answer(state, true, `${offer.name} 已进入备战席。`);
}

function combine(source, target) {
  if (source.kind !== target.kind) {
    const hero = source.kind === 'hero' ? source : target;
    const weapon = source.kind === 'weapon' ? source : target;
    if (!isAwake(hero)) return { error: '先凑齐姓名，唤醒武将再装配武器。' };
    if (HEROES[hero.key].synergy !== weapon.key)
      return { error: '专属武器不匹配，请查看图鉴中的联动配方。' };
    if (hero.weapon) return { error: '武将已有武器；可先升级另一支独立队伍。' };
    return {
      item: {
        ...hero,
        weapon: weapon.key,
        weaponLevel: weapon.level,
        value: hero.value + weapon.value,
      },
    };
  }
  if (source.key !== target.key) return null;
  if (source.kind === 'hero' && (!isAwake(source) || !isAwake(target))) {
    if (source.parts.some((part) => target.parts.includes(part)))
      return { error: '姓名碎片有重复，需要不同的汉字才能唤醒。' };
    const parts = HEROES[source.key].parts.filter(
      (part) => source.parts.includes(part) || target.parts.includes(part),
    );
    return { item: { ...target, parts, value: source.value + target.value } };
  }
  if (source.level !== target.level) return { error: '同名且同星级才能升星。' };
  if (target.level >= 3) return { error: '已达到三星上限。' };
  if (
    source.weapon &&
    target.weapon &&
    (source.weapon !== target.weapon ||
      (source.weaponLevel || 1) !== (target.weaponLevel || 1) ||
      (target.weaponLevel || 1) >= 3)
  ) {
    return { error: '两套武器无法同时升星，请合成未装备或同星武器的武将。' };
  }
  return {
    item: {
      ...target,
      level: target.level + 1,
      healthRatio: ((source.healthRatio ?? 1) + (target.healthRatio ?? 1)) / 2,
      weapon: target.weapon || source.weapon,
      weaponLevel:
        source.weapon && target.weapon
          ? (target.weaponLevel || 1) + 1
          : target.weaponLevel || source.weaponLevel,
      value: source.value + target.value,
    },
  };
}

export function moveItem(state, from, to) {
  if (!canEdit(state)) return answer(state, false, '请先继续战局。');
  const fromSlots = slot(state, from),
    toSlots = slot(state, to);
  if (!fromSlots || !toSlots) return answer(state, false, '请放入棋盘或备战席。');
  if (from.zone === to.zone && from.index === to.index) return answer(state, true, '已选中。');
  const source = fromSlots[from.index],
    target = toSlots[to.index];
  if (!source) return answer(state, false, '这个位置没有部件。');
  const result = target ? combine(source, target) : null;
  if (result?.error) return answer(state, false, result.error);
  if (result?.item) {
    const merged = result.item;
    merged.progress = 0;
    merged.recovery = Math.max(source.recovery || 0, target.recovery || 0);
    animate(merged, isAwake(merged) ? 'upgrade' : 'sleep', 0.9);
    fromSlots[from.index] = null;
    toSlots[to.index] = merged;
    retireRecipeUnits(state, [source.id, target.id], merged.id);
    event(state, 'merge', `${itemName(merged)}${merged.level > 1 ? ` ${merged.level}星` : ''}`);
    effect(state, 'merge', 130 + (to.index % 4) * 82, ROW_Y[Math.floor(to.index / 4)] || 196);
    syncDefense(state);
    return answer(
      state,
      true,
      `${itemName(merged)}${isAwake(merged) ? '合阵成功！' : '还在等待完整姓名。'}`,
    );
  }
  fromSlots[from.index] = target;
  toSlots[to.index] = source;
  // Moving a production recipe restarts its cycle so last-second assembly cannot bypass its cost.
  source.progress = 0;
  if (target) target.progress = 0;
  syncDefense(state);
  return answer(state, true, target ? '已交换位置。' : `${itemName(source)}已部署。`);
}

export function getLinks(state) {
  const links = [],
    used = new Set();
  state.board.forEach((hero, heroIndex) => {
    if (!hero || hero.kind !== 'hero' || !isAwake(hero) || hero.weapon) return;
    const row = Math.floor(heroIndex / 4),
      col = heroIndex % 4;
    const weaponIndex = state.board.findIndex(
      (weapon, index) =>
        weapon?.kind === 'weapon' &&
        weapon.key === HEROES[hero.key].synergy &&
        !used.has(index) &&
        Math.abs(Math.floor(index / 4) - row) + Math.abs((index % 4) - col) === 1,
    );
    if (weaponIndex < 0) return;
    used.add(weaponIndex);
    links.push({
      heroIndex,
      weaponIndex,
      heroId: hero.id,
      weaponId: state.board[weaponIndex].id,
      key: state.board[weaponIndex].key,
    });
  });
  return links;
}

export function getProductionTime(item, linked = false) {
  if (!item || !isAwake(item)) return Infinity;
  const base = item.kind === 'weapon' ? 12 : item.key === 'wukong' ? 15 : 12.5;
  return base * (1 + (item.level - 1) * 0.22) * (item.weapon || linked ? 1.5 : 1);
}

function unitStats(item, weapon, weaponLevel = 1) {
  const base = item.kind === 'hero' ? HERO_STATS[item.key] : WEAPON_STATS[item.key];
  const stats = { ...base };
  stats.hp *= 1.75 ** (item.level - 1);
  stats.damage *= 1.85 ** (item.level - 1);
  if (weapon && item.kind === 'hero') {
    const weaponStats = WEAPON_STATS[weapon];
    stats.damage = stats.damage * 1.4 + weaponStats.damage * 0.45 * 1.7 ** (weaponLevel - 1);
    stats.hp *= 1.24;
    stats.range = Math.max(stats.range, weaponStats.range);
    stats.splash = Math.max(stats.splash, weaponStats.splash + 15);
  }
  return stats;
}
function makeAlly(state, item, index, link) {
  const weapon = item.weapon || link?.key;
  const weaponLevel = item.weaponLevel || (link ? state.board[link.weaponIndex].level : 1);
  const stats = unitStats(item, weapon, weaponLevel);
  return {
    id: id(state),
    recipeId: item.id,
    signature: `${item.level}:${weapon || ''}:${weaponLevel}`,
    side: 'ally',
    key: item.key,
    kind: item.kind,
    x: state.mode === 'defense' ? 130 + (index % 4) * 82 : 100,
    y: ROW_Y[Math.floor(index / 4)],
    lane: Math.floor(index / 4),
    ...stats,
    hp: stats.hp,
    maxHp: stats.hp,
    level: item.level,
    weapon,
    weaponLevel,
    linked: Boolean(weapon),
    energy: 0,
    attackTimer: 0.35,
    slowTime: 0,
    anim: 'enter',
    animTime: 0,
    animDuration: 0.55,
    stationary: state.mode === 'defense',
    reward: 0,
    ...(state.mode === 'defense' ? { hp: stats.hp * (item.healthRatio ?? 1) } : {}),
  };
}
function retireRecipeUnits(state, recipeIds, retainedId) {
  if (state.mode !== 'defense') return;
  state.units.forEach((unit) => {
    if (unit.side === 'ally' && recipeIds.includes(unit.recipeId) && unit.recipeId !== retainedId) {
      unit.hp = 0;
      animate(unit, 'exit', 0.6);
    }
  });
}
function syncDefense(state) {
  if (state.mode !== 'defense' || state.phase !== 'running') return;
  const links = getLinks(state),
    linkedWeapons = new Set(links.map((link) => link.weaponIndex));
  const active = new Set();
  state.board.forEach((item, index) => {
    if (!isAwake(item) || linkedWeapons.has(index) || item.recovery > 0) return;
    active.add(item.id);
    const link = links.find((candidate) => candidate.heroIndex === index);
    const weapon = item.weapon || link?.key;
    const weaponLevel = item.weaponLevel || (link ? state.board[link.weaponIndex].level : 1);
    const signature = `${item.level}:${weapon || ''}:${weaponLevel}`;
    const existing = state.units.find(
      (unit) => unit.recipeId === item.id && unit.hp > 0 && unit.side === 'ally',
    );
    if (existing) {
      existing.x = 130 + (index % 4) * 82;
      existing.y = ROW_Y[Math.floor(index / 4)];
      existing.lane = Math.floor(index / 4);
      if (signature !== existing.signature) {
        const stats = unitStats(item, weapon, weaponLevel),
          ratio = item.healthRatio ?? existing.hp / existing.maxHp;
        Object.assign(existing, stats, {
          hp: stats.hp * ratio,
          maxHp: stats.hp,
          signature,
          level: item.level,
          weapon,
          weaponLevel,
          linked: Boolean(weapon),
        });
        animate(existing, 'upgrade', 0.8);
      }
    } else {
      const unit = makeAlly(state, item, index, link);
      state.units.push(unit);
      effect(
        state,
        'spawn',
        unit.x,
        unit.y,
        unit.x,
        unit.y,
        HEROES[item.key]?.color || WEAPONS[item.key].color,
      );
    }
  });
  state.units.forEach((unit) => {
    if (unit.side === 'ally' && unit.hp > 0 && !active.has(unit.recipeId)) {
      unit.hp = 0;
      animate(unit, 'exit', 0.6);
    }
  });
}

function beginWave(state) {
  state.wave++;
  state.wavePending = 6 + state.wave * 2 + (state.difficulty === 'hard' ? 3 : 0);
  state.waveSpawned = 0;
  state.spawnTimer = 1.5;
  state.intermission = 0;
  event(
    state,
    'wave',
    `第 ${state.wave} / ${state.maxWaves} 波${state.wave % 4 === 0 ? ' · 魔将来袭' : ''}`,
  );
  state.message = `第 ${state.wave} 波来袭！留意空缺的防线。`;
}
export function startBattle(state) {
  if (state.phase !== 'setup') return answer(state, false, '战局已经开始。');
  state.phase = 'running';
  if (state.mode === 'defense') {
    syncDefense(state);
    beginWave(state);
  } else {
    state.wave = 1;
    for (let lane = 0; lane < 3; lane++) spawnEnemy(state, 'brute', 2, lane).x = 780;
    state.message = '流水线已启动。合体武将生产更慢，但战力更强。';
  }
  event(state, 'start', state.mode === 'defense' ? '守护灵枢' : '攻破魔晶');
  return { ok: true, message: state.message };
}

export function recycle(state, loc) {
  if (!canEdit(state)) return answer(state, false, '请先继续战局。');
  const slots = slot(state, loc),
    item = slots?.[loc.index];
  if (!item) return answer(state, false, '先选中要回收的部件。');
  const refund = Math.floor(item.value * 0.6);
  slots[loc.index] = null;
  state.coins += refund;
  syncDefense(state);
  event(state, 'recycle', `回收 +${refund}`);
  return answer(state, true, `回收${itemName(item)}，返还 ${refund} 灵石。`);
}
export function repair(state) {
  if (!canEdit(state) || state.phase !== 'running')
    return answer(state, false, '开战后可以修复灵枢。');
  if (state.coreHp >= state.coreMax) return answer(state, false, '灵枢状态完好。');
  if (state.coins < 45) return answer(state, false, '修复需要 45 灵石。');
  state.coins -= 45;
  state.coreHp = Math.min(state.coreMax, state.coreHp + 280);
  effect(state, 'heal', 48, 196, 48, 196, '#85e1bf', 0.9);
  event(state, 'repair', '灵枢修复 +280');
  return answer(state, true, '灵枢恢复 280 耐久。');
}
export function surge(state) {
  if (!canEdit(state) || state.phase !== 'running')
    return answer(state, false, '开战后可发动神机超频。');
  if (state.cooldowns.surge > 0)
    return answer(state, false, `超频还需 ${Math.ceil(state.cooldowns.surge)} 秒冷却。`);
  state.cooldowns.surge = 36;
  state.surgeTime = 6;
  state.units
    .filter((unit) => unit.side === 'ally' && unit.hp > 0)
    .forEach((unit) => {
      unit.energy = Math.min(100, unit.energy + 35);
    });
  event(state, 'surge', '神机超频 · 攻速与生产速度 +55%');
  return answer(state, true, '神机超频！6 秒内攻速与生产速度提升 55%。');
}

function spawnEnemy(state, kind, wave, lane) {
  const hard = state.difficulty === 'hard' ? 1.23 : 1;
  const specs = {
    grunt: {
      hp: 80 + wave * 17,
      damage: 11 + wave * 1.8,
      interval: 1.15,
      speed: 24,
      range: 42,
      reward: 5,
    },
    runner: {
      hp: 56 + wave * 12,
      damage: 8 + wave * 1.5,
      interval: 0.7,
      speed: 43,
      range: 38,
      reward: 4,
    },
    brute: {
      hp: 230 + wave * 35,
      damage: 24 + wave * 3,
      interval: 1.5,
      speed: 18,
      range: 50,
      reward: 9,
    },
    boss: {
      hp: 650 + wave * 235,
      damage: 42 + wave * 4,
      interval: 1.6,
      speed: 13,
      range: 76,
      reward: 45,
    },
  };
  const stats = specs[kind],
    hp = stats.hp * hard;
  const unit = {
    id: id(state),
    side: 'enemy',
    key: kind,
    kind,
    x: 945,
    y: ROW_Y[lane],
    lane,
    ...stats,
    hp,
    maxHp: hp,
    damage: stats.damage * hard,
    level: Math.ceil(wave / 3),
    energy: 0,
    attackTimer: 0.4,
    slowTime: 0,
    anim: 'enter',
    animTime: 0,
    animDuration: 0.45,
  };
  state.units.push(unit);
  return unit;
}
function hit(state, target, damage, attacker, isUltimate = false) {
  if (target.hp <= 0) return;
  target.hp = Math.max(0, target.hp - damage);
  if (target.side === 'ally' && state.mode === 'defense') {
    const recipe = state.board.find((item) => item?.id === target.recipeId);
    if (recipe) recipe.healthRatio = target.hp / target.maxHp;
  }
  if (attacker?.key === 'erlang') target.slowTime = Math.max(target.slowTime, isUltimate ? 3 : 0.7);
  Object.assign(
    effect(
      state,
      'hit',
      target.x,
      target.y - 15,
      target.x,
      target.y - 15,
      attacker?.side === 'enemy' ? '#be718b' : HEROES[attacker?.key]?.color || '#f4cf69',
      0.23,
    ),
    {
      amount: Math.round(damage),
      key: attacker?.key,
      weapon: attacker?.weapon,
      linked: attacker?.linked,
    },
  );
  if (target.hp <= 0) {
    animate(target, 'exit', 0.65);
    if (target.side === 'enemy') {
      state.coins += target.reward;
      state.kills++;
    } else if (state.mode === 'defense') {
      const item = state.board.find((candidate) => candidate?.id === target.recipeId);
      if (item) {
        item.recovery = 11;
        item.progress = 0;
        animate(item, 'sleep', 11);
      }
      event(
        state,
        'fallen',
        `${HEROES[target.key]?.name || WEAPONS[target.key]?.name}重整中 · 11秒`,
      );
    }
  }
}
function attack(state, unit, target, ultimate = false) {
  const color = HEROES[unit.key]?.color || WEAPONS[unit.key]?.color || '#bd7192';
  const damage = unit.damage * (ultimate ? (unit.key === 'erlang' ? 5 : 3.6) : 1);
  const splash = ultimate ? (unit.key === 'erlang' ? 165 : 160) : unit.splash || 0;
  if (!target) {
    if (unit.side === 'enemy') state.coreHp = Math.max(0, state.coreHp - damage);
    else state.enemyCoreHp = Math.max(0, state.enemyCoreHp - damage);
    Object.assign(
      effect(
        state,
        ultimate ? 'ultimate' : 'projectile',
        unit.x,
        unit.y - 24,
        unit.side === 'enemy' ? 38 : 975,
        unit.y - 12,
        color,
        ultimate ? 0.75 : 0.35,
      ),
      { key: unit.key, weapon: unit.weapon, linked: unit.linked },
    );
  } else {
    Object.assign(
      effect(
        state,
        ultimate ? 'ultimate' : 'projectile',
        unit.x,
        unit.y - 24,
        target.x,
        target.y - 20,
        color,
        ultimate ? 0.75 : 0.3,
      ),
      { key: unit.key, weapon: unit.weapon, linked: unit.linked },
    );
    hit(state, target, damage, unit, ultimate);
    if (splash > 0)
      state.units
        .filter(
          (other) =>
            other.id !== target.id &&
            other.side !== unit.side &&
            other.hp > 0 &&
            Math.hypot(other.x - target.x, other.y - target.y) < splash,
        )
        .forEach((other) => hit(state, other, damage * (ultimate ? 0.85 : 0.58), unit, ultimate));
    if (unit.weapon === 'drone' && !ultimate) {
      const chained = state.units
        .filter(
          (other) =>
            other.id !== target.id &&
            other.side !== unit.side &&
            other.hp > 0 &&
            Math.hypot(other.x - target.x, other.y - target.y) < 210,
        )
        .sort((a, b) => Math.abs(a.x - target.x) - Math.abs(b.x - target.x))
        .slice(0, 2);
      chained.forEach((other) => {
        hit(state, other, damage * 0.48, unit);
        effect(state, 'link', target.x, target.y - 20, other.x, other.y - 20, color, 0.4);
      });
    }
  }
  if (unit.kind === 'hero' && !ultimate) unit.energy = Math.min(100, unit.energy + 15);
  animate(
    unit,
    ultimate ? 'ultimate' : 'attack',
    ultimate ? 0.8 : Math.min(0.35, unit.interval * 0.5),
  );
}
function finish(state, phase) {
  state.phase = phase;
  state.message =
    phase === 'won'
      ? state.mode === 'defense'
        ? '八波尽破，灵枢安然！'
        : '魔晶破碎，合阵大捷！'
      : '灵枢被摧毁。调整阵型，再战一次。';
  event(state, phase, state.message);
}

function advanceVisuals(state, dt) {
  state.effects.forEach((fx) => {
    fx.life -= dt;
  });
  state.effects = state.effects.filter((fx) => fx.life > 0);
  [...state.board, ...state.reserve].filter(Boolean).forEach((item) => {
    item.animTime += dt;
    if (item.recovery > 0) {
      item.recovery = Math.max(0, item.recovery - dt);
      item.progress = 1 - item.recovery / 11;
      if (!item.recovery) item.healthRatio = 1;
    }
    if (item.animDuration > 0 && item.animTime >= item.animDuration)
      animate(item, isAwake(item) && !item.recovery ? 'idle' : 'sleep');
  });
}

function advance(state, dt) {
  state.time += dt;
  state.coins += dt * (state.mode === 'attack' ? 1.65 : 1.2);
  state.cooldowns.surge = Math.max(0, state.cooldowns.surge - dt);
  state.surgeTime = Math.max(0, state.surgeTime - dt);
  const haste = state.surgeTime > 0 ? 1.55 : 1;
  advanceVisuals(state, dt);
  if (state.mode === 'defense') {
    syncDefense(state);
    if (state.wavePending > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        const kind =
          state.wave % 4 === 0 && state.wavePending === 1
            ? 'boss'
            : state.wave >= 3 && state.waveSpawned % 4 === 2
              ? 'brute'
              : state.waveSpawned % 3 === 1
                ? 'runner'
                : 'grunt';
        spawnEnemy(state, kind, state.wave, (state.waveSpawned + state.wave) % 3);
        state.wavePending--;
        state.waveSpawned++;
        state.spawnTimer += Math.max(0.7, 1.9 - state.wave * 0.11);
      }
    } else if (!state.units.some((unit) => unit.side === 'enemy' && unit.hp > 0)) {
      if (state.wave >= state.maxWaves) {
        finish(state, 'won');
        return;
      }
      if (!state.intermission) {
        state.intermission = 5;
        const reward = 22 + state.wave * 3;
        state.coins += reward;
        event(state, 'reward', `守住第 ${state.wave} 波 · +${reward}灵石`);
        state.message = `下一波 ${state.wave + 1} 即将到来，抓紧补阵。`;
      } else {
        state.intermission = Math.max(0, state.intermission - dt);
        if (state.intermission <= 0) beginWave(state);
      }
    }
  } else {
    state.wave = Math.min(12, 1 + Math.floor(state.time / 35));
    state.attackSpawnTimer -= dt;
    // ponytail: at most 100 living troops per side; spatial indexing is only needed for larger armies.
    if (
      state.attackSpawnTimer <= 0 &&
      state.units.filter((unit) => unit.side === 'enemy' && unit.hp > 0).length < 100
    ) {
      const count = state.time > (state.difficulty === 'hard' ? 45 : 70) ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const kind =
          state.time > 20 && random(state) < 0.35
            ? 'brute'
            : random(state) < 0.33
              ? 'runner'
              : 'grunt';
        spawnEnemy(state, kind, state.wave, Math.floor(random(state) * 3));
      }
      state.attackSpawnTimer +=
        Math.max(1.65, 2.9 - state.time / 150) * (state.difficulty === 'hard' ? 0.75 : 1);
    }
    const links = getLinks(state),
      linkedWeapons = new Set(links.map((link) => link.weaponIndex));
    state.board.forEach((item, index) => {
      if (!isAwake(item) || linkedWeapons.has(index)) return;
      const link = links.find((candidate) => candidate.heroIndex === index);
      const cycleSignature = `${item.weapon || link?.key || ''}:${link?.weaponId || ''}:${link ? state.board[link.weaponIndex].level : item.weaponLevel || 0}`;
      if (item.cycleSignature !== undefined && cycleSignature !== item.cycleSignature)
        item.progress = 0;
      item.cycleSignature = cycleSignature;
      item.progress = Math.min(
        1,
        item.progress + (dt * haste) / getProductionTime(item, Boolean(link)),
      );
      if (link) state.board[link.weaponIndex].progress = item.progress;
      if (
        item.progress >= 1 &&
        state.units.filter((unit) => unit.side === 'ally' && unit.hp > 0).length < 100
      ) {
        item.progress = 0;
        if (link) state.board[link.weaponIndex].progress = 0;
        const unit = makeAlly(state, item, index, link);
        state.units.push(unit);
        animate(item, 'enter', 0.6);
        effect(
          state,
          'spawn',
          unit.x,
          unit.y,
          unit.x,
          unit.y,
          HEROES[item.key]?.color || WEAPONS[item.key].color,
        );
        event(state, 'produce', `${itemName(item)}出阵`, unit.x, unit.y);
      }
    });
  }
  for (const unit of state.units) {
    unit.animTime += dt;
    if (unit.hp <= 0) continue;
    unit.slowTime = Math.max(0, (unit.slowTime || 0) - dt);
    unit.attackTimer = Math.max(0, unit.attackTimer - dt * (unit.side === 'ally' ? haste : 1));
    if (unit.kind === 'hero') unit.energy = Math.min(100, unit.energy + dt * 1.8);
    if (unit.anim === 'charge') {
      if (unit.animTime >= 0.8) {
        const target = state.units
          .filter(
            (other) =>
              other.side !== unit.side &&
              other.hp > 0 &&
              other.lane === unit.lane &&
              Math.hypot(other.x - unit.x, other.y - unit.y) <= unit.range + 80,
          )
          .sort(
            (a, b) =>
              Math.hypot(a.x - unit.x, a.y - unit.y) - Math.hypot(b.x - unit.x, b.y - unit.y),
          )[0];
        if (target) {
          attack(state, unit, target, true);
          event(state, 'ultimate', HEROES[unit.key].skill, unit.x, unit.y);
        } else animate(unit, 'idle');
        unit.energy = 0;
      }
      continue;
    }
    if (unit.animDuration > 0 && unit.animTime >= unit.animDuration) animate(unit, 'idle');
    // Basic attacks hold one lane; area ultimates and linked chain fire can reach neighboring lanes.
    const enemies = state.units.filter(
      (other) => other.side !== unit.side && other.hp > 0 && other.lane === unit.lane,
    );
    const target = enemies
      .filter((other) => Math.hypot(other.x - unit.x, other.y - unit.y) <= unit.range)
      .sort(
        (a, b) => Math.hypot(a.x - unit.x, a.y - unit.y) - Math.hypot(b.x - unit.x, b.y - unit.y),
      )[0];
    if (target) {
      if (unit.kind === 'hero' && unit.energy >= 100) {
        animate(unit, 'charge', 0.8);
        continue;
      }
      if (unit.attackTimer <= 0) {
        attack(state, unit, target);
        unit.attackTimer += unit.interval;
      } else if (!['idle', 'attack', 'ultimate', 'enter', 'upgrade'].includes(unit.anim))
        animate(unit, 'idle');
    } else if (!unit.stationary) {
      const crystalX = unit.side === 'ally' ? 967 : 42;
      if (Math.abs(crystalX - unit.x) <= Math.max(50, unit.range * 0.68)) {
        if (unit.attackTimer <= 0) {
          attack(state, unit, null);
          unit.attackTimer += unit.interval;
        }
      } else {
        unit.x +=
          (unit.side === 'ally' ? 1 : -1) * unit.speed * dt * (unit.slowTime > 0 ? 0.55 : 1);
        if (!['walk', 'enter', 'attack', 'ultimate'].includes(unit.anim)) animate(unit, 'walk');
      }
    }
  }
  state.units = state.units.filter((unit) => unit.hp > 0 || unit.animTime < 0.65);
  if (state.coreHp <= 0) finish(state, 'lost');
  else if (state.mode === 'attack' && state.enemyCoreHp <= 0) finish(state, 'won');
}

export function tick(state, dtSeconds) {
  if (TERMINAL.has(state.phase) || state.paused || !Number.isFinite(dtSeconds) || dtSeconds <= 0)
    return state;
  if (state.phase === 'setup') {
    advanceVisuals(state, dtSeconds);
    return state;
  }
  // Process full visible elapsed time; only the simulation step is bounded.
  let remaining = dtSeconds;
  while (remaining > 1e-8 && state.phase === 'running') {
    const dt = Math.min(0.05, remaining);
    advance(state, dt);
    remaining -= dt;
  }
  return state;
}

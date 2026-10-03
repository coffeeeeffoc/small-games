import { LEVELS, SEEDS, BOONS, SKILLS, UPGRADES } from './config.mjs';
import {
  createGame,
  startGame,
  step,
  configureLoadout,
  selectSkill,
  chooseUpgrade,
  pauseGame,
  resumeGame,
  castSkill,
  dash,
} from './simulation.mjs';
import { GardenRenderer, drawSeedIcon, drawPortrait } from './renderer.mjs';
import { GardenAudio } from './audio.mjs';

import {
  createProfile,
  levelFromXp,
  profileStats,
  PERMANENT_UPGRADES,
  upgradeCost,
  purchaseUpgrade,
  isLevelUnlocked,
  settleLevel,
} from './progression.mjs';

const $ = (id) => document.getElementById(id);
const canvas = $('arena');
const renderer = new GardenRenderer(canvas);
const audio = new GardenAudio();
const PROFILE_KEY = 'bullet-garden.profile.v1';
let storageWarning = '';
let profile = loadProfile();
const campaign = () => Object.values(LEVELS).sort((a, b) => (a.order ?? 1) - (b.order ?? 1));
if (!isLevelUnlocked(profile, profile.selectedLevelId)) profile.selectedLevelId = campaign()[0].id;
let state = createGame(profile.selectedLevelId, 42, profile);
const input = {
  moveX: 0,
  moveY: 0,
  aimX: 900,
  aimY: 470,
  firing: false,
  autoFire: true,
  aimActive: false,
};
const keys = new Set();
const panels = ['ready', 'pause', 'help', 'upgrade', 'result', 'campaign', 'shop'];
const skillButtons = [...document.querySelectorAll('[data-skill-slot]')];
const prepSkills = ['blast', 'gale'];
let armed = false,
  fieldArmed = false;
let helpOpen = false,
  previousPhase = '',
  savedResult = false;
let campReturn = 'ready',
  settlement = null,
  activePanel = 'ready';
let campaignPage = 0;
const LEVELS_PER_PAGE = 12;
let joystickPointer = null,
  fieldPointer = null,
  stickX = 0,
  stickY = 0;
let aim = { x: 900, y: 470 },
  announcementUntil = 0,
  lastUI = 0;
let lastTime = performance.now(),
  accumulator = 0,
  uiTime = 0;
let hasAimed = false,
  pointerOnField = false;
let pointerClient = null;
let best = 0;
let gameSpeed = 1;
try {
  best = Number(localStorage.getItem('bullet-garden.best') || 0);
  audio.enabled = localStorage.getItem('bullet-garden.sound') === 'true';
} catch {
  /* Storage can be unavailable in embedded mode. */
}

drawPortrait($('portrait'));
drawSeedIcon($('title-seed'), 'flower');

function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return createProfile();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('Invalid save');
    return createProfile(parsed);
  } catch {
    storageWarning = '存档无法读取；本次进度暂存于内存。';
    return createProfile();
  }
}

function saveProfile() {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    storageWarning = '';
  } catch {
    storageWarning = '本次进度未保存；仍可继续游玩，请勿关闭页面。';
  }
  refreshStorageStatus();
}

function refreshStorageStatus() {
  $('save-status').textContent = storageWarning;
  $('save-status').hidden = !storageWarning;
}

function availableSeeds() {
  const playerLevel = levelFromXp(profile.xp).level;
  return Object.values(SEEDS).filter((seed) => playerLevel >= (seed.unlockLevel ?? 1));
}

function weatherDetails(level) {
  const weather = level.weather ?? { kind: 'sunny' };
  const names = {
    sunny: '晴天',
    cloudy: '阴天',
    overcast: '阴天',
    rain: '雨天',
    fog: '大雾',
    hail: '冰雹',
  };
  const effects = {
    sunny: '暖阳花治疗、花瓣炮伤害 +10%',
    cloudy: '植物耐久和持续时间 +10%',
    overcast: '植物耐久和持续时间 +10%',
    rain: '植物生成频率 +10%，灌木缠绕更强；泥地、坡地更湿滑',
    fog: '自动射击射程 −15%；吐籽花攻击更慢',
    hail: '地面怪速度 −10%，冰柱耐久 +25%；躲开落冰警示圈',
  };
  const kind = weather.kind ?? 'sunny';
  const extras = [];
  if (weather.wind > 0) extras.push('大风');
  if (weather.thunder || weather.thunderstorm) extras.push('雷暴');
  return {
    name: [names[kind] ?? '天气', ...extras].join(' · '),
    effect: [
      weather.description ?? effects[kind] ?? '留意天气变化',
      weather.wind > 0 ? '大风加快怪物和花瓣炮弹速' : '',
      weather.thunder || weather.thunderstorm ? '引雷芦伤害 +20%；躲开雷击警示圈' : '',
    ]
      .filter(Boolean)
      .join('；'),
  };
}

function refreshProfile() {
  const xp = levelFromXp(profile.xp);
  document.querySelectorAll('[data-profile]').forEach((element) => {
    element.textContent = `永久 Lv.${xp.level} · 关卡经验 ${xp.earned} / ${xp.required} · 金币 ${profile.coins}`;
  });
  $('shop-wallet').textContent = profile.coins;
  refreshStorageStatus();
}

function refreshReady() {
  const level = LEVELS[state.levelId];
  const weather = weatherDetails(level);
  $('ready-level-order').textContent = String(level.order ?? 1).padStart(2, '0');
  $('ready-level-name').textContent = level.name;
  $('ready-level-details').textContent =
    `${level.waves} 波 · ${Math.round((level.duration / 60) * 10) / 10} 分钟 · ${level.encounter ? (level.encounter.rank === 'boss' || level.encounter.kind === 'overgrowth' ? '击败 BOSS' : '击败首领') : '生存守卫'}`;
  const terrainHints = { wall: '石块阻挡地面移动', mud: '泥地减速双方', slope: '苔阶有概率滑落' };
  const terrain = [
    ...new Set((level.terrain ?? []).map((entry) => terrainHints[entry.kind]).filter(Boolean)),
  ];
  $('ready-weather').textContent =
    `${weather.name}：${weather.effect}${terrain.length ? `。${terrain.join(' · ')}` : ''}`;
  const locked = Object.values(SEEDS).filter(
    (seed) => !availableSeeds().some((entry) => entry.id === seed.id),
  );
  $('ready-unlocks').textContent = locked.length
    ? locked.map((seed) => `${seed.name} Lv.${seed.unlockLevel}`).join(' · ')
    : '全部植物已解锁 · 局内升级可选对应增益';
  refreshProfile();
}

function openCamp(name) {
  if (!['ready', 'won', 'lost'].includes(state.phase) || helpOpen) return;
  campReturn = state.phase === 'ready' ? 'ready' : 'result';
  if (name === 'campaign') {
    campaignPage = Math.floor(
      campaign().findIndex((level) => level.id === state.levelId) / LEVELS_PER_PAGE,
    );
    populateCampaign();
  }
  if (name === 'shop') populateShop();
  refreshProfile();
  showPanel(name);
}

function closeCamp() {
  refreshReady();
  if (campReturn === 'result') populateResult();
  showPanel(campReturn);
}

function selectLevel(levelId) {
  if (!['ready', 'won', 'lost'].includes(state.phase) || !isLevelUnlocked(profile, levelId)) return;
  resetInput();
  profile.selectedLevelId = levelId;
  saveProfile();
  state = createGame(levelId, 42, profile);
  helpOpen = false;
  previousPhase = '';
  savedResult = false;
  settlement = null;
  campReturn = 'ready';
  configureLoadout(state, { skills: prepSkills });
  refreshPreparation();
  refreshReady();
  syncPhase();
  refreshHUD();
}

function populateCampaign() {
  $('campaign-list').replaceChildren();
  const levels = campaign();
  const pages = Math.ceil(levels.length / LEVELS_PER_PAGE);
  campaignPage = Math.max(0, Math.min(pages - 1, campaignPage));
  $('campaign-pagination').hidden = pages <= 1;
  $('campaign-page').textContent = `${campaignPage + 1} / ${pages}`;
  $('campaign-previous').disabled = campaignPage <= 0;
  $('campaign-next').disabled = campaignPage >= pages - 1;
  for (const level of levels.slice(
    campaignPage * LEVELS_PER_PAGE,
    (campaignPage + 1) * LEVELS_PER_PAGE,
  )) {
    const unlocked = isLevelUnlocked(profile, level.id);
    const cleared = profile.completed.includes(level.id);
    const button = document.createElement('button');
    button.className = `campaign-level${state.levelId === level.id ? ' current' : ''}`;
    button.dataset.level = level.id;
    button.disabled = !unlocked;
    const order = document.createElement('span');
    order.className = 'campaign-order';
    order.textContent = String(level.order ?? 1).padStart(2, '0');
    const content = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = level.name;
    const detail = document.createElement('small');
    detail.textContent = `${weatherDetails(level).name} · ${level.waves} 波${level.encounter ? ' · ' + (level.encounter.rank === 'boss' || level.encounter.kind === 'overgrowth' ? 'BOSS' : '首领') : ''}`;
    const status = document.createElement('span');
    status.className = 'campaign-state';
    status.textContent = cleared
      ? '已通关 · 重玩'
      : unlocked
        ? '出发 →'
        : `先通关前一关${(level.unlockLevel ?? 1) > 1 ? ` · Lv.${level.unlockLevel}` : ''}`;
    content.append(title, detail, status);
    button.append(order, content);
    button.addEventListener('click', () => selectLevel(level.id));
    $('campaign-list').append(button);
  }
}

function statLabel(id, stats) {
  const decimal = (value) => Math.round(value * 10) / 10;
  if (id === 'attack' || id === 'weaponDamage') return `伤害 ${decimal(stats.damage)}`;
  if (id === 'fireRate' || id === 'weaponRate') return `每秒 ${decimal(1 / stats.fireInterval)} 发`;
  if (id === 'health') return `生命 ${stats.maxHp}`;
  if (id === 'armor')
    return `护甲 ${stats.armor} · 减伤 ${Math.round(Math.min(0.6, stats.armor / (stats.armor + 100)) * 100)}%`;
  if (id === 'seedMastery') return `植物强度 ${Math.round(stats.seedPower * 100)}%`;
  if (id === 'pet')
    return `助手伤害 ${decimal(stats.petDamage)} · 每秒 ${decimal(1 / stats.petInterval)} 发`;
  if (id === 'weaponPierce') return `额外穿透 ${stats.pierce} 个目标`;
  const definition = PERMANENT_UPGRADES.find((entry) => entry.id === id);
  const labels = {
    damage: '伤害',
    fireRate: '每秒发数',
    maxHp: '生命',
    armor: '护甲',
    seedPower: '植物强度',
    pierce: '额外穿透',
    petDamage: '助手伤害',
    petFireRate: '助手每秒发数',
  };
  return (
    (definition?.displayStats ?? definition?.effects.map((effect) => effect.stat) ?? [])
      .filter((key) => Number.isFinite(stats[key]))
      .map(
        (key) =>
          `${labels[key] ?? key} ${key === 'seedPower' ? `${Math.round(stats[key] * 100)}%` : decimal(stats[key])}`,
      )
      .join(' · ') ||
    definition?.description ||
    '成长效果'
  );
}

function populateShop() {
  $('growth-shop').replaceChildren();
  $('weapon-shop').replaceChildren();
  const current = profileStats(profile);
  for (const definition of PERMANENT_UPGRADES) {
    const rank = profile.upgrades[definition.id];
    const locked = current.level < definition.unlockLevel;
    const cost = upgradeCost(profile, definition.id);
    const capped = cost === null;
    const card = document.createElement('article');
    card.className = `shop-card${locked ? ' locked' : ''}`;
    card.dataset.growth = definition.id;
    const icon = document.createElement('canvas');
    icon.width = 140;
    icon.height = 110;
    icon.setAttribute('aria-hidden', 'true');
    const heading = document.createElement('strong');
    heading.textContent = `${definition.name} ${rank} / ${definition.maxRank}`;
    const description = document.createElement('p');
    description.textContent = definition.description;
    const values = document.createElement('div');
    values.className = 'shop-values';
    const before = document.createElement('span');
    before.textContent = `当前：${locked ? '尚未解锁' : statLabel(definition.id, current)}`;
    const after = document.createElement('span');
    if (capped) after.textContent = '已达到最高档';
    else {
      const preview = createProfile(profile);
      preview.upgrades[definition.id] += 1;
      // Preview the unlocked tier without changing the player's experience.
      if (locked) after.textContent = `下一档：${definition.description.replace(/。$/, '')}`;
      else after.textContent = `下一档：${statLabel(definition.id, profileStats(preview))}`;
    }
    values.append(before, after);
    const requirement = document.createElement('small');
    requirement.className = 'shop-requirement';
    requirement.textContent = locked
      ? `Lv.${definition.unlockLevel} 解锁 · 下一档 ${cost ?? '—'} 金币`
      : capped
        ? '成长已满级'
        : `升级费用：${cost} 金币`;
    const purchase = document.createElement('button');
    purchase.dataset.purchase = definition.id;
    purchase.className = 'shop-purchase';
    purchase.disabled = locked || capped || profile.coins < cost;
    purchase.textContent = locked
      ? `Lv.${definition.unlockLevel} 解锁`
      : capped
        ? '已满级'
        : profile.coins < cost
          ? '金币不足'
          : `升级 · ${cost} 金币`;
    purchase.addEventListener('click', () => {
      if (!['ready', 'won', 'lost'].includes(state.phase)) return;
      const result = purchaseUpgrade(profile, definition.id);
      if (!result.ok) return;
      saveProfile();
      if (state.phase === 'ready') {
        state = createGame(state.levelId, state.initialSeed ?? 42, profile);
        configureLoadout(state, { skills: prepSkills });
        refreshPreparation();
      }
      populateShop();
      refreshReady();
      refreshHUD();
      $('shop-feedback').textContent =
        `${definition.name} 已升至 ${result.rank} 级，下一次出发立即生效。`;
    });
    card.append(icon, heading, description, values, requirement, purchase);
    $(definition.id.startsWith('weapon') ? 'weapon-shop' : 'growth-shop').append(card);
    drawSeedIcon(
      icon,
      definition.id === 'pet'
        ? 'pet'
        : definition.id === 'armor'
          ? 'shield'
          : definition.icon === 'shot'
            ? 'normal'
            : definition.icon,
    );
  }
}

function announce(text, duration = 3) {
  $('announcement').textContent = text;
  announcementUntil = uiTime + duration;
  $('announcement').classList.add('visible');
}

function showPanel(name) {
  activePanel = name;
  $('overlay').hidden = !name;
  for (const panel of panels) $(`${panel}-panel`).hidden = panel !== name;
  if (name) {
    resetInput();
    requestAnimationFrame(() => {
      const focus =
        name === 'ready'
          ? $('ready-title')
          : $(`${name}-panel`).querySelector('button:not(:disabled), select');
      focus?.focus({ preventScroll: true });
    });
  }
}

function resetInput() {
  armed = false;
  fieldArmed = false;
  $('targeting').hidden = true;
  document.body.dataset.armed = 'false';
  keys.clear();
  input.moveX = 0;
  input.moveY = 0;
  input.firing = false;
  input.aimActive = false;
  hasAimed = false;
  pointerClient = null;
  stickX = 0;
  stickY = 0;
  if (joystickPointer !== null && $('joystick').hasPointerCapture(joystickPointer))
    $('joystick').releasePointerCapture(joystickPointer);
  if (fieldPointer !== null && canvas.hasPointerCapture(fieldPointer))
    canvas.releasePointerCapture(fieldPointer);
  joystickPointer = null;
  fieldPointer = null;
  pointerOnField = false;
  $('joystick-knob').style.transform = '';
}

function begin() {
  state = createGame(state.levelId, state.initialSeed ?? 42, profile);
  if (!configureLoadout(state, { skills: prepSkills })) return;
  resetInput();
  helpOpen = false;
  savedResult = false;
  settlement = null;
  state.runId = crypto.randomUUID();
  startGame(state);
  profile.selectedLevelId = state.levelId;
  saveProfile();
  previousPhase = '';
  input.autoFire = true;
  aim = { x: state.player.x + 160, y: state.player.y };
  hasAimed = false;
  input.aimX = aim.x;
  input.aimY = aim.y;
  accumulator = 0;
  audio.unlock();
  syncPhase();
  refreshHUD();
  announce(
    matchMedia('(pointer:coarse)').matches
      ? '摇杆移动 · 满能后点技能，再点战场释放'
      : 'WASD 移动 · 1 / 2 选满能技能 · 点击战场释放',
    5,
  );
}

function togglePause() {
  if (activePanel === 'campaign' || activePanel === 'shop') {
    closeCamp();
    return;
  }
  if (helpOpen) {
    closeHelp();
    return;
  }
  if (state.phase === 'playing') pauseGame(state);
  else if (state.phase === 'paused') resumeGame(state);
  accumulator = 0;
  syncPhase();
}

function openHelp() {
  if (state.phase === 'playing') pauseGame(state);
  if (state.phase === 'upgrade' || state.phase === 'won' || state.phase === 'lost') return;
  helpOpen = true;
  syncPhase();
  showPanel('help');
}

function closeHelp() {
  helpOpen = false;
  previousPhase = '';
  syncPhase();
}

function prepare() {
  resetInput();
  state = createGame(state.levelId, state.initialSeed ?? 42, profile);
  helpOpen = false;
  previousPhase = '';
  savedResult = false;
  configureLoadout(state, { skills: prepSkills });
  refreshPreparation();
  syncPhase();
  refreshHUD();
}

function refreshPreparation() {
  refreshReady();
  for (let index = 0; index < 2; index++) {
    $(`loadout-skill-${index}`).value = prepSkills[index];
    $(`loadout-description-${index}`).textContent = SKILLS[prepSkills[index]].description;
  }
}

const skillLabels = { blast: '爆破', gale: '大风', cart: '冲锋车', horse: '战马', laser: '激光' };
for (let index = 0; index < 2; index++) {
  const select = $(`loadout-skill-${index}`);
  for (const definition of Object.values(SKILLS)) {
    const option = document.createElement('option');
    option.value = definition.id;
    option.textContent = skillLabels[definition.id]
      ? `${skillLabels[definition.id]} · ${definition.name}`
      : definition.name;
    select.append(option);
  }
  select.addEventListener('change', () => {
    const previous = prepSkills[index];
    prepSkills[index] = select.value;
    // Swapping a duplicate keeps both native controls usable and the pair distinct.
    if (prepSkills[1 - index] === select.value) prepSkills[1 - index] = previous;
    refreshPreparation();
  });
}
function cancelSkill(message = false) {
  armed = false;
  fieldArmed = false;
  refreshHUD();
  if (message) announce('已取消瞄准 · 能量保留', 2);
}

function armSkill(index) {
  if (helpOpen || state.phase !== 'playing') return;
  if (armed && state.selectedSkill === index) {
    cancelSkill(true);
    return;
  }
  if (!selectSkill(state, index)) return;
  const slot = state.skillSlots[index];
  armed = slot.energy >= SKILLS[slot.kind].energyMax;
  fieldArmed = false;
  constrainAim(aim);
  refreshHUD();
  announce(
    armed
      ? `${SKILLS[slot.kind].name} · ${SKILLS[slot.kind].shape === 'line' ? '拖动选择方向' : '拖动选择落点'}，松手释放`
      : '技能正在充能 · 战斗与击退敌人都能积攒能量',
    2.5,
  );
}

function releaseSkill() {
  if (!armed || state.phase !== 'playing' || helpOpen) return;
  audio.unlock();
  if (castSkill(state, aim)) {
    armed = false;
    fieldArmed = false;
  } else announce('技能暂未就绪 · 能量已保留', 2);
  refreshHUD();
}

function doDash() {
  const direction =
    Math.hypot(input.moveX, input.moveY) > 0.1
      ? { x: input.moveX, y: input.moveY }
      : input.aimActive || armed
        ? { x: aim.x - state.player.x, y: aim.y - state.player.y }
        : { x: Math.cos(state.player.angle), y: Math.sin(state.player.angle) };
  dash(state, direction);
  audio.unlock();
  refreshHUD();
}

function constrainAim(world) {
  const bounds = LEVELS[state.levelId].bounds;
  aim = {
    x: Math.max(bounds.left, Math.min(bounds.right, world.x)),
    y: Math.max(bounds.top, Math.min(bounds.bottom, world.y)),
  };
  const definition = SKILLS[state.skillSlots[state.selectedSkill]?.kind];
  if (armed && definition) {
    const dx = aim.x - state.player.x,
      dy = aim.y - state.player.y;
    const distance = Math.hypot(dx, dy);
    if (distance > definition.range) {
      aim.x = state.player.x + (dx / distance) * definition.range;
      aim.y = state.player.y + (dy / distance) * definition.range;
    }
  }
  input.aimX = aim.x;
  input.aimY = aim.y;
}

function updateAim(event) {
  pointerClient = { x: event.clientX, y: event.clientY };
  constrainAim(renderer.screenToWorld(event.clientX, event.clientY));
  hasAimed = true;
}

function updateStick(event) {
  const rect = $('joystick').getBoundingClientRect(),
    reach = rect.width * 0.32;
  let x = event.clientX - rect.left - rect.width / 2,
    y = event.clientY - rect.top - rect.height / 2;
  const distance = Math.hypot(x, y);
  if (distance > reach) {
    x *= reach / distance;
    y *= reach / distance;
  }
  stickX = x / reach;
  stickY = y / reach;
  $('joystick-knob').style.transform = `translate(${x}px, ${y}px)`;
}

$('joystick').addEventListener('pointerdown', (event) => {
  if (state.phase !== 'playing' || joystickPointer !== null) return;
  event.preventDefault();
  joystickPointer = event.pointerId;
  $('joystick').setPointerCapture(event.pointerId);
  updateStick(event);
  audio.unlock();
});
$('joystick').addEventListener('pointermove', (event) => {
  if (event.pointerId === joystickPointer) updateStick(event);
});
function releaseStick(event) {
  if (event.pointerId !== joystickPointer) return;
  joystickPointer = null;
  stickX = 0;
  stickY = 0;
  $('joystick-knob').style.transform = '';
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
  $('joystick').addEventListener(type, releaseStick);

canvas.addEventListener('pointerdown', (event) => {
  if (state.phase !== 'playing') return;
  if (event.button !== 0) return;
  if (fieldPointer !== null) return;
  if (event.pointerType !== 'mouse') event.preventDefault();
  audio.unlock();
  updateAim(event);
  pointerOnField = true;
  fieldPointer = event.pointerId;
  fieldArmed = armed;
  canvas.setPointerCapture(event.pointerId);
  input.firing = !armed;
  input.aimActive = !armed;
});
canvas.addEventListener('pointermove', (event) => {
  if (state.phase !== 'playing') return;
  if (event.pointerType === 'mouse' || fieldPointer === event.pointerId) {
    updateAim(event);
    pointerOnField = true;
  }
});
canvas.addEventListener('pointerup', (event) => {
  if (event.pointerId !== fieldPointer) return;
  const rect = canvas.getBoundingClientRect();
  const inside =
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom &&
    document.elementFromPoint(event.clientX, event.clientY) === canvas;
  if (fieldArmed && state.phase === 'playing') {
    if (inside) {
      updateAim(event);
      releaseSkill();
    } else cancelSkill(true);
  }
  input.firing = false;
  input.aimActive = false;
  fieldPointer = null;
  fieldArmed = false;
  pointerOnField = event.pointerType === 'mouse';
});
for (const type of ['pointercancel', 'lostpointercapture'])
  canvas.addEventListener(type, (event) => {
    if (event.pointerId === fieldPointer) {
      fieldPointer = null;
      input.firing = false;
      input.aimActive = false;
      pointerOnField = false;
      cancelSkill();
    }
  });
canvas.addEventListener('pointerleave', () => {
  if (fieldPointer === null) pointerOnField = false;
});
// A second mouse button does not emit pointerdown while the first stays held.
canvas.addEventListener('mousedown', (event) => {
  if (event.button === 2 && state.phase === 'playing') {
    event.preventDefault();
    updateAim(event);
    pointerOnField = true;
    releaseSkill();
  }
});
canvas.addEventListener('contextmenu', (event) => event.preventDefault());

const controls = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowLeft',
  'ArrowDown',
  'ArrowRight',
  'Space',
  'KeyE',
  'Digit1',
  'Digit2',
  'Escape',
]);
window.addEventListener('keydown', (event) => {
  if (event.code === 'Tab' && !$('overlay').hidden) {
    const focusable = [
      ...$('overlay').querySelectorAll(
        'section:not([hidden]) button, section:not([hidden]) select',
      ),
    ].filter((button) => !button.disabled);
    const first = focusable[0],
      last = focusable.at(-1);
    if (
      event.shiftKey &&
      (document.activeElement === first || !focusable.includes(document.activeElement))
    ) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  if (event.target instanceof HTMLSelectElement && event.code !== 'Escape') return;
  if (!controls.has(event.code)) return;
  if (state.phase === 'playing' || event.code === 'Escape') event.preventDefault();
  if (event.code === 'Escape' && !event.repeat) {
    if (armed) cancelSkill(true);
    else togglePause();
    return;
  }
  if (state.phase !== 'playing' || helpOpen) return;
  keys.add(event.code);
  audio.unlock();
  if (event.repeat) return;
  if (event.code === 'KeyE') releaseSkill();
  if (event.code === 'Space') doDash();
  if (event.code.startsWith('Digit')) armSkill(Number(event.code.slice(5)) - 1);
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
function suspend() {
  resetInput();
  if (state.phase === 'playing') {
    pauseGame(state);
    syncPhase();
  }
  accumulator = 0;
}
window.addEventListener('blur', suspend);
canvas.addEventListener('contextlost', suspend);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) suspend();
});
window.addEventListener('resize', () => {
  resetInput();
  renderer.resize();
});

$('start').addEventListener('click', begin);
$('restart').addEventListener('click', prepare);
$('play-again').addEventListener('click', prepare);
$('next-level').addEventListener('click', () => {
  const nextId =
    settlement?.unlockedLevelId ??
    campaign()[campaign().findIndex((level) => level.id === state.levelId) + 1]?.id;
  if (nextId && state.phase === 'won') selectLevel(nextId);
});
for (const id of ['ready-campaign', 'result-campaign'])
  $(id).addEventListener('click', () => openCamp('campaign'));
for (const id of ['ready-shop', 'result-shop'])
  $(id).addEventListener('click', () => openCamp('shop'));
$('close-campaign').addEventListener('click', closeCamp);
$('close-shop').addEventListener('click', closeCamp);
for (const [id, direction] of [
  ['campaign-previous', -1],
  ['campaign-next', 1],
]) {
  $(id).addEventListener('click', () => {
    if (activePanel !== 'campaign') return;
    campaignPage += direction;
    populateCampaign();
    $('campaign-panel').scrollTop = 0;
  });
}
$('pause').addEventListener('click', togglePause);
$('resume').addEventListener('click', togglePause);
for (const id of ['help', 'ready-help', 'pause-help']) $(id).addEventListener('click', openHelp);
$('close-help').addEventListener('click', closeHelp);
$('cast').addEventListener('click', releaseSkill);
$('cancel-cast').addEventListener('click', () => cancelSkill(true));
$('dash').addEventListener('click', doDash);
for (const button of skillButtons)
  button.addEventListener('click', () => armSkill(Number(button.dataset.skillSlot)));
$('game-speed').addEventListener('change', () => {
  const speed = Number($('game-speed').value);
  gameSpeed = [1, 2, 3, 5].includes(speed) ? speed : 1;
  accumulator = 0;
  announce(`战斗速度 ${gameSpeed}× · 充能与技能同步加速`, 2);
});
$('auto-fire').addEventListener('click', () => {
  input.autoFire = !input.autoFire;
  refreshHUD();
  announce(input.autoFire ? '自动射击已开启' : '自动射击已关闭 · 按住战场定向射击', 2);
});
function syncSound() {
  $('sound').setAttribute('aria-pressed', String(audio.enabled));
  $('pause-sound').setAttribute('aria-pressed', String(audio.enabled));
  $('pause-sound').textContent = `音效：${audio.enabled ? '开启' : '关闭'}`;
  $('sound').setAttribute('aria-label', audio.enabled ? '关闭音效' : '开启音效');
  $('sound-waves').setAttribute(
    'd',
    audio.enabled ? 'M17 7q6 5 0 10m0-7q3 2 0 4' : 'm17 9 5 6m0-6-5 6',
  );
}
function toggleSound() {
  audio.toggle();
  syncSound();
  try {
    localStorage.setItem('bullet-garden.sound', String(audio.enabled));
  } catch {
    /* Optional preference. */
  }
}
$('sound').addEventListener('click', toggleSound);
$('pause-sound').addEventListener('click', toggleSound);

function populateUpgrades() {
  $('upgrade-options').replaceChildren();
  $('upgrade-options').dataset.count = state.upgradeChoices.length;
  const rewardLevel = state.progression.queue?.[0] || state.progression.level;
  $('upgrade-description').textContent =
    `Lv. ${rewardLevel} 强化 · 随机 ${state.upgradeChoices.length} 选 1${state.progression.pending > 1 ? ` · 待选 ${state.progression.pending} 次` : '，选择后继续战斗'}`;
  for (const id of state.upgradeChoices) {
    const definition = UPGRADES.find((upgrade) => upgrade.id === id);
    if (!definition) continue;
    const button = document.createElement('button');
    button.className = 'upgrade-option';
    button.dataset.upgrade = id;
    button.dataset.category = definition.category;
    const icon = document.createElement('canvas');
    icon.width = 180;
    icon.height = 140;
    const title = document.createElement('strong');
    title.textContent = definition.name;
    const description = document.createElement('p');
    description.textContent = definition.description;
    const category = document.createElement('span');
    category.className = 'upgrade-category';
    const rank = state.upgrades.filter((upgradeId) => upgradeId === id).length + 1;
    category.textContent = `${{ weapon: '枪械', terrain: '地形', survival: '生存' }[definition.category] || '强化'} · ${rank} / ${definition.maxRank || 1}`;
    const choose = document.createElement('small');
    choose.textContent = id.startsWith('boon-') ? '解锁地形 →' : '选择强化 →';
    button.append(icon, category, title, description, choose);
    $('upgrade-options').append(button);
    drawSeedIcon(icon, definition.icon || definition.kind || 'normal');
    button.addEventListener('click', () => {
      if (chooseUpgrade(state, id)) {
        previousPhase = '';
        syncPhase();
        refreshHUD();
        announce(`获得 ${definition.name} · Lv. ${state.progression.level}`, 3);
      }
    });
  }
}

function populateResult() {
  const won = state.phase === 'won';
  const level = LEVELS[state.levelId];
  $('result-kicker').textContent = won ? 'GARDEN PROTECTED' : 'EVERY GARDEN GROWS AGAIN';
  $('result-title').textContent = won ? '花园，生生不息。' : '下一次，会开花。';
  $('result-description').textContent = won
    ? `${level.name}守卫完成。带上新的成长，继续深入花园。`
    : `坚持到第 ${state.wave} 波。让地形拖慢追兵，把充满的能量留给最需要的时刻。`;
  const seconds = Math.floor(state.time);
  const values = [
    [`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`, '守卫时间'],
    [state.kills, '击退怪物'],
    [state.stats.skillCasts, '手动释放'],
    [state.progression.level, '本局等级'],
    [state.upgrades.length, '获得强化'],
    [state.stats.plantKills + state.stats.skillKills, '战术击退'],
  ];
  $('result-stats').replaceChildren();
  for (const [value, label] of values) {
    const box = document.createElement('div'),
      number = document.createElement('strong'),
      caption = document.createElement('span');
    number.textContent = value;
    caption.textContent = label;
    box.append(number, caption);
    $('result-stats').append(box);
  }
  if (!savedResult) {
    settlement = settleLevel(profile, state);
    if (settlement.ok) saveProfile();
    best = Math.max(best, seconds);
    savedResult = true;
    try {
      localStorage.setItem('bullet-garden.best', String(best));
    } catch {
      /* Optional best score. */
    }
  }
  $('best-record').textContent =
    `最佳守卫 ${Math.floor(best / 60)}:${String(best % 60).padStart(2, '0')} · 地形与技能造成 ${Math.round(state.stats.terrainDamage + state.stats.skillDamage)} 伤害`;
  $('reward-coins').textContent = settlement?.reward?.coins ?? 0;
  $('reward-xp').textContent = settlement?.reward?.xp ?? 0;
  $('reward-note').textContent = !settlement?.ok
    ? '本局奖励未到账，请保留当前页面。'
    : won
      ? settlement.reward.firstClear
        ? `首次通关奖励已到账。${settlement.unlockedLevelId ? '下一关已解锁。' : ''}`
        : '重玩奖励：地图奖励、击杀金币和经验的 35%。'
      : '保留 25% 击杀金币；经验按生存时间折算，未解锁下一关。';
  if (
    won &&
    settlement?.ok &&
    !campaign()[campaign().findIndex((entry) => entry.id === level.id) + 1]
  )
    $('reward-note').textContent = '本章全部通关！可以重玩花园，继续培养成长。';
  const next = campaign()[campaign().findIndex((entry) => entry.id === state.levelId) + 1];
  $('next-level').hidden = !won || !next || !isLevelUnlocked(profile, next.id);
  $('next-level').textContent = next ? `下一关 · ${next.name} →` : '本章已完成';
  $('play-again').textContent = won ? '重玩本关 · 重新搭配 ↻' : '重新搭配 · 再挑战 ↻';
  refreshProfile();
}

function syncPhase() {
  document.body.dataset.phase = state.phase;
  if (state.phase === previousPhase) return;
  previousPhase = state.phase;
  accumulator = 0;
  if (helpOpen) {
    showPanel('help');
    return;
  }
  if (state.phase === 'ready') {
    refreshReady();
    showPanel('ready');
  } else if (state.phase === 'paused') showPanel('pause');
  else if (state.phase === 'upgrade') {
    populateUpgrades();
    showPanel('upgrade');
  } else if (state.phase === 'won' || state.phase === 'lost') {
    populateResult();
    showPanel('result');
  } else {
    showPanel(null);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }
}

function refreshHUD() {
  const currentLevel = LEVELS[state.levelId];
  $('wave-total').textContent = ` / ${currentLevel.waves}`;
  $('hud-level-name').textContent =
    `${String(currentLevel.order ?? 1).padStart(2, '0')} · ${currentLevel.name}`;
  $('hud-weather').textContent = weatherDetails(currentLevel).name;
  $('permanent-level').textContent = `永久 Lv.${levelFromXp(profile.xp).level}`;
  $('health').textContent = `${Math.ceil(state.player.hp)} / ${state.player.maxHp}`;
  $('health-fill').style.width = `${(100 * state.player.hp) / state.player.maxHp}%`;
  $('coins').textContent = state.coins;
  $('wave').textContent = state.wave;
  $('wave-fill').style.width = `${Math.max(0, Math.min(100, state.waveProgress * 100))}%`;
  const remaining = Math.max(0, Math.ceil(state.duration - state.time));
  $('timer').textContent =
    `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  $('kill-count').textContent = `击退 ${state.kills}`;
  $('plant-count').textContent = `生长中 ${state.plants.length} / ${state.plantCap}`;
  const { level, xp, nextXp } = state.progression;
  $('level').textContent = `局内 Lv.${level}`;
  $('experience').textContent = `${xp} / ${nextXp}`;
  $('experience-fill').style.width = `${Math.min(100, (xp / nextXp) * 100)}%`;
  const experienceTrack = $('experience-fill').parentElement;
  experienceTrack.setAttribute('aria-valuenow', xp);
  experienceTrack.setAttribute('aria-valuemax', nextXp);
  $('active-boons').textContent = state.boons.length
    ? state.boons.map((id) => BOONS[id].name).join(' · ')
    : '升级选择后解锁';
  for (const button of skillButtons) {
    const index = Number(button.dataset.skillSlot),
      slot = state.skillSlots[index];
    const definition = SKILLS[slot.kind],
      ready = slot.energy >= definition.energyMax;
    const selected = armed && state.selectedSkill === index;
    if (button.dataset.kind !== slot.kind) {
      button.dataset.kind = slot.kind;
      button.style.setProperty('--skill-color', definition.color);
      $(`skill-name-${index}`).textContent = definition.name;
      drawSeedIcon($(`skill-icon-${index}`), slot.kind);
    }
    button.classList.toggle('ready', ready);
    button.classList.toggle('armed', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute(
      'aria-label',
      `${definition.name}，能量 ${Math.floor(slot.energy)} / ${definition.energyMax}，${selected ? '正在瞄准，再点取消' : ready ? '已就绪，点击选择落点' : '充能中'}`,
    );
    $(`skill-energy-${index}`).textContent = `${Math.floor(slot.energy)} / ${definition.energyMax}`;
    $(`skill-status-${index}`).textContent = selected
      ? '瞄准中 · 再点取消'
      : ready
        ? '已就绪 · 点此瞄准'
        : '充能中';
    const meter = button.querySelector('.skill-meter');
    meter.setAttribute('aria-valuenow', String(Math.floor(slot.energy)));
    meter.querySelector('i').style.transform =
      `scaleX(${Math.min(1, slot.energy / definition.energyMax)})`;
  }
  const definition = SKILLS[state.skillSlots[state.selectedSkill].kind];
  $('targeting').hidden = !armed;
  document.body.dataset.armed = String(armed);
  $('targeting-text').textContent =
    `${definition.name} · ${definition.shape === 'line' ? '选择方向' : '选择落点'}，松手释放`;
  $('skill-instruction').textContent = armed
    ? '在战场拖动瞄准 · 松手释放 · 取消保留能量'
    : '点亮已充满的技能，再选择战场落点';
  $('cast').disabled = !armed;
  const coarse = matchMedia('(pointer:coarse)').matches;
  $('cast-cooldown').textContent = armed ? (coarse ? '松手释放' : '右键 / E') : '先选技能';
  $('dash-cooldown').textContent =
    state.player.dashCooldown > 0
      ? `${state.player.dashCooldown.toFixed(1)}s`
      : coarse
        ? '就绪'
        : 'SPACE';
  $('dash').style.opacity = state.player.dashCooldown > 0 ? '.6' : '1';
  $('auto-fire').setAttribute('aria-pressed', String(input.autoFire));
  $('auto-fire').querySelector('b').textContent = input.autoFire ? '开' : '关';
}

function frame(now) {
  const elapsed = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  uiTime += elapsed;
  if (pointerClient && (pointerOnField || fieldPointer !== null))
    constrainAim(renderer.screenToWorld(pointerClient.x, pointerClient.y));
  input.moveX =
    stickX +
    Number(keys.has('KeyD') || keys.has('ArrowRight')) -
    Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  input.moveY =
    stickY +
    Number(keys.has('KeyS') || keys.has('ArrowDown')) -
    Number(keys.has('KeyW') || keys.has('ArrowUp'));
  if (!hasAimed) constrainAim({ x: state.player.x + 150, y: state.player.y });
  // HTML controls remain clickable during canvas recovery. Keep combat paused
  // even if start, resume or an upgrade is pressed before the canvas returns.
  if (state.phase === 'playing' && (renderer.contextLost || renderer.ctx.isContextLost?.()))
    suspend();
  if (state.phase === 'playing') {
    accumulator += elapsed * gameSpeed;
    while (accumulator >= 1 / 60 && state.phase === 'playing') {
      step(state, 1 / 60, input);
      accumulator -= 1 / 60;
    }
  }
  for (const event of state.events.splice(0)) {
    audio.play(event.type);
    if (event.type === 'wave' && state.wave > 1)
      announce(
        `第 ${state.wave} 波 · ${state.wave >= 7 ? '黑潮涌入，守住花园' : '新的敌人正在靠近'}`,
        3,
      );
  }
  renderer.render(state, {
    aim,
    planting: state.phase === 'playing' && armed,
    time: uiTime,
  });
  syncPhase();
  if (now - lastUI > 80) {
    refreshHUD();
    lastUI = now;
  }
  if (announcementUntil < uiTime) $('announcement').classList.remove('visible');
  requestAnimationFrame(frame);
}

// Read-only observability for browser acceptance; never expose mutable state or time controls.
Object.defineProperty(window, '__bulletGarden', {
  value: Object.freeze({
    snapshot: () =>
      structuredClone({
        ...state,
        controls: {
          manualAim: input.aimActive,
          moveX: input.moveX,
          moveY: input.moveY,
          armed,
          speed: gameSpeed,
        },
      }),
  }),
  writable: false,
  configurable: false,
});
refreshPreparation();
syncSound();
syncPhase();
refreshHUD();
requestAnimationFrame(frame);

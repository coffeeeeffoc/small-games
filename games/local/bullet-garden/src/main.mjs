import { LEVELS, SEEDS, UPGRADES } from './config.mjs';
import {
  createGame,
  startGame,
  step,
  chooseUpgrade,
  pauseGame,
  resumeGame,
  dash,
} from './simulation.mjs';
import { GardenRenderer, drawSeedIcon, drawPortrait } from './renderer.mjs';
import { GardenAudio } from './audio.mjs';

const $ = (id) => document.getElementById(id);
const canvas = $('arena');
const renderer = new GardenRenderer(canvas);
const audio = new GardenAudio();
const state = createGame('ruins');
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
const panels = ['ready', 'pause', 'help', 'upgrade', 'result'];
const terrainLegend = [...document.querySelectorAll('[data-terrain]')];
let helpOpen = false,
  previousPhase = '',
  savedResult = false;
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
try {
  best = Number(localStorage.getItem('bullet-garden.best') || 0);
  audio.enabled = localStorage.getItem('bullet-garden.sound') === 'true';
} catch {
  /* Storage can be unavailable in embedded mode. */
}

drawPortrait($('portrait'));
document.querySelectorAll('[data-icon]').forEach((icon) => drawSeedIcon(icon, icon.dataset.icon));
drawSeedIcon($('title-seed'), 'flower');

function announce(text, duration = 3) {
  $('announcement').textContent = text;
  announcementUntil = uiTime + duration;
  $('announcement').classList.add('visible');
}

function showPanel(name) {
  $('overlay').hidden = !name;
  for (const panel of panels) $(`${panel}-panel`).hidden = panel !== name;
  if (name) {
    resetInput();
    requestAnimationFrame(() => {
      const focus = $(`${name}-panel`).querySelector('button');
      focus?.focus({ preventScroll: true });
    });
  }
}

function resetInput() {
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
  resetInput();
  helpOpen = false;
  savedResult = false;
  startGame(state);
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
      ? '摇杆移动 · 自动射击与生长 · 击退升级'
      : 'WASD 移动 · 自动射击与生长 · 击退升级',
    5,
  );
}

function togglePause() {
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

function doDash() {
  const direction =
    Math.hypot(input.moveX, input.moveY) > 0.1
      ? { x: input.moveX, y: input.moveY }
      : input.aimActive
        ? { x: aim.x - state.player.x, y: aim.y - state.player.y }
        : { x: Math.cos(state.player.angle), y: Math.sin(state.player.angle) };
  dash(state, direction);
  audio.unlock();
  refreshHUD();
}

function constrainAim(world) {
  const bounds = LEVELS[state.levelId].bounds;
  const radius = 8;
  aim = {
    x: Math.max(bounds.left + radius, Math.min(bounds.right - radius, world.x)),
    y: Math.max(bounds.top + radius, Math.min(bounds.bottom - radius, world.y)),
  };
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
  if (event.button === 2) return;
  if (fieldPointer !== null) return;
  if (event.pointerType !== 'mouse') event.preventDefault();
  audio.unlock();
  updateAim(event);
  pointerOnField = true;
  fieldPointer = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  input.firing = true;
  input.aimActive = true;
});
canvas.addEventListener('pointermove', (event) => {
  if (state.phase !== 'playing') return;
  if (fieldPointer === event.pointerId) {
    updateAim(event);
    pointerOnField = true;
  }
});
function releaseAim(event) {
  if (event.pointerId !== fieldPointer) return;
  const capturedPointer = fieldPointer;
  fieldPointer = null;
  input.firing = false;
  input.aimActive = false;
  hasAimed = false;
  pointerOnField = false;
  pointerClient = null;
  if (canvas.hasPointerCapture(capturedPointer)) canvas.releasePointerCapture(capturedPointer);
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
  canvas.addEventListener(type, releaseAim);
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
  'Escape',
]);
window.addEventListener('keydown', (event) => {
  if (event.code === 'Tab' && !$('overlay').hidden) {
    const focusable = [...$('overlay').querySelectorAll('section:not([hidden]) button')].filter(
      (button) => !button.disabled,
    );
    const first = focusable[0],
      last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  if (!controls.has(event.code)) return;
  if (state.phase === 'playing' || event.code === 'Escape') event.preventDefault();
  if (event.code === 'Escape' && !event.repeat) {
    togglePause();
    return;
  }
  if (state.phase !== 'playing' || helpOpen) return;
  keys.add(event.code);
  audio.unlock();
  if (event.repeat) return;
  if (event.code === 'Space') doDash();
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
document.addEventListener('visibilitychange', () => {
  if (document.hidden) suspend();
});
window.addEventListener('resize', () => {
  resetInput();
  renderer.resize();
});

$('start').addEventListener('click', begin);
$('restart').addEventListener('click', begin);
$('play-again').addEventListener('click', begin);
$('pause').addEventListener('click', togglePause);
$('resume').addEventListener('click', togglePause);
for (const id of ['help', 'ready-help', 'pause-help']) $(id).addEventListener('click', openHelp);
$('close-help').addEventListener('click', closeHelp);
$('dash').addEventListener('click', doDash);
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
    category.textContent = `${{ weapon: '枪械', terrain: '地形', survival: '生存' }[definition.category] || '强化'} · ${rank} / ${definition.maxRank}`;
    const choose = document.createElement('small');
    choose.textContent = '选择强化 →';
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
  $('result-kicker').textContent = won ? 'GARDEN PROTECTED' : 'EVERY GARDEN GROWS AGAIN';
  $('result-title').textContent = won ? '花园，生生不息。' : '下一次，会开花。';
  $('result-description').textContent = won
    ? '五分钟守卫完成。你把一片废墟，种成了自己的战场。'
    : `坚持到第 ${state.wave} 波。移动留出空间，让自动地形与枪械强化一起守住追兵的路线。`;
  const seconds = Math.floor(state.time);
  const values = [
    [`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`, '守卫时间'],
    [state.kills, '击退怪物'],
    [state.stats.autoPlants, '自动生长'],
    [state.stats.plantKills, '植物击退'],
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
    best = Math.max(best, seconds);
    savedResult = true;
    try {
      localStorage.setItem('bullet-garden.best', String(best));
    } catch {
      /* Optional best score. */
    }
  }
  $('best-record').textContent =
    `最佳守卫 ${Math.floor(best / 60)}:${String(best % 60).padStart(2, '0')} · 地形造成 ${Math.round(state.stats.terrainDamage)} 伤害`;
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
  if (state.phase === 'ready') showPanel('ready');
  else if (state.phase === 'paused') showPanel('pause');
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
  $('level').textContent = `Lv. ${level}`;
  $('experience').textContent = `${xp} / ${nextXp}`;
  $('experience-fill').style.width = `${Math.min(100, (xp / nextXp) * 100)}%`;
  const experienceTrack = $('experience-fill').parentElement;
  experienceTrack.setAttribute('aria-valuenow', xp);
  experienceTrack.setAttribute('aria-valuemax', nextXp);
  const { misses, threshold, nextKind, cooldown, pending } = state.growth;
  $('growth-count').textContent = `${Math.min(misses, threshold)} / ${threshold}`;
  $('growth-fill').style.width = `${Math.min(100, (misses / threshold) * 100)}%`;
  const growthTrack = $('growth-fill').parentElement;
  growthTrack.setAttribute('aria-valuenow', Math.min(misses, threshold));
  growthTrack.setAttribute('aria-valuemax', threshold);
  $('growth-next').textContent =
    pending && cooldown > 0
      ? `${SEEDS[nextKind]?.name || '地形'} · ${cooldown.toFixed(1)}s 后生长`
      : pending
        ? '生长已就绪 · 移动腾出空间'
        : `下一株 · ${SEEDS[nextKind]?.name || '临时地形'}`;
  for (const item of terrainLegend)
    item.classList.toggle('next', item.dataset.terrain === nextKind);
  const coarse = matchMedia('(pointer:coarse)').matches;
  $('dash-cooldown').textContent =
    state.player.dashCooldown > 0
      ? `${state.player.dashCooldown.toFixed(1)}s`
      : coarse
        ? '就绪'
        : 'SPACE';
  $('dash').style.opacity = state.player.dashCooldown > 0 ? '.6' : '1';
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
  if (state.phase === 'playing') {
    accumulator += elapsed;
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
    aim: input.aimActive ? aim : null,
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
        controls: { manualAim: input.aimActive, moveX: input.moveX, moveY: input.moveY },
      }),
  }),
  writable: false,
  configurable: false,
});
syncSound();
syncPhase();
refreshHUD();
requestAnimationFrame(frame);

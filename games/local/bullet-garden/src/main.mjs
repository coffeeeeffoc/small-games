import { LEVELS, SEEDS, UPGRADES } from './config.mjs';
import {
  createGame,
  startGame,
  step,
  selectSeed,
  chooseUpgrade,
  pauseGame,
  resumeGame,
  castSeed,
  dash,
} from './simulation.mjs';
import { GardenRenderer, drawSeedIcon, drawPortrait } from './renderer.mjs';
import { GardenAudio } from './audio.mjs';

const $ = (id) => document.getElementById(id);
const canvas = $('arena');
const renderer = new GardenRenderer(canvas);
const audio = new GardenAudio();
const state = createGame('ruins');
const input = { moveX: 0, moveY: 0, aimX: 900, aimY: 470, firing: false, autoFire: true };
const keys = new Set();
const panels = ['ready', 'pause', 'help', 'upgrade', 'result'];
const seedButtons = [...document.querySelectorAll('[data-seed]')];
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
drawSeedIcon($('guide-flower'), 'flower');
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
      ? '摇杆移动 · 点空地播种 · 普通弹自动射击'
      : 'WASD 移动 · 右键播种 · 普通弹自动射击',
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

function pickSeed(kind) {
  if (helpOpen || !['playing', 'ready'].includes(state.phase)) return;
  if (selectSeed(state, kind)) {
    constrainAim(aim);
    refreshHUD();
    if (state.phase === 'playing') announce(`${SEEDS[kind].name} · ${SEEDS[kind].subtitle}`, 2);
  }
}

function plant() {
  if (state.phase !== 'playing' || helpOpen) return;
  audio.unlock();
  if (!castSeed(state, aim)) {
    if (state.seeds[state.selectedSeed] < 1) announce('种子正在恢复，先用其他植物布局', 2);
    else if (state.seedCooldown <= 0) announce('瞄准庭院里的空地播种', 2);
  }
  refreshHUD();
}

function doDash() {
  const direction =
    Math.hypot(input.moveX, input.moveY) > 0.1
      ? { x: input.moveX, y: input.moveY }
      : { x: aim.x - state.player.x, y: aim.y - state.player.y };
  dash(state, direction);
  audio.unlock();
  refreshHUD();
}

function constrainAim(world) {
  const bounds = LEVELS[state.levelId].bounds;
  const radius = SEEDS[state.selectedSeed].radius;
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
  if (event.pointerType === 'mouse') input.firing = true;
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
  if (event.pointerType !== 'mouse' && state.phase === 'playing') {
    updateAim(event);
    plant();
  }
  input.firing = false;
  fieldPointer = null;
  pointerOnField = event.pointerType === 'mouse';
});
for (const type of ['pointercancel', 'lostpointercapture'])
  canvas.addEventListener(type, (event) => {
    if (event.pointerId === fieldPointer) {
      fieldPointer = null;
      input.firing = false;
      pointerOnField = false;
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
    plant();
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
  'Digit3',
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
  if (event.code === 'KeyE') plant();
  if (event.code === 'Space') doDash();
  if (event.code.startsWith('Digit'))
    pickSeed(['thorn', 'ice', 'mushroom'][Number(event.code.slice(5)) - 1]);
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
$('cast').addEventListener('click', plant);
$('dash').addEventListener('click', doDash);
for (const button of seedButtons)
  button.addEventListener('click', () => pickSeed(button.dataset.seed));
$('auto-fire').addEventListener('click', () => {
  input.autoFire = !input.autoFire;
  refreshHUD();
  announce(input.autoFire ? '自动射击已开启' : '自动射击已关闭 · 桌面可按住左键射击', 2);
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
  for (const id of state.upgradeChoices) {
    const definition = UPGRADES.find((upgrade) => upgrade.id === id);
    if (!definition) continue;
    const button = document.createElement('button');
    button.className = 'upgrade-option';
    button.dataset.upgrade = id;
    const icon = document.createElement('canvas');
    icon.width = 180;
    icon.height = 140;
    const title = document.createElement('strong');
    title.textContent = definition.name;
    const description = document.createElement('p');
    description.textContent = definition.description;
    const choose = document.createElement('small');
    choose.textContent = '选择强化 →';
    button.append(icon, title, description, choose);
    $('upgrade-options').append(button);
    drawSeedIcon(icon, definition.kind || 'thorn');
    button.addEventListener('click', () => {
      if (chooseUpgrade(state, id)) {
        syncPhase();
        refreshHUD();
        announce(`获得 ${definition.name} · 第 ${state.wave} 波开始`, 3);
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
    : `坚持到第 ${state.wave} 波。试试提前种下荆棘，再用蘑菇守住追兵的路线。`;
  const seconds = Math.floor(state.time);
  const values = [
    [`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`, '守卫时间'],
    [state.kills, '击退怪物'],
    [state.stats.plantsGrown, '落空生长'],
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
  for (const button of seedButtons) {
    const kind = button.dataset.seed,
      selected = state.selectedSeed === kind;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
    $(`stock-${kind}`).textContent = Math.floor(state.seeds[kind]);
    const regen =
      state.seeds[kind] < SEEDS[kind].capacity
        ? (state.seedRegen?.[kind] || 0) / SEEDS[kind].regenSeconds
        : 0;
    button.querySelector('.seed-cooldown').style.transform = `scaleX(${Math.min(1, regen)})`;
  }
  const coarse = matchMedia('(pointer:coarse)').matches;
  $('cast-cooldown').textContent =
    state.seedCooldown > 0 ? `${state.seedCooldown.toFixed(1)}s` : coarse ? '点空地' : '右键 / E';
  $('dash-cooldown').textContent =
    state.player.dashCooldown > 0
      ? `${state.player.dashCooldown.toFixed(1)}s`
      : coarse
        ? '就绪'
        : 'SPACE';
  $('dash').style.opacity = state.player.dashCooldown > 0 ? '.6' : '1';
  $('cast').style.opacity = state.seeds[state.selectedSeed] < 1 ? '.5' : '1';
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
    aim,
    planting:
      state.phase === 'playing' && (pointerOnField || matchMedia('(pointer:coarse)').matches),
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
  value: Object.freeze({ snapshot: () => structuredClone(state) }),
  writable: false,
  configurable: false,
});
syncSound();
syncPhase();
refreshHUD();
requestAnimationFrame(frame);

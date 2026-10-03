import { LEVELS, BOONS, SKILLS, UPGRADES } from './config.mjs';
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
const skillButtons = [...document.querySelectorAll('[data-skill-slot]')];
const boonButtons = [...document.querySelectorAll('[data-boon]')];
const prepSkills = ['blast', 'gale'];
let prepBoon = null,
  armed = false,
  fieldArmed = false;
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
let gameSpeed = 1;
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
  if (!prepBoon || !configureLoadout(state, { boon: prepBoon, skills: prepSkills })) return;
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
      ? '摇杆移动 · 满能后点技能，再点战场释放'
      : 'WASD 移动 · 1 / 2 选满能技能 · 点击战场释放',
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

function prepare() {
  resetInput();
  Object.assign(state, createGame(state.levelId));
  helpOpen = false;
  previousPhase = '';
  savedResult = false;
  if (prepBoon) configureLoadout(state, { boon: prepBoon, skills: prepSkills });
  refreshPreparation();
  syncPhase();
  refreshHUD();
}

function refreshPreparation() {
  for (const button of boonButtons) {
    const selected = button.dataset.boon === prepBoon;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
  $('boon-description').textContent = prepBoon
    ? BOONS[prepBoon].description
    : '先选一个增益，后续强化还可解锁更多地形。';
  for (let index = 0; index < 2; index++) {
    $(`loadout-skill-${index}`).value = prepSkills[index];
    $(`loadout-description-${index}`).textContent = SKILLS[prepSkills[index]].description;
  }
  $('start').disabled = !prepBoon;
  $('start').firstChild.textContent = prepBoon ? '进入花园 ' : '先选择庭院增益 ';
}

const skillLabels = { blast: '爆破', gale: '大风', cart: '冲锋车', horse: '战马', laser: '激光' };
for (let index = 0; index < 2; index++) {
  const select = $(`loadout-skill-${index}`);
  for (const definition of Object.values(SKILLS)) {
    const option = document.createElement('option');
    option.value = definition.id;
    option.textContent = `${skillLabels[definition.id]} · ${definition.name}`;
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
for (const button of boonButtons)
  button.addEventListener('click', () => {
    prepBoon = button.dataset.boon;
    refreshPreparation();
  });

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
  $('result-kicker').textContent = won ? 'GARDEN PROTECTED' : 'EVERY GARDEN GROWS AGAIN';
  $('result-title').textContent = won ? '花园，生生不息。' : '下一次，会开花。';
  $('result-description').textContent = won
    ? '五分钟守卫完成。你的庭院增益与能量战术，守住了这片花园。'
    : `坚持到第 ${state.wave} 波。让地形拖慢追兵，把充满的能量留给最需要的时刻。`;
  const seconds = Math.floor(state.time);
  const values = [
    [`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`, '守卫时间'],
    [state.kills, '击退怪物'],
    [state.stats.skillCasts, '手动释放'],
    [state.progression.level, '守望等级'],
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
  $('active-boons').textContent = state.boons.length
    ? state.boons.map((id) => BOONS[id].name).join(' · ')
    : '尚未选择';
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

import * as Engine from './engine.mjs';
import { LEVELS } from './levels.mjs';
import { createRenderer, icon, renderVignette } from './art.mjs';

const { createGame, step, command, getRoom, getSnapshot, getNearbyInteractable, getObjective } =
  Engine;
const $ = (selector) => document.querySelector(selector);
const esc = (text) =>
  String(text ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const saveKey = 'ink-is-everything:action-chapter:v2';
let state = createGame(),
  saved = null,
  paused = false,
  muted = true,
  storageAvailable = true;
let navPath = [],
  navAction = null,
  aimPoint = null,
  lockedEnemy = null,
  canvasPointer = null,
  drawStroke = null,
  drawBridge = null,
  drawMode = false;
let movePointer = null,
  firePointer = null,
  meleePointer = null,
  moveStick = { x: 0, y: 0 },
  fireAim = null,
  canvasFire = false,
  fireHeld = false,
  meleeHeld = false,
  dashQueued = false,
  fireQueued = false,
  meleeQueued = false;
let lastMessage = '',
  feedbackUntil = 0,
  hudClock = 0,
  saveClock = 0,
  audio = null,
  lastFrame = performance.now(),
  accumulator = 0,
  lastModalFocus = null;
let lastRoom = state.roomId,
  lastStatus = state.status,
  lastShots = 0,
  lastHits = 0,
  lastHp = state.player.hp,
  ended = false,
  navStall = 0;
const keys = new Set();
const canvas = $('#game-canvas');
const renderer = createRenderer(canvas);
const level = () => LEVELS[state.levelId];
const active = () => state.status === 'playing' && !paused && !document.hidden;

try {
  muted = localStorage.getItem('ink-is-everything:muted') !== 'false';
  const data = localStorage.getItem(saveKey);
  if (data && Engine.restoreGame) {
    const restored = Engine.restoreGame(JSON.parse(data));
    if (restored?.status === 'playing') saved = restored;
  }
} catch {
  /* A missing, outdated or disabled save never blocks the chapter. */
}

function save() {
  try {
    if (state.status === 'playing') {
      const snapshot = Engine.serializeGame ? Engine.serializeGame(state) : state;
      localStorage.setItem(
        saveKey,
        typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot),
      );
    } else if (state.status === 'won' || state.status === 'lost') localStorage.removeItem(saveKey);
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
}
function sound(kind) {
  if (muted) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    const oscillator = audio.createOscillator(),
      gain = audio.createGain(),
      now = audio.currentTime;
    const hz =
      { shot: 155, hit: 90, hurt: 66, dash: 350, pickup: 600, heal: 440, draw: 275, win: 780 }[
        kind
      ] || 290;
    oscillator.type = kind === 'hurt' || kind === 'shot' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(hz, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      hz * (kind === 'win' ? 1.6 : 0.55),
      now + 0.13,
    );
    gain.gain.setValueAtTime(kind === 'shot' ? 0.025 : 0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(now + 0.18);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  } catch {
    /* Audio is optional. */
  }
}
function feedback(text, error = false, duration = 3200) {
  $('#feedback').textContent = text;
  $('#feedback').className = `visible${error ? ' error' : ''}`;
  feedbackUntil = performance.now() + duration;
}
function bindPress(selector, handler) {
  const button = $(selector);
  button.addEventListener('pointerdown', (event) => {
    if (button.disabled || event.button !== 0) return;
    event.preventDefault();
    handler(event);
  });
  button.addEventListener('click', (event) => {
    if (!button.disabled && event.detail === 0) handler(event);
  });
}
function setText(selector, text) {
  const el = $(selector);
  if (el.textContent !== String(text)) el.textContent = text;
}
function updateHUD() {
  const p = state.player;
  $('#game-root').dataset.status = state.status;
  $('#game-root').dataset.started = String(state.status !== 'ready');
  $('#game-root').dataset.paused = String(paused);
  setText('#ink-value', p.ink);
  setText('#seal-value', state.seals);
  $('#ink-fill').style.width = `${(p.ink / p.maxInk) * 100}%`;
  $('#ink-fill').style.background = p.ink < 12 ? '#bf8767' : '';
  $('.ink-track').setAttribute('aria-valuenow', p.ink);
  $('.ink-track').setAttribute('aria-valuemax', p.maxInk);
  if ($('#hearts').dataset.value !== `${p.hp}/${p.maxHp}`) {
    $('#hearts').innerHTML = Array.from({ length: p.maxHp }, (_, i) =>
      icon('heart').replace('<svg', `<svg class="${i >= p.hp ? 'empty' : ''}"`),
    ).join('');
    $('#hearts').dataset.value = `${p.hp}/${p.maxHp}`;
    $('#hearts').dataset.label = `生命 ${p.hp} / ${p.maxHp}`;
    $('#hearts').setAttribute('aria-label', `生命${p.hp}/${p.maxHp}`);
  }
  setText('#room-name', getRoom(state).name);
  setText('#objective', getObjective(state));
  const mapMarkup = level()
    .rooms.map(
      (room) =>
        `<span class="map-dot ${room.id === state.roomId ? 'current' : state.rooms[room.id].cleared && state.rooms[room.id].visited ? 'cleared' : ''}" title="${esc(room.name)}">${esc(room.name.slice(0, 2))}<small>${room.id === state.roomId ? '所在' : state.rooms[room.id].cleared && state.rooms[room.id].visited ? '已清' : state.rooms[room.id].visited ? '已访' : '未访'}</small></span>`,
    )
    .join('');
  if ($('#room-map').innerHTML !== mapMarkup) $('#room-map').innerHTML = mapMarkup;
  const nearby = state.status === 'playing' ? getNearbyInteractable(state) : null;
  $('#interact').hidden = !nearby || paused;
  if (nearby)
    setText(
      '#interact-label',
      nearby.kind === 'portal'
        ? nearby.label
        : nearby.kind === 'merchant'
          ? '与契约师交易'
          : nearby.kind === 'spring'
            ? '饮用洗笔泉'
            : '开启墨匣',
    );
  setText(
    '#context-hint',
    drawMode ? '从桥下笔尖锚点，拖到对岸圆点' : p.ink < 2 ? '墨水见底：干笔与闪避永远免费' : '',
  );
  $('#heal').disabled = p.hp >= p.maxHp || p.ink < level().rules.healCost || p.healCd > 0;
  $('#dash .cooldown-mask').style.transform =
    `translateY(${100 - Math.min(1, p.dashCd / (state.contracts.includes('brush-step') ? 0.72 : level().rules.dashCooldown)) * 100}%)`;
  $('#melee .cooldown-mask').style.transform =
    `translateY(${100 - Math.min(1, p.meleeCd / level().rules.meleeCooldown) * 100}%)`;
  setText('#fire b', p.ink >= level().rules.attackCost ? '墨弹' : '干笔');
  setText('#fire small', p.ink >= level().rules.attackCost ? '按住 · 2 墨' : '近身 · 0 墨');
  $('#fire').setAttribute(
    'aria-label',
    p.ink >= 2 ? '按住发射墨弹，每发2墨水' : '墨水耗尽，按住使用免费干笔近战',
  );
  $('#tutorial-hint').classList.toggle(
    'faded',
    state.time > 9 ||
      state.stats.enemiesDefeated > 0 ||
      $('#feedback').classList.contains('visible'),
  );
  $('#draw-tool').setAttribute('aria-pressed', String(drawMode));
  $('#game-root').classList.toggle(
    'game-quiet',
    state.status === 'ready' || paused || state.status === 'won' || state.status === 'lost',
  );
}
function syncSoundButton() {
  $('#sound').innerHTML = icon(muted ? 'muted' : 'sound');
  $('#sound').setAttribute('aria-label', muted ? '开启声音' : '静音');
}
function cancelInput() {
  const captured = [
    [$('#joystick'), movePointer],
    [$('#fire'), firePointer],
    [canvas, canvasPointer],
    [$('#melee'), meleePointer],
  ];
  keys.clear();
  moveStick = { x: 0, y: 0 };
  fireAim = null;
  movePointer = null;
  firePointer = null;
  canvasPointer = null;
  meleePointer = null;
  fireHeld = false;
  canvasFire = false;
  meleeHeld = false;
  dashQueued = false;
  fireQueued = false;
  meleeQueued = false;
  drawStroke = null;
  drawBridge = null;
  navPath = [];
  navAction = null;
  $('#stick-thumb').style.transform = '';
  $('#fire .aim-thumb').style.transform = '';
  document.querySelectorAll('.held,.aiming').forEach((el) => el.classList.remove('held', 'aiming'));
  for (const [element, id] of captured)
    if (id !== null && element.hasPointerCapture(id)) element.releasePointerCapture(id);
}
function start(fresh = false) {
  if (saved && !fresh) state = saved;
  else {
    state = createGame();
    command(state, { type: 'start' });
  }
  saved = null;
  paused = false;
  ended = false;
  drawMode = false;
  cancelInput();
  $('#cover').hidden = true;
  $('#modal').close();
  lastRoom = state.roomId;
  lastStatus = state.status;
  lastHp = state.player.hp;
  lastHits = state.stats.hits;
  lastShots = state.stats.shots;
  lastFrame = performance.now();
  accumulator = 0;
  save();
  updateHUD();
  renderer.render(state, { time: state.time });
  feedback('沿东侧门前进。墨弹远攻，干笔近战；红色笔迹出现时，侧向闪避。', false, 4200);
  canvas.focus({ preventScroll: true });
}
function perform(action, allowModal = false) {
  if (state.status !== 'playing' || (paused && !allowModal)) return { ok: false };
  const beforeRoom = state.roomId,
    result = command(state, action);
  feedback(result.message, !result.ok);
  if (result.ok) {
    if (action.type === 'heal') sound('heal');
    if (action.type === 'draw') {
      drawMode = false;
      sound('draw');
    }
    if (action.type === 'buy') sound('pickup');
    if (beforeRoom !== state.roomId) onRoomChanged();
    if (result.shop) showShop();
    save();
    updateHUD();
  }
  return result;
}
function onRoomChanged() {
  lastRoom = state.roomId;
  navPath = [];
  navAction = null;
  aimPoint = null;
  lockedEnemy = null;
  canvasFire = false;
  drawStroke = null;
  drawBridge = null;
  drawMode = false;
  feedback(getRoom(state).subtitle);
  save();
  updateHUD();
}

function solids() {
  const room = getRoom(state);
  return room.obstacles.filter(
    (o) => !o.bridgeId || !room.bridges.find((b) => b.id === o.bridgeId)?.drawn,
  );
}
function pointClear(point, radius = state.player.r + 4) {
  const room = getRoom(state);
  if (
    point.x < 33 + radius ||
    point.y < 33 + radius ||
    point.x > room.width - 33 - radius ||
    point.y > room.height - 33 - radius
  )
    return false;
  return !solids().some(
    (o) =>
      Math.hypot(
        point.x - clamp(point.x, o.x, o.x + o.w),
        point.y - clamp(point.y, o.y, o.y + o.h),
      ) < radius,
  );
}
// Tap-to-walk uses a small grid path; stick and keyboard always give direct movement.
function routeTo(target) {
  const grid = 24,
    room = getRoom(state),
    cols = Math.ceil(room.width / grid),
    rows = Math.ceil(room.height / grid);
  const cell = (point) => ({
    x: clamp(Math.floor(point.x / grid), 0, cols - 1),
    y: clamp(Math.floor(point.y / grid), 0, rows - 1),
  });
  const point = (c) => ({ x: c.x * grid + grid / 2, y: c.y * grid + grid / 2 });
  const begin = cell(state.player),
    goal = cell(target),
    queue = [begin],
    seen = new Map([[`${begin.x},${begin.y}`, null]]);
  let final = null;
  for (let i = 0; i < queue.length && i < 1200; i++) {
    const current = queue[i];
    if (current.x === goal.x && current.y === goal.y) {
      final = current;
      break;
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const next = { x: current.x + dx, y: current.y + dy },
        key = `${next.x},${next.y}`;
      if (
        next.x < 0 ||
        next.y < 0 ||
        next.x >= cols ||
        next.y >= rows ||
        seen.has(key) ||
        !pointClear(point(next))
      )
        continue;
      if (
        dx &&
        dy &&
        (!pointClear(point({ x: current.x + dx, y: current.y })) ||
          !pointClear(point({ x: current.x, y: current.y + dy })))
      )
        continue;
      seen.set(key, current);
      queue.push(next);
    }
  }
  if (!final) return [];
  const path = [];
  for (let c = final; c; c = seen.get(`${c.x},${c.y}`)) path.unshift(point(c));
  path.shift();
  if (pointClear(target)) path.push(target);
  return path;
}
function walkTo(point, interaction = null) {
  const dest = { x: clamp(point.x, 58, 902), y: clamp(point.y, 58, 542) };
  navPath = routeTo(dest);
  navAction = interaction;
  navStall = 0;
  if (!navPath.length && dist(state.player, dest) > 40) {
    feedback('这里还不能通过。绕开石墙，或先画出墨桥。', true);
    navAction = null;
  }
}
function inputFrame(dt) {
  const p = state.player;
  let moveX = moveStick.x,
    moveY = moveStick.y;
  const keyX =
    Number(keys.has('d') || keys.has('arrowright')) -
    Number(keys.has('a') || keys.has('arrowleft'));
  const keyY =
    Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
  if (keyX || keyY) {
    moveX = keyX;
    moveY = keyY;
    navPath = [];
    navAction = null;
  }
  if (Math.hypot(moveStick.x, moveStick.y) > 0.1) {
    navPath = [];
    navAction = null;
  }
  if (!moveX && !moveY && navPath.length) {
    while (navPath.length && dist(p, navPath[0]) < 13) navPath.shift();
    if (navPath.length) {
      const d = dist(p, navPath[0]);
      moveX = (navPath[0].x - p.x) / d;
      moveY = (navPath[0].y - p.y) / d;
    }
  }
  if (navAction && dist(p, navAction) < 94) {
    const object = navAction;
    navPath = [];
    navAction = null;
    moveX = moveY = 0;
    perform({ type: 'interact', objectId: object.id });
  }
  let aim = aimPoint;
  const alive = state.enemies.filter((e) => e.hp > 0);
  const target =
    alive.find((e) => e.id === lockedEnemy) || alive.sort((a, b) => dist(p, a) - dist(p, b))[0];
  if (fireAim) aim = { x: p.x + fireAim.x * 400, y: p.y + fireAim.y * 400 };
  else if ((fireHeld || !aim) && target) aim = { x: target.x, y: target.y };
  else if (!aim) aim = { x: p.x + p.aimX * 200, y: p.y + p.aimY * 200 };
  const shooting = fireHeld || canvasFire || fireQueued;
  const input = {
    moveX,
    moveY,
    aimX: aim.x,
    aimY: aim.y,
    shoot: shooting && p.ink >= level().rules.attackCost,
    melee:
      meleeHeld || meleeQueued || keys.has('f') || (shooting && p.ink < level().rules.attackCost),
    dash: dashQueued,
  };
  dashQueued = false;
  fireQueued = false;
  meleeQueued = false;
  return input;
}

canvas.addEventListener('contextmenu', (event) => event.preventDefault());
canvas.addEventListener('pointerdown', (event) => {
  if (!active() || canvasPointer !== null) return;
  event.preventDefault();
  canvas.focus({ preventScroll: true });
  const point = renderer.screenToWorld(event.clientX, event.clientY),
    room = getRoom(state);
  if (event.button === 2) {
    aimPoint = point;
    meleeHeld = true;
    meleeQueued = true;
    canvasPointer = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    return;
  }
  if (event.button !== 0) return;
  const bridge = room.bridges.find((b) => !b.drawn && dist(point, b.from) < 57);
  if (bridge && dist(state.player, bridge.from) <= 125) {
    drawBridge = bridge;
    drawStroke = [point];
    canvasPointer = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    navPath = [];
    return;
  }
  if (drawMode) {
    feedback(bridge ? '先走近桥下方的笔尖锚点。' : '从裂隙下方的笔尖锚点拖到对岸圆点。', true);
    return;
  }
  const enemy = state.enemies.filter((e) => e.hp > 0).find((e) => dist(point, e) < e.r + 35);
  if (enemy) {
    lockedEnemy = enemy.id;
    aimPoint = point;
    canvasFire = true;
    fireQueued = true;
    canvasPointer = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    return;
  }
  const object = [...room.objects.filter((o) => !o.used), ...room.portals].find(
    (o) => dist(point, o) < o.r + 35,
  );
  if (object) {
    if (dist(state.player, object) < 106) perform({ type: 'interact', objectId: object.id });
    else walkTo(object, object);
    return;
  }
  if (event.pointerType === 'mouse' && (event.shiftKey || keys.has('shift'))) {
    aimPoint = point;
    canvasFire = true;
    fireQueued = true;
    canvasPointer = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    return;
  }
  walkTo(point);
});
canvas.addEventListener('pointermove', (event) => {
  const point = renderer.screenToWorld(event.clientX, event.clientY);
  if (drawStroke && canvasPointer === event.pointerId) {
    if (dist(drawStroke.at(-1), point) > 3) drawStroke.push(point);
    return;
  }
  if (!active()) return;
  if (event.pointerType === 'mouse' || canvasPointer === event.pointerId) aimPoint = point;
});
function releaseCanvas(event, cancelled = false) {
  if (event.pointerId !== canvasPointer) return;
  if (drawStroke && drawBridge && !cancelled) {
    const end = renderer.screenToWorld(event.clientX, event.clientY);
    const length = drawStroke.slice(1).reduce((sum, p, i) => sum + dist(p, drawStroke[i]), 0);
    if (dist(end, drawBridge.to) < 60 && length > dist(drawBridge.from, drawBridge.to) * 0.65)
      perform({ type: 'draw', bridgeId: drawBridge.id });
    else feedback('笔迹没有连到对岸，未消耗墨水。再试一次。');
  }
  drawStroke = null;
  drawBridge = null;
  canvasFire = false;
  meleeHeld = false;
  canvasPointer = null;
  if (cancelled) {
    fireQueued = false;
    meleeQueued = false;
  }
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
}
canvas.addEventListener('pointerup', (event) => releaseCanvas(event));
canvas.addEventListener('pointercancel', (event) => releaseCanvas(event, true));
canvas.addEventListener('lostpointercapture', (event) => releaseCanvas(event, true));

function updateStick(event) {
  const rect = $('#joystick').getBoundingClientRect(),
    max = rect.width * 0.3;
  let x = event.clientX - rect.left - rect.width / 2,
    y = event.clientY - rect.top - rect.height / 2,
    d = Math.hypot(x, y);
  if (d > max) {
    x = (x / d) * max;
    y = (y / d) * max;
    d = max;
  }
  moveStick = d < 5 ? { x: 0, y: 0 } : { x: x / max, y: y / max };
  $('#stick-thumb').style.transform = `translate(${x}px,${y}px)`;
}
$('#joystick').addEventListener('pointerdown', (event) => {
  if (!active() || movePointer !== null) return;
  event.preventDefault();
  movePointer = event.pointerId;
  navPath = [];
  navAction = null;
  $('#joystick').setPointerCapture(event.pointerId);
  updateStick(event);
});
$('#joystick').addEventListener('pointermove', (event) => {
  if (event.pointerId === movePointer) {
    event.preventDefault();
    updateStick(event);
  }
});
function releaseStick(event) {
  if (event.pointerId !== movePointer) return;
  movePointer = null;
  moveStick = { x: 0, y: 0 };
  $('#stick-thumb').style.transform = '';
  if ($('#joystick').hasPointerCapture(event.pointerId))
    $('#joystick').releasePointerCapture(event.pointerId);
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
  $('#joystick').addEventListener(type, releaseStick);
function updateFireAim(event) {
  const rect = $('#fire').getBoundingClientRect(),
    x = event.clientX - rect.left - rect.width / 2,
    y = event.clientY - rect.top - rect.height / 2,
    d = Math.hypot(x, y);
  fireAim = d > 15 ? { x: x / d, y: y / d } : null;
  $('#fire').classList.toggle('aiming', Boolean(fireAim));
  $('#fire .aim-thumb').style.transform = fireAim
    ? `translate(${fireAim.x * Math.min(d, 42)}px,${fireAim.y * Math.min(d, 42)}px)`
    : '';
}
$('#fire').addEventListener('pointerdown', (event) => {
  if (!active() || firePointer !== null) return;
  event.preventDefault();
  firePointer = event.pointerId;
  fireHeld = true;
  fireQueued = true;
  $('#fire').classList.add('held');
  $('#fire').setPointerCapture(event.pointerId);
  updateFireAim(event);
});
$('#fire').addEventListener('pointermove', (event) => {
  if (event.pointerId === firePointer) {
    event.preventDefault();
    updateFireAim(event);
  }
});
function releaseFire(event) {
  if (event.pointerId !== firePointer) return;
  if (event.type !== 'pointerup') fireQueued = false;
  firePointer = null;
  fireHeld = false;
  fireAim = null;
  $('#fire').classList.remove('held', 'aiming');
  $('#fire .aim-thumb').style.transform = '';
  if ($('#fire').hasPointerCapture(event.pointerId))
    $('#fire').releasePointerCapture(event.pointerId);
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
  $('#fire').addEventListener(type, releaseFire);
$('#melee').addEventListener('pointerdown', (event) => {
  if (!active()) return;
  event.preventDefault();
  meleeHeld = true;
  meleeQueued = true;
  meleePointer = event.pointerId;
  $('#melee').classList.add('held');
  $('#melee').setPointerCapture(event.pointerId);
});
function releaseMelee(event) {
  if (event.pointerId !== meleePointer) return;
  if (event.type !== 'pointerup') meleeQueued = false;
  meleePointer = null;
  meleeHeld = false;
  $('#melee').classList.remove('held');
  if ($('#melee').hasPointerCapture(event.pointerId))
    $('#melee').releasePointerCapture(event.pointerId);
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
  $('#melee').addEventListener(type, releaseMelee);
$('#dash').addEventListener('pointerdown', (event) => {
  if (!active()) return;
  event.preventDefault();
  dashQueued = true;
  sound('dash');
});
bindPress('#heal', () => perform({ type: 'heal' }));
bindPress('#interact', () => perform({ type: 'interact' }));
bindPress('#draw-tool', () => {
  if (!active()) return;
  const bridge = getRoom(state).bridges.find((b) => !b.drawn);
  if (!bridge) {
    feedback('墨桥在落笔庭院北侧。主路不需要花墨开门。');
    return;
  }
  if (dist(state.player, bridge.from) > 125) {
    walkTo({ x: bridge.from.x, y: bridge.from.y + 36 });
    feedback('正在走向桥下锚点。到达后，从笔尖拖到对岸。');
    drawMode = false;
  } else {
    drawMode = !drawMode;
    feedback(
      drawMode
        ? `连接两个锚点，花 ${bridge.cost} 墨画桥；宝库有 34 墨与 2 生命。`
        : '已回到移动与战斗。',
    );
  }
  updateHUD();
});

function openModal(html) {
  cancelInput();
  paused = true;
  lastModalFocus = document.activeElement;
  $('#modal-content').innerHTML = html;
  if (!$('#modal').open) $('#modal').showModal();
  $('#modal-title').tabIndex = -1;
  $('#modal-title').focus({ preventScroll: true });
  updateHUD();
  save();
}
function closeModal() {
  $('#modal').close();
}
$('#modal').addEventListener('close', () => {
  paused = false;
  cancelInput();
  lastFrame = performance.now();
  accumulator = 0;
  updateHUD();
  if (lastModalFocus?.isConnected) lastModalFocus.focus({ preventScroll: true });
});
bindPress('#modal-close', closeModal);
// Resume explicitly. A modal opened on pointerdown can receive that same
// gesture's compatibility click on its backdrop after the page becomes inert.
// Treating that click as dismissal would immediately undo a touch pause.
function showPause() {
  if ($('#modal').open) {
    closeModal();
    return;
  }
  openModal(
    `<span class="modal-kicker">BETWEEN TWO STROKES</span><h2 id="modal-title">让墨，歇一会儿。</h2><p>${state.status === 'ready' ? '纸上的世界正在等你。' : state.status !== 'playing' ? '这一页已经写完。' : storageAvailable ? '敌人和时间都已暂停，旅程已保存在此浏览器。' : '敌人和时间已暂停。浏览器未能保存，请保持页面打开。'}</p><button id="resume" class="primary-button" data-close>继续旅程</button><button class="secondary-button" id="modal-sound">${muted ? '开启声音' : '关闭声音'}</button><button class="secondary-button" data-restart>重新落笔</button>`,
  );
}
function showHelp() {
  openModal(
    `<span class="modal-kicker">THE TRAVELER'S HANDBOOK</span><h2 id="modal-title">笔，要握在手里。</h2><ul class="help-list"><li><b>移动：</b>左下摇杆 / WASD / 方向键。也可以点地面、门或人物，旅人会自动走近。</li><li><b>墨弹：</b>按住右下墨弹，自动瞄准最近敌人；向外拖动可手动瞄准。电脑可直接按住敌人射击。每发 2 墨。</li><li><b>干笔与闪避：</b>免费近战伤害 2，需要靠近；闪避有短暂无敌。红色预警出现后侧向避开，敌人出招后的空当再近身。F 干笔，空格闪避，右键也能干笔。</li><li><b>绘桥：</b>庭院北侧有两个锚点。走近下方笔尖，拖线连到对岸，花 8 墨架桥。桥后宝库藏 34 墨与 2 生命；不画桥也能走免费主路。</li><li><b>补给：</b>战利品靠近自动拾取。Q / 疗伤按钮花 10 墨回 3 生命；洗笔驿站有一次免费泉水，也能用墨签永久契约。</li><li><b>目标：</b>拿到两枚钥印，进入驿站东门击败两阶段守门者。墨水见底仍可挥笔与闪避。Esc 暂停，E 交互。</li></ul><button class="primary-button" data-close>握紧画笔，继续</button>`,
  );
}
function askRestart() {
  openModal(
    `<span class="modal-kicker">A CLEAN PAGE</span><h2 id="modal-title">重新落笔？</h2><p>本次旅程会被新的空白页替代。重新获得 64 墨水与完整生命。</p><button id="confirm-restart" class="primary-button">重新开始</button><button class="secondary-button" data-close>保留这段旅程</button>`,
  );
}
function showShop() {
  const contracts = level().contracts;
  openModal(
    `<span class="modal-kicker">THE NAMELESS SCRIBE</span><h2 id="modal-title">以墨，签下可能。</h2><p>同一瓶墨，也是你的武器与伤药。<br>现在持有 <b id="shop-ink">${state.player.ink}</b> 墨，契约持续至本局结束。</p>${contracts.map((c) => `<button class="shop-option" data-buy="${c.id}" ${state.contracts.includes(c.id) || state.player.ink < c.price ? 'disabled' : ''}><strong>${esc(c.name)}<span>${state.contracts.includes(c.id) ? '已签订' : c.price + ' 墨'}</span></strong><small>${esc(c.description)}</small></button>`).join('')}<p class="contract-tags" id="shop-message">选择你的打法，不必签下每一份。</p><button class="secondary-button" data-close>收笔，继续前行</button>`,
  );
}
function showResult() {
  const won = state.status === 'won',
    s = state.stats,
    time = Math.floor(state.time),
    minutes = Math.floor(time / 60),
    seconds = String(time % 60).padStart(2, '0');
  openModal(
    `<span class="modal-kicker">THE END OF THIS PAGE</span><h2 id="modal-title">${won ? '你亲手写出了归途。' : '下一笔，会更稳。'}</h2><p>${won ? '两枚钥印，六处遗迹。你花掉的每一滴墨，都改变了这趟旅程。' : '红色笔迹是敌人的预告。侧向闪避，绕开弹幕，利用石墙，再抓住收招的空当。'}</p><div class="result-stats"><div><b>${minutes}:${seconds}</b><small>冒险时间</small></div><div><b>${s.enemiesDefeated}</b><small>击散墨灵</small></div><div><b>${state.player.ink}</b><small>余墨</small></div></div><div class="spent-summary">墨水去向：战斗 ${s.spent.attack} · 绘桥 ${s.spent.explore} · 治疗 ${s.spent.heal} · 契约 ${s.spent.trade}<br>干笔 ${s.freeAttacks} 次 · 闪避 ${s.dashes} 次 · 探索 ${s.roomsVisited}/${level().rooms.length} 处</div><button id="result-restart" class="primary-button">${won ? '换一种打法，再写一页' : '重新落笔'}</button><button class="secondary-button" data-close>看看这张地图</button>`,
  );
}
function toggleSound() {
  muted = !muted;
  try {
    localStorage.setItem('ink-is-everything:muted', String(muted));
  } catch {}
  syncSoundButton();
  sound('pickup');
  if ($('#modal-sound')) $('#modal-sound').textContent = muted ? '开启声音' : '关闭声音';
}
bindPress('#start-game', () => start());
bindPress('#new-game', askRestart);
bindPress('#pause', showPause);
bindPress('#help', showHelp);
bindPress('#sound', toggleSound);
function handleDialogButton(event) {
  const b = event.target.closest('button');
  if (!b || b.disabled || !b.closest('#modal')) return;
  if (event.type === 'pointerdown') event.preventDefault();
  if (b.hasAttribute('data-close')) closeModal();
  if (b.hasAttribute('data-restart')) askRestart();
  if (b.id === 'confirm-restart' || b.id === 'result-restart') {
    closeModal();
    start(true);
  }
  if (b.id === 'modal-sound') toggleSound();
  if (b.dataset.buy) {
    const result = perform({ type: 'buy', contractId: b.dataset.buy }, true);
    if (result.ok) {
      showShop();
      $('#shop-message').textContent = result.message;
    } else $('#shop-message').textContent = result.message;
  }
}
document.addEventListener('pointerdown', (event) => {
  if (event.button === 0) handleDialogButton(event);
});
document.addEventListener('click', (event) => {
  if (event.detail === 0) handleDialogButton(event);
});
document.addEventListener('keydown', (event) => {
  if (
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)
  )
    return;
  const key = event.key.toLowerCase();
  if (key === 'escape') {
    if (!$('#modal').open) {
      event.preventDefault();
      showPause();
    }
    return;
  }
  if ($('#modal').open) {
    // Gameplay keys must not activate the button that opened the dialog.
    // Enter and Tab remain available for keyboard navigation.
    if (
      [
        'w',
        'a',
        's',
        'd',
        'arrowup',
        'arrowdown',
        'arrowleft',
        'arrowright',
        'f',
        'q',
        'e',
        'r',
        ' ',
      ].includes(key)
    )
      event.preventDefault();
    return;
  }
  if (!active()) return;
  if (
    ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'f', ' '].includes(key)
  ) {
    event.preventDefault();
    keys.add(key);
  }
  if (event.repeat) return;
  if (key === ' ') {
    dashQueued = true;
    sound('dash');
  } else if (key === 'f') meleeQueued = true;
  else if (key === 'q') perform({ type: 'heal' });
  else if (key === 'e') perform({ type: 'interact' });
  else if (key === 'r') $('#draw-tool').click();
});
document.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => {
  cancelInput();
  if (state.status === 'playing' && !paused) showPause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelInput();
    save();
    if (state.status === 'playing' && !paused) showPause();
  }
  lastFrame = performance.now();
  accumulator = 0;
});
window.addEventListener('pagehide', save);

function tick(now) {
  const elapsed = Math.min(0.06, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if (active()) {
    accumulator += elapsed;
    while (accumulator >= 1 / 60 && active()) {
      const old = { x: state.player.x, y: state.player.y };
      const input = inputFrame(1 / 60);
      step(state, input, 1 / 60);
      accumulator -= 1 / 60;
      if (navPath.length && Math.hypot(input.moveX, input.moveY) > 0.1) {
        navStall = dist(old, state.player) < 0.1 ? navStall + 1 / 60 : 0;
        if (navStall > 0.7) {
          navPath = [];
          navAction = null;
          feedback('前路受阻，用摇杆绕开障碍。');
        }
      }
      if (state.roomId !== lastRoom) onRoomChanged();
    }
    saveClock += elapsed;
    if (saveClock >= 4) {
      saveClock = 0;
      save();
    }
    if (state.stats.shots !== lastShots) {
      lastShots = state.stats.shots;
      sound('shot');
    }
    if (state.stats.hits !== lastHits) {
      lastHits = state.stats.hits;
      sound('hit');
    }
    if (state.player.hp < lastHp) sound('hurt');
    lastHp = state.player.hp;
  } else accumulator = 0;
  if (state.message !== lastMessage) {
    lastMessage = state.message;
    if (state.status !== 'ready' && state.message) feedback(state.message);
  }
  if (state.status !== lastStatus) {
    lastStatus = state.status;
    if ((state.status === 'won' || state.status === 'lost') && !ended) {
      ended = true;
      cancelInput();
      save();
      sound(state.status === 'won' ? 'win' : 'hurt');
      showResult();
    }
  }
  if (now > feedbackUntil) $('#feedback').classList.remove('visible');
  hudClock += elapsed;
  if (hudClock > 0.09) {
    hudClock = 0;
    updateHUD();
  }
  renderer.render(state, {
    time: state.time,
    drawStroke,
    aimPoint,
    paused: paused || state.status === 'ready',
  });
  requestAnimationFrame(tick);
}
// Read-only observability for repeatable browser playtests; no mutation or command hooks.
Object.defineProperty(window, '__inkGame', {
  value: Object.freeze({
    snapshot: () => ({
      ...getSnapshot(state),
      paused,
      input: {
        moveX: moveStick.x,
        moveY: moveStick.y,
        shoot: fireHeld || canvasFire,
        melee: meleeHeld,
        drawing: Boolean(drawStroke),
      },
    }),
    worldToScreen: (x, y) => renderer.worldToScreen(x, y),
  }),
  writable: false,
});
document.querySelectorAll('[data-icon]').forEach((el) => (el.innerHTML = icon(el.dataset.icon)));
$('#cover-art').innerHTML = renderVignette('attack');
if (saved) {
  $('#start-game').innerHTML = `继续上次旅程 ${icon('arrow')}`;
  $('#new-game').hidden = false;
}
syncSoundButton();
updateHUD();
renderer.render(state, { time: 0 });
requestAnimationFrame(tick);

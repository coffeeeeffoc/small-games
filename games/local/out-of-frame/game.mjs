import { LEVELS } from './levels.mjs';
import { createState, step, moveFrame, snapshot, restore } from './engine.mjs';
import { render } from './render.mjs';
import { readProgress, writeProgress } from './progress.mjs';

const $ = (id) => document.getElementById(id);
const canvas = $('board');
const context = canvas.getContext('2d');
const world = { w: 960, h: 540 };
let storage;
try {
  storage = window.localStorage;
} catch {
  /* Private browsing still supports a full run. */
}
const progress = readProgress(storage, LEVELS);
let levelIndex = 0;
let state = createState(LEVELS[0]);
let mode = 'intro';
let history = [];
let ticks = 0;
let hintIndex = 0;
let accumulator = 0;
let previousTime = 0;
let drag = null;
let jumpQueued = false;
let audio;
let lastStatus = '';
let lastSwitches = '';
const keys = new Set();
const pointers = new Map();
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const dialogs = [$('pause-dialog'), $('help-dialog')];
const paused = () => dialogs.some((dialog) => dialog.open);
const isPlaying = () => mode === 'playing' && !paused() && state.status === 'playing';

function tone(frequency = 440, duration = 0.1) {
  if (!progress.sound) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    void audio.resume();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      frequency * 0.75,
      audio.currentTime + duration,
    );
    gain.gain.setValueAtTime(0.065, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + duration);
  } catch {
    /* Sound is optional. */
  }
}

function save() {
  writeProgress(storage, progress);
}
function clearInput() {
  jumpQueued = false;
  keys.clear();
  pointers.clear();
  document.querySelectorAll('.pressed').forEach((button) => button.classList.remove('pressed'));
  if (drag && canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
  drag = null;
  canvas.classList.remove('dragging');
  accumulator = 0;
}
function openDialog(dialog) {
  clearInput();
  if (!dialog.open) dialog.showModal();
}
function refreshRoute() {
  $('progress-label').textContent =
    `完成 ${Object.keys(progress.completed).length} / ${LEVELS.length}`;
  $('level-nav').replaceChildren(
    ...LEVELS.map((level, index) => {
      const button = document.createElement('button');
      button.dataset.level = index;
      button.className = index === levelIndex ? 'current' : '';
      button.setAttribute('aria-current', index === levelIndex ? 'step' : 'false');
      button.setAttribute(
        'aria-label',
        `第 ${index + 1} 关：${level.title}${progress.completed[level.id] ? '，已完成' : ''}`,
      );
      const number = document.createElement('span');
      number.className = 'level-index';
      number.textContent = String(index + 1).padStart(2, '0');
      const title = document.createElement('span');
      title.textContent = level.title;
      const check = document.createElement('span');
      check.className = 'level-check';
      check.textContent = progress.completed[level.id] ? '✓' : '';
      button.append(number, title, check);
      button.addEventListener('click', () => loadLevel(index, true));
      return button;
    }),
  );
  $('pause-levels').replaceChildren(
    ...LEVELS.map((level, index) => {
      const button = document.createElement('button');
      button.textContent = `${String(index + 1).padStart(2, '0')} ${level.title}`;
      button.setAttribute('aria-current', index === levelIndex ? 'step' : 'false');
      button.addEventListener('click', () => loadLevel(index, true));
      return button;
    }),
  );
}
function loadLevel(index, start = false) {
  clearInput();
  levelIndex = index;
  state = createState(LEVELS[index]);
  history = [snapshot(state)];
  ticks = 0;
  hintIndex = 0;
  lastStatus = '';
  lastSwitches = '';
  if (start) mode = 'playing';
  dialogs.forEach((dialog) => dialog.close());
  $('intro').hidden = mode !== 'intro';
  $('result').hidden = true;
  $('room-number').textContent = String(index + 1).padStart(2, '0');
  $('room-title').textContent = LEVELS[index].title;
  $('room-kicker').textContent = LEVELS[index].kicker;
  $('goal').textContent = LEVELS[index].goal;
  $('hint-copy').textContent = '先观察，再试着移开目光。';
  $('hint').firstChild.textContent = '需要一点线索？ ';
  canvas.dataset.level = String(index + 1);
  $('object-status').dataset.key = '';
  refreshRoute();
  updateUI();
  if (start) canvas.focus({ preventScroll: true });
}
function start() {
  mode = 'playing';
  $('intro').hidden = true;
  tone(520);
  canvas.focus({ preventScroll: true });
}
function undo() {
  if (mode !== 'playing' || history.length === 0) return;
  clearInput();
  const targetTime = Math.max(0, state.time - 1);
  let previous = history[0];
  while (history.length) {
    previous = history.pop();
    if (previous.time <= targetTime + 0.00001) break;
  }
  restore(state, previous);
  ticks = Math.round(state.time * 60);
  lastStatus = '';
  $('result').hidden = true;
  tone(280);
  updateUI();
  canvas.focus({ preventScroll: true });
}
function row(name, value, className) {
  const item = document.createElement('div');
  item.className = 'status-row';
  const label = document.createElement('span');
  label.textContent = name;
  const status = document.createElement('b');
  status.className = className;
  if (className === 'frozen') {
    const bars = document.createElement('i');
    bars.className = 'pause-mini';
    bars.setAttribute('aria-hidden', 'true');
    status.append(bars);
  }
  status.append(document.createTextNode(value));
  item.append(label, status);
  return item;
}
function updateUI() {
  $('undo').disabled = mode !== 'playing' || history.length === 0 || state.time <= 0;
  $('pause').disabled = mode !== 'playing' || state.status !== 'playing';
  $('live-status').textContent =
    mode === 'intro'
      ? '实验待开始'
      : paused()
        ? '实验暂停'
        : state.status === 'playing'
          ? '实验进行中'
          : state.status === 'won'
            ? '实验完成'
            : '可以回退';
  const statusKey = JSON.stringify([
    state.objects.map((object) => object.active),
    state.switches.map((item) => item.pressed),
  ]);
  if ($('object-status').dataset.key !== statusKey) {
    $('object-status').dataset.key = statusKey;
    $('object-status').replaceChildren(
      ...state.objects.map((object, i) =>
        row(
          object.label || `${object.kind === 'robot' ? '巡逻机器人' : '移动平台'} ${i + 1}`,
          object.active ? '运动中' : '已冻结',
          object.active ? '' : 'frozen',
        ),
      ),
      ...state.switches.map((item, i) =>
        row(
          `开关 ${item.label || String.fromCharCode(65 + i)}`,
          item.pressed ? '已压住' : '等待重物',
          item.pressed ? 'pressed-switch' : '',
        ),
      ),
    );
  }
  const switchKey = state.switches.map((item) => item.pressed).join(',');
  if (lastSwitches && switchKey !== lastSwitches && state.switches.some((item) => item.pressed))
    tone(680, 0.12);
  lastSwitches = switchKey;
  if (state.status !== lastStatus) {
    lastStatus = state.status;
    canvas.dataset.status = state.status;
    if (state.status === 'won' || state.status === 'lost') {
      clearInput();
      const won = state.status === 'won';
      $('result').hidden = false;
      $('result-icon').textContent = won ? '↗' : '↶';
      $('result-kicker').textContent = won ? 'EXPERIMENT COMPLETE' : 'NOTHING IS LOST';
      $('result-title').textContent = won
        ? levelIndex === LEVELS.length - 1
          ? '所有房间，时间由你。'
          : '这一刻，恰到好处。'
        : '只是错过了一步。';
      $('result-copy').textContent = won
        ? `用时 ${Math.ceil(state.time)} 秒 · ${levelIndex === LEVELS.length - 1 ? '序章已完成，可以重访任意房间。' : '带着这条规则，继续下一次实验。'}`
        : '回退 1 秒，换一种安排。也可以重新开始。';
      $('next-level').hidden = !won;
      $('next-level').textContent =
        levelIndex === LEVELS.length - 1 ? '重访第一个房间 ↻' : '下一个房间 →';
      if (won) {
        const level = LEVELS[levelIndex];
        progress.completed[level.id] = Math.min(
          progress.completed[level.id] || Infinity,
          state.time,
        );
        save();
        refreshRoute();
      }
      tone(won ? 880 : 190, 0.3);
    }
  }
}

function logicalPoint(event) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - bounds.left) / bounds.width) * world.w,
    y: ((event.clientY - bounds.top) / bounds.height) * world.h,
  };
}
canvas.addEventListener('pointerdown', (event) => {
  if (!isPlaying() || drag || event.button > 0) return;
  event.preventDefault();
  const point = logicalPoint(event);
  const frame = state.frame;
  const inside =
    point.x >= frame.x - 14 &&
    point.x <= frame.x + frame.w + 14 &&
    point.y >= frame.y - 18 &&
    point.y <= frame.y + frame.h + 14;
  history.push(snapshot(state));
  drag = {
    id: event.pointerId,
    offsetX: inside ? point.x - frame.x : frame.w / 2,
    offsetY: inside ? point.y - frame.y : frame.h / 2,
  };
  canvas.setPointerCapture(event.pointerId);
  canvas.classList.add('dragging');
  moveFrame(state, point.x - drag.offsetX, point.y - drag.offsetY);
});
canvas.addEventListener('pointermove', (event) => {
  if (drag?.id !== event.pointerId || !isPlaying()) return;
  const point = logicalPoint(event);
  moveFrame(state, point.x - drag.offsetX, point.y - drag.offsetY);
});
function endDrag(event) {
  if (drag?.id !== event.pointerId) return;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  drag = null;
  canvas.classList.remove('dragging');
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('lostpointercapture', endDrag);
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
for (const [id, action] of [
  ['move-left', 'left'],
  ['move-right', 'right'],
  ['jump', 'jump'],
]) {
  const button = $(id);
  button.addEventListener('pointerdown', (event) => {
    if (!isPlaying() || event.button > 0) return;
    event.preventDefault();
    pointers.set(event.pointerId, action);
    if (action === 'jump') jumpQueued = true;
    button.setPointerCapture(event.pointerId);
    button.classList.add('pressed');
  });
  const release = (event) => {
    if (event.type === 'pointercancel' && action === 'jump') jumpQueued = false;
    pointers.delete(event.pointerId);
    if (![...pointers.values()].includes(action)) button.classList.remove('pressed');
    if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
  };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
  button.addEventListener('contextmenu', (event) => event.preventDefault());
  button.style.touchAction = 'none';
}
const gameKeys = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'Space',
  'KeyA',
  'KeyD',
  'KeyW',
  'KeyI',
  'KeyJ',
  'KeyK',
  'KeyL',
  'KeyZ',
  'KeyR',
]);
window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape') {
    if (!paused() && mode === 'playing' && state.status === 'playing') {
      event.preventDefault();
      openDialog($('pause-dialog'));
    }
    return;
  }
  if (paused() || mode !== 'playing' || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target instanceof HTMLButtonElement && ['Space', 'Enter'].includes(event.code)) return;
  if (gameKeys.has(event.code)) event.preventDefault();
  if (!event.repeat && ['Space', 'ArrowUp', 'KeyW'].includes(event.code)) jumpQueued = true;
  if (!event.repeat && event.code === 'KeyZ') undo();
  else if (!event.repeat && event.code === 'KeyR') loadLevel(levelIndex, true);
  else keys.add(event.code);
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
function backgroundPause() {
  clearInput();
  if (mode === 'playing' && state.status === 'playing' && !paused()) openDialog($('pause-dialog'));
}
window.addEventListener('blur', backgroundPause);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) backgroundPause();
});
window.addEventListener('pagehide', clearInput);
window.addEventListener('resize', clearInput);
dialogs.forEach((dialog) => {
  dialog.addEventListener('close', () => {
    clearInput();
    canvas.focus({ preventScroll: true });
  });
  dialog.addEventListener('cancel', clearInput);
});
$('start-button').addEventListener('click', start);
$('pause').addEventListener('click', () => openDialog($('pause-dialog')));
$('resume').addEventListener('click', () => $('pause-dialog').close());
$('pause-help').addEventListener('click', () => {
  $('pause-dialog').close();
  openDialog($('help-dialog'));
});
$('pause-home').addEventListener('click', () => {
  mode = 'intro';
  loadLevel(levelIndex);
});
$('help').addEventListener('click', () => openDialog($('help-dialog')));
$('close-help').addEventListener('click', () => $('help-dialog').close());
$('undo').addEventListener('click', undo);
$('result-undo').addEventListener('click', undo);
$('restart').addEventListener('click', () => loadLevel(levelIndex, true));
$('result-retry').addEventListener('click', () => loadLevel(levelIndex, true));
$('next-level').addEventListener('click', () => loadLevel((levelIndex + 1) % LEVELS.length, true));
$('hint').addEventListener('click', () => {
  const hints = LEVELS[levelIndex].hint;
  $('hint-copy').textContent = hints[Math.min(hintIndex, hints.length - 1)];
  hintIndex += 1;
  $('hint').firstChild.textContent = hintIndex >= hints.length ? '线索已全部展开 ' : '再提示一点 ';
  canvas.focus({ preventScroll: true });
});
$('sound').addEventListener('click', () => {
  progress.sound = !progress.sound;
  save();
  updateSound();
  tone(600);
});
function updateSound() {
  $('sound').setAttribute('aria-pressed', String(progress.sound));
  $('sound').setAttribute('aria-label', progress.sound ? '关闭音效' : '开启音效');
  $('sound').style.color = progress.sound ? 'var(--mint)' : 'var(--muted)';
}
document.querySelector('.brand').addEventListener('click', (event) => {
  event.preventDefault();
  mode = 'intro';
  loadLevel(levelIndex);
});

function draw() {
  const bounds = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.round(bounds.width * ratio),
    height = Math.round(bounds.height * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  context.setTransform(width / world.w, 0, 0, height / world.h, 0, 0);
  render(context, LEVELS[levelIndex], state, { dragging: Boolean(drag), reducedMotion });
}
function frame(time) {
  const elapsed = Math.min((time - previousTime) / 1000 || 0, 0.1);
  previousTime = time;
  if (isPlaying()) {
    accumulator += elapsed;
    const values = new Set(pointers.values());
    const input = {
      left: keys.has('ArrowLeft') || keys.has('KeyA') || values.has('left'),
      right: keys.has('ArrowRight') || keys.has('KeyD') || values.has('right'),
      jump:
        jumpQueued ||
        keys.has('Space') ||
        keys.has('ArrowUp') ||
        keys.has('KeyW') ||
        values.has('jump'),
    };
    while (accumulator >= 1 / 60 && state.status === 'playing') {
      if (ticks % 15 === 0) history.push(snapshot(state));
      const fx = Number(keys.has('KeyL')) - Number(keys.has('KeyJ'));
      const fy = Number(keys.has('KeyK')) - Number(keys.has('KeyI'));
      if (fx || fy) moveFrame(state, state.frame.x + fx * 5, state.frame.y + fy * 5);
      step(LEVELS[levelIndex], state, input, 1 / 60);
      jumpQueued = false;
      ticks += 1;
      accumulator -= 1 / 60;
    }
  } else accumulator = 0;
  updateUI();
  draw();
  window.requestAnimationFrame(frame);
}
window.__outOfFrameSnapshot = () => ({
  levelIndex,
  state: snapshot(state),
  world: { ...world },
  mode,
  paused: paused(),
  historyLength: history.length,
});
loadLevel(0);
$('intro-meta').textContent = `${LEVELS.length} 个房间 · 自由探索 · 免费回退`;
updateSound();
window.requestAnimationFrame(frame);

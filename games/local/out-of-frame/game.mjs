import { LEVELS, CHAPTERS } from './levels.mjs';
import { createState, step, moveFrame, snapshot, restore } from './engine.mjs';
import { render } from './render.mjs';
import { createCheckpoint, readProgress, writeProgress } from './progress.mjs';

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
let chapterIndex = 0;
let checkpointRestored = false;
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
let lastClock = '';
let lastFrameFeedback = '';
let hasMovedFrame = false;
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
function saveSession() {
  progress.lastLevelId = LEVELS[levelIndex].id;
  progress.checkpoint = mode === 'playing' ? createCheckpoint(state, history) : progress.checkpoint;
  save();
}
function formatTime(seconds) {
  const total = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
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
  saveSession();
  $('pause-copy').textContent =
    `第 ${levelIndex + 1} 关 · ${LEVELS[levelIndex].title} · 本次 ${formatTime(state.time)}。准备好后继续。`;
  if (!dialog.open) dialog.showModal();
}
function refreshRoute() {
  const completedCount = Object.keys(progress.completed).length;
  const chapter = CHAPTERS[chapterIndex];
  const chapterLevels = LEVELS.slice(chapter.start - 1, chapter.end);
  const chapterCompleted = chapterLevels.filter((level) => progress.completed[level.id]).length;
  $('progress-label').textContent = `完成 ${completedCount} / ${LEVELS.length}`;
  $('route-progress').max = LEVELS.length;
  $('route-progress').value = completedCount;
  $('chapter-subtitle').textContent = chapter.subtitle;
  $('chapter-progress').textContent =
    `第 ${chapter.start}–${chapter.end} 关 · 已完成 ${chapterCompleted} / ${chapterLevels.length}`;
  $('pause-chapter-progress').textContent =
    `${chapter.title} · 已完成 ${chapterCompleted} / ${chapterLevels.length}`;
  for (const prefix of ['', 'pause-']) {
    const select = $(`${prefix}chapter-select`);
    if (!select.options.length)
      select.replaceChildren(
        ...CHAPTERS.map((item, index) => {
          const option = document.createElement('option');
          option.value = String(index);
          option.textContent = `第 ${String(item.number).padStart(2, '0')} 章 · ${item.title}`;
          return option;
        }),
      );
    select.value = String(chapterIndex);
    $(`${prefix}chapter-prev`).disabled = chapterIndex === 0;
    $(`${prefix}chapter-next`).disabled = chapterIndex === CHAPTERS.length - 1;
  }
  function levelButton(level, index, compact = false) {
    const button = document.createElement('button');
    button.dataset.level = index;
    button.className = index === levelIndex ? 'current' : '';
    if (progress.completed[level.id]) button.classList.add('completed');
    button.setAttribute('aria-current', index === levelIndex ? 'step' : 'false');
    button.setAttribute(
      'aria-label',
      `第 ${index + 1} 关：${level.title}${progress.completed[level.id] ? '，已完成' : ''}`,
    );
    const number = document.createElement('span');
    number.className = 'level-index';
    number.textContent = String(index + 1).padStart(2, '0');
    const title = document.createElement('span');
    title.className = 'level-title';
    title.textContent = level.title;
    const check = document.createElement('span');
    check.className = 'level-check';
    check.textContent = progress.completed[level.id] ? '✓' : '';
    check.setAttribute('aria-hidden', 'true');
    button.append(number, title, check);
    if (!compact) {
      const best = document.createElement('small');
      best.className = 'level-best';
      best.textContent = progress.completed[level.id]
        ? `最佳 ${formatTime(progress.completed[level.id])}`
        : `难度 ${level.difficulty} / ${LEVELS.length}`;
      button.append(best);
    }
    button.addEventListener('click', () => loadLevel(index, true));
    return button;
  }
  $('level-nav').replaceChildren(
    ...chapterLevels.map((level, index) => levelButton(level, chapter.start - 1 + index)),
  );
  $('pause-levels').replaceChildren(
    ...chapterLevels.map((level, index) => levelButton(level, chapter.start - 1 + index, true)),
  );
}
function loadLevel(index, start = false, checkpoint = null) {
  clearInput();
  levelIndex = index;
  chapterIndex = CHAPTERS.findIndex(
    (chapter) => index + 1 >= chapter.start && index + 1 <= chapter.end,
  );
  state = createState(LEVELS[index]);
  checkpointRestored = Boolean(checkpoint);
  if (checkpoint) restore(state, checkpoint.state);
  history = checkpoint?.history.length ? checkpoint.history : [snapshot(state)];
  ticks = state.ticks;
  hintIndex = 0;
  lastStatus = '';
  lastSwitches = '';
  lastClock = '';
  lastFrameFeedback = '';
  hasMovedFrame = checkpointRestored;
  if (start) mode = 'playing';
  dialogs.forEach((dialog) => dialog.close());
  $('intro').hidden = mode !== 'intro';
  $('result').hidden = true;
  $('room-number').textContent = String(index + 1).padStart(2, '0');
  $('room-title').textContent = LEVELS[index].title;
  $('room-kicker').textContent = LEVELS[index].kicker;
  $('room-chapter').textContent =
    `第 ${LEVELS[index].chapterNumber} 章 · ${LEVELS[index].chapterTitle} · ${LEVELS[index].chapterLevel} / 10`;
  $('goal').textContent = LEVELS[index].goal;
  $('hint-copy').textContent = '先观察，再试着移开目光。';
  $('hint').firstChild.textContent = '需要一点线索？ ';
  canvas.dataset.level = String(index + 1);
  $('object-status').dataset.key = '';
  progress.lastLevelId = LEVELS[index].id;
  progress.checkpoint = checkpoint;
  $('start-button').textContent = checkpoint
    ? `继续第 ${String(index + 1).padStart(2, '0')} 关 →`
    : `进入第 ${String(index + 1).padStart(2, '0')} 关 ↗`;
  $('intro-meta').textContent = checkpoint
    ? `已保存 ${formatTime(state.time)} · ${LEVELS.length} 个房间 · 免费回退`
    : `${LEVELS.length} 个房间 · 10 个章节 · 自由探索`;
  refreshRoute();
  updateUI();
  saveSession();
  if (start) canvas.focus({ preventScroll: true });
}
function start() {
  mode = 'playing';
  $('intro').hidden = true;
  saveSession();
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
  saveSession();
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
  const clock = formatTime(state.time);
  if (clock !== lastClock) {
    lastClock = clock;
    $('run-time').textContent = clock;
  }
  const best = progress.completed[LEVELS[levelIndex].id];
  $('best-time').textContent = best ? formatTime(best) : '—';
  const activeCount = state.objects.filter((object) => object.active).length;
  const feedback = drag
    ? `正在移框 · ${activeCount} 台运动 / ${state.objects.length - activeCount} 台冻结`
    : `${activeCount} 台运动 · ${state.objects.length - activeCount} 台冻结`;
  if (feedback !== lastFrameFeedback) {
    lastFrameFeedback = feedback;
    $('frame-feedback').textContent = feedback;
  }
  $('frame-guide').classList.toggle('awaiting-drag', mode === 'playing' && !hasMovedFrame);
  $('frame-guide').classList.toggle('is-dragging', Boolean(drag));
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
      ...state.gates.map((item, i) =>
        row(
          `门 ${i + 1}`,
          item.open ? '出口已通行' : '等待开关',
          item.open ? 'pressed-switch' : '',
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
      const previousBest = progress.completed[LEVELS[levelIndex].id];
      const newBest = won && (!previousBest || state.time < previousBest);
      const completedCount =
        Object.keys(progress.completed).length + (won && !previousBest ? 1 : 0);
      $('result').hidden = false;
      $('result-icon').textContent = won ? '↗' : '↶';
      $('result-kicker').textContent = won ? 'EXPERIMENT COMPLETE' : 'NOTHING IS LOST';
      $('result-title').textContent = won
        ? completedCount === LEVELS.length
          ? '所有房间，时间由你。'
          : '这一刻，恰到好处。'
        : '只是错过了一步。';
      $('result-copy').textContent = won
        ? `用时 ${state.time.toFixed(1)} 秒 · ${newBest ? '新的最佳纪录' : `最佳 ${previousBest.toFixed(1)} 秒`} · 已完成 ${completedCount} / ${LEVELS.length}`
        : '回退 1 秒，换一种安排。也可以重新开始。';
      $('next-level').hidden = !won;
      $('next-level').textContent =
        levelIndex === LEVELS.length - 1
          ? completedCount === LEVELS.length
            ? '重访第一个房间 ↻'
            : '继续未完成的房间 →'
          : (levelIndex + 1) % 10 === 0
            ? '进入下一章 →'
            : '下一个房间 →';
      if (won) {
        const level = LEVELS[levelIndex];
        progress.completed[level.id] = Math.min(
          progress.completed[level.id] || Infinity,
          state.time,
        );
        save();
        refreshRoute();
      }
      saveSession();
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
  hasMovedFrame = true;
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
  saveSession();
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
  if (
    event.target instanceof HTMLSelectElement ||
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement
  )
    return;
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
window.addEventListener('pagehide', () => {
  clearInput();
  saveSession();
});
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
  showIntro();
});
$('help').addEventListener('click', () => openDialog($('help-dialog')));
$('close-help').addEventListener('click', () => $('help-dialog').close());
$('undo').addEventListener('click', undo);
$('result-undo').addEventListener('click', undo);
$('restart').addEventListener('click', () => loadLevel(levelIndex, true));
$('result-retry').addEventListener('click', () => loadLevel(levelIndex, true));
$('next-level').addEventListener('click', () => {
  const unfinished = LEVELS.findIndex((level) => !progress.completed[level.id]);
  loadLevel(
    levelIndex === LEVELS.length - 1 && unfinished >= 0
      ? unfinished
      : (levelIndex + 1) % LEVELS.length,
    true,
  );
});
for (const prefix of ['', 'pause-']) {
  $(`${prefix}chapter-select`).addEventListener('pointerdown', clearInput);
  $(`${prefix}chapter-select`).addEventListener('change', (event) => {
    clearInput();
    chapterIndex = Number(event.target.value);
    refreshRoute();
  });
  for (const [direction, delta] of [
    ['prev', -1],
    ['next', 1],
  ]) {
    $(`${prefix}chapter-${direction}`).addEventListener('click', () => {
      chapterIndex = Math.max(0, Math.min(CHAPTERS.length - 1, chapterIndex + delta));
      refreshRoute();
    });
  }
}
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
  showIntro();
});
function showIntro() {
  saveSession();
  clearInput();
  mode = 'intro';
  dialogs.forEach((dialog) => dialog.close());
  $('result').hidden = true;
  $('intro').hidden = false;
  if (state.status !== 'playing') loadLevel(levelIndex);
  else {
    $('start-button').textContent = `继续第 ${String(levelIndex + 1).padStart(2, '0')} 关 →`;
    $('intro-meta').textContent =
      `已保存 ${formatTime(state.time)} · ${LEVELS.length} 个房间 · 免费回退`;
  }
}

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
  render(context, LEVELS[levelIndex], state, {
    dragging: Boolean(drag),
    reducedMotion,
  });
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
      if (fx || fy) {
        hasMovedFrame = true;
        moveFrame(state, state.frame.x + fx * 5, state.frame.y + fy * 5);
      }
      step(LEVELS[levelIndex], state, input, 1 / 60);
      jumpQueued = false;
      ticks += 1;
      if (ticks % 120 === 0) saveSession();
      accumulator -= 1 / 60;
    }
  } else accumulator = 0;
  updateUI();
  draw();
  window.requestAnimationFrame(frame);
}
window.__outOfFrameSnapshot = () => ({
  levelIndex,
  chapterIndex,
  checkpointRestored,
  state: snapshot(state),
  world: { ...world },
  mode,
  paused: paused(),
  historyLength: history.length,
});
loadLevel(
  Math.max(
    0,
    LEVELS.findIndex((level) => level.id === progress.lastLevelId),
  ),
  false,
  progress.checkpoint,
);
updateSound();
window.requestAnimationFrame(frame);

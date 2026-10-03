import { LEVELS } from './levels.mjs';
import {
  createState,
  moveShaft,
  toggleLatch,
  releaseBall,
  advanceBall,
  getSnapshot,
} from './engine.mjs';
import {
  renderBoard,
  renderDragPreview,
  boardBallPoint,
  shaftY,
  RAIL_TOP,
  RAIL_BOTTOM,
} from './render.mjs';
import { readProgress, saveProgress } from './progress.mjs';

const $ = (selector) => document.querySelector(selector);
const board = $('#board');
const boards = [board, $('#back-board')];
const clone = (value) => structuredClone(value);
let storage;
try {
  storage = localStorage;
} catch {
  /* Optional in restricted WebViews. */
}
const progress = readProgress(storage, LEVELS);
let levelIndex = progress.selected;
let state = createState(LEVELS[levelIndex]);
let history = [];
let ball = [...LEVELS[levelIndex].path[0]];
let ballPathCursor = 0;
let ballMoving = false;
let generation = 0;
let drag = null;
let deferredScene = false;
let highlighted = null;
let hintIndex = 0;
let feedback = LEVELS[levelIndex].intro;
let audioContext;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const level = () => LEVELS[levelIndex];
const remember = () => ({ state: clone(state), ball: [...ball], ballPathCursor });
const save = () => {
  if (!saveProgress(storage, progress))
    $('#collection-count').title = '此浏览器无法保存，进度仅保留在本次游玩中';
};

// A cancelled drag can suppress the browser's next compatibility click. Use
// the completed primary touch itself to activate a control, and discard only
// its duplicate native click. Mouse and keyboard retain normal click behavior.
const touchControlSelector = 'button, a.brand, [data-latch], [data-notch-shaft]';
let touchPress = null;
let lastTouchActivation = null;
document.addEventListener('pointerdown', (event) => {
  if (event.pointerType !== 'touch' || !event.isPrimary) return;
  const control = event.target.closest(touchControlSelector);
  touchPress =
    control && !control.disabled
      ? { control, pointerId: event.pointerId, x: event.clientX, y: event.clientY }
      : null;
});
document.addEventListener('pointercancel', (event) => {
  if (touchPress?.pointerId === event.pointerId) touchPress = null;
});
document.addEventListener('pointerup', (event) => {
  if (touchPress?.pointerId !== event.pointerId) return;
  const press = touchPress;
  touchPress = null;
  const rect = press.control.getBoundingClientRect();
  if (
    !press.control.isConnected ||
    press.control.disabled ||
    Math.hypot(event.clientX - press.x, event.clientY - press.y) > 12 ||
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
    return;
  lastTouchActivation = { ...press, at: performance.now() };
  if (typeof press.control.click === 'function') press.control.click();
  else press.control.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
});
document.addEventListener(
  'click',
  (event) => {
    const previous = lastTouchActivation;
    if (!event.isTrusted || !previous || performance.now() - previous.at > 500) return;
    const duplicate =
      event.pointerType === 'touch'
        ? event.pointerId === previous.pointerId
        : !event.pointerType &&
          event.detail > 0 &&
          (event.sourceCapabilities
            ? event.sourceCapabilities.firesTouchEvents
            : event.target.closest(touchControlSelector) === previous.control);
    if (duplicate) {
      event.preventDefault();
      event.stopImmediatePropagation();
      lastTouchActivation = null;
    }
  },
  true,
);
window.addEventListener('blur', () => {
  touchPress = null;
});

function sound(kind) {
  if (!progress.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') void audioContext.resume().catch(() => {});
    const tones = {
      move: [360, 440],
      latch: [240, 310],
      blocked: [135, 110],
      win: [440, 550, 660, 880],
    }[kind] || [400];
    tones.forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const at = audioContext.currentTime + index * 0.08;
      oscillator.type = kind === 'win' ? 'sine' : 'triangle';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.035, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.13);
    });
  } catch {
    /* Audio must never block a puzzle. */
  }
}

function paintScene() {
  if (deferredScene) return;
  let visualState = state;
  if (drag) {
    visualState = clone(state);
    visualState.shafts[drag.id] = Math.max(
      0,
      Math.min(2, Math.round((RAIL_BOTTOM - drag.y) / 150)),
    );
    for (const face of boards) renderDragPreview(face, level(), visualState, drag);
    return;
  }
  const focusedShaft = document.activeElement?.getAttribute('data-shaft');
  const focusedLatch = document.activeElement?.getAttribute('data-latch');
  const focusedBoard = document.activeElement?.closest('svg');
  for (const face of boards)
    renderBoard(face, level(), visualState, { side: face.dataset.side, ball, drag, highlighted });
  if (focusedShaft && !drag)
    focusedBoard?.querySelector(`[data-shaft="${focusedShaft}"]`)?.focus({ preventScroll: true });
  if (focusedLatch && !drag)
    focusedBoard?.querySelector(`[data-latch="${focusedLatch}"]`)?.focus({ preventScroll: true });
}

function deferSceneUntilTouchEnds() {
  deferredScene = true;
  const token = generation;
  requestAnimationFrame(() => {
    if (token !== generation) return;
    deferredScene = false;
    paintScene();
  });
}

function update() {
  paintScene();
  const snapshot = getSnapshot(level(), state);
  $('#level-number').textContent = String(levelIndex + 1).padStart(2, '0');
  $('#level-title').textContent = level().title;
  $('#level-subtitle').textContent = level().subtitle;
  $('#intro').textContent = level().intro;
  $('#move-count').textContent = state.moves;
  $('#release').disabled = state.released || state.completed;
  $('#release span').textContent = state.completed
    ? '已进入终点'
    : state.released
      ? ballMoving
        ? '小球前进中'
        : '小球停靠中'
      : '放出小球';
  $('#ball-state').textContent = state.completed
    ? '已进入终点 ✓'
    : !state.released
      ? '小球待出发'
      : ballMoving
        ? '小球前进中'
        : '等候机关打开';
  $('#undo').disabled = !history.length || ballMoving;
  $('#status').textContent = feedback;
  $('#collection-count').textContent = `${Object.keys(progress.best).length}/${LEVELS.length}`;
  $('#sound').classList.toggle('muted', !progress.sound);
  $('#sound').setAttribute('aria-label', progress.sound ? '关闭音效' : '开启音效');
  $('#sound').setAttribute('aria-pressed', String(progress.sound));
  $('#help-sound').textContent = progress.sound ? '关闭音效' : '开启音效';
  $('#help-sound').setAttribute('aria-pressed', String(progress.sound));
  $('#mechanism-list').replaceChildren(
    ...snapshot.shafts.map((shaft) => {
      const card = document.createElement('div');
      card.className = 'mechanism-card';
      const letter = document.createElement('span');
      letter.className = 'mechanism-letter';
      letter.textContent = shaft.id;
      const details = document.createElement('div');
      details.className = 'mechanism-details';
      details.textContent = shaft.locked ? '锁扣固定中' : '两面同步联动';
      const role = document.createElement('small');
      role.textContent = `正面：${shaft.frontRole}；背面：${shaft.backRole}`;
      details.append(role);
      const value = document.createElement('span');
      value.className = 'shaft-value';
      value.textContent = shaft.notches[shaft.value];
      card.append(letter, details, value);
      return card;
    }),
  );
}

function showFeedback(message, blocked = false, id = null) {
  feedback = message;
  $('#status').textContent = message;
  if (blocked) {
    sound('blocked');
    const elements = id
      ? $('#scene').querySelectorAll(`[data-shaft="${id}"], [data-latch="${id}"]`)
      : [];
    elements.forEach((element) => element.classList.add('jolt'));
    setTimeout(() => elements.forEach((element) => element.classList.remove('jolt')), 500);
  }
}

function change(action, id = null) {
  if (drag || state.completed) return false;
  if (ballMoving) {
    showFeedback('小球正在沿球道前进。停靠后，继续调整机关即可。');
    return false;
  }
  const before = remember();
  const result = action();
  if (!result.ok) {
    showFeedback(result.message, true, id);
    return false;
  }
  if (result.changed !== false) history.push(before);
  feedback = result.message;
  highlighted = id?.startsWith('lock-')
    ? level().latches.find((latch) => latch.id === id)?.shaft
    : id;
  sound(id?.startsWith('lock-') ? 'latch' : 'move');
  update();
  if (state.released) void runBall();
  return true;
}

function animateSegment(target, token) {
  const start = [...ball];
  const duration = reducedMotion.matches
    ? 25
    : Math.min(420, Math.max(140, Math.hypot(target[0] - start[0], target[1] - start[1]) * 1.65));
  const at = performance.now();
  return new Promise((resolve) => {
    const tick = (now) => {
      if (token !== generation) return resolve(false);
      const p = Math.min(1, (now - at) / duration);
      ball = [start[0] + (target[0] - start[0]) * p, start[1] + (target[1] - start[1]) * p];
      const sprite = board.querySelector('#ball');
      const point = boardBallPoint(board, level(), ball);
      sprite?.setAttribute('transform', `translate(${point[0]} ${point[1]})`);
      if (p < 1) requestAnimationFrame(tick);
      else resolve(true);
    };
    requestAnimationFrame(tick);
  });
}

async function runBall() {
  if (ballMoving || !state.released || state.completed) return;
  const token = generation;
  ballMoving = true;
  update();
  while (token === generation && !state.completed) {
    const targetIndex = level().checkpoints[state.checkpoint].pathIndex;
    while (ballPathCursor < targetIndex) {
      if (!(await animateSegment(level().path[ballPathCursor + 1], token))) return;
      ballPathCursor += 1;
    }
    if (token !== generation) return;
    const result = advanceBall(level(), state);
    feedback = result.message;
    if (!result.ok) break;
    if (state.completed) {
      const previous = progress.best[level().id];
      progress.best[level().id] = Math.min(previous ?? Infinity, state.moves);
      save();
      sound('win');
      $('#result-copy').textContent =
        `第 ${levelIndex + 1} 盒「${level().title}」已完成。${state.moves} 次操作。`;
      $('#next').textContent =
        levelIndex === LEVELS.length - 1 ? '查看六盒收藏 →' : '打开下一个盒子 →';
      if (!document.querySelector('dialog[open]')) $('#result').showModal();
      break;
    }
    update();
  }
  if (token === generation) {
    ballMoving = false;
    update();
  }
}

function cancelDrag() {
  if (!drag) return;
  const pointer = drag.pointerId;
  const capturedBoard = drag.board;
  for (const face of boards)
    renderDragPreview(face, level(), state, { ...drag, y: shaftY(state.shafts[drag.id]) });
  drag = null;
  if (capturedBoard.hasPointerCapture(pointer)) capturedBoard.releasePointerCapture(pointer);
  deferSceneUntilTouchEnds();
  paintScene();
}

function closeDialogs() {
  document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
}

function loadLevel(index) {
  cancelDrag();
  generation += 1;
  ballMoving = false;
  deferredScene = false;
  levelIndex = index;
  state = createState(level());
  history = [];
  ball = [...level().path[0]];
  ballPathCursor = 0;
  highlighted = null;
  hintIndex = 0;
  feedback = level().intro;
  progress.selected = index;
  save();
  closeDialogs();
  update();
}

function openLevels() {
  $('#level-nav').replaceChildren(
    ...LEVELS.map((item, index) => {
      const button = document.createElement('button');
      button.dataset.levelIndex = String(index);
      button.setAttribute('aria-current', String(index === levelIndex));
      const number = document.createElement('strong');
      number.textContent = String(index + 1).padStart(2, '0');
      const text = document.createElement('span');
      text.textContent = item.title;
      const note = document.createElement('small');
      note.textContent = progress.best[item.id]
        ? `已解开 · 最佳 ${progress.best[item.id]} 次`
        : '尚未解开';
      text.append(note);
      button.append(number, text);
      button.addEventListener('click', () => loadLevel(index));
      return button;
    }),
  );
  $('#level-dialog').showModal();
}

function boardPoint(face, event) {
  const matrix = face.getScreenCTM();
  if (!matrix) return null;
  return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
}

for (const face of boards) {
  face.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0 || ballMoving || state.completed || drag) return;
    const shaftElement = event.target.closest('[data-shaft]');
    if (
      !shaftElement ||
      (event.target.closest('[data-notch-shaft]') && !event.target.closest('[data-shaft-handle]'))
    )
      return;
    const id = shaftElement.dataset.shaft;
    const value = state.shafts[id];
    if (getSnapshot(level(), state).lockedShafts.includes(id)) {
      const result = moveShaft(level(), state, id, value === 2 ? 1 : 2);
      showFeedback(result.message, true, id);
      return;
    }
    const point = boardPoint(face, event);
    if (!point) return;
    drag = {
      id,
      board: face,
      pointerId: event.pointerId,
      y: shaftY(value),
      startY: point.y,
      handleY: shaftY(value),
      moved: false,
      before: remember(),
    };
    face.setPointerCapture(event.pointerId);
  });
  face.addEventListener('pointermove', (event) => {
    if (!drag || drag.board !== face || event.pointerId !== drag.pointerId) return;
    const point = boardPoint(face, event);
    if (!point) return;
    const nextY = Math.max(RAIL_TOP, Math.min(RAIL_BOTTOM, drag.handleY + point.y - drag.startY));
    drag.moved ||= Math.abs(nextY - drag.handleY) > 5;
    drag.y = nextY;
    highlighted = drag.id;
    paintScene();
  });
  face.addEventListener('pointerup', (event) => {
    if (!drag || drag.board !== face || event.pointerId !== drag.pointerId) return;
    const gesture = drag;
    const value = Math.max(0, Math.min(2, Math.round((RAIL_BOTTOM - drag.y) / 150)));
    drag = null;
    if (face.hasPointerCapture(event.pointerId)) face.releasePointerCapture(event.pointerId);
    if (gesture.moved) {
      const result = moveShaft(level(), state, gesture.id, value);
      if (result.ok && result.changed) {
        history.push(gesture.before);
        feedback = result.message;
        sound('move');
      } else if (!result.ok) feedback = result.message;
    }
    for (const target of boards)
      renderDragPreview(target, level(), state, {
        ...gesture,
        y: shaftY(state.shafts[gesture.id]),
      });
    deferSceneUntilTouchEnds();
    update();
    if (state.released) void runBall();
  });
  face.addEventListener('pointercancel', (event) => {
    if (drag?.pointerId === event.pointerId) cancelDrag();
  });
  face.addEventListener('lostpointercapture', () => {
    if (drag?.board === face) cancelDrag();
  });
  face.addEventListener('click', (event) => {
    const latch = event.target.closest('[data-latch]');
    const notch = event.target.closest('[data-notch-shaft]');
    if (latch)
      change(
        () => toggleLatch(level(), state, latch.dataset.latch, face.dataset.side),
        latch.dataset.latch,
      );
    else if (notch)
      change(
        () => moveShaft(level(), state, notch.dataset.notchShaft, Number(notch.dataset.value)),
        notch.dataset.notchShaft,
      );
  });
  face.addEventListener('keydown', (event) => {
    const shaft = event.target.closest('[data-shaft]');
    const latch = event.target.closest('[data-latch]');
    if (latch && ['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      change(
        () => toggleLatch(level(), state, latch.dataset.latch, face.dataset.side),
        latch.dataset.latch,
      );
    } else if (shaft && ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const id = shaft.dataset.shaft;
      const value =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? 2
            : Math.max(0, Math.min(2, state.shafts[id] + (event.key === 'ArrowUp' ? 1 : -1)));
      change(() => moveShaft(level(), state, id, value), id);
    }
  });
}

window.addEventListener('blur', cancelDrag);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelDrag();
    void audioContext?.suspend().catch(() => {});
  }
});

$('#release').addEventListener('click', () => change(() => releaseBall(level(), state)));
$('#restart').addEventListener('click', () => loadLevel(levelIndex));
$('#undo').addEventListener('click', () => {
  if (!history.length || ballMoving) return;
  cancelDrag();
  generation += 1;
  deferredScene = false;
  const previous = history.pop();
  state = previous.state;
  ball = previous.ball;
  ballPathCursor = previous.ballPathCursor;
  feedback = '已撤销上一步，机关和小球一起回到之前的位置。';
  highlighted = null;
  update();
  if (state.released) void runBall();
});
$('#hint').addEventListener('click', () => {
  $('#hint-copy').textContent = level().hints[hintIndex];
  $('#hint-more').disabled = hintIndex >= level().hints.length - 1;
  highlighted =
    getSnapshot(level(), state).gates.find((gate) => !gate.open)?.shaft || level().shafts[0].id;
  paintScene();
  $('#hint-dialog').showModal();
});
$('#hint-more').addEventListener('click', () => {
  hintIndex = Math.min(hintIndex + 1, level().hints.length - 1);
  $('#hint-copy').textContent = level().hints[hintIndex];
  $('#hint-more').disabled = hintIndex >= level().hints.length - 1;
});
$('#levels').addEventListener('click', openLevels);
$('#help').addEventListener('click', () => $('#help-dialog').showModal());
function toggleSound() {
  progress.sound = !progress.sound;
  if (progress.sound) sound('move');
  else void audioContext?.suspend().catch(() => {});
  save();
  update();
}
$('#sound').addEventListener('click', toggleSound);
$('#help-sound').addEventListener('click', toggleSound);
$('#start').addEventListener('click', () => {
  $('#welcome').close();
  sound('move');
});
$('.brand').addEventListener('click', (event) => {
  event.preventDefault();
  openLevels();
});
$('#next').addEventListener('click', () => {
  $('#result').close();
  if (levelIndex < LEVELS.length - 1) loadLevel(levelIndex + 1);
  else openLevels();
});
$('#replay').addEventListener('click', () => loadLevel(levelIndex));
document
  .querySelectorAll('[data-close]')
  .forEach((button) =>
    button.addEventListener('click', () => document.getElementById(button.dataset.close).close()),
  );
document.querySelectorAll('dialog:not(#result)').forEach((dialog) =>
  dialog.addEventListener('close', () => {
    if (state.completed && !document.querySelector('dialog[open]')) $('#result').showModal();
  }),
);

// Inspection only: tests and Shell smoke must use actual touch/mouse controls.
window.__twoSidedSnapshot = () =>
  clone({
    levelIndex,
    levelId: level().id,
    state,
    historyLength: history.length,
    progress,
    animating: false,
    ballMoving,
    dragging: Boolean(drag),
    ball,
    ballPathCursor,
    ...{ mechanisms: getSnapshot(level(), state) },
  });
const resizeBoards = () => {
  const layouts = boards.map((face) =>
    face.getBoundingClientRect().width < 300 ? 'compact' : 'wide',
  );
  if (boards.every((face, index) => face.dataset.layout === layouts[index])) return;
  cancelDrag();
  boards.forEach((face, index) => {
    face.dataset.layout = layouts[index];
  });
  paintScene();
};
new ResizeObserver(resizeBoards).observe($('#scene'));
resizeBoards();
update();
$('#start').firstChild.textContent = Object.keys(progress.best).length
  ? '继续探索机关盒 '
  : '开始探索机关盒 ';
$('#welcome').showModal();

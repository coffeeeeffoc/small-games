import { LEVELS } from './levels.mjs';
import {
  createState,
  moveShaft,
  toggleLatch,
  releaseBall,
  advanceBall,
  getSnapshot,
} from './engine.mjs';
import { renderBoard, renderDragPreview, shaftY, RAIL_TOP, RAIL_BOTTOM } from './render.mjs';
import { readProgress, saveProgress } from './progress.mjs';
import { FACES, createFaceAccess, faceById, hiddenFaces, revealFace } from './faces.mjs';
import { canOfferReward, offerFaceReward } from './rewards.mjs';

const $ = (selector) => document.querySelector(selector);
const board = $('#board');
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
let animating = false;
let generation = 0;
let faceAccess = createFaceAccess();
let rewardPending = false;
let rewardFeedback = '';
let drag = null;
let deferredScene = false;
let highlighted = null;
let hintIndex = 0;
const openingFeedback = () =>
  `本次随机展开${faceAccess.visibleFaces.map((id) => faceById(id).label).join('和')}。需要更多线索时，点击「提示 · 展开一面」。`;
let feedback = openingFeedback();
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
  board.dataset.level = String(level().number);
  board.dataset.status = state.completed ? 'won' : 'playing';
  board.dataset.faceCount = String(faceAccess.visibleFaces.length);
  if (drag) {
    const visualState = clone(state);
    visualState.shafts[drag.id] = Math.max(
      0,
      Math.min(2, Math.round((RAIL_BOTTOM - drag.y) / 150)),
    );
    for (const svg of board.querySelectorAll('svg[data-face]'))
      renderDragPreview(svg, level(), visualState, drag);
    return;
  }
  const focused = document.activeElement;
  const focusedFace = focused?.closest('svg[data-face]')?.dataset.face;
  const focusedShaft = focused?.getAttribute('data-shaft');
  const focusedLatch = focused?.getAttribute('data-latch');
  // Retain the existing face cards: revealing a face never replaces another one.
  for (const id of faceAccess.visibleFaces) {
    let svg = board.querySelector(`svg[data-face="${id}"]`);
    if (!svg) {
      const face = faceById(id);
      const card = document.createElement('section');
      card.className = 'face-card';
      card.dataset.faceCard = id;
      const heading = document.createElement('div');
      heading.className = 'face-heading';
      const title = document.createElement('h3');
      title.textContent = face.label;
      const caption = document.createElement('span');
      caption.textContent = face.caption;
      heading.append(title, caption);
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 720 600');
      svg.setAttribute('role', 'group');
      svg.dataset.face = id;
      card.append(heading, svg);
      board.append(card);
    }
    renderBoard(svg, level(), state, { face: id, ball, highlighted });
  }
  const focusedBoard = board.querySelector(`svg[data-face="${focusedFace}"]`);
  if (focusedShaft)
    focusedBoard?.querySelector(`[data-shaft="${focusedShaft}"]`)?.focus({ preventScroll: true });
  if (focusedLatch)
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
  const frontVisible = faceAccess.visibleFaces.includes('front');
  const remaining = hiddenFaces(faceAccess);
  $('#level-number').textContent = String(levelIndex + 1).padStart(2, '0');
  $('#level-title').textContent = level().title;
  $('#level-subtitle').textContent = level().subtitle;
  $('#intro').textContent = level().intro;
  $('#side-name').textContent = `${faceAccess.visibleFaces.length} / 6 面已展开`;
  $('#face-strip').replaceChildren(
    ...FACES.map((face) => {
      const marker = document.createElement('span');
      const visible = faceAccess.visibleFaces.includes(face.id);
      marker.className = visible ? 'face-marker revealed' : 'face-marker';
      marker.textContent = face.label;
      marker.setAttribute('aria-label', `${face.label}：${visible ? '已展开' : '未展开'}`);
      return marker;
    }),
  );
  $('#reveal').disabled = !remaining.length || rewardPending || state.completed;
  $('#reveal span').textContent = remaining.length ? '提示 · 展开一面' : '六面已全部展开';
  $('#hint-reveal').disabled = !remaining.length || rewardPending || state.completed;
  $('#hint-reveal').textContent = remaining.length
    ? `展开${remaining[0].label} · 免费`
    : '六面已全部展开';
  $('#reward-reveal').disabled =
    !remaining.length ||
    rewardPending ||
    ballMoving ||
    state.completed ||
    !canOfferReward(window.twoSidedBoxHost);
  $('#reward-reveal').textContent = rewardPending ? '等待视频奖励…' : '看视频 · 多看一面';
  $('#reward-note').textContent =
    rewardFeedback ||
    (canOfferReward(window.twoSidedBoxHost)
      ? '完整观看后展开一面，也可使用免费提示。'
      : '当前暂无可用视频，可使用免费提示展开。');
  $('#reveal-note').textContent = remaining.length
    ? `还藏着 ${remaining.length} 面 · 展开后会一直留在观察台上`
    : '六面共同联动 · 拖动任意可操作面上的黄铜滑轴';
  $('#move-count').textContent = state.moves;
  $('#release').disabled =
    !frontVisible || state.released || state.completed || animating || rewardPending;
  $('#release span').textContent = !frontVisible
    ? '先展开正面放球'
    : state.completed
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
  $('#undo').disabled = !history.length || animating || ballMoving || rewardPending;
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
      role.textContent = `${shaft.frontRole} / ${shaft.backRole}`;
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
    const element = id ? board.querySelector(`[data-shaft="${id}"], [data-latch="${id}"]`) : null;
    element?.classList.add('jolt');
    setTimeout(() => element?.classList.remove('jolt'), 500);
  }
}

function change(action, id = null) {
  if (animating || drag || rewardPending || state.completed) return false;
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
      for (const sprite of board.querySelectorAll('[data-ball]'))
        sprite.setAttribute('transform', `translate(${ball[0]} ${ball[1]})`);
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
        `第 ${levelIndex + 1} 盒「${level().title}」已完成。${state.moves} 次机关操作，展开了 ${faceAccess.visibleFaces.length} 个面。`;
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
  for (const svg of board.querySelectorAll('svg[data-face]'))
    renderDragPreview(svg, level(), state, { ...drag, y: shaftY(state.shafts[drag.id]) });
  drag = null;
  if (board.hasPointerCapture(pointer)) board.releasePointerCapture(pointer);
  deferSceneUntilTouchEnds();
  paintScene();
}

function closeDialogs() {
  document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
}

function loadLevel(index) {
  cancelDrag();
  generation += 1;
  rewardPending = false;
  rewardFeedback = '';
  faceAccess = createFaceAccess();
  board.replaceChildren();
  ballMoving = false;
  animating = false;
  deferredScene = false;
  levelIndex = index;
  state = createState(level());
  history = [];
  ball = [...level().path[0]];
  ballPathCursor = 0;
  highlighted = null;
  hintIndex = 0;
  feedback = openingFeedback();
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

function revealNextFace(requestedId) {
  if (drag || state.completed) return;
  const next = revealFace(faceAccess, requestedId);
  if (next === faceAccess) return;
  faceAccess = next;
  const face = faceById(faceAccess.visibleFaces.at(-1));
  feedback = `已展开${face.label}。所有已展开的面都保留在观察台，机关位置不变。`;
  sound('latch');
  update();
}

async function revealWithReward() {
  const hidden = hiddenFaces(faceAccess);
  if (
    rewardPending ||
    drag ||
    ballMoving ||
    state.completed ||
    !hidden.length ||
    !canOfferReward(window.twoSidedBoxHost)
  )
    return;
  const token = generation;
  const face = hidden[0];
  rewardPending = true;
  rewardFeedback = '';
  update();
  const outcome = await offerFaceReward(window.twoSidedBoxHost, face.id);
  // A reward requested for an old attempt cannot unlock a fresh box.
  if (token !== generation) return;
  rewardPending = false;
  if (outcome.status === 'completed') {
    revealNextFace(face.id);
    $('#hint-dialog').close();
  } else {
    feedback =
      outcome.status === 'dismissed'
        ? '视频未看完，没有展开新面。也可以使用免费提示。'
        : '暂时无法播放视频。可以使用免费提示展开一面。';
    rewardFeedback = feedback;
    update();
  }
}

function boardPoint(event, svg = drag?.svg || event.target.closest('svg[data-face]')) {
  const matrix = svg?.getScreenCTM();
  if (!matrix) return null;
  return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
}

board.addEventListener('pointerdown', (event) => {
  if (
    !event.isPrimary ||
    event.button !== 0 ||
    animating ||
    ballMoving ||
    rewardPending ||
    state.completed ||
    drag
  )
    return;
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
  const point = boardPoint(event);
  if (!point) return;
  drag = {
    id,
    pointerId: event.pointerId,
    svg: shaftElement.closest('svg[data-face]'),
    y: shaftY(value),
    startY: point.y,
    handleY: shaftY(value),
    moved: false,
    before: remember(),
  };
  board.setPointerCapture(event.pointerId);
});
board.addEventListener('pointermove', (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const point = boardPoint(event);
  if (!point) return;
  const nextY = Math.max(RAIL_TOP, Math.min(RAIL_BOTTOM, drag.handleY + point.y - drag.startY));
  drag.moved ||= Math.abs(nextY - drag.handleY) > 5;
  drag.y = nextY;
  highlighted = drag.id;
  paintScene();
});
board.addEventListener('pointerup', (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const gesture = drag;
  const value = Math.max(0, Math.min(2, Math.round((RAIL_BOTTOM - drag.y) / 150)));
  drag = null;
  if (board.hasPointerCapture(event.pointerId)) board.releasePointerCapture(event.pointerId);
  if (gesture.moved) {
    const result = moveShaft(level(), state, gesture.id, value);
    if (result.ok && result.changed) {
      history.push(gesture.before);
      feedback = result.message;
      sound('move');
    } else if (!result.ok) feedback = result.message;
  }
  for (const svg of board.querySelectorAll('svg[data-face]'))
    renderDragPreview(svg, level(), state, { ...gesture, y: shaftY(state.shafts[gesture.id]) });
  deferSceneUntilTouchEnds();
  update();
  if (state.released) void runBall();
});
board.addEventListener('pointercancel', (event) => {
  if (drag?.pointerId === event.pointerId) cancelDrag();
});
board.addEventListener('lostpointercapture', () => {
  if (drag) cancelDrag();
});
window.addEventListener('blur', cancelDrag);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelDrag();
    void audioContext?.suspend().catch(() => {});
  }
});
board.addEventListener('click', (event) => {
  const latch = event.target.closest('[data-latch]');
  const notch = event.target.closest('[data-notch-shaft]');
  if (latch)
    change(
      () =>
        toggleLatch(
          level(),
          state,
          latch.dataset.latch,
          latch.closest('svg[data-face]').dataset.face,
        ),
      latch.dataset.latch,
    );
  else if (notch)
    change(
      () => moveShaft(level(), state, notch.dataset.notchShaft, Number(notch.dataset.value)),
      notch.dataset.notchShaft,
    );
});
board.addEventListener('keydown', (event) => {
  const shaft = event.target.closest('[data-shaft]');
  const latch = event.target.closest('[data-latch]');
  if (latch && ['Enter', ' '].includes(event.key)) {
    event.preventDefault();
    change(
      () =>
        toggleLatch(
          level(),
          state,
          latch.dataset.latch,
          latch.closest('svg[data-face]').dataset.face,
        ),
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

$('#reveal').addEventListener('click', () => {
  if (!rewardPending) revealNextFace();
});
$('#hint-reveal').addEventListener('click', () => {
  if (rewardPending) return;
  revealNextFace();
  $('#hint-dialog').close();
});
$('#reward-reveal').addEventListener('click', () => void revealWithReward());
$('#release').addEventListener('click', () => {
  if (faceAccess.visibleFaces.includes('front')) change(() => releaseBall(level(), state, 'front'));
});
$('#restart').addEventListener('click', () => loadLevel(levelIndex));
$('#undo').addEventListener('click', () => {
  if (!history.length || animating || ballMoving || rewardPending) return;
  cancelDrag();
  generation += 1;
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
    faceAccess,
    rewardPending,
    levelId: level().id,
    state,
    historyLength: history.length,
    progress,
    animating,
    ballMoving,
    dragging: Boolean(drag),
    ball,
    ballPathCursor,
    ...{ mechanisms: getSnapshot(level(), state) },
  });
update();
$('#start').firstChild.textContent = Object.keys(progress.best).length
  ? '继续探索机关盒 '
  : '开始探索机关盒 ';
$('#welcome').showModal();

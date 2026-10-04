import { LEVELS } from './levels.mjs';
import { FACE_IDS, FACE_DEFS } from './faces.mjs';
import {
  createState,
  moveShaft,
  toggleLatch,
  revealFace,
  revealStructure,
  releaseBall,
  advanceBall,
  getSnapshot,
} from './engine.mjs';
import { createStructureViewer } from './structure-view.mjs';
import { createRevealAccess } from './reveal-access.mjs';
import { readProgress, saveProgress } from './progress.mjs';
import { installTouchButtons } from './touch-buttons.mjs';
import { canOfferReward, offerFaceReward } from './rewards.mjs';

installTouchButtons(document);

const $ = (selector) => document.querySelector(selector);
const clone = (value) => structuredClone(value);
const faceName = (face) => FACE_DEFS[face].label;
const positions = ['低', '中', '高'];
const access = createRevealAccess();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let storage;
try {
  storage = localStorage;
} catch {
  /* Storage is optional. */
}
const progress = readProgress(storage, LEVELS);
let levelIndex = progress.selected;
const level = () => LEVELS[levelIndex];
let state = createState(level());
let initialFaces = [...state.revealedFaces];
let ball = [...level().path[0]];
let ballPathCursor = 0;
let ballMoving = false;
let history = [];
let generation = 0;
let feedback = level().intro;
let audioContext;
let structureViewer;
let structureXray = true;
let structureExploded = false;
let structureForCompletion = false;
let switchingLevel = false;
let revealPending = false;
let rewardPending = false;
let observationRequest = 0;
let rewardController;
let rewardFeedback = '';
let selectedReveal = null;
const faceBoards = new Map();

const remember = () => ({ state: clone(state), ball: [...ball], ballPathCursor });
const save = () => saveProgress(storage, progress);
function sound(kind = 'move') {
  if (!progress.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    void audioContext.resume().catch(() => {});
    const notes = kind === 'win' ? [440, 554, 660] : kind === 'blocked' ? [160] : [340, 420];
    notes.forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const start = audioContext.currentTime + index * 0.09;
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.025, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.13);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.14);
    });
  } catch {
    /* Audio never blocks a move. */
  }
}

function message(text, blocked = false) {
  feedback = text;
  $('#status').textContent = text;
  if (blocked) sound('blocked');
}

function renderFaces() {
  $('#face-nav').replaceChildren(
    ...FACE_IDS.map((face) => {
      const known = state.revealedFaces.includes(face);
      const marker = document.createElement(known ? 'span' : 'button');
      marker.dataset.face = face;
      marker.dataset.revealed = String(known);
      marker.className = known ? 'face-marker revealed' : 'face-marker';
      marker.setAttribute(
        'aria-label',
        known ? `${faceName(face)}已展开` : `揭示${faceName(face)}`,
      );
      marker.textContent = faceName(face);
      if (!known) {
        const note = document.createElement('small');
        note.textContent = '提示展开';
        note.setAttribute('aria-hidden', 'true');
        marker.append(note);
        marker.disabled = revealPending || state.completed;
        marker.addEventListener('click', () => openHint(face));
      }
      return marker;
    }),
  );
}

function renderControls(snapshot, face, target) {
  const fragment = document.createDocumentFragment();
  for (const shaft of snapshot.shafts.filter((item) => item.face === face)) {
    const row = document.createElement('div');
    row.className = 'control-row';
    const label = document.createElement('span');
    label.textContent = `${shaft.id} 轴`;
    const note = document.createElement('small');
    note.textContent = shaft.locked ? '被锁扣固定' : '低 · 中 · 高，三挡滑动';
    label.append(note);
    const detents = document.createElement('div');
    detents.className = 'detents';
    for (let value = shaft.min; value <= shaft.max; value++) {
      const button = document.createElement('button');
      button.dataset.shaft = shaft.id;
      button.dataset.value = String(value);
      button.setAttribute('aria-label', `${shaft.id} 轴${positions[value]}位`);
      button.setAttribute('aria-pressed', String(shaft.value === value));
      button.disabled = ballMoving || state.completed || revealPending;
      button.textContent = positions[value];
      button.addEventListener('click', () =>
        change(() => moveShaft(level(), state, shaft.id, value, face)),
      );
      detents.append(button);
    }
    row.append(label, detents);
    fragment.append(row);
  }
  for (const latch of snapshot.latches.filter((item) => item.face === face)) {
    const row = document.createElement('div');
    row.className = 'control-row';
    const label = document.createElement('span');
    label.textContent = `${latch.shaft} 轴锁扣`;
    const note = document.createElement('small');
    note.textContent =
      (latch.releaseWhen ?? [])
        .map(
          (condition) =>
            `${condition.shaft} 轴${condition.positions.map((value) => positions[value]).join('或')}位可释放`,
        )
        .join('；') || '固定同名滑轴';
    label.append(note);
    const button = document.createElement('button');
    button.className = 'latch-button';
    button.dataset.latch = latch.id;
    button.setAttribute('aria-label', `${latch.engaged ? '松开' : '扣紧'}${latch.shaft}轴锁扣`);
    button.setAttribute('aria-pressed', String(latch.engaged));
    button.disabled = ballMoving || state.completed || revealPending;
    button.textContent = latch.engaged ? '松开锁扣' : '扣紧锁扣';
    button.addEventListener('click', () =>
      change(() => toggleLatch(level(), state, latch.id, face)),
    );
    row.append(label, button);
    fragment.append(row);
  }
  if (!fragment.childNodes.length) {
    const note = document.createElement('p');
    note.className = 'empty-face';
    note.textContent = '机关检视窗 · 这一面展示内部联动，可在其他已展开的面上操作。';
    fragment.append(note);
  }
  target.replaceChildren(fragment);
}

function renderBoards(snapshot) {
  for (const face of state.revealedFaces) {
    let entry = faceBoards.get(face);
    if (!entry) {
      const card = document.createElement('section');
      card.className = 'face-card';
      card.dataset.faceCard = face;
      card.setAttribute('aria-label', `${faceName(face)}观察窗`);
      const heading = document.createElement('header');
      heading.className = 'face-heading';
      const title = document.createElement('h3');
      title.textContent = faceName(face);
      const note = document.createElement('span');
      note.textContent = '同一只盒子 · 实时联动';
      heading.append(title, note);
      const canvas = document.createElement('canvas');
      canvas.dataset.faceBoard = face;
      canvas.tabIndex = 0;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `${faceName(face)}机关盒，可拖动滑轴或点按锁扣`);
      canvas.setAttribute('aria-describedby', 'board-gesture status');
      canvas.textContent = '机关画面不可用，可使用本面下方的档位和锁扣按钮。';
      const controls = document.createElement('div');
      controls.className = 'face-controls';
      controls.setAttribute('aria-label', `${faceName(face)}机关操作`);
      card.append(heading, canvas, controls);
      $('#board').append(card);
      const viewer = createStructureViewer(canvas, {
        mode: 'face',
        face,
        onShaft: (id, value) => change(() => moveShaft(level(), state, id, value, face)),
        onLatch: (id) => change(() => toggleLatch(level(), state, id, face)),
      });
      entry = { card, viewer, controls };
      faceBoards.set(face, entry);
    }
    entry.viewer.update(level(), state, ball);
    renderControls(snapshot, face, entry.controls);
  }
  $('#board').dataset.level = level().id;
  $('#board').dataset.status = state.completed ? 'won' : 'playing';
}

function updateBoards() {
  for (const { viewer } of faceBoards.values()) viewer.update(level(), state, ball);
}

function clearBoards() {
  for (const { viewer } of faceBoards.values()) viewer.destroy();
  faceBoards.clear();
  $('#board').replaceChildren();
}

function updateStructure() {
  if (!$('#structure-dialog').open || !structureViewer) return;
  structureViewer.update(level(), state, ball);
  $('#structure-level').textContent = `第 ${level().number} 盒 · ${level().title}`;
  $('#structure-state').replaceChildren(
    ...getSnapshot(level(), state).shafts.map((shaft) => {
      const card = document.createElement('div');
      card.className = 'structure-state-card';
      const title = document.createElement('strong');
      title.textContent = `${shaft.id} 轴 · ${faceName(shaft.face)} · ${positions[shaft.value]}位`;
      const details = document.createElement('p');
      details.textContent = getSnapshot(level(), state)
        .gates.filter((gate) => gate.shaft === shaft.id)
        .map((gate) => `${gate.label}：${gate.open ? '孔口对齐' : '未对齐'}`)
        .join('；');
      card.append(title, details);
      return card;
    }),
  );
}

function update() {
  const focused = document.activeElement;
  const focusedFace = focused?.closest('[data-face-card]')?.dataset.faceCard;
  const focusKey = focused?.dataset.shaft
    ? `[data-shaft="${focused.dataset.shaft}"][data-value="${focused.dataset.value}"]`
    : focused?.dataset.latch
      ? `[data-latch="${focused.dataset.latch}"]`
      : focused?.dataset.face
        ? `[data-face="${focused.dataset.face}"]`
        : null;
  const snapshot = getSnapshot(level(), state);
  renderBoards(snapshot);
  $('#chapter-name').textContent = `第 ${level().chapter.number} 章 · ${level().chapter.title}`;
  $('#level-number').textContent = String(level().number).padStart(2, '0');
  $('#level-title').textContent = level().title;
  $('#difficulty').textContent = level().difficulty;
  $('#intro').textContent = level().intro;
  $('#side-name').textContent = `${state.revealedFaces.length} 面同时展开`;
  $('#move-count').textContent = state.moves;
  $('#status').textContent = feedback;
  $('#collection-count').textContent = `${Object.keys(progress.best).length} / ${LEVELS.length}`;
  $('#view-count').textContent = `${state.revealedFaces.length} / 6`;
  const hintLabel = state.structureViewed
    ? '重看完整 3D'
    : state.revealedFaces.length === 6
      ? '最终提示：完整 3D'
      : '提示 · 展开一面';
  $('#hint [data-label]').textContent = hintLabel;
  $('#hint').disabled = revealPending || state.completed;
  $('#release').disabled = state.released || state.completed || ballMoving || revealPending;
  $('#release [data-label]').textContent = state.completed
    ? '已进入终点'
    : state.released
      ? '小球已出发'
      : '放出小球';
  $('#undo').disabled = !history.length || ballMoving || state.completed || revealPending;
  $('#ball-state').textContent = state.completed
    ? '已进入终点'
    : ballMoving
      ? '小球前进中'
      : state.released
        ? '等候孔口对齐'
        : '小球待出发';
  $('#sound').textContent = progress.sound ? '关闭音效' : '开启音效';
  $('#sound').setAttribute('aria-pressed', String(progress.sound));
  renderFaces();
  if (focusKey) {
    const scope = focusedFace ? faceBoards.get(focusedFace)?.card : document;
    scope?.querySelector(focusKey)?.focus({ preventScroll: true });
  }
  if ($('#hint-dialog').open) renderHint();
  updateStructure();
}

function change(action) {
  if (state.completed || ballMoving || revealPending) return;
  const before = remember();
  const result = action();
  if (!result.ok) return message(result.message, true);
  if (result.changed !== false) history.push(before);
  feedback = result.message;
  sound();
  update();
  if (state.released) void runBall();
}

async function animateTo(index, token) {
  while (ballPathCursor < index) {
    const start = [...ball];
    const target = level().path[ballPathCursor + 1];
    const duration = reducedMotion.matches
      ? 12
      : Math.min(240, Math.max(75, Math.hypot(...target.map((v, i) => v - start[i])) * 1.1));
    const began = performance.now();
    const completed = await new Promise((resolve) => {
      function tick(now) {
        if (token !== generation) return resolve(false);
        const fraction = Math.min(1, (now - began) / duration);
        ball = start.map((v, i) => v + (target[i] - v) * fraction);
        updateBoards();
        if ($('#structure-dialog').open) structureViewer?.update(level(), state, ball);
        if (fraction < 1) requestAnimationFrame(tick);
        else resolve(true);
      }
      requestAnimationFrame(tick);
    });
    if (!completed) return false;
    ballPathCursor += 1;
  }
  return token === generation;
}

async function runBall() {
  if (ballMoving || !state.released || state.completed) return;
  const token = generation;
  ballMoving = true;
  update();
  while (token === generation && !state.completed) {
    const checkpoint = level().checkpoints[state.checkpoint];
    // Stop in front of a closed plate, not inside its solid material.
    const approach = checkpoint.gateIds.length ? checkpoint.pathIndex - 1 : checkpoint.pathIndex;
    if (!(await animateTo(approach, token))) return;
    if (getSnapshot(level(), state).blockedGateIds.length) {
      feedback = getSnapshot(level(), state).blockingReason;
      break;
    }
    if (!(await animateTo(checkpoint.pathIndex, token))) return;
    const result = advanceBall(level(), state);
    feedback = result.message;
    if (!result.ok) break;
  }
  if (token !== generation) return;
  ballMoving = false;
  update();
  if (state.completed) completeLevel();
}

function closeDialogs() {
  document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
}

function loadLevel(index, restart = false) {
  switchingLevel = true;
  generation += 1;
  access.invalidate();
  rewardController?.abort();
  observationRequest += 1;
  revealPending = false;
  rewardPending = false;
  structureForCompletion = false;
  ballMoving = false;
  closeDialogs();
  clearBoards();
  levelIndex = index;
  state = createState(level());
  initialFaces = [...state.revealedFaces];
  history = [];
  ball = [...level().path[0]];
  ballPathCursor = 0;
  feedback = restart
    ? `机关已复位，重新随机展开${initialFaces.map(faceName).join('和')}。`
    : `先从${initialFaces.map(faceName).join('和')}同时观察。${level().intro}`;
  progress.selected = index;
  save();
  update();
  switchingLevel = false;
}

function renderHint() {
  const hidden = FACE_IDS.filter((face) => !state.revealedFaces.includes(face));
  $('#hint-title').textContent = hidden.length ? '从哪一面继续看？' : '最后一条线索：完整结构';
  $('#hint-copy').textContent = hidden.length
    ? `已展开 ${state.revealedFaces.length} 面。选一个新角度，所有已展开的面都会留在同一个观察台。`
    : '六面已揭示。现在可以旋转完整结构，并选择是否透视外壳。';
  const options =
    selectedReveal && hidden.includes(selectedReveal)
      ? [selectedReveal, ...hidden.filter((face) => face !== selectedReveal)]
      : hidden;
  $('#reveal-options').replaceChildren(
    ...(hidden.length
      ? options.map((face) => {
          const button = document.createElement('button');
          button.dataset.revealFace = face;
          button.disabled = revealPending;
          button.textContent = faceName(face);
          const note = document.createElement('small');
          note.textContent = '免费查看这一面';
          button.append(note);
          button.addEventListener('click', () => void requestObservation('face', face));
          return button;
        })
      : [
          (() => {
            const button = document.createElement('button');
            button.className = 'final-hint';
            button.id = 'reveal-structure';
            button.disabled = revealPending;
            button.textContent = '查看完整 3D 结构';
            const note = document.createElement('small');
            note.textContent = '最终提示 · 可选外壳透视';
            button.append(note);
            button.addEventListener('click', () => void requestObservation('structure'));
            return button;
          })(),
        ]),
  );
  const rewardFace = options[0];
  $('#reward-reveal').hidden = !hidden.length;
  $('#reward-note').hidden = !hidden.length;
  $('#reward-reveal').disabled =
    revealPending || ballMoving || state.completed || !canOfferReward(window.twoSidedBoxHost);
  $('#reward-reveal').textContent = rewardPending
    ? '等待视频奖励…'
    : rewardFace
      ? `看视频 · 展开${faceName(rewardFace)}`
      : '六面已全部展开';
  $('#reward-note').textContent =
    rewardFeedback ||
    (canOfferReward(window.twoSidedBoxHost)
      ? '完整观看后展开这一面，也可以直接使用上方的免费提示。'
      : '当前暂无可用视频，可使用上方的免费提示展开。');
}

function openHint(face = null) {
  if (revealPending || state.completed) return;
  if (state.structureViewed) return openStructure(false);
  selectedReveal = face;
  rewardFeedback = '';
  $('#reveal-feedback').textContent = '';
  renderHint();
  $('#hint-dialog').showModal();
}

async function requestObservation(kind, face) {
  if (revealPending) return;
  const token = generation;
  const request = ++observationRequest;
  revealPending = true;
  renderHint();
  $('#reveal-feedback').textContent = '正在打开观察窗…';
  const grant = await access.request({ kind, face, levelId: level().id });
  if (token !== generation || request !== observationRequest || !$('#hint-dialog').open) return;
  revealPending = false;
  if (!grant.granted) {
    $('#reveal-feedback').textContent = '这次没有打开，可以稍后重试。';
    renderHint();
    return;
  }
  const result = kind === 'face' ? revealFace(state, face) : revealStructure(state);
  if (!result.ok) {
    $('#reveal-feedback').textContent = result.message;
    renderHint();
    return;
  }
  $('#hint-dialog').close();
  if (kind === 'face') {
    feedback = `已展开${faceName(face)}。所有已知面同时保留，机关位置不变。`;
    update();
  } else {
    update();
    openStructure(false);
  }
}

async function requestRewardedFace() {
  const hidden = FACE_IDS.filter((face) => !state.revealedFaces.includes(face));
  if (
    revealPending ||
    ballMoving ||
    state.completed ||
    !hidden.length ||
    !canOfferReward(window.twoSidedBoxHost)
  )
    return;
  const face = hidden.includes(selectedReveal) ? selectedReveal : hidden[0];
  const token = generation;
  const request = ++observationRequest;
  rewardController = new AbortController();
  rewardPending = true;
  revealPending = true;
  rewardFeedback = '';
  update();
  const outcome = await offerFaceReward(window.twoSidedBoxHost, face, {
    signal: rewardController.signal,
  });
  if (token !== generation || request !== observationRequest || !$('#hint-dialog').open) return;
  rewardController = null;
  rewardPending = false;
  revealPending = false;
  if (outcome.status === 'completed') {
    const result = revealFace(state, face);
    if (result.ok) {
      $('#hint-dialog').close();
      feedback = `视频奖励已完成，${faceName(face)}已展开。所有已知面同时保留。`;
      sound();
      update();
      return;
    }
  }
  rewardFeedback =
    outcome.status === 'dismissed'
      ? '视频未看完，没有展开新面。也可以使用免费提示。'
      : '暂时无法播放视频，没有展开新面。可以使用免费提示。';
  update();
}

function openStructure(forCompletion) {
  if (!state.structureViewed && !state.completed) return;
  structureForCompletion = forCompletion;
  $('#structure-purpose').textContent = forCompletion
    ? '机关已解开 · 先看看完整结构'
    : '最终提示 · 完整机关原理模型';
  $('#structure-close').textContent = forCompletion ? '进入结算 →' : '返回操作';
  $('#structure-dialog').showModal();
  structureViewer ||= createStructureViewer($('#structure-canvas'), { mode: 'structure' });
  structureViewer.setXray(structureXray);
  structureViewer.setExploded(structureExploded);
  structureViewer.setView('angled');
  updateStructure();
  structureViewer.resize();
}

function showResult() {
  if (switchingLevel || !state.completed) return;
  closeDialogs();
  $('#result-copy').textContent =
    `第 ${level().number} 盒「${level().title}」已完成。${state.moves} 次机关操作，观察了 ${state.revealedFaces.length} 面。`;
  $('#next').textContent = levelIndex === LEVELS.length - 1 ? '查看全部收藏 →' : '打开下一个盒子 →';
  $('#result').showModal();
}

function completeLevel() {
  progress.best[level().id] = Math.min(
    progress.best[level().id] ?? Infinity,
    Math.max(1, state.moves),
  );
  save();
  sound('win');
  access.invalidate();
  revealPending = false;
  closeDialogs();
  if (!state.structureViewed) {
    revealStructure(state);
    openStructure(true);
  } else showResult();
  update();
}

function openLevels() {
  $('#level-nav').replaceChildren();
  for (let chapter = 1; chapter <= 5; chapter++) {
    const items = LEVELS.filter((item) => item.chapter.number === chapter);
    const section = document.createElement('section');
    section.className = 'chapter-collection';
    const heading = document.createElement('h3');
    heading.textContent = `第 ${chapter} 章 · ${items[0].chapter.title}`;
    const grid = document.createElement('div');
    grid.className = 'level-grid';
    for (const item of items) {
      const index = LEVELS.indexOf(item);
      const button = document.createElement('button');
      button.dataset.levelIndex = String(index);
      button.setAttribute('aria-current', String(index === levelIndex));
      button.setAttribute('aria-label', `第${item.number}关 ${item.title}`);
      const number = document.createElement('strong');
      number.textContent =
        String(item.number).padStart(2, '0') + (progress.best[item.id] ? ' ✓' : '');
      const name = document.createElement('span');
      name.textContent = item.title;
      button.append(number, name);
      button.addEventListener('click', () => loadLevel(index));
      grid.append(button);
    }
    section.append(heading, grid);
    $('#level-nav').append(section);
  }
  $('#level-dialog').showModal();
}

$('#release').addEventListener('click', () => change(() => releaseBall(level(), state)));
$('#hint').addEventListener('click', () => openHint());
$('#reward-reveal').addEventListener('click', () => void requestRewardedFace());
$('#restart').addEventListener('click', () => loadLevel(levelIndex, true));
$('#undo').addEventListener('click', () => {
  if (!history.length || ballMoving || state.completed || revealPending) return;
  generation += 1;
  const knowledge = {
    revealedFaces: [...state.revealedFaces],
    structureViewed: state.structureViewed,
    side: state.side,
  };
  const previous = history.pop();
  state = { ...previous.state, ...knowledge };
  ball = previous.ball;
  ballPathCursor = previous.ballPathCursor;
  feedback = '机关和小球已退回上一步，观察过的角度保留。';
  update();
  if (state.released) void runBall();
});
$('#levels').addEventListener('click', openLevels);
$('.brand').addEventListener('click', (event) => {
  event.preventDefault();
  openLevels();
});
$('#help').addEventListener('click', () => $('#help-dialog').showModal());
$('#sound').addEventListener('click', () => {
  progress.sound = !progress.sound;
  save();
  update();
  if (progress.sound) sound();
});
$('#start').addEventListener('click', () => {
  $('#welcome').close();
  for (const { viewer } of faceBoards.values()) viewer.resize();
});
$('#next').addEventListener('click', () => {
  $('#result').close();
  if (levelIndex < LEVELS.length - 1) loadLevel(levelIndex + 1);
  else openLevels();
});
$('#replay').addEventListener('click', () => loadLevel(levelIndex, true));
$('#result').addEventListener('cancel', (event) => event.preventDefault());
$('#result-structure').addEventListener('click', () => {
  $('#result').close();
  openStructure(true);
});
$('#structure-close').addEventListener('click', () => $('#structure-dialog').close());
$('#structure-dialog').addEventListener('close', () => {
  const needsResult = structureForCompletion;
  structureForCompletion = false;
  if (needsResult && !switchingLevel) showResult();
});
$('#hint-dialog').addEventListener('close', () => {
  access.invalidate();
  rewardController?.abort();
  rewardController = null;
  observationRequest += 1;
  revealPending = false;
  rewardPending = false;
  if (!switchingLevel) update();
});
$('#structure-xray').addEventListener('click', () => {
  structureXray = !structureXray;
  $('#structure-xray').setAttribute('aria-pressed', String(structureXray));
  structureViewer?.setXray(structureXray);
});
$('#structure-explode').addEventListener('click', () => {
  structureExploded = !structureExploded;
  $('#structure-explode').setAttribute('aria-pressed', String(structureExploded));
  structureViewer?.setExploded(structureExploded);
});
$('#structure-views').replaceChildren(
  ...FACE_IDS.map((face) => {
    const button = document.createElement('button');
    button.dataset.structureView = face;
    button.textContent = faceName(face);
    return button;
  }),
);
$('#structure-dialog').addEventListener('click', (event) => {
  const button = event.target.closest('[data-structure-view]');
  if (button) structureViewer?.setView(button.dataset.structureView);
});
$('#structure-zoom-in').addEventListener('click', () => structureViewer?.zoom(0.15));
$('#structure-zoom-out').addEventListener('click', () => structureViewer?.zoom(-0.15));
document
  .querySelectorAll('[data-close]')
  .forEach((button) =>
    button.addEventListener('click', () => document.getElementById(button.dataset.close).close()),
  );
document.addEventListener('visibilitychange', () => {
  if (document.hidden) void audioContext?.suspend().catch(() => {});
});

// Read-only diagnostics; all browser acceptance actions use visible controls.
window.__twoSidedSnapshot = () =>
  clone({
    levelIndex,
    levelId: level().id,
    state,
    initialFaces,
    ball,
    ballPathCursor,
    ballMoving,
    historyLength: history.length,
    progress,
    revealPending,
    rewardPending,
    mechanisms: getSnapshot(level(), state),
    boards: Object.fromEntries(
      [...faceBoards].map(([face, entry]) => [face, entry.viewer.getSnapshot()]),
    ),
    board:
      (faceBoards.get(state.side) ?? faceBoards.values().next().value)?.viewer.getSnapshot() ??
      null,
    structure: structureViewer?.getSnapshot() ?? null,
    structureOpen: $('#structure-dialog').open,
  });
update();
$('#welcome').showModal();

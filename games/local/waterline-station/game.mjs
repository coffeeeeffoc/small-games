import { LEVELS } from './levels.mjs';
import {
  createState,
  toggleGate,
  previewGate,
  getObjectives,
  solve,
  isGateLocked,
} from './engine.mjs';
import { renderBoard, getBoardLayout } from './render.mjs';
import { readProgress, saveProgress } from './progress.mjs';

const $ = (selector) => document.querySelector(selector);
let storage;
try {
  storage = window.localStorage;
} catch {
  storage = null;
}
const progress = readProgress(storage, LEVELS);
let levelIndex = progress.selected;
let level = LEVELS[levelIndex];
let state;
let history = [];
let prediction = false;
let selectedGate = null;
let preview = null;
let animating = false;
let frame = 0;
let extraClaimed = false;
let audioContext;
let displayedVolumes = [];
let boardLayout;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const format = (value) => Number(value.toFixed(2)).toString();
const persist = () => saveProgress(storage, progress);

function sound(kind = 'valve') {
  if (!progress.sound || document.hidden) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    audioContext ??= new Audio();
    void audioContext.resume().catch(() => {});
    const notes =
      kind === 'win' ? [392, 494, 587, 784] : kind === 'switch' ? [523, 659] : [196, 294];
    notes.forEach((frequency, i) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const time = audioContext.currentTime + i * 0.09;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, time);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.055, time + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.28);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(time);
      oscillator.stop(time + 0.3);
    });
  } catch {
    /* Audio is optional; denied media must not interrupt a turn. */
  }
}

function message(text, label = '调度提示') {
  $('#message').textContent = text;
  $('#message-label').textContent = label;
}

function draw() {
  renderBoard(
    $('#board'),
    level,
    state,
    displayedVolumes,
    preview,
    performance.now() / 1000,
    boardLayout,
  );
  $('#board').dataset.level = String(levelIndex + 1);
  $('#board').dataset.status = animating
    ? 'flowing'
    : state.won
      ? 'won'
      : state.lost
        ? 'lost'
        : 'playing';
  $('#board').setAttribute(
    'aria-label',
    level.tanks
      .map((tank, i) => `${tank.id}槽${tank.name}液位${format(state.volumes[i])}`)
      .join('，'),
  );
}

function updateBoardLayout() {
  boardLayout = getBoardLayout(level, $('#board').getBoundingClientRect().width);
  $('#board').setAttribute('viewBox', `0 0 960 ${boardLayout.height}`);
  $('#board').style.aspectRatio = `960 / ${boardLayout.height}`;
  for (const gate of boardLayout.valves) {
    const button = $(`#board-controls [data-gate="${gate.id}"]`);
    button.style.left = `${(gate.x / 960) * 100}%`;
    button.style.top = `${(gate.y / boardLayout.height) * 100}%`;
  }
}

function renderRoutes() {
  $('#level-nav').innerHTML = LEVELS.map((item, index) => {
    const best = progress.best[item.id];
    const stars = best ? (best <= item.par ? 3 : best <= item.par + 1 ? 2 : 1) : 0;
    return `<button class="level-button ${index === levelIndex ? 'active' : ''} ${best ? 'completed' : ''}" data-level-index="${index}" ${index === levelIndex ? 'aria-current="step"' : ''} aria-label="第${index + 1}关 ${escapeHtml(item.title)}${best ? `，最佳${best}步` : ''}"><span class="level-index">${String(index + 1).padStart(2, '0')}</span><span class="level-stars" aria-hidden="true">${stars ? '✦'.repeat(stars) : '·'}</span><span class="level-name">${escapeHtml(item.title)}</span></button>`;
  }).join('');
  $('#route-progress').textContent =
    `航站记录 ${Object.keys(progress.best).length} / ${LEVELS.length}`;
}

function renderControls() {
  const objectives = getObjectives(level, state);
  $('#moves-left').textContent = Math.max(
    0,
    level.maxMoves + (state.bonusMoves || 0) - state.moves,
  );
  $('#objective-count').textContent =
    `${objectives.filter((o) => o.done).length} / ${objectives.length}`;
  $('#objectives').innerHTML = objectives
    .map(
      (o) =>
        `<li class="${o.done ? 'done' : ''}"><span class="objective-check" aria-hidden="true">✓</span><span>${escapeHtml(o.label)}${o.done ? '<span class="sr-only">（已完成）</span>' : ''}</span><span class="objective-value">${typeof o.value === 'number' ? format(o.value) : ''}${typeof o.target === 'number' ? ` / ${format(o.target)}` : ''}</span></li>`,
    )
    .join('');
  // Keep buttons in place so updating a prediction preserves keyboard focus.
  for (const [index, gate] of level.gates.entries()) {
    const button = $(`[data-gate="${gate.id}"]`);
    const locked = isGateLocked(level, state, gate.id);
    const open = state.gates[index];
    const selected = selectedGate === gate.id;
    button.className = `scene-valve ${open ? 'open' : ''} ${locked ? 'locked' : ''} ${selected ? 'selected' : ''}`;
    // aria-disabled preserves keyboard focus while water animates; useGate guards every input.
    button.disabled = state.won || state.lost || locked;
    button.setAttribute('aria-disabled', String(animating || button.disabled));
    button.setAttribute('aria-pressed', String(open));
    const description = `${gate.a}到${gate.b}阀门，${locked ? `等待 ${[gate.requires].flat().join('、')} 箱子开关解锁` : selected ? '再次点击确认' : open ? '已打开，点击关闭' : '已关闭，点击打开'}`;
    button.setAttribute('aria-label', description);
    button.title = description;
    button.querySelector('.valve-state').textContent = locked
      ? '待解锁'
      : selected
        ? '再点确认'
        : open
          ? '已开'
          : '已关';
  }
  $('#undo').disabled = animating || !history.length;
  $('#restart').disabled = animating;
  $('#predict').disabled = animating || state.won || state.lost;
  $('#predict').setAttribute('aria-pressed', String(prediction));
  $('#hint').disabled = animating || state.won || state.lost;
  $('#extra-move').disabled = animating || extraClaimed || state.won;
  $('#extra-move').innerHTML = extraClaimed
    ? '✓ 已增加一次操作 <span>本关已领取</span>'
    : '＋ 多一次操作 <span>本关一次 · 免费</span>';
  $('#sound').setAttribute('aria-pressed', String(progress.sound));
  $('#sound').setAttribute('aria-label', progress.sound ? '关闭音效' : '开启音效');
  $('#sound').textContent = progress.sound ? '♫' : '♪';
  $('#board-status').textContent = animating
    ? '水位重新分配中'
    : preview
      ? '液位预测 · 再点一次确认'
      : state.won
        ? '全站联动完成'
        : state.lost
          ? '操作次数已用尽'
          : '点击场景阀门，开 / 关';
  $('#volume-total').textContent =
    `总水量 ${format(state.volumes.reduce((a, b) => a + b, 0))} · 守恒`;
  $('#predict-note').textContent = prediction
    ? '点击闸门看预测，再点同一闸门确认'
    : '开启后，先看水位，再确认操作';
}

function setBackgroundInert(value) {
  for (const selector of [
    '.masthead',
    '.stage-header',
    '#board-controls',
    '.control-panel',
    '.route-panel',
  ])
    $(selector).inert = value;
}

function hideResult() {
  $('#result').hidden = true;
  setBackgroundInert(false);
}

function showResult() {
  if (!state.won && !state.lost) return;
  const won = state.won;
  const last = levelIndex === LEVELS.length - 1;
  $('.result-card').classList.toggle('loss', !won);
  $('#result-mark').textContent = won ? '✦' : '⌁';
  $('#result-kicker').textContent = won
    ? 'STATION COMPLETE / 调度完成'
    : 'TAKE A BREATH / 再想一步';
  $('#result-title').textContent = won
    ? last
      ? '终站抵达，联动完成！'
      : '全站联动成功'
    : '水还在，换个思路。';
  $('#result-copy').textContent = won
    ? `用了 ${state.moves} 次操作 · 最佳目标 ${level.par} 次\n${state.moves <= level.par ? '恰到好处，每一阀都算数。' : '机关全部就位，小船顺利出航。'}`
    : extraClaimed
      ? '撤销上一步，重新安排水位。\n关阀隔离，也可以是关键一步。'
      : '可以免费增加一次操作，\n也可以撤销，重新安排水位。';
  $('#next-level').textContent = won
    ? last
      ? '返回首站，再试一次 →'
      : '下一站 →'
    : extraClaimed
      ? '重新调度 →'
      : '＋ 免费增加一次操作';
  $('#result-undo').hidden = !history.length;
  $('#result').hidden = false;
  setBackgroundInert(true);
  $('#next-level').focus({ preventScroll: true });
  if (window.innerWidth <= 780)
    $('.board-wrap').scrollIntoView({
      behavior: reduceMotion.matches ? 'instant' : 'smooth',
      block: 'center',
    });
}

function finishTurn() {
  cancelAnimationFrame(frame);
  animating = false;
  displayedVolumes = [...state.volumes];
  draw();
  renderControls();
  if (state.won) {
    progress.best[level.id] = Math.min(progress.best[level.id] ?? Infinity, state.moves);
    persist();
    renderRoutes();
    sound('win');
  }
  showResult();
}

function animate(from) {
  animating = true;
  renderControls();
  const duration = reduceMotion.matches || document.hidden ? 0 : 850;
  const start = performance.now();
  const tick = (time) => {
    const ratio = duration ? Math.min(1, (time - start) / duration) : 1;
    const ease = 1 - (1 - ratio) ** 3;
    displayedVolumes = from.map((value, index) => value + (state.volumes[index] - value) * ease);
    draw();
    if (ratio < 1) frame = requestAnimationFrame(tick);
    else finishTurn();
  };
  frame = requestAnimationFrame(tick);
}

function clearPreview() {
  selectedGate = null;
  preview = null;
}

function useGate(id) {
  if (animating || state.won || state.lost || isGateLocked(level, state, id)) return;
  const gate = level.gates.find((item) => item.id === id);
  if (prediction && selectedGate !== id) {
    selectedGate = id;
    preview = previewGate(level, state, id);
    message(
      `${level.tanks.map((tank, index) => `${tank.id} ${format(state.volumes[index])} → ${format(preview.volumes[index])}`).join('  /  ')}。再次点击 ${gate.a} ↔ ${gate.b} 确认。`,
      '液位预测 · 不消耗操作',
    );
    draw();
    renderControls();
    return;
  }
  const next = toggleGate(level, state, id);
  if (next.moves === state.moves) return;
  const previous = state;
  history.push(structuredClone(state));
  state = next;
  clearPreview();
  const events = state.events?.map((event) => event.text).filter(Boolean) || [];
  message(events.join(' ') || '闸门已调度，相连的水槽正在分享水量。', '联动记录');
  sound(state.latched.length > previous.latched.length ? 'switch' : 'valve');
  animate(previous.volumes);
}

function undo() {
  if (animating || !history.length) return;
  hideResult();
  const from = [...state.volumes];
  state = history.pop();
  state.bonusMoves = extraClaimed ? 1 : 0;
  state.lost = !state.won && state.moves >= level.maxMoves + state.bonusMoves;
  clearPreview();
  message('已恢复上一步的水位、闸门和机关。换一个连接，再试试看。', '撤销成功');
  animate(from);
}

function addMove() {
  if (animating || extraClaimed || state.won) return;
  extraClaimed = true;
  state = { ...state, bonusMoves: 1, lost: false };
  hideResult();
  clearPreview();
  message('增加了 1 次操作。这次调度已经领取过额外机会。', '继续调度');
  draw();
  renderControls();
  $('#board-controls button:not(:disabled)')?.focus({ preventScroll: true });
}

function loadLevel(index) {
  const wasResultVisible = !$('#result').hidden;
  cancelAnimationFrame(frame);
  levelIndex = index;
  level = LEVELS[index];
  state = createState(level);
  history = [];
  extraClaimed = false;
  animating = false;
  clearPreview();
  hideResult();
  displayedVolumes = [...state.volumes];
  progress.selected = index;
  persist();
  $('#level-number').textContent = String(index + 1).padStart(2, '0');
  $('#level-name').textContent = level.title;
  $('#chapter').textContent = level.chapter;
  $('#board-controls').innerHTML = level.gates
    .map(
      (gate) =>
        `<button type="button" data-gate="${escapeHtml(gate.id)}" class="scene-valve"><span class="valve-wheel" aria-hidden="true"></span><span class="valve-label" aria-hidden="true"><span>${escapeHtml(gate.a)}—${escapeHtml(gate.b)}</span><span class="valve-state"></span></span></button>`,
    )
    .join('');
  updateBoardLayout();
  message(level.intro);
  renderControls();
  renderRoutes();
  draw();
  if (wasResultVisible) $('#board-controls button:not(:disabled)')?.focus({ preventScroll: true });
}

$('#board-controls').addEventListener('click', (event) => {
  const button = event.target.closest('[data-gate]');
  if (button) useGate(button.dataset.gate);
});
$('#level-nav').addEventListener('click', (event) => {
  const button = event.target.closest('[data-level-index]');
  if (button && !animating) {
    loadLevel(Number(button.dataset.levelIndex));
    if (window.innerWidth <= 780)
      $('.stage-header').scrollIntoView({
        behavior: reduceMotion.matches ? 'instant' : 'smooth',
        block: 'start',
      });
  }
});
$('#undo').addEventListener('click', undo);
$('#result-undo').addEventListener('click', undo);
$('#restart').addEventListener('click', () => loadLevel(levelIndex));
$('#result-retry').addEventListener('click', () => loadLevel(levelIndex));
$('#extra-move').addEventListener('click', addMove);
$('#next-level').addEventListener('click', () => {
  if (state.won) loadLevel((levelIndex + 1) % LEVELS.length);
  else if (!extraClaimed) addMove();
  else loadLevel(levelIndex);
});
$('#predict').addEventListener('click', () => {
  prediction = !prediction;
  clearPreview();
  message(
    prediction ? '点一道闸门，虚线会显示结算后的液位。再点同一道闸门才执行。' : level.intro,
    prediction ? '液位预测已开启' : '调度提示',
  );
  renderControls();
  draw();
});
$('#hint').addEventListener('click', () => {
  const route = solve(level, state);
  if (!route?.length) {
    message(
      '剩余操作内暂时无法完成。试试撤销，或重来后先处理箱子，再考虑把水留在哪个水槽。',
      '调度提示',
    );
    return;
  }
  const index = level.gates.findIndex((gate) => gate.id === route[0]);
  const gate = level.gates[index];
  message(
    `下一步试着${state.gates[index] ? '关闭' : '打开'} ${gate.a} ↔ ${gate.b}。从当前状态还需 ${route.length} 次操作即可完成。`,
    '一点灵感',
  );
});
$('#sound').addEventListener('click', () => {
  progress.sound = !progress.sound;
  persist();
  renderControls();
  sound();
});
$('#help').addEventListener('click', () => $('#help-dialog').showModal());
for (const selector of ['#close-help', '#start-playing'])
  $(selector).addEventListener('click', () => $('#help-dialog').close());
$('#help-dialog').addEventListener('click', (event) => {
  if (event.target === $('#help-dialog')) {
    const bounds = event.target.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      event.target.close();
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (animating) finishTurn();
    void audioContext?.suspend().catch(() => {});
  }
});
document.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || $('#help-dialog').open)
    return;
  if (!$('#result').hidden) {
    if (event.key === 'Tab') {
      const buttons = [...$('#result').querySelectorAll('button:not([hidden])')];
      const first = buttons[0];
      const last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    return;
  }
  if (event.key === 'Escape') {
    clearPreview();
    renderControls();
    draw();
    return;
  }
  const keys = { z: '#undo', r: '#restart', h: '#hint', p: '#predict', '?': '#help' };
  const selector = keys[event.key.toLowerCase()];
  if (selector) {
    event.preventDefault();
    $(selector).click();
  } else if (/^[1-5]$/.test(event.key)) {
    const gate = level.gates[Number(event.key) - 1];
    if (gate) {
      event.preventDefault();
      useGate(gate.id);
    }
  }
});
Object.defineProperty(window, '__waterlineSnapshot', {
  value: () =>
    structuredClone({
      levelIndex,
      levelId: level.id,
      state,
      animating,
      prediction,
      selectedGate,
      historyLength: history.length,
      extraClaimed,
      progress,
    }),
});
loadLevel(levelIndex);
// Resize only moves the native controls; it never recreates a focused valve.
let boardWidth = $('#board').getBoundingClientRect().width;
new ResizeObserver(([entry]) => {
  if (Math.abs(entry.contentRect.width - boardWidth) < 0.5) return;
  boardWidth = entry.contentRect.width;
  updateBoardLayout();
  draw();
}).observe($('#board'));

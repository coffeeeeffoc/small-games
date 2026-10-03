import { LEVELS } from './levels.mjs';
import {
  createState,
  canPlace,
  placePiece,
  rotatePiece,
  removePiece,
  simulate,
} from './engine.mjs';
import {
  renderBoard,
  renderInventory,
  renderTrace,
  pieceIcon,
  COLORS,
  localized,
  escapeHtml,
  format,
  coordinate,
} from './render.mjs';
import { readProgress, persistProgress } from './progress.mjs';
import { createAudio } from './audio.mjs';

const $ = (selector) => document.querySelector(selector);
const COPY = {
  zh: {
    brandSub: '回声编织 / 空间节拍实验',
    target: '目标到达时刻',
    unit: '每走一格 = ¼ 拍',
    boardLabel: '构建你的声路',
    mirror: '反射板',
    splitter: '分声器',
    delay: '延迟器',
    inventory: '器件架 · 拖入棋盘',
    rotate: '旋转',
    returnPiece: '收回器件',
    undo: '撤销',
    restart: '重置',
    notes: '实验记录',
    replay: '重放本次布局',
    ideaTitle: '一个机关，影响几次回声？',
    ideaCopy: '延迟器放在分声前，会让后面的回声一起晚到。放在支路，只影响其中一道。',
    hint: '给一点线索 ↗',
    rulesTitle: '工作台规则',
    silent: '不用麦克风 · 静音同样可玩',
    helpTitle: '自己搭路，再让声音出发。',
    closeHelp: '回到工作台 →',
    backBoard: '留在棋盘查看轨迹',
    emit: '发声试奏',
    stop: '停止',
    ready: '等待你来搭路',
    running: '声音正在传播',
    paused: '已暂停',
    result: '轨迹已保留',
    beat: '拍',
    ticks: '格时',
    selected: '已选',
    nothingSelected: '选器件，再点格子放置',
    moveHint: '点空格移动 · 再点原位旋转',
    tapHint: '拖动，或选中后点格子',
    locked: '这是固定机关，不能移动。',
    invalid: '这里放不下。找一块空地，或先收回占位器件。',
    returned: '器件已收回，换条路线试试。',
    placed: '已放置。再次点选中的器件可旋转。',
    rotated: '已旋转。声路会随朝向改变。',
    undone: '已撤销上一步。',
    stopped: '已停止试奏，可以继续搭路。',
    trialReady: '先搭一条声路，然后试奏。',
    trialEmpty: '试奏后，这里会记录声音走过的路径、到达时间和剩余能量。',
    inFlight: '观察声波怎样分开、停留和抵达。',
    passed: '每一道回声都在目标时刻回来。',
    failed: '这次还没对上。轨迹留在棋盘上，可以直接修改。',
    early: '提前',
    late: '迟到',
    onTime: '准时',
    extra: '多余回声',
    missing: '缺少回声',
    energy: '剩余能量',
    wall: '撞上墙',
    escaped: '离开棋盘',
    weak: '能量不足',
    loop: '陷入循环',
    overload: '传播超出上限',
    source: '返回声源',
    attempt: '次试奏',
    pieces: '个器件已放置',
    completed: '个实验完成',
    mute: '关闭音效',
    unmute: '开启音效',
    resume: '继续',
    next: '下一个实验 →',
    explore: '从头再探索 →',
    winTitle: '这条声路，是你织出来的。',
    finalTitle: '五个实验，都找到了节奏。',
    winCopy: '距离、分声位置与等待时间，终于在同一条节奏上相遇。',
    finalCopy: '你已经亲手构建了绕路、分声与共享等待。可以返回任意关卡，寻找不同的搭法。',
    storage: '浏览器未允许存档，本次仍可继续游玩。',
    fixedDelay: '延迟时长固定；试着改变它的位置。',
    failureAt: '终止于',
    notArrived: '目标时刻没有回声抵达',
    slow: '半速观察',
    help: '玩法说明',
  },
  en: {
    brandSub: 'BUILD A CIRCUIT FOR SOUND',
    target: 'TARGET ARRIVALS',
    unit: 'One cell = ¼ beat',
    boardLabel: 'BUILD YOUR OWN ROUTES',
    mirror: 'Mirror',
    splitter: 'Splitter',
    delay: 'Delay',
    inventory: 'PARTS TRAY · DRAG TO BUILD',
    rotate: 'Rotate',
    returnPiece: 'Return part',
    undo: 'Undo',
    restart: 'Reset',
    notes: 'Trial notebook',
    replay: 'Replay this layout',
    ideaTitle: 'How many echoes does one part affect?',
    ideaCopy:
      'A delay before a split holds every echo downstream. Put it on a branch to hold only that echo.',
    hint: 'A little clue ↗',
    rulesTitle: 'Workbench rules',
    silent: 'No microphone · Fully playable muted',
    helpTitle: 'Build the route. Then strike.',
    closeHelp: 'Back to the workbench →',
    backBoard: 'Stay and inspect the trace',
    emit: 'Strike & listen',
    stop: 'Stop',
    ready: 'Ready to build',
    running: 'Sound in flight',
    paused: 'Paused',
    result: 'Trace retained',
    beat: 'beat',
    ticks: 'ticks',
    selected: 'Selected',
    nothingSelected: 'Select a part, then tap a cell',
    moveHint: 'Tap empty cell to move · Tap again to rotate',
    tapHint: 'Drag, or select then tap a cell',
    locked: 'This part is fixed in place.',
    invalid: 'That cell is occupied. Choose an empty cell or return its part first.',
    returned: 'Part returned to the tray. Try a different route.',
    placed: 'Placed. Tap the selected part again to rotate it.',
    rotated: 'Rotated. Orientation changes the actual route.',
    undone: 'Last edit undone.',
    stopped: 'Playback stopped. Keep building.',
    trialReady: 'Build a route, then make a trial.',
    trialEmpty:
      'Strike a note to record its route, actual arrival times and remaining energy here.',
    inFlight: 'Watch the pulse split, wait, and find its way home.',
    passed: 'Every echo returned at its target moment.',
    failed: 'Not quite. The trace stays on the board; edit it directly.',
    early: 'Early by',
    late: 'Late by',
    onTime: 'On time',
    extra: 'Extra echo',
    missing: 'Missing echo',
    energy: 'Energy left',
    wall: 'Hit a wall',
    escaped: 'Left the board',
    weak: 'Too little energy',
    loop: 'Trapped in a loop',
    overload: 'Propagation limit',
    source: 'Returned to source',
    attempt: 'trials',
    pieces: 'parts placed',
    completed: 'experiments complete',
    mute: 'Mute audio',
    unmute: 'Enable audio',
    resume: 'Resume',
    next: 'Next experiment →',
    explore: 'Explore again →',
    winTitle: 'A circuit you wove yourself.',
    finalTitle: 'Five experiments. A rhythm of your own.',
    winCopy: 'Distance, the placement of each split, and time spent waiting found the same rhythm.',
    finalCopy:
      'You built real detours, split echoes and shared waits. Revisit any experiment to try a different construction.',
    storage: 'Browser storage is unavailable. You can still play.',
    fixedDelay: 'Delay duration is fixed. Change its position instead.',
    failureAt: 'Stopped at',
    notArrived: 'No echo reached this target moment',
    slow: 'Half-speed playback',
    help: 'How to play',
  },
};
let storage;
try {
  storage = window.localStorage;
} catch {
  storage = null;
}
const progress = readProgress(storage, LEVELS);
let levelIndex = progress.selected,
  level = LEVELS[levelIndex],
  state = createState(level);
let phase = 'ready',
  report = null,
  elapsed = 0,
  history = [],
  selectedPiece = null,
  attempts = 0;
let slow = false,
  frame = 0,
  lastTime = 0,
  heard = new Set(),
  audioGeneration = 0,
  storageOK = true;
let instruction = null,
  hintShown = false,
  drag = null,
  suppressClickUntil = 0;
const audio = createAudio();
audio.setEnabled(progress.sound);
const t = (key) => COPY[progress.locale][key] || key;
const loc = (item, key) => localized(item, key, progress.locale);
const busy = () => phase === 'running' || phase === 'paused';
const beat = (ticks) => `${format(ticks / level.ticksPerBeat)} ${t('beat')}`;
const persist = () => {
  storageOK = persistProgress(storage, progress);
};
function activatedTone(kind) {
  const generation = audioGeneration;
  void audio.unlock().then((ready) => {
    if (ready && generation === audioGeneration) audio.tone(kind);
  });
}
function soundIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/>${progress.sound ? '<path d="M17 7q7 5 0 10" fill="none" stroke="currentColor" stroke-width="1.5"/>' : '<path d="m17 9 5 6m0-6-5 6" fill="none" stroke="currentColor" stroke-width="1.5"/>'}</svg>`;
}
function updateText() {
  document.documentElement.lang = progress.locale === 'zh' ? 'zh-CN' : 'en';
  document
    .querySelectorAll('[data-i18n]')
    .forEach((node) => (node.textContent = t(node.dataset.i18n)));
  $('#level-number').textContent = String(levelIndex + 1).padStart(2, '0');
  $('#level-title').textContent = loc(level, 'title');
  $('#level-subtitle').textContent = loc(level, 'subtitle');
  $('#lesson').textContent = loc(level, 'intro');
  $('#language').textContent = progress.locale === 'zh' ? 'EN' : '中文';
  $('#language').setAttribute(
    'aria-label',
    progress.locale === 'zh' ? 'Switch to English' : '切换中文',
  );
  $('#help').setAttribute('aria-label', t('help'));
  $('#board').setAttribute('aria-label', t('boardLabel'));
  $('#inventory').setAttribute('aria-label', t('inventory'));
  $('#quick-rules').innerHTML =
    progress.locale === 'zh'
      ? '<li>把器件拖进任意空格。也可先选器件，再点格子；重复点选中的器件可旋转。</li><li>分声器让声音一半直行、一半反射。所有分出的回声都必须回来。</li><li>接通不等于成功。路径决定到达时间；延迟器的数值固定，位置由你选择。</li>'
      : '<li>Drag parts onto any empty cell. Or select a part, then tap a cell. Tap the selected part again to rotate.</li><li>A splitter sends half forward and reflects half. Every emitted branch must return.</li><li>Connected does not mean solved. Routes determine arrival time. A delay has a fixed duration; you choose where it goes.</li>';
  $('#energy-rule').textContent =
    progress.locale === 'zh'
      ? `初始声能 ${level.sourceEnergy} · 接收至少 ${level.minEnergy}。每格损耗 ${level.travelLoss}，每次反射损耗 ${level.reflectionLoss}；分声先减 ${level.splitterLoss} 再平分，每格等待损耗 ${level.delayLoss}。吸音地格另扣标注能量。`
      : `Start: ${level.sourceEnergy} energy · Receiver needs ${level.minEnergy}. Each cell costs ${level.travelLoss}; mirrors cost ${level.reflectionLoss}. Splitters cost ${level.splitterLoss} then halve energy; each waiting tick costs ${level.delayLoss}. Absorbers spend their marked energy.`;
  $('#help-content').innerHTML =
    progress.locale === 'zh'
      ? '<div class="help-step"><h3>01 / 自己决定位置</h3><p>从器件架拖一个反射板到空格。也可以先点器件，再点格子。点棋盘上的器件选中，再点它一次或按「旋转」改变方向。拖回器件架或按「收回器件」回收。</p></div><div class="help-step"><h3>02 / 只发声一次</h3><p>声音每走一格用 ¼ 拍。反射板转弯，分声器一半直行、一半转弯。数字 +2 的延迟器让路过的声音等待 2 格时间，即 ½ 拍。每一道回声都要按目标时间回来，漏掉或多出一声都失败。</p></div><div class="help-step"><h3>03 / 先试奏，再推理</h3><p>目标圆灯标记必须到达的时刻，小菱形记录实际到达。失败不会弹窗打断；路径和停止位置留在棋盘上。可以半速观察、暂停、重放、撤销。新编辑会清除旧轨迹。</p></div><div class="help-step"><h3>04 / 分享一段等待</h3><p>一块延迟器可以同时影响分声后的两路。放在分声前还是分声后，是不同的决定。分声也平分能量，越晚分出去的声音越弱。</p></div><p>键盘：Z 撤销 / R 旋转 / Delete 收回 / P 暂停 / 空白处 Space 试奏。声音仅作反馈，静音不影响判定。</p>'
      : '<div class="help-step"><h3>01 / Choose every position</h3><p>Drag a mirror from the tray to an empty cell, or select it and tap a cell. Select a placed part, then tap it again or press Rotate. Drag back to the tray or press Return part to recover it.</p></div><div class="help-step"><h3>02 / Emit just once</h3><p>Every cell takes ¼ beat. Mirrors turn; splitters send half forward and reflect half. A +2 delay holds sound for 2 ticks (½ beat). Every emitted echo must return on a target; extra or lost echoes fail.</p></div><div class="help-step"><h3>03 / Experiment, then reason</h3><p>Target circles mark required times. Diamonds record real arrivals. Failure keeps the route and stop positions visible. Observe at half speed, pause, replay or undo. Editing clears stale traces.</p></div><div class="help-step"><h3>04 / Share a wait</h3><p>One delay can hold both branches downstream. Before or after a split is a meaningful choice. Splitting also halves energy, so late branches have less to spend.</p></div><p>Keyboard: Z undo / R rotate / Delete return / P pause / Space on page play. Audio is optional feedback and never judges a win.</p>';
}
function renderNav() {
  $('#level-nav').innerHTML = LEVELS.map(
    (item, i) =>
      `<button class="level-button ${i === levelIndex ? 'current' : ''} ${progress.completed[item.id] ? 'done' : ''}" data-level="${i}" ${i === levelIndex ? 'aria-current="step"' : ''} aria-label="${i + 1}. ${escapeHtml(loc(item, 'title'))}"><span>${String(i + 1).padStart(2, '0')}</span><small>${escapeHtml(loc(item, 'title'))}</small></button>`,
  ).join('');
  $('#completion').textContent =
    `${Object.keys(progress.completed).length} / ${LEVELS.length} ${t('completed')}`;
}
function updateControls() {
  $('#emit').innerHTML = busy()
    ? `<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="5" width="10" height="10" rx="1"/></svg>${t('stop')}`
    : `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 3 11 7-11 7z"/></svg>${t('emit')}`;
  $('#pause').hidden = !busy();
  $('#pause').setAttribute('aria-label', phase === 'paused' ? t('resume') : '暂停');
  $('#pause').innerHTML =
    phase === 'paused'
      ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 2 10 6-10 6z"/></svg>'
      : '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2" width="3" height="12"/><rect x="10" y="2" width="3" height="12"/></svg>';
  $('#undo').disabled = busy() || !history.length;
  const selected = state.pieces.find((p) => p.id === selectedPiece);
  $('#rotate').disabled = busy() || !selected || selected.type === 'delay';
  $('#return-piece').disabled = busy() || !selected || selected.x === null;
  $('#selected-label').textContent = selected
    ? `${t('selected')}：${t(selected.type)} ${selected.type === 'delay' ? `+${selected.delayTicks}` : selected.orientation}${selected.x === null ? '' : ` · ${coordinate(selected.x, selected.y)}`}`
    : t('nothingSelected');
  $('#selection-hint').textContent = selected ? t('moveHint') : t('tapHint');
  $('#piece-count').textContent =
    `${state.pieces.filter((p) => p.x !== null).length} / ${state.pieces.length} ${t('pieces')}`;
  $('#replay').disabled = busy() || !report;
  $('#slow').setAttribute('aria-pressed', String(slow));
  $('#slow').setAttribute('aria-label', t('slow'));
  $('#sound').innerHTML = soundIcon();
  $('#sound').setAttribute('aria-label', t(progress.sound ? 'mute' : 'unmute'));
  $('#sound').setAttribute('aria-pressed', String(progress.sound));
  $('#hint').disabled = busy();
  $('#hint-copy').textContent = hintShown ? loc(level, 'hint') : instruction ? t(instruction) : '';
  $('#attempts').textContent = `${attempts} ${t('attempt')}`;
}
function updateRhythm() {
  const max = Math.max(...level.targets) + 2;
  const end =
    phase === 'result' && report ? Math.max(max, ...report.arrivals.map((a) => a.tick)) : max;
  const position = (tick) => Math.min(100, (tick / end) * 100);
  $('#rhythm').innerHTML =
    '<div class="rhythm-line"></div>' +
    level.targets
      .map((target, i) => {
        const status =
          report && elapsed >= target
            ? report.targetResults[i].status === 'hit'
              ? 'hit'
              : 'miss'
            : 'waiting';
        return `<span class="beat-light" data-status="${status}" style="left:${position(target)}%;--color:${status === 'hit' ? COLORS[report.targetResults[i].arrival.colorIndex % COLORS.length] : '#aec6b5'}">${i + 1}<small>${beat(target)}</small></span>`;
      })
      .join('') +
    (report
      ? report.arrivals
          .filter((a) => a.tick <= elapsed)
          .map(
            (a) =>
              `<span class="arrival-marker" style="left:${position(a.tick)}%;--color:${COLORS[a.colorIndex % COLORS.length]}" title="${beat(a.tick)}"></span>`,
          )
          .join('')
      : '') +
    `<span class="time-cursor" style="left:${position(elapsed)}%"></span>`;
  $('#clock').textContent = beat(elapsed);
  $('#phase-label').textContent = t(phase);
}
function arrivalStatus(arrival, index) {
  if (arrival.matched) return t('onTime');
  const unmatchedIndex = report.arrivals.filter((item) => !item.matched).indexOf(arrival);
  const missing = report.targetResults.filter((item) => item.status !== 'hit')[unmatchedIndex];
  if (!missing) return t('extra');
  const delta = arrival.tick - missing.target;
  return `${t(delta < 0 ? 'early' : 'late')} ${beat(Math.abs(delta))} → ${beat(missing.target)}`;
}
function renderLog() {
  $('#trial-state').textContent = !report
    ? t('trialReady')
    : busy()
      ? t('inFlight')
      : report.won
        ? t('passed')
        : t('failed');
  if (!report) {
    $('#arrival-log').innerHTML = `<p class="empty-log">${escapeHtml(t('trialEmpty'))}</p>`;
    return;
  }
  let html = report.arrivals
    .filter((a) => a.tick <= elapsed)
    .map(
      (arrival, i) =>
        `<div class="arrival-entry ${arrival.matched ? '' : 'bad'}" style="--color:${COLORS[arrival.colorIndex % COLORS.length]}"><div><b>${i + 1} · ${beat(arrival.tick)}</b><span>${arrivalStatus(arrival, i)}</span></div><small>${t('energy')} ${format(arrival.energy)} / ≥${level.minEnergy}</small></div>`,
    )
    .join('');
  html += report.failures
    .filter((f) => f.tick <= elapsed)
    .map(
      (f) =>
        `<div class="arrival-entry bad"><div><b>${escapeHtml(t(f.reason))}</b><span>${beat(f.tick)}</span></div><small>${t('failureAt')} ${coordinate(Math.max(0, Math.min(level.cols - 1, f.x)), Math.max(0, Math.min(level.rows - 1, f.y)))}${f.reason === 'weak' ? ` · ${t('energy')} ${format(f.energy)} / ≥${level.minEnergy}` : ''}</small></div>`,
    )
    .join('');
  if (phase === 'result')
    html += report.targetResults
      .filter((r) => r.status !== 'hit')
      .map(
        (r) =>
          `<div class="arrival-entry bad"><div><b>${t('missing')}</b><span>${beat(r.target)}</span></div><small>${t('notArrived')}</small></div>`,
      )
      .join('');
  $('#arrival-log').innerHTML = html || `<p class="empty-log">${t('inFlight')}</p>`;
}
function draw() {
  updateText();
  renderNav();
  updateControls();
  renderBoard($('#board'), level, state, { selectedPiece, phase, locale: progress.locale });
  renderInventory($('#inventory'), level, state, { selectedPiece, phase, locale: progress.locale });
  updatePlayback();
  renderLog();
}
function updatePlayback() {
  renderTrace($('#board'), level, report, elapsed, phase);
  updateRhythm();
  $('#board').dataset.status = phase;
}
function stopClock() {
  cancelAnimationFrame(frame);
  frame = 0;
  audioGeneration++;
  audio.suspend();
}
function clearTrial() {
  stopClock();
  report = null;
  elapsed = 0;
  phase = 'ready';
  heard.clear();
  hintShown = false;
}
function applyEdit(next, key) {
  if (busy() || JSON.stringify(next) === JSON.stringify(state)) return false;
  history.push(structuredClone(state));
  state = next;
  clearTrial();
  instruction = key;
  activatedTone('control');
  draw();
  return true;
}
function select(id) {
  if (busy()) return;
  if (id === selectedPiece) {
    rotate();
    return;
  }
  if (!state.pieces.some((p) => p.id === id)) return;
  selectedPiece = id;
  instruction = null;
  draw();
}
function put(id, x, y) {
  if (busy()) return;
  if (!canPlace(level, state, id, x, y)) {
    instruction = 'invalid';
    hintShown = false;
    updateControls();
    return;
  }
  selectedPiece = id;
  applyEdit(placePiece(level, state, id, x, y), 'placed');
}
function rotate() {
  if (busy() || !selectedPiece) return;
  const piece = state.pieces.find((p) => p.id === selectedPiece);
  if (piece?.type === 'delay') {
    instruction = 'fixedDelay';
    updateControls();
    return;
  }
  applyEdit(rotatePiece(level, state, selectedPiece), 'rotated');
}
function returnPiece(id = selectedPiece) {
  if (!id || busy()) return;
  if (applyEdit(removePiece(level, state, id), 'returned')) {
    selectedPiece = id;
    draw();
  }
}
function undo() {
  if (busy() || !history.length) return;
  state = history.pop();
  selectedPiece = null;
  clearTrial();
  instruction = 'undone';
  draw();
}
function cancelDrag() {
  if (drag?.active) suppressClickUntil = performance.now() + 350;
  $('#drag-ghost').hidden = true;
  document
    .querySelectorAll('.drop-valid,.drop-invalid,.drag-origin')
    .forEach((n) => n.classList.remove('drop-valid', 'drop-invalid', 'drag-origin'));
  if (drag?.capture?.hasPointerCapture?.(drag.pointerId))
    try {
      drag.capture.releasePointerCapture(drag.pointerId);
    } catch {
      /* Pointer already released. */
    }
  drag = null;
}
function loadLevel(index) {
  if (!Number.isInteger(index) || !LEVELS[index]) return;
  cancelDrag();
  clearTrial();
  if ($('#result').open) $('#result').close();
  levelIndex = index;
  level = LEVELS[index];
  state = createState(level);
  selectedPiece = null;
  history = [];
  attempts = 0;
  instruction = null;
  progress.selected = index;
  persist();
  draw();
}
function showResult() {
  if (!report?.won) return;
  const all = Object.keys(progress.completed).length === LEVELS.length;
  $('#result-kicker').textContent = 'RESONANCE FOUND / 共鸣达成';
  $('#result-title').textContent = t(all ? 'finalTitle' : 'winTitle');
  $('#result-copy').textContent =
    t(all ? 'finalCopy' : 'winCopy') + (storageOK ? '' : ` ${t('storage')}`);
  $('#result-arrivals').innerHTML = report.arrivals
    .map(
      (a, i) =>
        `<div class="result-row" style="--color:${COLORS[a.colorIndex % COLORS.length]}"><b>${i + 1} · ${beat(a.tick)}</b><span>${t('energy')} ${format(a.energy)}</span></div>`,
    )
    .join('');
  $('#continue').textContent = t(levelIndex === LEVELS.length - 1 ? 'explore' : 'next');
  $('#result').showModal();
  $('#continue').focus({ preventScroll: true });
}
function finish() {
  cancelAnimationFrame(frame);
  frame = 0;
  elapsed = report.duration;
  phase = 'result';
  if (report.won) {
    progress.completed[level.id] = {
      attempts: Math.min(progress.completed[level.id]?.attempts ?? Infinity, Math.max(1, attempts)),
    };
    persist();
    audio.tone('success');
  }
  draw();
  showResult();
}
function tick(now) {
  if (phase !== 'running') return;
  elapsed = Math.min(
    report.duration,
    elapsed + ((now - lastTime) / (level.beatMs / level.ticksPerBeat)) * (slow ? 0.5 : 1),
  );
  lastTime = now;
  let changed = false;
  report.arrivals.forEach((a, i) => {
    if (a.tick <= elapsed && !heard.has(`a${i}`)) {
      heard.add(`a${i}`);
      audio.tone(a.matched ? 'echo' : 'fail', i);
      changed = true;
    }
  });
  report.failures.forEach((f, i) => {
    if (f.tick <= elapsed && !heard.has(`f${i}`)) {
      heard.add(`f${i}`);
      audio.tone('fail');
      changed = true;
    }
  });
  updatePlayback();
  if (changed) renderLog();
  if (elapsed >= report.duration) finish();
  else frame = requestAnimationFrame(tick);
}
function startPlayback(replay = false) {
  if ($('#result').open || $('#help-dialog').open) return;
  if (busy()) {
    clearTrial();
    instruction = 'stopped';
    draw();
    return;
  }
  if (replay && !report) return;
  cancelDrag();
  if (!replay) {
    report = simulate(level, state);
    attempts++;
  }
  phase = 'running';
  elapsed = 0;
  heard.clear();
  selectedPiece = null;
  instruction = null;
  hintShown = false;
  activatedTone('emit');
  draw();
  lastTime = performance.now();
  frame = requestAnimationFrame(tick);
}
function pause() {
  if (phase === 'running') {
    stopClock();
    phase = 'paused';
    draw();
  } else if (phase === 'paused') {
    phase = 'running';
    void audio.unlock();
    draw();
    lastTime = performance.now();
    frame = requestAnimationFrame(tick);
  }
}
$('#board').addEventListener('click', (event) => {
  if (busy() || performance.now() < suppressClickUntil) return;
  const cell = event.target.closest('.cell');
  if (!cell) return;
  if (cell.dataset.piece) {
    select(cell.dataset.piece);
    return;
  }
  if (cell.dataset.fixed) {
    instruction = 'locked';
    hintShown = false;
    updateControls();
    return;
  }
  if (selectedPiece) put(selectedPiece, Number(cell.dataset.x), Number(cell.dataset.y));
});
$('#inventory').addEventListener('click', (event) => {
  if (performance.now() < suppressClickUntil) return;
  const button = event.target.closest('button[data-piece]');
  if (button && !button.disabled) select(button.dataset.piece);
});
// Native Chromium can suppress a synthetic click immediately after a fast touch
// drag. Activate stationary button taps on pointer release when no native click
// arrived, and consume its later duplicate. Mouse/keyboard keep native clicks.
let touchTap = null;
const completedTouches = new Map();
document.addEventListener(
  'pointerdown',
  (event) => {
    if (event.pointerType !== 'touch') return;
    const target = event.target.closest('button');
    touchTap =
      target && !target.disabled
        ? {
            id: event.pointerId,
            target,
            x: event.clientX,
            y: event.clientY,
            moved: false,
            clicked: false,
          }
        : null;
  },
  true,
);
document.addEventListener(
  'pointermove',
  (event) => {
    if (
      touchTap?.id === event.pointerId &&
      Math.hypot(event.clientX - touchTap.x, event.clientY - touchTap.y) > 7
    )
      touchTap.moved = true;
  },
  true,
);
document.addEventListener(
  'pointercancel',
  (event) => {
    if (touchTap?.id === event.pointerId) touchTap = null;
  },
  true,
);
document.addEventListener(
  'pointerup',
  (event) => {
    if (touchTap?.id !== event.pointerId) return;
    const tap = touchTap;
    touchTap = null;
    if (tap.moved) return;
    completedTouches.set(tap.id, tap);
    if (completedTouches.size > 32) completedTouches.delete(completedTouches.keys().next().value);
    requestAnimationFrame(() => {
      if (tap.clicked || !tap.target.isConnected || tap.target.disabled) return;
      tap.clicked = true;
      tap.target.click();
    });
  },
  true,
);
document.addEventListener(
  'click',
  (event) => {
    if (
      !event.isTrusted ||
      (event.pointerType !== 'touch' && !event.sourceCapabilities?.firesTouchEvents)
    )
      return;
    const tap = completedTouches.get(event.pointerId);
    if (!tap) return;
    if (tap.clicked) {
      event.preventDefault();
      event.stopImmediatePropagation();
    } else tap.clicked = true;
  },
  true,
);
function pointerDown(event) {
  if (busy() || drag || event.button !== 0) return;
  suppressClickUntil = 0;
  const part = event.target.closest('[data-piece]');
  if (!part || part.disabled) return;
  const piece = state.pieces.find((p) => p.id === part.dataset.piece);
  if (!piece) return;
  drag = {
    id: piece.id,
    piece,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    active: false,
    origin: part,
    capture: event.currentTarget,
  };
}
$('#board').addEventListener('pointerdown', pointerDown);
$('#inventory').addEventListener('pointerdown', pointerDown);
document.addEventListener(
  'pointermove',
  (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 7)
      return;
    if (!drag.active) {
      drag.active = true;
      drag.origin.classList.add('drag-origin');
      drag.capture.setPointerCapture(event.pointerId);
      $('#drag-ghost').innerHTML = pieceIcon(drag.piece);
      $('#drag-ghost').hidden = false;
    }
    if (event.cancelable) event.preventDefault();
    $('#drag-ghost').style.left = `${event.clientX}px`;
    $('#drag-ghost').style.top = `${event.clientY}px`;
    document
      .querySelectorAll('.drop-valid,.drop-invalid')
      .forEach((n) => n.classList.remove('drop-valid', 'drop-invalid'));
    const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest('#board .cell');
    if (cell)
      cell.classList.add(
        canPlace(level, state, drag.id, Number(cell.dataset.x), Number(cell.dataset.y))
          ? 'drop-valid'
          : 'drop-invalid',
      );
  },
  { passive: false },
);
document.addEventListener('pointerup', (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const current = drag;
  if (!current.active) {
    drag = null;
    return;
  }
  const target = document.elementFromPoint(event.clientX, event.clientY);
  const cell = target?.closest('#board .cell');
  cancelDrag();
  const layout = state;
  const activeLevel = level;
  const destination = cell ? { x: Number(cell.dataset.x), y: Number(cell.dataset.y) } : null;
  const toTray = Boolean(target?.closest('.inventory-panel'));
  // Keep the touched node alive until touchend has completed its native dispatch.
  requestAnimationFrame(() => {
    if (state !== layout || level !== activeLevel || busy()) return;
    if (destination) put(current.id, destination.x, destination.y);
    else if (toTray) returnPiece(current.id);
  });
});
document.addEventListener('pointercancel', (event) => {
  if (event.pointerId === drag?.pointerId) cancelDrag();
});
window.addEventListener('blur', cancelDrag);
$('#rotate').addEventListener('click', rotate);
$('#return-piece').addEventListener('click', () => returnPiece());
$('#undo').addEventListener('click', undo);
$('#restart').addEventListener('click', () => loadLevel(levelIndex));
$('#emit').addEventListener('click', () => startPlayback());
$('#replay').addEventListener('click', () => startPlayback(true));
$('#pause').addEventListener('click', pause);
$('#slow').addEventListener('click', () => {
  slow = !slow;
  updateControls();
});
$('#level-nav').addEventListener('click', (event) => {
  const button = event.target.closest('[data-level]');
  if (button) {
    loadLevel(Number(button.dataset.level));
    $(`[data-level="${levelIndex}"]`)?.focus({ preventScroll: true });
  }
});
$('#hint').addEventListener('click', () => {
  hintShown = true;
  instruction = null;
  updateControls();
});
$('#sound').addEventListener('click', () => {
  progress.sound = !progress.sound;
  audioGeneration++;
  audio.setEnabled(progress.sound);
  if (progress.sound) activatedTone('control');
  persist();
  updateControls();
});
$('#language').addEventListener('click', () => {
  cancelDrag();
  progress.locale = progress.locale === 'zh' ? 'en' : 'zh';
  persist();
  draw();
});
$('#help').addEventListener('click', () => {
  cancelDrag();
  if (phase === 'running') pause();
  $('#help-dialog').showModal();
});
$('#close-help').addEventListener('click', () => $('#help-dialog').close());
$('#continue').addEventListener('click', () => loadLevel((levelIndex + 1) % LEVELS.length));
$('#result-close').addEventListener('click', () => {
  $('#result').close();
  $('#emit').focus({ preventScroll: true });
});
for (const dialog of [$('#help-dialog'), $('#result')])
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      dialog.close();
  });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelDrag();
    if (phase === 'running') pause();
    audio.suspend();
  }
});
window.addEventListener('pagehide', () => {
  cancelDrag();
  stopClock();
});
document.addEventListener('keydown', (event) => {
  if (
    event.repeat ||
    event.ctrlKey ||
    event.altKey ||
    event.metaKey ||
    $('#result').open ||
    $('#help-dialog').open ||
    event.target.closest('input,select,textarea')
  )
    return;
  if (event.key === 'Escape') {
    cancelDrag();
    selectedPiece = null;
    draw();
    return;
  }
  if (event.key === ' ' && event.target.closest('button,a')) return;
  const actions = {
    ' ': () => startPlayback(),
    z: undo,
    r: rotate,
    p: pause,
    delete: () => returnPiece(),
    backspace: () => returnPiece(),
    h: () => $('#hint').click(),
  };
  const action = actions[event.key.toLowerCase()];
  if (action) {
    event.preventDefault();
    action();
  }
});
Object.defineProperty(window, '__echoWeaverSnapshot', {
  value: () =>
    structuredClone({
      levelIndex,
      levelId: level.id,
      state,
      phase,
      report,
      elapsed,
      historyLength: history.length,
      selectedPiece,
      progress,
      attempts,
      slow,
    }),
});
persist();
draw();

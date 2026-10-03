import { LEVELS } from './levels.mjs';
import { createState, cycleControl, simulate } from './engine.mjs';
import { renderBoard, animateBoard, COLORS, localized, escapeHtml, format } from './render.mjs';
import { readProgress, persistProgress } from './progress.mjs';
import { createAudio } from './audio.mjs';

const $ = (selector) => document.querySelector(selector);
const STRINGS = {
  zh: {
    brandSub: '回声编织 / 声音实验室',
    headline: '把声音，织成节奏。',
    tagline: '一次发声，三次回响。让每一条声路，恰好赶上它的节拍。',
    chapter: '初始共鸣',
    boardLabel: '声路编织台',
    boardNote: '点击发光机关调整',
    routeLegend: '声路 / 标注时长',
    reflectorLegend: '反射板',
    delayLegend: '延迟段',
    keyboard: 'SPACE / 试奏',
    scoreKicker: 'THE SCORE / 目标节奏',
    scoreTitle: '恰好，在这一拍。',
    scoreCopy: '三条回声分别在目标拍抵达，且有足够能量。',
    playhead: '内部节拍',
    ruleNote: '更长的声路，换来更晚的回声。',
    routeReadout: '声路读数',
    prediction: '实时预测',
    footer: '原创节拍谜题 · 8 个声音实验',
    silent: '静音也能完整游玩',
    helpTitle: '声音需要时间。',
    understood: '开始编织 →',
    backBoard: '返回编织台',
    ready: '等待编织',
    running: '回声传播中',
    paused: '已暂停',
    result: '试奏结束',
    emit: '发出声音',
    stop: '停止试奏',
    undo: '撤销',
    restart: '重置',
    hint: '一点提示 ↗',
    messageLabel: '实验笔记',
    beat: '拍',
    energy: '能量',
    minimum: '接收阈值',
    completed: '已完成',
    ontime: '准时抵达',
    early: '提前',
    late: '迟到',
    weak: '能量不足',
    blocked: '被吸音块吞没',
    winTitle: '三次回响，恰如其分。',
    finalTitle: '你已成为回声编织者。',
    winCopy: '一次声音，沿不同的路，在各自的节拍归来。',
    finalCopy: '8 个声音实验全部完成。你把距离、等待与能量，织成了节奏。',
    loseTitle: '差一点，再调整一下。',
    loseCopy: '观察读数与节拍灯，修改声路后可以无限次试奏。',
    next: '下一个实验 →',
    retry: '继续调整 →',
    replay: '重新探索 →',
    soundOn: '关闭音效',
    soundOff: '开启音效',
    resume: '继续',
    pausedMessage: '传播已暂停，继续后从当前节拍恢复。',
    changed: '机关已调整。查看右侧读数，再试奏验证。',
    stopped: '试奏已停止。可以继续调整声路。',
    undoMessage: '已撤销上一步。',
    noHint: '先看每条声路的抵达拍数；时间正确后，再检查能量。',
    loss: '损耗',
    units: '格',
    reflections: '次反射',
    delay: '延迟',
    arrival: '抵达',
    target: '目标',
    hintLabel: '一点灵感',
    storage: '当前浏览器无法保存，仍可完整游玩。',
    saved: '进度保存在当前浏览器',
    source: '一次发声',
    helpLabel: '玩法说明',
    levelLabel: '选择关卡',
  },
  en: {
    brandSub: 'A SMALL LAB FOR SOUND',
    headline: 'Weave a little rhythm.',
    tagline: 'One sound. Three echoes. Find the right path to the right moment.',
    chapter: 'First resonance',
    boardLabel: 'THE WEAVING DESK',
    boardNote: 'Tap a glowing mechanism',
    routeLegend: 'Route / marked duration',
    reflectorLegend: 'Reflector',
    delayLegend: 'Delay',
    keyboard: 'SPACE / PLAY',
    scoreKicker: 'THE SCORE / TARGET RHYTHM',
    scoreTitle: 'Right on the beat.',
    scoreCopy: 'Each echo must arrive on its own target beat, with enough energy.',
    playhead: 'INTERNAL BEAT',
    ruleNote: 'A longer journey makes a later echo.',
    routeReadout: 'Route readings',
    prediction: 'LIVE FORECAST',
    footer: 'Original rhythm puzzles · 8 experiments',
    silent: 'Fully playable on mute',
    helpTitle: 'Sound takes time.',
    understood: 'Start weaving →',
    backBoard: 'Back to the desk',
    ready: 'Ready to weave',
    running: 'Echoes in flight',
    paused: 'Paused',
    result: 'Playback complete',
    emit: 'Strike a note',
    stop: 'Stop playback',
    undo: 'Undo',
    restart: 'Reset',
    hint: 'A little hint ↗',
    messageLabel: 'FIELD NOTES',
    beat: 'beat',
    energy: 'Energy',
    minimum: 'Receiver threshold',
    completed: 'complete',
    ontime: 'On time',
    early: 'Early by',
    late: 'Late by',
    weak: 'Too weak',
    blocked: 'Absorbed',
    winTitle: 'Three echoes. In harmony.',
    finalTitle: 'You are an echo weaver.',
    winCopy: 'One sound took three different journeys. Every echo found its moment.',
    finalCopy: 'All eight experiments complete. Distance, patience and energy, woven into rhythm.',
    loseTitle: 'Almost. Try another route.',
    loseCopy:
      'Check the readings and beat lights. Adjust your routes and try as often as you like.',
    next: 'Next experiment →',
    retry: 'Keep weaving →',
    replay: 'Explore again →',
    soundOn: 'Mute audio',
    soundOff: 'Enable audio',
    resume: 'Resume',
    pausedMessage: 'Propagation is paused. Resume to continue from this exact beat.',
    changed: 'Mechanism adjusted. Check the readings, then strike a note.',
    stopped: 'Playback stopped. Keep shaping the routes.',
    undoMessage: 'Last change undone.',
    noHint: 'Check each arrival beat first, then the energy left at the receiver.',
    loss: 'Loss',
    units: 'units',
    reflections: 'reflections',
    delay: 'delay',
    arrival: 'Arrival',
    target: 'Target',
    hintLabel: 'A LITTLE INSPIRATION',
    storage: 'Storage is unavailable; you can still play every level.',
    saved: 'Progress saved in this browser',
    source: 'One sound',
    helpLabel: 'How to play',
    levelLabel: 'Choose a level',
  },
};
let storage;
try {
  storage = window.localStorage;
} catch {
  storage = null;
}
const progress = readProgress(storage, LEVELS);
let levelIndex = progress.selected;
let level = LEVELS[levelIndex];
let state = createState(level);
let report = simulate(level, state);
let phase = 'ready';
let history = [];
let attempts = 0;
let elapsed = 0;
let frame = 0;
let lastTime = 0;
let heard = new Set();
let hintShown = false;
let messageKey = null;
let storageAvailable = true;
let audioGeneration = 0;
const audio = createAudio();
audio.setEnabled(progress.sound);
const t = (key) => STRINGS[progress.locale][key] || key;
const loc = (item, key) => localized(item, key, progress.locale);
const beatText = (ticks) => `${format(ticks / level.ticksPerBeat)} ${t('beat')}`;
const isBusy = () => phase === 'running' || phase === 'paused';
function activatedTone(kind) {
  const generation = audioGeneration;
  void audio.unlock().then((ready) => {
    if (ready && generation === audioGeneration) audio.tone(kind);
  });
}
const persist = () => {
  storageAvailable = persistProgress(storage, progress);
};
function soundIcon() {
  return progress.sound
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 7q7 5 0 10M16 10q3 2 0 4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="m17 9 5 6m0-6-5 6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
}
function statusText(echo) {
  if (echo.status === 'on-time') return t('ontime');
  if (echo.status === 'weak' || echo.status === 'blocked') return t(echo.status);
  return `${t(echo.status)} ${beatText(Math.abs(echo.targetDelta))}`;
}
function renderStaticText() {
  document.documentElement.lang = progress.locale === 'zh' ? 'zh-CN' : 'en';
  document.title =
    progress.locale === 'zh' ? 'Echo Weaver · 回声编织' : 'Echo Weaver · First resonance';
  document
    .querySelectorAll('[data-i18n]')
    .forEach((node) => (node.textContent = t(node.dataset.i18n)));
  $('#language').textContent = progress.locale === 'zh' ? 'EN' : '中文';
  $('#language').setAttribute(
    'aria-label',
    progress.locale === 'zh' ? 'Switch to English' : '切换中文',
  );
  $('#help').setAttribute('aria-label', t('helpLabel'));
  $('#board').setAttribute('aria-label', t('boardLabel'));
  $('#level-nav').setAttribute('aria-label', t('levelLabel'));
  $('#help-content').innerHTML =
    progress.locale === 'zh'
      ? '<div class="help-step"><b>01</b><div><h3>点击反射板，改变声路</h3><p>发光机关可点按，暗色机关已固定。每格路程耗时 ¼ 拍。长路线晚到，反射更多则损耗更大。</p></div></div><div class="help-step"><b>02</b><div><h3>让三个回声各就各位</h3><p>点声源或「发出声音」只敲击一次。三路要分别赶上目标拍；只接通路线还不够。右侧读数会告诉你提前或迟到了多少。</p></div></div><div class="help-step"><b>03</b><div><h3>时间正确，也要留足能量</h3><p>延迟段增加等待时间；分声器分配 300 点能量。路程、反射和软吸音消耗能量，深色吸音块会彻底阻断声波。接收器至少需要 18 点。</p></div></div><p class="help-footnote">无限试奏 · 随时撤销 · 所有关卡可自由选择<br>画面为声路示意，时长以格数标注为准。声音仅作反馈，静音不影响判定。</p>'
      : '<div class="help-step"><b>01</b><div><h3>Tap a reflector. Shape a route.</h3><p>Glowing mechanisms are editable; dim ones are fixed. Each path unit takes ¼ beat. Longer routes arrive later, while more reflections cost more energy.</p></div></div><div class="help-step"><b>02</b><div><h3>Give each echo its moment.</h3><p>Tap the source or Strike a note to emit one pulse. Every echo must reach its own target beat. A connected route alone is not enough. Readings show exactly how early or late it is.</p></div></div><div class="help-step"><b>03</b><div><h3>Keep enough energy alive.</h3><p>Delays add waiting time; the splitter shares 300 energy. Distance, reflections and soft damping spend energy. Dark absorbers block an echo. The receiver needs at least 18 energy.</p></div></div><p class="help-footnote">Unlimited attempts · Undo anytime · All levels available<br>Paths are schematic: marked units determine time. Audio is feedback only; mute never changes the result.</p>';
}
function renderNav() {
  $('#level-nav').innerHTML = LEVELS.map(
    (item, i) =>
      `<button class="level-button ${i === levelIndex ? 'current' : ''} ${progress.completed[item.id] ? 'done' : ''}" data-level="${i}" ${i === levelIndex ? 'aria-current="step"' : ''} aria-label="${i + 1}. ${escapeHtml(loc(item, 'title'))}${progress.completed[item.id] ? ` · ${t('completed')}` : ''}"><span class="level-num">${String(i + 1).padStart(2, '0')}</span><small>${escapeHtml(loc(item, 'title'))}</small></button>`,
  ).join('');
  $('#completion').textContent =
    `${Object.keys(progress.completed).length} / ${LEVELS.length} ${t('completed')}`;
}
function renderReadouts() {
  $('#route-readouts').innerHTML = report.echoes
    .map(
      (echo, i) =>
        `<div class="route-readout" style="--route-color:${COLORS[i]}"><div class="readout-header"><span class="route-name">0${i + 1} · ${progress.locale === 'zh' ? '回声' : 'ECHO'}</span><span class="route-status ${echo.status === 'on-time' ? '' : 'bad'}">${escapeHtml(statusText(echo))}</span></div><div class="route-stats"><span>${t('arrival')} <strong>${format(echo.arrival / level.ticksPerBeat)}</strong> / ${format(echo.target / level.ticksPerBeat)} ${t('beat')}</span><span>${t('energy')} <strong>${format(echo.energy)}</strong> / ${echo.sourceEnergy}</span></div><div class="energy-track"><div class="energy-fill" style="width:${(Math.max(0, echo.energy) / 150) * 100}%"></div><span class="energy-threshold" style="left:${(level.minEnergy / 150) * 100}%"></span></div><div class="route-stats"><span>${echo.length} ${t('units')} · ${echo.reflections} ${t('reflections')}</span><span>+${beatText(echo.delay)} ${t('delay')}</span></div></div>`,
    )
    .join('');
  $('#energy-note').textContent =
    `${t('minimum')} ≥ ${level.minEnergy} · ${t('loss')}: ${level.lossPerUnit}/${t('units')} + ${level.reflectionLoss}/${progress.locale === 'zh' ? '次反射' : 'reflection'}`;
}
function renderControls() {
  $('#emit').innerHTML = isBusy()
    ? `<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="5" width="10" height="10" rx="1"/></svg>${t('stop')}`
    : `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 3 11 7-11 7z"/></svg>${t('emit')}`;
  $('#undo').innerHTML =
    `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4 3 8l4 4M4 8h7a5 5 0 0 1 0 10" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>${t('undo')}`;
  $('#restart').innerHTML =
    `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 8a6 6 0 1 1 0 5M4 3v5h5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>${t('restart')}`;
  $('#undo').disabled = isBusy() || !history.length;
  $('#restart').disabled = false;
  $('#pause').hidden = !isBusy();
  $('#pause').setAttribute('aria-label', phase === 'paused' ? t('resume') : '暂停');
  $('#pause').innerHTML =
    phase === 'paused'
      ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 2 10 6-10 6z"/></svg>'
      : '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2" width="3" height="12"/><rect x="10" y="2" width="3" height="12"/></svg>';
  $('#sound').innerHTML = soundIcon();
  $('#sound').setAttribute('aria-label', t(progress.sound ? 'soundOn' : 'soundOff'));
  $('#sound').setAttribute('aria-pressed', String(progress.sound));
  $('#hint').textContent = t('hint');
  $('#hint').disabled = isBusy();
  $('#phase').textContent = t(phase);
  $('#message-label').textContent = t(hintShown ? 'hintLabel' : 'messageLabel');
  $('#message').textContent = hintShown
    ? loc(level, 'hint')
    : messageKey
      ? t(messageKey)
      : loc(level, 'intro');
}
function renderRhythm() {
  $('#beat-lights').innerHTML = level.targets
    .map(
      (target, i) =>
        `<div class="beat" data-beat="${i}" style="--route-color:${COLORS[i]}"><span class="beat-orb">${format(target / level.ticksPerBeat)}</span><small>0${i + 1} / ${progress.locale === 'zh' ? '回声' : 'ECHO'}</small></div>`,
    )
    .join('');
  const maxBeat = Math.max(...level.targets) / level.ticksPerBeat;
  $('#timeline-ticks').innerHTML = Array.from(
    { length: Math.ceil(maxBeat) + 1 },
    (_, i) => `<span class="tick" style="left:${(i / maxBeat) * 100}%"><small>${i}</small></span>`,
  ).join('');
}
function draw() {
  report = simulate(level, state);
  renderStaticText();
  renderNav();
  renderReadouts();
  renderControls();
  renderRhythm();
  $('#level-number').textContent = String(levelIndex + 1).padStart(2, '0');
  $('#level-title').textContent = loc(level, 'title');
  $('#board-tip').textContent = loc(level, 'tip') || loc(level, 'intro');
  $('#level-subtitle').textContent = loc(level, 'subtitle');
  renderBoard($('#board'), level, state, report, { locale: progress.locale, phase });
  updatePlayback();
}
function updatePlayback() {
  const active = isBusy();
  animateBoard($('#board'), report, elapsed, active);
  $('#time-readout').textContent = `${(elapsed / level.ticksPerBeat).toFixed(1)} ${t('beat')}`;
  $('#playhead').style.left = `${Math.min(100, (elapsed / Math.max(...level.targets)) * 100)}%`;
  report.echoes.forEach((echo, i) => {
    const node = $(`[data-beat="${i}"]`);
    node.classList.toggle('hit', elapsed >= echo.arrival && echo.status === 'on-time');
    node.classList.toggle(
      'miss',
      elapsed >= Math.min(echo.arrival, echo.target) && echo.status !== 'on-time',
    );
  });
  $('#board').dataset.status = phase;
}
function cancelPlayback() {
  cancelAnimationFrame(frame);
  frame = 0;
  audioGeneration++;
  audio.suspend();
}
function setReady(key = null) {
  cancelPlayback();
  phase = 'ready';
  elapsed = 0;
  heard.clear();
  hintShown = false;
  messageKey = key;
  if ($('#result').open) $('#result').close();
}
function loadLevel(index) {
  if (!Number.isInteger(index) || !LEVELS[index]) return;
  setReady();
  levelIndex = index;
  level = LEVELS[index];
  state = createState(level);
  history = [];
  attempts = 0;
  progress.selected = index;
  persist();
  draw();
}
function changeControl(id) {
  if (isBusy()) return;
  const next = cycleControl(level, state, id);
  if (JSON.stringify(next) === JSON.stringify(state)) return;
  history.push(structuredClone(state));
  state = next;
  setReady('changed');
  activatedTone('control');
  draw();
}
function finish() {
  cancelAnimationFrame(frame);
  frame = 0;
  elapsed = report.duration;
  phase = 'result';
  if (report.won) {
    const previous = progress.completed[level.id]?.attempts ?? Infinity;
    progress.completed[level.id] = { attempts: Math.min(previous, attempts) };
    persist();
    audio.tone('success');
  }
  draw();
  showResult();
}
function tick(now) {
  if (phase !== 'running') return;
  // A hidden document freezes playback. No wall-clock or audio callback decides success.
  elapsed = Math.min(
    report.duration,
    elapsed + (now - lastTime) / (level.beatMs / level.ticksPerBeat),
  );
  lastTime = now;
  for (const [i, echo] of report.echoes.entries()) {
    if (elapsed >= echo.arrival && !heard.has(echo.id)) {
      heard.add(echo.id);
      audio.tone(echo.status === 'on-time' ? 'echo' : 'fail', i);
    }
  }
  updatePlayback();
  if (elapsed >= report.duration) finish();
  else frame = requestAnimationFrame(tick);
}
function emit() {
  if ($('#help-dialog').open || $('#result').open) return;
  if (isBusy()) {
    setReady('stopped');
    draw();
    return;
  }
  elapsed = 0;
  heard.clear();
  phase = 'running';
  hintShown = false;
  messageKey = null;
  attempts++;
  activatedTone('emit');
  draw();
  lastTime = performance.now();
  frame = requestAnimationFrame(tick);
}
function pause() {
  if (phase === 'running') {
    cancelPlayback();
    phase = 'paused';
    messageKey = 'pausedMessage';
    draw();
  } else if (phase === 'paused') {
    phase = 'running';
    messageKey = null;
    audio.unlock();
    draw();
    lastTime = performance.now();
    frame = requestAnimationFrame(tick);
  }
}
function undo() {
  if (isBusy() || !history.length) return;
  state = history.pop();
  setReady('undoMessage');
  draw();
}
function showResult() {
  const won = report.won;
  const allComplete = Object.keys(progress.completed).length === LEVELS.length;
  $('#result-kicker').textContent = won ? 'RESONANCE FOUND / 共鸣达成' : 'RETUNE & TRY / 再调一调';
  $('#result-title').textContent = t(won ? (allComplete ? 'finalTitle' : 'winTitle') : 'loseTitle');
  $('#result-copy').textContent = t(won ? (allComplete ? 'finalCopy' : 'winCopy') : 'loseCopy');
  $('#result-echoes').innerHTML = report.echoes
    .map(
      (echo, i) =>
        `<div class="result-echo" style="--route-color:${COLORS[i]}"><b>0${i + 1} · ${beatText(echo.arrival)}</b><span>${escapeHtml(statusText(echo))} · ${format(echo.energy)} ${t('energy')}</span></div>`,
    )
    .join('');
  $('#continue').textContent = t(
    won ? (levelIndex === LEVELS.length - 1 ? 'replay' : 'next') : 'retry',
  );
  if (!storageAvailable) $('#result-copy').textContent += ` ${t('storage')}`;
  if (!$('#result').open) $('#result').showModal();
  $('#continue').focus({ preventScroll: true });
}
$('#scene-controls').addEventListener('click', (event) => {
  const control = event.target.closest('[data-control]');
  if (control) changeControl(control.dataset.control);
  else if (event.target.closest('[data-emit]')) emit();
});
$('#level-nav').addEventListener('click', (event) => {
  const button = event.target.closest('[data-level]');
  if (!button) return;
  loadLevel(Number(button.dataset.level));
  $(`#level-nav [data-level="${levelIndex}"]`)?.focus({ preventScroll: true });
});
$('#emit').addEventListener('click', emit);
$('#pause').addEventListener('click', pause);
$('#undo').addEventListener('click', undo);
$('#restart').addEventListener('click', () => loadLevel(levelIndex));
$('#continue').addEventListener('click', () => {
  if (report.won) loadLevel((levelIndex + 1) % LEVELS.length);
  else {
    $('#result').close();
    $('#emit').focus({ preventScroll: true });
  }
});
$('#result-close').addEventListener('click', () => {
  $('#result').close();
  $('#emit').focus({ preventScroll: true });
});
$('#hint').addEventListener('click', () => {
  if (isBusy()) return;
  hintShown = true;
  messageKey = null;
  renderControls();
  const target = level.routes
    .flatMap((r) => r.stages)
    .find((s) => s.options.length > 1 && state.choices[s.id] !== level.solution.choices[s.id]);
  const button = target ? $(`[data-control="${target.id}"]`) : $('[data-control="splitter"]');
  button?.classList.remove('hinted');
  requestAnimationFrame(() => button?.classList.add('hinted'));
});
$('#sound').addEventListener('click', () => {
  progress.sound = !progress.sound;
  audioGeneration++;
  audio.setEnabled(progress.sound);
  if (progress.sound) activatedTone('control');
  persist();
  renderControls();
});
$('#language').addEventListener('click', () => {
  progress.locale = progress.locale === 'zh' ? 'en' : 'zh';
  persist();
  draw();
});
$('#help').addEventListener('click', () => {
  if (phase === 'running') pause();
  $('#help-dialog').showModal();
});
$('#close-help').addEventListener('click', () => $('#help-dialog').close());
for (const dialog of [$('#help-dialog'), $('#result')])
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      dialog.close();
  });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (phase === 'running') pause();
    audio.suspend();
  }
});
window.addEventListener('pagehide', cancelPlayback);
document.addEventListener('keydown', (event) => {
  if (
    event.repeat ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    $('#help-dialog').open ||
    $('#result').open
  )
    return;
  if (event.target.closest('input,select,textarea')) return;
  if (event.key === ' ' && event.target.closest('button,a')) return;
  const actions = {
    ' ': emit,
    z: undo,
    r: () => loadLevel(levelIndex),
    p: pause,
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
      historyLength: history.length,
      progress,
      report,
      elapsed,
      attempts,
    }),
});
persist();
draw();

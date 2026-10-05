import { LEVELS, CHAPTERS, PRACTICE, MODES, getLevels } from './levels.js';
import {
  createGame,
  startGame,
  pauseGame,
  resumeGame,
  stepGame,
  commandCop,
  commandRobber,
  holdRobber,
  holdCop,
  routePreview,
  roadTarget,
  roadDistance,
  isExitBlocked,
  captureStatus,
  CAPTURE_RADIUS,
  canRelayOrder,
} from './engine.js';
import { createRenderer } from './renderer.js';
import { createAudio } from './audio.js';
import { openAppearanceSettings, roleAvatarSvg } from './role-appearance.js';
import { runConfig, formatRecord, readRecords, submitRun } from './records.js';
import { readPuzzleLink, fillPuzzleShare } from './share.js';

const $ = (id) => document.getElementById(id);
const STORAGE = 'neighborhood-patrol-v1';
const sharedPuzzle = readPuzzleLink(location.href);
const formatTime = (seconds) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const ordinal = ['一', '二', '三', '四', '五', '六', '七', '八'];
let screen = 'home',
  runTicks = 0,
  runOrders = [],
  recordRequest = 0,
  pendingSubmission = null;
function readProgress() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE));
    const records = {
      best: {},
      escapeBest: {},
      teamworkBest: {},
      streetBest: {},
    };
    for (const field of Object.keys(records))
      for (const [id, seconds] of Object.entries(value?.[field] || {})) {
        if (
          /^\d+$/.test(id) &&
          Number(id) >= 1 &&
          Number(id) <= 100 &&
          Number.isFinite(seconds) &&
          seconds > 0 &&
          seconds < 86400
        )
          records[field][Number(id)] = seconds;
      }
    const modeBest = {};
    for (const [key, seconds] of Object.entries(value?.modeBest || {}))
      if (
        (/^(challenge|classic|escape)-(cop|robber)-(100|[1-9]\d?)(:relay)?(:(cop|robber|simultaneous))?$/.test(
          key,
        ) ||
          /^quick-cop-[1-3](:simultaneous)?$/.test(key)) &&
        Number.isFinite(seconds) &&
        seconds > 0 &&
        seconds < 86400
      )
        modeBest[key] = seconds;
    return {
      ...records,
      modeBest,
      settings: {
        rule: value?.settings?.rule === 'relay' ? 'relay' : 'standard',
        mode: ['quick', 'challenge', 'classic', 'escape'].includes(value?.settings?.mode)
          ? value.settings.mode
          : 'challenge',
        role: value?.settings?.role === 'robber' ? 'robber' : 'cop',
        initiative: ['first', 'second', 'random'].includes(value?.settings?.initiative)
          ? value.settings.initiative
          : 'random',
      },
      sound: value?.sound !== false,
      practiceDone: value?.practiceDone === true,
    };
  } catch {
    return {
      best: {},
      escapeBest: {},
      teamworkBest: {},
      streetBest: {},
      modeBest: {},
      sound: true,
    };
  }
}
let progress = readProgress();
const legacyKey = (id) => `${mode}-${playerRole}-${id}${rule === 'relay' ? ':relay' : ''}`;
const recordKey = (id) => `${legacyKey(id)}:${game.firstRole || 'simultaneous'}`;
const bestTime = (id) =>
  progress.modeBest[recordKey(id)] ||
  (['challenge', 'quick'].includes(mode) ? progress.modeBest[legacyKey(id)] : null) ||
  (rule === 'standard' && mode === 'challenge' && playerRole === 'cop'
    ? progress.streetBest[id]
    : null);
let mode = progress.settings?.mode || 'challenge',
  playerRole = progress.settings?.role || 'cop',
  initiative = progress.settings?.initiative || 'random';
let rule = progress.settings?.rule === 'relay' ? 'relay' : 'standard';
if (sharedPuzzle) {
  mode = sharedPuzzle.mode;
  playerRole = sharedPuzzle.role;
  rule = sharedPuzzle.rule;
  initiative = sharedPuzzle.first === playerRole ? 'first' : 'second';
}
const controlled = () => (game.playerRole === 'robber' ? game.robbers : game.cops);
const roleLabel = () => (game.playerRole === 'robber' ? '小偷' : '警察');
const playerWon = () =>
  game.playerRole === 'robber' ? game.phase === 'lost' : game.phase === 'won';
function unlockedLevel() {
  let id = 1;
  while (id < 100 && progress.best[id]) id++;
  return id;
}
let game = createGame(LEVELS[unlockedLevel() - 1]);
let returnLevel = game.level.id,
  practiceReturn = null,
  practiceOrders = new Set(),
  quickOrders = new Set(),
  captureHint = null;
let selected = 0,
  pointer = null,
  mousePosition = null,
  hover = null,
  preview = null,
  gesture = null,
  keyboardNode = null;
let chapterTab = game.level.chapter,
  toastTimer = 0,
  winTimer = 0,
  lastHud = 0,
  lastTurnSound = -10;
let lastFrame = performance.now(),
  accumulator = 0,
  frameCount = 0,
  measureStart = lastFrame,
  fps = 0;
let dialogResume = false,
  destroyed = false,
  animationId;
const canvas = $('game-canvas');
const renderer = createRenderer(canvas);
const audio = createAudio(progress.sound);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function saveProgress() {
  progress.settings = { mode, role: playerRole, initiative, rule };
  try {
    localStorage.setItem(STORAGE, JSON.stringify(progress));
  } catch {
    toast('浏览器未允许保存进度，本次游戏仍可继续。', 4500);
  }
}
function toast(message, duration = 2400) {
  clearTimeout(toastTimer);
  $('board-toast').textContent = message;
  $('board-toast').classList.add('visible');
  toastTimer = setTimeout(() => $('board-toast').classList.remove('visible'), duration);
}
function clearGesture() {
  if (gesture && canvas.hasPointerCapture(gesture.id)) canvas.releasePointerCapture(gesture.id);
  gesture = null;
  preview = null;
  pointer = null;
  mousePosition = null;
  hover = null;
  canvas.dataset.cursor = 'default';
}
function updateSound() {
  $('sound-button').setAttribute('aria-pressed', String(progress.sound));
  $('sound-button').setAttribute('aria-label', progress.sound ? '关闭声音' : '打开声音');
}
function selectCop(index, sound = true) {
  if (!controlled()[index] || controlled()[index].caught || controlled()[index].escaped) return;
  clearGesture();
  selected = index;
  keyboardNode = null;
  preview = null;
  if (sound) {
    audio.unlock();
    audio.play('select');
  }
  updateHud();
}
function renderAvatars() {
  for (const node of document.querySelectorAll('[data-home-avatar]'))
    node.innerHTML =
      '<svg viewBox="0 0 100 100" aria-hidden="true">' +
      roleAvatarSvg(node.dataset.homeAvatar, 0, 0, 100) +
      '</svg>';
}
function showScreen(next) {
  clearGesture();
  screen = next;
  document.body.dataset.screen = next;
  for (const name of ['home', 'level', 'game'])
    $(name + '-screen').hidden = name !== (next === 'levels' ? 'level' : next);
  renderer.resize();
}
function goHome() {
  clearTimeout(winTimer);
  pauseGame(game);
  document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
  dialogResume = false;
  document.body.classList.remove('modal-open');
  showScreen('home');
  renderAvatars();
}
function recordDescription() {
  return (
    MODES.find((item) => item.id === mode).name +
    ' · ' +
    roleLabel() +
    ' · ' +
    (rule === 'relay' ? '轮换指挥' : '自由调动') +
    ' · ' +
    (game.firstRole ? (game.firstRole === 'cop' ? '警察' : '小偷') + '先动' : '同时开始')
  );
}
async function refreshRecords() {
  const serial = ++recordRequest;
  $('selection-best').textContent = formatRecord(bestTime(game.level.id));
  $('selection-world').textContent = '正在读取';
  $('record-context').textContent = game.firstRole
    ? (game.firstRole === 'cop' ? '警察' : '小偷') + '先动 · 同配置比较'
    : '同时开始 · 同配置比较';
  try {
    const data = await readRecords(runConfig(game));
    if (serial !== recordRequest) return;
    $('selection-world').textContent = formatRecord(data.fastestMs / 1000);
  } catch {
    if (serial === recordRequest) $('selection-world').textContent = '暂未连接';
  }
}
let boardRequest = 0;
async function refreshBoard() {
  const serial = ++boardRequest,
    id = Number($('records-level').value);
  const config = { ...runConfig(game), level: id };
  $('records-context').textContent = recordDescription();
  $('records-local').textContent = formatRecord(bestTime(id));
  $('records-world').textContent = '正在读取';
  $('records-list').replaceChildren();
  $('records-state').textContent = '正在读取服务器纪录…';
  try {
    const data = await readRecords(config);
    if (serial !== boardRequest) return;
    $('records-world').textContent = formatRecord(data.fastestMs / 1000);
    $('records-state').textContent = data.top.length
      ? '操作已通过服务器重放验证。'
      : '本关还没有服务器通关纪录。';
    for (const row of data.top) {
      const item = document.createElement('li'),
        time = document.createElement('b');
      item.append(document.createTextNode(row.name || '玩家'));
      time.textContent = formatRecord(row.elapsedMs / 1000);
      item.append(time);
      $('records-list').append(item);
    }
  } catch {
    if (serial !== boardRequest) return;
    $('records-world').textContent = '暂未连接';
    $('records-state').textContent = '服务器暂不可用；个人最佳仍保存在本机，可稍后刷新。';
  }
}
async function uploadRecord(submission = pendingSubmission) {
  if (!submission) return;
  $('record-status').textContent = '正在验证通关纪录…';
  $('retry-record').hidden = true;
  try {
    const result = await submitRun(submission.config, submission.ticks, submission.orders);
    if (pendingSubmission !== submission) return;
    $('win-world').textContent = formatRecord(result.fastestMs / 1000);
    $('record-status').textContent = '服务器已验证并保存';
    pendingSubmission = null;
  } catch {
    if (pendingSubmission !== submission) return;
    $('win-world').textContent = '暂未连接';
    $('record-status').textContent = '个人最佳已保存，服务器尚未确认。';
    $('retry-record').hidden = false;
  }
}
function updateHud() {
  document.body.dataset.mode = mode;
  document.body.dataset.phase = game.phase;
  document.body.dataset.level = game.level.id;
  if (
    game.playerRole === 'robber' &&
    (controlled()[selected]?.caught || controlled()[selected]?.escaped)
  ) {
    const next = controlled().findIndex((actor) => !actor.caught && !actor.escaped);
    if (next >= 0) selected = next;
  }
  $('caught-count').textContent = game.robbers.filter((r) => r.caught).length;
  $('timer').textContent = formatTime(game.time);
  $('pause-button').disabled = game.phase !== 'playing';
  $('phase-badge').lastElementChild.textContent =
    game.phase === 'playing' && game.time < game.openingSeconds
      ? (game.firstRole === 'cop' ? '警察' : '小偷') + '先动'
      : game.phase === 'paused'
        ? '已暂停'
        : '实时行动';
  $('review-controls').hidden = game.phase !== 'review';
  const exits = exitStates();
  $('exit-status').textContent = game.level.timeLimit
    ? '剩余 ' + Math.ceil(Math.max(0, game.level.timeLimit - game.time)) + ' 秒'
    : exits.length
      ? '出口 ' + exits.filter((exit) => !exit.blocked).length + '/' + exits.length
      : '';
  updateCaptureHint();
}
function updateCaptureHint() {
  const practice = game.level.id === 0;
  $('practice-exit').hidden = !practice;
  $('capture-coach').hidden = !practice || !['playing', 'paused'].includes(game.phase);
  const robber = game.robbers
    .filter((r) => !r.caught && !r.escaped)
    .sort(
      (a, b) =>
        b.escapeProgress - a.escapeProgress ||
        b.capture - a.capture ||
        roadDistance(game, controlled()[selected], a) -
          roadDistance(game, controlled()[selected], b),
    )[0];
  captureHint = robber ? { robber, ...captureStatus(game, robber) } : null;
  let message = '队员抵达目标后会停下；换选同伴从另一侧靠近，完成双人合围。';
  if (practice && !practiceOrders.has(0)) {
    message = '练习 1/3 · 点 1 号警察，再点道路中央的蓝圈。';
  } else if (practice && !practiceOrders.has(1)) {
    message = '练习 2/3 · 换选 2 号，再点橙色小偷，从另一侧追击。';
  } else if (
    practice &&
    captureHint &&
    !captureHint.enclosed &&
    game.cops.every((cop) => !cop.moving)
  ) {
    const farther = game.cops.reduce((a, b) =>
      roadDistance(game, a, robber) > roadDistance(game, b, robber) ? a : b,
    );
    message = `练习 3/3 · 到点会停：选 ${farther.id + 1} 号，再点小偷继续夹击。`;
  } else if (captureHint) {
    const { nearby, enclosed } = captureHint;
    message =
      robber.escapeProgress > 0
        ? `${robber.id + 1} 号在${exitLabel(robber.exitTarget)}翻越！靠近该出口，打断逃脱。`
        : enclosed
          ? `${robber.id + 1} 号 · 双人就位，收网 ${Math.round(robber.capture * 100)}% · 保持 0.8 秒`
          : nearby < 2
            ? `${practice ? '练习 3/3 · ' : `${robber.id + 1} 号 · `}近身 ${nearby}/2 人 · 派同伴从另一侧靠近`
            : `${robber.id + 1} 号 · 橙色路段仍可退避，继续压缩包围`;
  }
  const relayText =
    game.orderRule === 'relay'
      ? game.lastOrder === null
        ? ' · 轮换指挥：每次有效调动后换人，守住不交棒。'
        : ` · 上次 ${game.lastOrder + 1} 号出发，下一道调动请换人${controlled().filter((actor) => !actor.caught && !actor.escaped).length === 1 ? '；仅剩一人时可连续指挥' : ''}。`
      : '';
  if (mode === 'quick' && !practice) {
    const next = game.level.solution.find((order) => !quickOrders.has(order.cop));
    if (next)
      message = `选 ${next.cop + 1} 号，再点${game.level.id === 3 ? (next.cop < 2 ? '上街' : '下街') : ''}小偷。${game.level.id === 2 ? '三条岔路都要封住。' : '另一侧到位才会收网。'}`;
  }
  $('capture-message').textContent =
    (game.playerRole === 'robber'
      ? game.exits.length
        ? '你指挥小偷：点队员，再点道路；任一人越过出口即获胜。'
        : `你指挥小偷：利用环路避开两侧夹击，坚持 ${game.level.timeLimit} 秒。`
      : message) + relayText;
}
function exitStates() {
  return (game.exits || []).map((exit) => ({
    node: exit.node,
    x: exit.x,
    y: exit.y,
    blocked: isExitBlocked(game, exit),
  }));
}
function exitLabel(node) {
  const index = game.exits.findIndex((exit) => exit.node === node);
  return index < 0 ? '出口' : `出口 ${String.fromCharCode(65 + index)}`;
}
function updateCampaign() {
  const catalog = getLevels(mode),
    count = catalog.filter((level) => bestTime(level.id)).length;
  $('campaign-count').textContent = `${count} / ${catalog.length}`;
}
function loadLevel(id, saved = null, opening = {}) {
  if (mode === 'quick') {
    if (id > 3) id = 1;
    playerRole = 'cop';
    rule = 'standard';
  }
  if (!Number.isInteger(id) || id < 0 || id > 100) return false;
  if (id === 0 && game.level.id > 0) returnLevel = game.level.id;
  clearTimeout(winTimer);
  clearTimeout(toastTimer);
  clearGesture();
  $('board-toast').classList.remove('visible');
  $('board-toast').textContent = '';
  document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
  document.body.classList.remove('modal-open');
  dialogResume = false;
  const samePuzzle =
    !opening.fresh &&
    id === game.level.id &&
    mode === game.level.mode &&
    playerRole === game.playerRole;
  const firstRole =
    id === 0 || ['challenge', 'quick'].includes(mode)
      ? null
      : 'first' in opening
        ? opening.first
        : samePuzzle
          ? game.firstRole
          : initiative === 'random'
            ? Math.random() < 0.5
              ? 'cop'
              : 'robber'
            : initiative === 'first'
              ? playerRole
              : playerRole === 'cop'
                ? 'robber'
                : 'cop';
  game =
    saved?.game ||
    createGame(id === 0 ? PRACTICE : getLevels(mode)[id - 1], {
      playerRole: id === 0 ? 'cop' : playerRole,
      firstRole,
      orderRule: id === 0 ? 'standard' : rule,
    });
  if (id !== 0) practiceReturn = null;
  practiceOrders.clear();
  quickOrders.clear();
  captureHint = null;
  selected = saved?.selected ?? 0;
  keyboardNode = null;
  accumulator = 0;
  lastTurnSound = -10;
  runTicks = 0;
  runOrders = [];
  pendingSubmission = null;
  const chapter = CHAPTERS[game.level.chapter];
  chapterTab = game.level.chapter;
  $('chapter-name').textContent = mode === 'quick' ? '战术试炼' : chapter.name;
  $('mission-title').textContent =
    (id ? String(id).padStart(2, '0') + ' · ' : '') + game.level.name;
  $('mission-subtitle').textContent = chapter.subtitle;
  $('mode-select').value = mode;
  $('role-select').value = playerRole;
  $('initiative-select').value = initiative;
  $('rule-select').value = rule;
  for (const name of ['role-select', 'rule-select', 'initiative-select'])
    $(name).closest('label').hidden = mode === 'quick';
  $('initiative-select').disabled = mode === 'challenge';
  $('mode-description').textContent = MODES.find((item) => item.id === mode).description;
  $('share-puzzle').disabled = id === 0;
  $('robber-count').textContent = game.robbers.length;
  $('guide-title').textContent = game.level.name;
  $('guide-hint').textContent = game.level.hint;
  $('ready-hint').textContent = game.level.briefing || '';
  $('start-button').firstChild.textContent = '开始行动';
  canvas.setAttribute('aria-label', game.level.name + '。点击' + roleLabel() + '再点击道路。');
  showScreen('levels');
  updateHud();
  updateCampaign();
  renderLevelGrid();
  if (id) void refreshRecords();
  return true;
}
function begin() {
  showScreen('game');
  audio.unlock();
  if (['won', 'lost'].includes(game.phase) && !playerWon()) {
    loadLevel(game.level.id);
    return;
  }
  if (['won', 'lost'].includes(game.phase) && playerWon()) {
    if (game.level.id === 0) leavePractice();
    else if (mode === 'quick' && game.level.id === 3) {
      mode = 'challenge';
      rule = 'relay';
      playerRole = 'cop';
      saveProgress();
      loadLevel(1, null, { fresh: true });
    } else if (game.level.id === 100) openLevels();
    else loadLevel(game.level.id + 1);
    return;
  }
  if (!startGame(game)) return;
  audio.play('start');
  accumulator = 0;
  lastFrame = performance.now();
  updateHud();
  window.scrollTo({ top: 0, left: 0 });
  canvas.focus({ preventScroll: true });
}
function issue(point) {
  if (game.phase !== 'playing') {
    if (game.phase === 'ready') toast('点击“开始行动”，小队就能出发。');
    return false;
  }
  audio.unlock();
  if (!canRelayOrder(game, game.playerRole, selected)) {
    toast(`轮换要换人：请先让另一位队员出发，${selected + 1} 号仍按原路线行动。`);
    audio.play('invalid');
    return false;
  }
  const accepted = (game.playerRole === 'robber' ? commandRobber : commandCop)(
    game,
    selected,
    point,
  );
  if (accepted) {
    if (mode === 'quick' && game.level.id !== 0) quickOrders.add(selected);
    if (game.level.id === 0 && (Math.abs(point.x - 500) < 45 || game.robbers.includes(point)))
      practiceOrders.add(selected);
    audio.play('order');
    runOrders.push({ tick: runTicks, type: 'move', actor: selected, x: point.x, y: point.y });
  } else {
    audio.play('invalid');
    toast(
      game.time < game.openingSeconds && game.firstRole !== game.playerRole
        ? '开局待命 2 秒，随后双方同时行动。'
        : '这里不能通行，请选择未被封住的道路。',
    );
  }
  preview = null;
  updateHud();
  return accepted;
}
function hold() {
  if ((game.playerRole === 'robber' ? holdRobber : holdCop)(game, selected)) {
    audio.unlock();
    audio.play('hold');
    runOrders.push({ tick: runTicks, type: 'hold', actor: selected });
    clearGesture();
    toast(`${selected + 1} 号，守住这里。`);
    updateHud();
  }
}
function openDialog(id) {
  if ($(id).open) return;
  clearTimeout(winTimer);
  clearGesture();
  dialogResume = game.phase === 'playing';
  if (dialogResume) pauseGame(game);
  $(id).showModal();
  document.body.classList.add('modal-open');
  updateHud();
}
function closeDialog(dialog, resume = true) {
  dialog.close();
  if (!document.querySelector('dialog[open]')) {
    document.body.classList.remove('modal-open');
    if (resume && dialogResume && game.phase === 'paused' && !document.hidden) {
      resumeGame(game);
      lastFrame = performance.now();
      accumulator = 0;
    }
    dialogResume = false;
  }
  updateHud();
}
function pause(reason = '警察和小偷都在等你回来。') {
  if (game.phase !== 'playing') return;
  $('pause-reason').textContent = reason;
  openDialog('pause-dialog');
}
function renderLevelGrid() {
  $('chapter-tabs').hidden = mode === 'quick';
  $('chapter-tabs').replaceChildren(
    ...CHAPTERS.map((chapter) => {
      const button = document.createElement('button');
      button.className = 'chapter-tab';
      button.textContent = `${ordinal[chapter.id]} · ${chapter.name}`;
      button.setAttribute('aria-pressed', String(chapter.id === chapterTab));
      button.addEventListener('click', () => {
        chapterTab = chapter.id;
        renderLevelGrid();
      });
      return button;
    }),
  );
  $('level-grid').replaceChildren(
    ...getLevels(mode)
      .filter((level) => level.chapter === chapterTab)
      .map((level) => {
        const button = document.createElement('button');
        button.className = `level-tile${game.level.id === level.id ? ' current' : ''}`;
        button.disabled = false;
        button.setAttribute('aria-label', `第 ${level.id} 关 ${level.name}`);
        const best = bestTime(level.id);
        const roads = level.edges
          .map(
            ([a, b]) =>
              `M${level.nodes[a].x},${level.nodes[a].y}L${level.nodes[b].x},${level.nodes[b].y}`,
          )
          .join('');
        const exits = level.exits
          .map(
            (node) =>
              `<circle cx="${level.nodes[node].x}" cy="${level.nodes[node].y}" r="22" fill="#cc703c"/>`,
          )
          .join('');
        button.innerHTML = `<strong>${String(level.id).padStart(2, '0')}</strong><i class="tile-mark">${best ? (best <= level.par ? '★' : '✓') : '↗'}</i><svg class="level-map" viewBox="0 0 ${level.worldWidth || 1000} ${level.worldHeight || 600}" aria-hidden="true"><path d="${roads}" fill="none" stroke="#638770" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>${exits}</svg><span>${level.name}</span><small>${best ? `最佳 ${formatRecord(best)}` : `${level.cops.length} 警察 · ${level.robbers.length} 小偷`}</small>`;
        button.addEventListener('click', () => {
          loadLevel(level.id);
          audio.play('select');
        });
        return button;
      }),
  );
}
function openLevels() {
  loadLevel(game.level.id || returnLevel);
}
function won() {
  clearGesture();
  const id = game.level.id;
  if (id === 0) {
    game.phase = 'review';
    progress.practiceDone = true;
    saveProgress();
    audio.play('win');
    updateHud();
    return;
  }
  const recordEligible = rule === 'standard' && mode === 'challenge' && game.playerRole === 'cop';
  const previousBest = bestTime(id);
  progress.modeBest[recordKey(id)] = Math.min(previousBest || Infinity, game.time);
  if (recordEligible) {
    progress.streetBest[id] = Math.min(previousBest || Infinity, game.time);
    progress.best[id] ??= game.time;
  }
  saveProgress();
  updateCampaign();
  updateHud();
  audio.play('win');
  $('win-time').textContent = formatRecord(game.time);
  $('win-world').textContent = '正在读取';
  pendingSubmission = { config: runConfig(game), ticks: runTicks, orders: runOrders.slice() };
  void uploadRecord();
  $('win-best').textContent = formatRecord(progress.modeBest[recordKey(id)]);
  $('win-title').textContent = id === 100 ? '全城围捕，圆满收官。' : '一个也没跑掉。';
  $('win-description').textContent =
    id === 100
      ? '本模式最后一关完成！回到街区地图，挑战更漂亮的用时。'
      : previousBest && game.time < previousBest
        ? '刷新个人最佳！这次的收网又快了一点。'
        : game.time <= game.level.par
          ? `全员抓获，并达成 ${game.level.par} 秒街区挑战！`
          : `全员抓获！再试着把用时压进 ${game.level.par} 秒，拿下本关挑战星。`;
  $('next-button').firstChild.textContent = id === 100 ? '回到街区地图' : `出发 · 第 ${id + 1} 关`;
  if (mode === 'quick') {
    $('win-title').textContent = `战术试炼 ${id} / 3，收网成功！`;
    $('win-description').textContent = `${game.time.toFixed(1)} 秒完成。${game.level.lesson}`;
    $('next-button').firstChild.textContent = id === 3 ? '进阶：轮换指挥' : '下一张短场试炼';
  }
  if (game.playerRole === 'robber') {
    $('win-title').textContent = '小偷获胜！';
    $('win-description').textContent = game.robbers.some((r) => r.escaped)
      ? '成功越过出口！换个角色，试试如何守住它。'
      : '坚持到倒计时结束，成功避开合围。';
  }
  toast(`${roleLabel()}获胜！`, 1700);
  winTimer = setTimeout(
    () => {
      if (playerWon()) openDialog('win-dialog');
    },
    reducedMotion.matches ? 250 : 1150,
  );
}
function lost(event) {
  clearGesture();
  audio.play('lose');
  const label = exitLabel(event.exitNode);
  $('lose-title').textContent =
    game.playerRole === 'robber'
      ? '小偷被合围了。'
      : event.reason === 'timeout'
        ? '时间到，小偷获胜。'
        : `${label}失守了。`;
  $('lose-description').textContent =
    game.playerRole === 'robber'
      ? '两侧退路被警察封住。复盘时看看能否更早换路。'
      : event.reason === 'timeout'
        ? '倒计时结束仍有队员未被合围。尝试分头守住岔路，避免同向追赶。'
        : `${event.robberId + 1} 号小偷从 ${label} 越过出口。复盘保留最后局面；可随时返回准备或重新挑战。`;
  if (mode === 'quick') {
    $('lose-title').textContent = '短场时间到，再试一次分工。';
    $('lose-description').textContent =
      `${game.level.lesson} ${game.level.hint} 点重新挑战马上再来。`;
  }
  $('lose-caught').textContent =
    `${game.robbers.filter((r) => r.caught).length} / ${game.robbers.length}`;
  $('lose-time').textContent = formatTime(game.time);
  toast(
    game.playerRole === 'robber'
      ? '退路被合围，本局结束。'
      : event.reason === 'timeout'
        ? '时间到，小偷获胜。'
        : `小偷从${label}冲线！`,
    2000,
  );
  updateHud();
  winTimer = setTimeout(
    () => {
      if (['won', 'lost'].includes(game.phase) && !playerWon()) openDialog('lose-dialog');
    },
    reducedMotion.matches ? 200 : 900,
  );
}

function hitActor(clientX, clientY) {
  // Large districts render smaller figures: a fixed CSS hit disk would swallow adjacent roads.
  const origin = renderer.toScreen({ x: 0, y: 0 }),
    edge = renderer.toScreen({ x: 26, y: 0 });
  let hit = null,
    nearest = Math.max(14, Math.min(26, Math.hypot(edge.x - origin.x, edge.y - origin.y)));
  const actors = [
    ...game.cops.map((actor) => ({ actor, cop: true })),
    ...game.robbers
      .filter((actor) => !actor.caught && !actor.escaped)
      .map((actor) => ({ actor, cop: false })),
  ];
  for (const { actor, cop } of actors) {
    const screen = renderer.toScreen({ x: actor.x, y: actor.y - 28 });
    const foot = renderer.toScreen(actor);
    const distance = Math.min(
      Math.hypot(clientX - screen.x, clientY - screen.y),
      Math.hypot(clientX - foot.x, clientY - foot.y),
    );
    if (distance < nearest) {
      // Input hit.cop means selectable (our team); physical actor types stay in the engine.
      hit = { actor, cop: cop === (game.playerRole !== 'robber') };
      nearest = distance;
    }
  }
  return hit;
}
function updateHover() {
  hover = null;
  let cursor = 'default';
  if (mousePosition && ['ready', 'playing'].includes(game.phase)) {
    hover = hitActor(mousePosition.x, mousePosition.y);
    if (gesture?.cop >= 0 && game.phase === 'playing') cursor = 'drag';
    else if (hover) cursor = hover.cop ? 'cop' : 'robber';
    else if (
      game.phase === 'playing' &&
      roadTarget(game, renderer.toWorld(mousePosition.x, mousePosition.y))
    )
      cursor = 'road';
  }
  if (canvas.dataset.cursor !== cursor) canvas.dataset.cursor = cursor;
}
canvas.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
  event.preventDefault();
  audio.unlock();
  canvas.focus({ preventScroll: true });
  const hit = hitActor(event.clientX, event.clientY);
  const wasSelected = hit?.cop && hit.actor.id === selected;
  if (hit?.cop) selectCop(hit.actor.id);
  if (event.pointerType === 'mouse') mousePosition = { x: event.clientX, y: event.clientY };
  gesture = {
    id: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    cop: hit?.cop ? hit.actor.id : -1,
    dragged: false,
    wasSelected,
  };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (!event.isPrimary) return;
  if (event.pointerType === 'mouse') mousePosition = { x: event.clientX, y: event.clientY };
  const hit = hitActor(event.clientX, event.clientY);
  const point = hit && !hit.cop ? hit.actor : renderer.toWorld(event.clientX, event.clientY);
  if (gesture && gesture.id === event.pointerId) {
    gesture.dragged ||=
      Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 8;
    if (gesture.dragged && gesture.cop >= 0) {
      preview = routePreview(game, selected, point);
      pointer = roadTarget(game, point);
    }
  } else if (event.pointerType === 'mouse' && game.phase === 'playing') {
    pointer = hit?.cop ? null : roadTarget(game, point);
    preview = hit?.cop ? null : routePreview(game, selected, point);
  }
});
canvas.addEventListener('pointerup', (event) => {
  if (!gesture || gesture.id !== event.pointerId) return;
  const { cop, dragged, startX, startY, wasSelected } = gesture;
  // Returning a drag to its press point cancels it, preserving an order already in progress.
  const droppedAway = Math.hypot(event.clientX - startX, event.clientY - startY) > 8;
  const hit = hitActor(event.clientX, event.clientY);
  const point = hit && !hit.cop ? hit.actor : renderer.toWorld(event.clientX, event.clientY);
  clearGesture();
  if (cop >= 0 && !dragged && wasSelected && controlled()[cop].moving) hold();
  if ((cop < 0 && !dragged) || (cop >= 0 && dragged && droppedAway)) issue(point);
  if (event.pointerType === 'mouse') mousePosition = { x: event.clientX, y: event.clientY };
});
canvas.addEventListener('pointercancel', clearGesture);
canvas.addEventListener('lostpointercapture', clearGesture);
canvas.addEventListener('pointerleave', () => {
  mousePosition = null;
  hover = null;
  canvas.dataset.cursor = 'default';
  if (!gesture) {
    pointer = null;
    preview = null;
  }
});
canvas.addEventListener('contextmenu', (event) => event.preventDefault());

function keyboardTarget(key) {
  canvas.focus({ preventScroll: true });
  const graph = game.graph;
  if (keyboardNode === null) {
    keyboardNode = graph.nodes.reduce(
      (best, node, i) =>
        Math.hypot(node.x - controlled()[selected].x, node.y - controlled()[selected].y) <
        Math.hypot(
          graph.nodes[best].x - controlled()[selected].x,
          graph.nodes[best].y - controlled()[selected].y,
        )
          ? i
          : best,
      0,
    );
  }
  const origin = graph.nodes[keyboardNode];
  const direction = {
    ArrowRight: [1, 0],
    ArrowLeft: [-1, 0],
    ArrowDown: [0, 1],
    ArrowUp: [0, -1],
  }[key];
  const candidates = graph.adjacent[keyboardNode].map(({ node }) => ({
    node,
    dx: graph.nodes[node].x - origin.x,
    dy: graph.nodes[node].y - origin.y,
  }));
  const next = candidates
    .filter((c) => c.dx * direction[0] + c.dy * direction[1] > 0)
    .sort(
      (a, b) =>
        (b.dx * direction[0] + b.dy * direction[1]) / Math.hypot(b.dx, b.dy) -
        (a.dx * direction[0] + a.dy * direction[1]) / Math.hypot(a.dx, a.dy),
    )[0];
  if (next) keyboardNode = next.node;
  pointer = graph.nodes[keyboardNode];
  preview = routePreview(game, selected, pointer);
  toast(`目标路口：${graph.nodes[keyboardNode].label || keyboardNode + 1}，按回车下令。`, 2000);
}
document.addEventListener('keydown', (event) => {
  if (
    screen !== 'game' ||
    document.querySelector('dialog[open]') ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  )
    return;
  if (/^[1-9]$/.test(event.key)) {
    event.preventDefault();
    selectCop(Number(event.key) - 1);
  } else if (event.key === 'Escape' || event.key.toLowerCase() === 'p') {
    event.preventDefault();
    pause();
  } else if (event.key.toLowerCase() === 'h') {
    event.preventDefault();
    hold();
  } else if (game.phase === 'playing' && event.key.startsWith('Arrow')) {
    event.preventDefault();
    keyboardTarget(event.key);
  } else if (
    game.phase === 'playing' &&
    event.key === 'Enter' &&
    pointer &&
    document.activeElement === canvas
  ) {
    event.preventDefault();
    issue(pointer);
  }
});

$('start-button').addEventListener('click', begin);
function practice() {
  if (game.level.id > 0 && ['playing', 'paused'].includes(game.phase)) {
    pauseGame(game);
    practiceReturn = { game, selected };
  }
  loadLevel(0);
  begin();
}
function leavePractice() {
  loadLevel(returnLevel, practiceReturn);
  if (game.phase === 'paused') {
    $('pause-reason').textContent = '练习结束，原来的布置和用时已保留。准备好后继续。';
    openDialog('pause-dialog');
    dialogResume = true;
  }
}
$('practice-button').addEventListener('click', practice);
$('practice-exit').addEventListener('click', leavePractice);
$('pause-button').addEventListener('click', () => pause());
$('resume-button').addEventListener('click', () => closeDialog($('pause-dialog')));
$('pause-restart').addEventListener('click', () => {
  loadLevel(game.level.id);
  begin();
});
$('win-retry').addEventListener('click', () => {
  loadLevel(game.level.id);
  begin();
});
$('lose-retry').addEventListener('click', () => {
  loadLevel(game.level.id);
  begin();
});
$('lose-review').addEventListener('click', () => {
  game.phase = 'review';
  closeDialog($('lose-dialog'), false);
});
$('review-return').addEventListener('click', () => loadLevel(game.level.id));
$('review-retry').addEventListener('click', () => {
  loadLevel(game.level.id);
  begin();
});
$('mode-select').addEventListener('change', (event) => {
  mode = event.target.value;
  saveProgress();
  loadLevel(1, null, { fresh: true });
});
$('role-select').addEventListener('change', (event) => {
  playerRole = event.target.value;
  saveProgress();
  loadLevel(game.level.id || 1, null, { fresh: true });
});
$('initiative-select').addEventListener('change', (event) => {
  initiative = event.target.value;
  saveProgress();
  loadLevel(game.level.id || 1, null, { fresh: true });
});
$('rule-select').addEventListener('change', (event) => {
  rule = event.target.value;
  saveProgress();
  loadLevel(game.level.id || 1);
});
function enterQuick(id) {
  mode = 'quick';
  playerRole = 'cop';
  rule = 'standard';
  saveProgress();
  loadLevel(id, null, { fresh: true });
}
document
  .querySelectorAll('[data-quick]')
  .forEach((button) =>
    button.addEventListener('click', () => enterQuick(Number(button.dataset.quick))),
  );
$('share-puzzle').addEventListener('click', () => {
  fillPuzzleShare(
    {
      mode,
      level: game.level.id || returnLevel,
      role: game.playerRole,
      rule: game.orderRule,
      first: game.firstRole,
    },
    `街区追捕 · ${game.level.name} · ${game.orderRule === 'relay' ? '轮换指挥' : roleLabel()}`,
  );
  openDialog('share-dialog');
});
$('appearance-button').addEventListener('click', () => openAppearanceSettings(renderAvatars));
$('next-button').addEventListener('click', () => {
  if (mode === 'quick' && game.level.id === 3) {
    mode = 'challenge';
    rule = 'relay';
    playerRole = 'cop';
    saveProgress();
    loadLevel(1, null, { fresh: true });
    return;
  }
  if (game.level.id === 100) {
    closeDialog($('win-dialog'), false);
    openLevels();
  } else loadLevel(game.level.id + 1);
});
$('win-levels').addEventListener('click', () => {
  closeDialog($('win-dialog'), false);
  openLevels();
});
$('levels-button').addEventListener('click', openLevels);
$('help-button').addEventListener('click', () => openDialog('help-dialog'));
$('sound-button').addEventListener('click', () => {
  progress.sound = !progress.sound;
  audio.setEnabled(progress.sound);
  audio.play('select');
  saveProgress();
  updateSound();
});
function displayChanged() {
  renderer.resize();
  clearGesture();
}
document.addEventListener('fullscreenchange', displayChanged);
document.addEventListener('game-displaychange', displayChanged);
document
  .querySelectorAll('[data-close]')
  .forEach((button) =>
    button.addEventListener('click', () => closeDialog(button.closest('dialog'))),
  );
document.querySelectorAll('dialog').forEach((dialog) =>
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeDialog(dialog);
  }),
);
document.addEventListener('visibilitychange', () => {
  clearGesture();
  if (document.hidden) pause('你刚刚离开了页面。准备好后，再继续行动。');
});
window.addEventListener('blur', () => {
  if (!document.querySelector('dialog[open]')) pause('窗口暂时失去焦点，行动已为你暂停。');
  clearGesture();
});
window.addEventListener('resize', () => {
  renderer.resize();
  clearGesture();
});
let competitionPaused = false;
window.addEventListener('competition-visibility', ({ detail }) => {
  if (detail?.open) {
    clearGesture();
    competitionPaused = pauseGame(game) || competitionPaused;
    updateHud();
  } else if (competitionPaused) {
    competitionPaused = false;
    if (game.phase !== 'paused') return;
    $('pause-reason').textContent = '好友赛已关闭，单人行动仍保留在离开时的局面。';
    openDialog('pause-dialog');
    dialogResume = true;
  }
});

function frame(now) {
  if (destroyed) return;
  const elapsed = Math.max(0, Math.min((now - lastFrame) / 1000, 0.05));
  lastFrame = now;
  if (game.phase === 'playing') {
    accumulator += elapsed;
    while (accumulator >= 1 / 60 && game.phase === 'playing') {
      stepGame(game, 1 / 60);
      runTicks++;
      accumulator -= 1 / 60;
    }
  } else accumulator = 0;
  for (const event of game.events.splice(0)) {
    if (event.type === 'capture') {
      audio.play('capture');
      toast(`抓到 ${event.robberId + 1} 号小偷！继续盯住其他路口。`);
    } else if (event.type === 'win' || event.type === 'lose') {
      if (playerWon()) won();
      else lost(event);
    } else if (event.type === 'turn' && game.time - lastTurnSound > 0.8) {
      audio.play('turn');
      lastTurnSound = game.time;
    }
  }
  updateHover();
  renderer.draw(game, {
    selected,
    preview,
    pointer,
    hover,
    captureHint,
    practiceTarget: game.level.id === 0 && game.phase === 'playing' && !practiceOrders.has(0),
    reducedMotion: reducedMotion.matches,
    now,
  });
  if (now - lastHud > 120) {
    updateHud();
    lastHud = now;
  }
  frameCount++;
  if (now - measureStart > 1000) {
    fps = (frameCount * 1000) / (now - measureStart);
    frameCount = 0;
    measureStart = now;
  }
  animationId = requestAnimationFrame(frame);
}

// Read-only inspection supports browser playtests without injecting state or fake wins.
export function getSnapshot() {
  const actor = (a) => ({
    id: a.id,
    x: a.x,
    y: a.y,
    moving: a.moving,
    caught: !!a.caught,
    escaped: !!a.escaped,
    escapeProgress: a.escapeProgress || 0,
    exitTarget: a.exitTarget ?? null,
    blocked: !!a.blocked,
    capture: a.capture || 0,
    destination: a.destination && { x: a.destination.x, y: a.destination.y },
  });
  return {
    screen,
    ticks: runTicks,
    level: game.level.id,
    mode,
    role: game.playerRole,
    phase: game.phase,
    time: game.time,
    selected,
    fps,
    firstRole: game.firstRole,
    rule: game.orderRule,
    lastOrder: game.lastOrder,
    openingSeconds: game.openingSeconds,
    cops: game.cops.map(actor),
    robbers: game.robbers.map(actor),
    exits: exitStates(),
    unlocked: unlockedLevel(),
    audio: progress.sound,
    nodes: game.level.nodes.map((p) => ({ ...p })),
  };
}
export function worldToScreen(point) {
  return renderer.toScreen(point);
}

loadLevel(
  sharedPuzzle?.level || game.level.id,
  null,
  sharedPuzzle ? { first: sharedPuzzle.first } : { fresh: true },
);
if (sharedPuzzle) {
  const clean = new URL(location.href);
  for (const key of ['mode', 'level', 'role', 'first', 'rule']) clean.searchParams.delete(key);
  history.replaceState(null, '', clean);
}
updateSound();
renderAvatars();
showScreen(sharedPuzzle ? 'levels' : 'home');
document
  .querySelectorAll('[data-home]')
  .forEach((button) => button.addEventListener('click', goHome));
document
  .querySelectorAll('[data-levels]')
  .forEach((button) => button.addEventListener('click', openLevels));
$('records-button').onclick = () => {
  $('records-level').replaceChildren(
    ...getLevels(mode).map((level) => {
      const option = document.createElement('option');
      option.value = level.id;
      option.textContent = level.id + ' · ' + level.name;
      return option;
    }),
  );
  $('records-level').value = game.level.id || 1;
  openDialog('records-dialog');
  void refreshBoard();
};
$('records-level').onchange = refreshBoard;
$('records-refresh').onclick = refreshBoard;
$('retry-record').onclick = () => uploadRecord();
document.querySelectorAll('[data-competition-entry]').forEach((button) =>
  button.addEventListener('click', () => {
    if (globalThis.__openStreetCompetition) {
      document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
      void globalThis.__openStreetCompetition(button.dataset.competitionEntry);
    } else openDialog('service-dialog');
  }),
);
animationId = requestAnimationFrame(frame);
window.addEventListener('pagehide', (event) => {
  clearGesture();
  pauseGame(game);
  if (!event.persisted) {
    destroyed = true;
    cancelAnimationFrame(animationId);
    renderer.destroy();
  }
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted && game.phase === 'paused' && !document.querySelector('dialog[open]')) {
    dialogResume = true;
    $('pause-dialog').showModal();
    document.body.classList.add('modal-open');
    updateHud();
  }
});

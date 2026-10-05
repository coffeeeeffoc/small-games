import { LEVELS } from './levels.mjs';
import { createBattle, step, setRetreat, alive, averageStamina } from './simulation.mjs';
import { emptyProgress, migrateProgress, SAVE_KEY, unlocked, recordVictory } from './progress.mjs';
import { render } from './renderer.mjs';
import { setupDisplay } from './display.mjs';

const $ = (s) => document.querySelector(s),
  game = $('#game'),
  canvas = $('#battlefield'),
  c = canvas.getContext('2d');
let progress = emptyProgress();
try {
  progress = migrateProgress(JSON.parse(localStorage.getItem(SAVE_KEY)));
} catch {}
let battle = null,
  screenName = 'home',
  selected = 0,
  mode = 'campaign',
  practice = false,
  last = 0,
  clock = 0,
  raf = 0,
  background = null,
  noticeTimer;
let matchTimer = null,
  matchTick = null,
  audio = null,
  width = 1200,
  height = 675,
  previousPhase = '';
const pointers = { blue: new Set(), red: new Set() },
  keys = { blue: false, red: false };
function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
  } catch {
    notice('暂时无法保存进度，本次仍可继续游玩。');
  }
}
function notice(text) {
  clearTimeout(noticeTimer);
  $('#notice').textContent = text;
  $('#notice').hidden = false;
  noticeTimer = setTimeout(() => ($('#notice').hidden = true), 3500);
}
function sound(kind) {
  if (progress.muted) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    void audio.resume();
    const osc = audio.createOscillator(),
      gain = audio.createGain();
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.type = 'triangle';
    const now = audio.currentTime;
    osc.frequency.setValueAtTime(kind === 'warning' ? 380 : kind === 'won' ? 720 : 240, now);
    osc.frequency.exponentialRampToValueAtTime(kind === 'won' ? 1000 : 140, now + 0.16);
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.start();
    osc.stop(now + 0.22);
  } catch {}
}
function updateCommand(side) {
  const held = pointers[side].size > 0 || keys[side];
  if (battle) setRetreat(battle, side, held);
  $(`#retreat-${side}`).setAttribute('aria-pressed', String(held));
}
function release() {
  for (const side of ['blue', 'red']) {
    pointers[side].clear();
    keys[side] = false;
    if (battle) battle.retreat[side] = false;
    updateCommand(side);
  }
}
function cancelMatch() {
  clearTimeout(matchTimer);
  clearInterval(matchTick);
  matchTimer = null;
  matchTick = null;
}
function show(name) {
  release();
  if (name !== 'prepare') cancelMatch();
  screenName = name;
  game.dataset.screen = name;
  document.body.dataset.phase = name === 'battle' ? 'playing' : name;
  for (const el of document.querySelectorAll('.screen')) el.hidden = el.id !== name;
  // A scoped same-origin bridge hides Shell chrome only while this game's battle is visible.
  try {
    const host = parent !== window && parent.document.querySelector('[data-game-display-host]');
    if (host) host.dataset.gameImmersive = String(name === 'battle');
  } catch {}
  if (name === 'home') {
    battle = null;
    $('#progress-count').textContent = `${Object.keys(progress.medals).length} / 三`;
    $('#start').firstChild.textContent = Object.keys(progress.medals).length
      ? '继续战役 '
      : '开始战役 ';
  }
  if (name === 'levels') drawLevels();
}
function drawLevels() {
  $('#map-progress').textContent = `已夺下 ${Object.keys(progress.medals).length} / 3 面军旗`;
  $('#level-list').replaceChildren(
    ...LEVELS.map((l, i) => {
      const button = document.createElement('button');
      button.className = 'level-card';
      button.dataset.level = l.id;
      button.disabled = !unlocked(progress, l);
      button.setAttribute('aria-label', `${l.name}${button.disabled ? '，尚未解锁' : ''}`);
      const n = progress.medals[l.id] || 0;
      button.innerHTML = `<span class="level-medallion">${['山', '追', '弩'][i]}</span><h3>${l.name}</h3><p>${button.disabled ? '通关前一关后解锁' : l.description}</p><span class="stars">${button.disabled ? '未解锁' : '◆'.repeat(n) + '◇'.repeat(3 - n)}</span>`;
      button.onclick = () => start(i, 'campaign');
      return button;
    }),
  );
}
function start(index = 0, nextMode = mode, dev = false) {
  if (nextMode === 'campaign' && !dev && !unlocked(progress, LEVELS[index])) return;
  cancelMatch();
  selected = index;
  mode = nextMode;
  practice = dev;
  previousPhase = '';
  battle = createBattle(LEVELS[index], mode, Math.floor(Math.random() * 10000));
  game.dataset.mode = mode;
  game.dataset.practice = String(practice);
  $('#battle-name').textContent = practice
    ? '开发试玩'
    : mode === 'campaign'
      ? LEVELS[index].name
      : mode === 'random'
        ? '随机对阵 · 模拟对手'
        : '好友对战 · 同屏双人';
  $('#retreat-red').hidden = mode !== 'friend';
  show('battle');
  last = performance.now();
  sound('start');
  updateHud();
}
function prepare(nextMode) {
  cancelMatch();
  mode = nextMode;
  show('prepare');
  const friend = mode === 'friend';
  $('#prepare-title').textContent = friend ? '好友，来一局' : '随机对阵';
  $('#prepare-eyebrow').textContent = friend ? '双人同屏 · 一人一枚军令' : '本地演练 · 模拟匹配';
  $('#red-role').textContent = friend ? '好友指挥' : '待匹配的模拟对手';
  $('#blue-role').textContent = friend ? '左侧按钮 / A 键' : '你来指挥';
  $('#prepare-note').textContent = friend
    ? '共用这块屏幕。蓝方按左下，红方按右下；双方松手进攻。'
    : '为你抽选不同节奏的本地对手。本原型尚未连接在线匹配。';
  $('#prepare-start').textContent = friend ? '双方就位，开战 →' : '寻找模拟对手 →';
  $('#prepare-start').disabled = false;
}
function beginPrepared() {
  if (mode === 'friend') {
    start(0, 'friend');
    return;
  }
  $('#prepare-start').disabled = true;
  let count = 0;
  $('#prepare-start').textContent = '正在整军 · 取消可回营';
  matchTick = setInterval(() => {
    $('#red-role').textContent = ['挑选对手…', '正在整军…', '赤焰校尉 · 模拟对手'][
      Math.min(count++, 2)
    ];
  }, 450);
  matchTimer = setTimeout(() => {
    start(1, 'random');
  }, 1700);
}
function pause() {
  if (screenName !== 'battle' || battle?.status !== 'playing') return;
  show('paused');
  audio?.suspend();
}
function updateHud() {
  if (!battle) return;
  const s = battle,
    v = s.volley;
  for (const side of ['blue', 'red']) {
    $(`#${side}-count`).textContent = `${alive(s, side).length} / 6 人`;
    $(`#${side}-flag`).style.width = `${s.flags[side]}%`;
    $(`#${side}-stamina`).textContent =
      `体力 ${Math.round(averageStamina(s, side))}% · 军旗 ${Math.ceil(s.flags[side])}%`;
  }
  $('#battle-time').textContent =
    `${String(Math.floor(s.time / 60)).padStart(2, '0')}:${String(Math.floor(s.time % 60)).padStart(2, '0')}`;
  const danger = ['warning', 'gap', 'impact'].includes(v.phase),
    card = $('#volley-notice');
  card.classList.toggle('danger', danger);
  card.querySelector('b').textContent =
    v.phase === 'warning'
      ? `箭雨将至 · ${v.timer.toFixed(1)}秒`
      : v.phase === 'gap'
        ? `还有一轮 · ${v.timer.toFixed(1)}秒`
        : v.phase === 'impact'
          ? '箭雨落下！'
          : v.phase === 'silent'
            ? '敌方弓阵已破'
            : `弓兵装填 · ${Math.ceil(v.timer)}秒`;
  card.querySelector('small').textContent = danger
    ? v.remaining > 1
      ? '分批齐射 · 等最后一箭落地'
      : '撤离橙色区域'
    : v.phase === 'silent'
      ? '向前，夺旗！'
      : '趁现在，重新推进';
  $('#battle-hint').textContent =
    s.time < 4 && mode === 'campaign'
      ? '士兵自动进攻 · 试着按住右下方收兵'
      : s.retreat.blue && averageStamina(s, 'blue') > 98
        ? '体力已满，可以反攻！'
        : '';
  $('#command-state b').textContent = s.retreat.blue ? '全军收兵' : '全军进攻';
  $('#command-state small').textContent = s.retreat.blue
    ? '脱离接战后恢复体力'
    : '保住人，才能再冲';
  if (v.phase !== previousPhase) {
    if (v.phase === 'warning') sound('warning');
    previousPhase = v.phase;
  }
  game.dataset.retreat = String(s.retreat.blue);
  game.dataset.battleStatus = s.status;
}
function finish() {
  if (recordVictory(progress, battle, practice)) save();
  const won = battle.status === 'won',
    draw = battle.status === 'draw',
    friend = mode === 'friend';
  $('#result-eyebrow').textContent = practice
    ? '开发试玩 · 不计入进度'
    : mode === 'campaign'
      ? '此战，已记入行军册'
      : friend
        ? '同屏切磋 · 胜负已分'
        : '本地模拟 · 对阵结束';
  $('#result-title').textContent = draw
    ? '鸣金，各自收兵'
    : friend
      ? won
        ? '青岚军胜'
        : '赤焰军胜'
      : won
        ? '这一退，赢回来了'
        : '留待下一次反攻';
  $('#result-medals').textContent = won
    ? '◆'.repeat(battle.casualties === 0 ? 3 : battle.casualties <= 2 ? 2 : 1)
    : '—';
  $('#result-reason').textContent =
    battle.reason +
    (won && mode === 'campaign'
      ? ' · ' + LEVELS[selected].reward
      : !won && !draw
        ? '。躲过箭雨，整队后再试一次。'
        : '');
  $('#result-stats').innerHTML =
    `<span><b>${Math.ceil(battle.time)}s</b>交战用时</span><span><b>${alive(battle, 'blue').length} / 6</b>蓝方存活</span><span><b>${battle.dodged}</b>避开齐射</span>`;
  $('#next').hidden = !(won && mode === 'campaign' && selected < LEVELS.length - 1 && !practice);
  show('result');
  sound(won ? 'won' : 'end');
}
for (const side of ['blue', 'red']) {
  const button = $(`#retreat-${side}`);
  button.addEventListener('pointerdown', (e) => {
    if (screenName !== 'battle' || e.button !== 0) return;
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    pointers[side].add(e.pointerId);
    updateCommand(side);
    sound('command');
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
    button.addEventListener(type, (e) => {
      pointers[side].delete(e.pointerId);
      updateCommand(side);
    });
  button.addEventListener('contextmenu', (e) => e.preventDefault());
}
const keySide = (e) =>
  e.code === 'Space' || e.code === 'KeyA' ? 'blue' : e.code === 'KeyL' ? 'red' : null;
function keydown(e) {
  if (e.code === 'Escape') {
    if (screenName === 'battle') pause();
    else if (screenName === 'paused') $('#resume').click();
    return;
  }
  const side = keySide(e);
  if (screenName === 'battle' && side && (side === 'blue' || mode === 'friend')) {
    e.preventDefault();
    keys[side] = true;
    updateCommand(side);
  }
}
function keyup(e) {
  const side = keySide(e);
  if (side) {
    keys[side] = false;
    updateCommand(side);
  }
}
window.addEventListener('keydown', keydown);
window.addEventListener('keyup', keyup);
function loseFocus() {
  release();
  pause();
  cancelMatch();
  if (screenName === 'prepare') prepare(mode);
}
window.addEventListener('blur', loseFocus);
function visibility() {
  if (document.hidden) loseFocus();
}
document.addEventListener('visibilitychange', visibility);
document.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => show(b.dataset.go)));
$('#start').onclick = () =>
  start(
    Math.min(
      LEVELS.findIndex((l) => !progress.medals[l.id]) < 0
        ? 2
        : LEVELS.findIndex((l) => !progress.medals[l.id]),
      2,
    ),
    'campaign',
  );
$('#levels-open').onclick = () => show('levels');
$('#help-open').onclick = () => show('help');
$('#random-open').onclick = () => prepare('random');
$('#friend-open').onclick = () => prepare('friend');
$('#prepare-start').onclick = beginPrepared;
$('#pause').onclick = pause;
$('#resume').onclick = () => {
  show('battle');
  last = performance.now();
  sound('resume');
};
$('#restart').onclick = $('#retry').onclick = () => start(selected, mode, practice);
$('#next').onclick = () => start(selected + 1, 'campaign');
function muteLabel() {
  $('#mute').textContent = `音效 ${progress.muted ? '关' : '开'}`;
  $('#mute').setAttribute('aria-pressed', String(!progress.muted));
}
$('#mute').onclick = () => {
  progress.muted = !progress.muted;
  muteLabel();
  save();
  if (progress.muted) audio?.suspend();
  else sound('toggle');
};
muteLabel();
const displayCleanup = setupDisplay(game, (w, h) => {
  width = w;
  height = h;
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * ratio);
  canvas.height = Math.round(h * ratio);
});
const bg = new Image();
bg.onload = () => (background = bg);
bg.src = new URL('../assets/valley.webp', import.meta.url).href;
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  if (screenName !== 'paused') clock += dt;
  if (screenName === 'battle' && battle) {
    step(battle, dt);
    updateHud();
    if (battle.status !== 'playing') finish();
  }
  render(c, battle, {
    width: canvas.width,
    height: canvas.height,
    time: clock,
    background,
    home: !battle,
  });
  raf = requestAnimationFrame(frame);
}
const unregister = window.SmallGamesDev?.registerActions(
  LEVELS.map((l, i) => ({
    id: `rally-${l.id}`,
    label: `试玩：${l.name}`,
    run: () => {
      if (window.SmallGamesDev.isEnabled()) start(i, 'campaign', true);
    },
  })),
);
const unsnapshot = window.SmallGamesDev?.registerSnapshot(() => ({
  screen: screenName,
  mode,
  practice,
  time: battle?.time,
  retreat: battle?.retreat,
  status: battle?.status,
  progress,
}));
// Read-only snapshots are available for automated checks; mutation stays inside the dev panel.
window.RetreatRally = {
  snapshot: () => structuredClone({ screen: screenName, battle, progress, practice }),
  pause,
};
function cleanup() {
  cancelAnimationFrame(raf);
  release();
  cancelMatch();
  clearTimeout(noticeTimer);
  displayCleanup();
  unregister?.();
  unsnapshot?.();
  audio?.close();
  window.removeEventListener('keydown', keydown);
  window.removeEventListener('keyup', keyup);
  window.removeEventListener('blur', loseFocus);
  document.removeEventListener('visibilitychange', visibility);
  try {
    const host = parent !== window && parent.document.querySelector('[data-game-display-host]');
    if (host) delete host.dataset.gameImmersive;
  } catch {}
}
window.addEventListener('pagehide', (e) => {
  if (e.persisted) loseFocus();
  else cleanup();
});
show('home');
raf = requestAnimationFrame(frame);

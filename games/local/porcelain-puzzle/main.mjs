import { startCocos } from './vendor/cocos/bootstrap.mjs';
import { View } from './src/view.mjs';
import { levels, vessels, themes, levelAt, vesselFor, VERSION } from './src/content.mjs';
import {
  newAttempt,
  makePuzzle,
  start,
  tick,
  pause,
  resume,
  move,
  snap,
  hint,
  revive,
  contains,
  progress,
  organize,
} from './src/core.mjs';
import { loadSave, persist, settle } from './src/storage.mjs';
import { storagePort, Rewards, RoomClient, Feedback, share } from './src/platform.mjs';
const canvas = document.querySelector('#GameCanvas'),
  stage = document.querySelector('#GameDiv'),
  ui = document.querySelector('#ui');
const port = await storagePort(),
  save = loadSave(port),
  rewards = new Rewards(),
  rooms = new RoomClient(),
  feedback = new Feedback(save.settings);
const isDev = () => globalThis.SmallGamesDev?.isEnabled?.() === true;
let runtime,
  view,
  screen = 'loading',
  attempt = null,
  puzzle = null,
  practice = false,
  challengeOnly = false,
  drag = null,
  room = null,
  roomsAvailable = false,
  roomBusy = false,
  pollBusy = false,
  pollAt = 0,
  serverOffset = 0,
  roomErrorAt = 0;
let height = 844,
  galleryPage = 0,
  collectionPage = 0,
  ceremonyStart = 0,
  ceremonyKind = 'intro',
  pendingNext = 0,
  lastFrame = performance.now(),
  peekAt = 0,
  peekUntil = 0,
  peekSide = 1,
  lastPose = 5,
  hintUntil = 0,
  autoNextAt = 0,
  original = false,
  zoom = 1,
  screenGeneration = 0,
  saveAt = 0,
  adPending = false,
  devPanel = false;
const pointers = new Map();
let pinch = null,
  pan = null,
  toastTimer;
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const btn = (label, action, cls = 'button', extra = '') =>
  `<button class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
const time = (ms) => {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
const back = (title, action = 'home', right = '') =>
  `<div class="topbar">${btn('‹', action, 'icon-button', 'aria-label="返回"')}<h2>${title}</h2>${right || '<span style="width:52px"></span>'}</div>`;
function notify(text) {
  const n = document.querySelector('#toast');
  n.textContent = text;
  n.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => n.classList.remove('visible'), 3000);
}
function remember() {
  if (!practice && !room && attempt && attempt.phase !== 'won')
    save.attempt = structuredClone(attempt);
  persist(port, save);
}
function clearGesture(revert = true) {
  if (drag && revert && attempt) {
    const g = attempt.groups.find((g) => g.id === drag.id);
    if (g) {
      g.x = drag.originalX;
      g.y = drag.originalY;
      view?.apply(attempt, true);
    }
  }
  drag = null;
  pinch = null;
  pan = null;
  pointers.clear();
}
function setScreen(next, markup = '') {
  clearGesture();
  autoNextAt = 0;
  screenGeneration++;
  screen = next;
  document.body.dataset.screen = next;
  document.body.dataset.room = String(!!room);
  ui.innerHTML = markup;

  parent.postMessage(
    {
      type: 'small-games:display-state',
      gameId: 'porcelain-puzzle',
      screen: ['playing', 'intro', 'travel', 'paused', 'timeout', 'result'].includes(next)
        ? 'playing'
        : 'home',
    },
    '*',
  );
}
function fit() {
  const viewport = document.querySelector('#viewport');
  const w = viewport.clientWidth,
    h = viewport.clientHeight;
  const scale = Math.min(w / 390, h / 700, 1.3);
  height = Math.min(980, h / scale);
  stage.style.width = '390px';
  stage.style.height = `${height}px`;
  stage.style.transform = `scale(${scale})`;
  stage.style.left = `${(w - 390 * scale) / 2}px`;
  stage.style.top = `${(h - height * scale) / 2}px`;
  if (runtime) {
    clearGesture();
    runtime.resize(390, height);
    view.resize();
    if (screen === 'playing') refreshBoard();
    else if (screen === 'home') view.home(vesselFor(levelAt(save.unlocked)));
  }
}
async function home() {
  if (room) {
    await leaveRoom();
    return;
  }
  rooms.cancel();
  rewards.cancel();
  adPending = false;
  remember();
  attempt = null;
  galleryPage = Math.floor((save.unlocked - 1) / 5);
  setScreen(
    'home',
    `<div class="brand"><div class="eyebrow">瓷间有趣 · 时光有你</div><h1>青花拾光</h1><p>把时光，一片片拾起</p></div><div class="home-actions">${btn(save.attempt ? '继续这份时光' : '开始闯关', 'start', 'button primary')}<div class="row">${btn('器物长廊', 'gallery', 'button small')}${roomsAvailable ? btn('好友闯关', 'friends', 'button small') : ''}</div><div class="minor">${btn('收藏', 'collection', 'quiet')}${btn('设置', 'settings', 'quiet')}${btn('玩法', 'help', 'quiet')}</div></div>`,
  );
  await view.home(vesselFor(levelAt(save.attempt?.number || save.unlocked)));
}
async function gallery() {
  if (room) return;
  rewards.cancel();
  adPending = false;
  remember();
  attempt = null;
  const from = galleryPage * 5,
    items = levels.slice(from, from + 5),
    chapter = items[0].chapter;
  setScreen(
    'gallery',
    back('器物长廊') +
      `<div class="gallery-subtitle">第 ${chapter + 1} 章 · ${themes[chapter].short}</div>` +
      items
        .map((l, i) => {
          const current = l.number === save.unlocked,
            locked = l.number > save.unlocked && !isDev();
          return btn(
            `第 ${String(l.number).padStart(2, '0')} 关<span class="mark">${locked ? '尚未抵达' : l.number < save.unlocked ? '已修复' : current ? '从这里出发' : '关卡挑战'}</span>`,
            `level:${l.number}`,
            `level-tag ${current ? 'current' : ''}`,
            `style="left:${i % 2 ? 268 : 122}px;top:${189 + i * Math.min(103, (height - 350) / 4)}px" ${locked ? 'disabled' : ''}`,
          );
        })
        .join('') +
      `<div class="pager">${btn('‹', 'gallery-prev', 'icon-button', 'aria-label="上一段长廊" ' + (galleryPage === 0 ? 'disabled' : ''))}<span>${from + 1} — ${from + 5} / 100</span>${btn('›', 'gallery-next', 'icon-button', 'aria-label="下一段长廊" ' + (galleryPage === 19 ? 'disabled' : ''))}</div>`,
  );
  await view.gallery(items.map((l) => ({ vessel: vesselFor(l) })));
}
function collection() {
  const list = vessels.slice(collectionPage * 6, collectionPage * 6 + 6);
  setScreen(
    'collection',
    back('拾光藏阁') +
      `<div class="gallery-subtitle">已修复 ${save.collection.length} / 100 件器物</div><div class="collection-grid">${list.map((v) => `<div class="collection-card ${save.collection.includes(v.id) ? '' : 'locked'}"><img src="./assets/vessels/${v.id}.svg" alt="${esc(v.name)}"/><span>${esc(v.name)}<br/>${save.collection.includes(v.id) ? '时光如初' : '静待修复'}</span></div>`).join('')}</div><div class="pager">${btn('‹', 'collection-prev', 'icon-button', 'aria-label="上一页" ' + (collectionPage === 0 ? 'disabled' : ''))}<span>${collectionPage + 1} / 17</span>${btn('›', 'collection-next', 'icon-button', 'aria-label="下一页" ' + (collectionPage === 16 ? 'disabled' : ''))}</div>`,
  );
  view.clear('collection');
  view.background(true);
}
async function begin(number, { continuing = false, shared = false, development = false } = {}) {
  rewards.cancel();
  adPending = false;
  original = false;
  zoom = 1;
  challengeOnly = shared && number > save.unlocked;
  practice = development || (isDev() && number > save.unlocked && !shared);
  if (!continuing)
    attempt = newAttempt(
      levelAt(number),
      `attempt-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
    );
  else attempt = structuredClone(save.attempt);
  if (!attempt) return begin(save.unlocked);
  puzzle = makePuzzle(levelAt(attempt.number));
  if (continuing && attempt.phase === 'timeout') {
    await refreshBoard();
    timeoutScreen();
    return;
  }
  if (continuing && attempt.phase === 'paused') {
    await play();
    return;
  }
  if (continuing && attempt.phase === 'playing') {
    await play();
    return;
  }
  await intro();
}
async function intro() {
  setScreen(
    'intro',
    `<div class="ceremony-copy">${esc(vesselFor(levelAt(attempt.number)).name)}<p class="eyebrow">第 ${attempt.number} 关 · ${time(levelAt(attempt.number).timeMs)}</p></div><div class="ceremony-foot">小淘气又发现了一件宝贝…</div>`,
  );
  ceremonyStart = Infinity;
  const generation = screenGeneration;
  ceremonyKind = 'intro';
  await view.prepareCeremony(attempt, 'intro');
  if (generation !== screenGeneration) return;
  ceremonyStart = performance.now();
  lastFrame = ceremonyStart;
  feedback.unlock();
  remember();
}
function playMarkup() {
  return (
    back(
      `第 ${String(attempt.number).padStart(2, '0')} 关`,
      room ? 'room-menu' : 'pause',
      btn(
        '<span class="pause"><i></i><i></i></span>',
        room ? 'room-menu' : 'pause',
        'icon-button',
        'aria-label="暂停"',
      ),
    ) +
    `<div class="timer">${time(attempt.remainingMs)}</div><div class="progress-line"><i style="width:${progress(attempt)}%"></i></div><div class="piece-count">${attempt.groups.length} 组碎片 · ${levelAt(attempt.number).pieces} 片</div>${room ? '<div class="room-progress"></div>' : ''}<div class="context-note">${attempt.number === 1 ? '把相邻的花纹靠近，碎片就会吸在一起' : ''}</div><div class="tools">${btn(`<span>✧</span>提示 ${attempt.hints}`, 'hint', 'tool')}${btn('<span>▱</span>整理', 'organize', 'tool')}${btn('<span>▧</span>原图', 'original', 'tool')}${btn('<span>＋</span>缩放', 'zoom', 'tool')}</div>`
  );
}
async function refreshBoard() {
  if (!attempt) return;
  zoom = 1;
  view.resize();
  await view.boardFor(attempt, puzzle);
}
async function play({ reuse = false } = {}) {
  const id = attempt.id;
  setScreen('playing', playMarkup());
  if (!reuse) await refreshBoard();
  if (attempt.id !== id || screen !== 'playing') return;
  if (attempt.phase === 'paused') resume(attempt);
  start(attempt);
  lastFrame = performance.now();
  peekAt = performance.now() + 18000 + Math.random() * 18000;
  remember();
  updateHUD();
}
function updateHUD() {
  const timer = ui.querySelector('.timer');
  if (timer) {
    timer.textContent = time(attempt.remainingMs);
    timer.classList.toggle('low', attempt.remainingMs <= 15000);
  }
  const p = ui.querySelector('.progress-line i');
  if (p) p.style.width = `${progress(attempt)}%`;
  const n = ui.querySelector('.piece-count');
  if (n) n.textContent = `${attempt.groups.length} 组碎片 · ${levelAt(attempt.number).pieces} 片`;
  const h = ui.querySelector('[data-action="hint"]');
  if (h) h.innerHTML = `<span>✧</span>提示 ${attempt.hints}`;
  if (room) {
    const r = ui.querySelector('.room-progress');
    if (r)
      r.innerHTML = room.players
        .map(
          (p) =>
            `<div>${esc(p.name)} ${p.phase === 'won' ? '✓' : `${p.progress}%`}<i><b style="width:${p.progress}%"></b></i></div>`,
        )
        .join('');
  }
}
function pauseScreen() {
  if (room) {
    roomMenu();
    return;
  }
  pause(attempt);
  remember();
  feedback.suspend();
  setScreen(
    'paused',
    `<div class="screen-wash"></div><div class="panel"><div class="seal" style="margin:auto">歇</div><h2>歇一歇</h2><p>碎片与剩余时光，都替你留着。</p>${btn('继续拼合', 'resume', 'button primary')}${btn('重新挑战', 'retry')}${btn('返回长廊', 'gallery', 'quiet')}</div>`,
  );
}
function timeoutScreen() {
  clearGesture();
  remember();
  const canRevive = attempt.revives < levelAt(attempt.number).maxRevives;
  setScreen(
    'timeout',
    `<div class="screen-wash"></div><div class="panel"><div class="seal" style="margin:auto">续</div><h2>时光稍纵即逝</h2><p>已拼合 ${progress(attempt)}%<br/>${canRevive ? '再添一点时间，把美好拼完整。' : '这一回合结束了，再试一次吧。'}</p>${canRevive ? btn(`看广告 · 再添 ${levelAt(attempt.number).reviveMs / 1000} 秒`, 'revive', 'button primary', rewards.available ? '' : 'disabled') : ''}${canRevive && !rewards.available ? '<p class="error" style="margin:12px 0">暂时没有可观看的广告</p>' : ''}${btn('重新挑战', 'retry', canRevive ? 'button' : 'button primary')}${btn('返回长廊', 'gallery', 'quiet')}</div>`,
  );
}
async function win() {
  clearGesture(false);
  settle(save, attempt, practice, attempt.number <= save.unlocked);
  remember();
  feedback.play('win');
  setScreen(
    'result',
    `<div class="result-copy"><div class="eyebrow">时光如初</div><h2>又拾起一份美好</h2><p>${esc(vesselFor(levelAt(attempt.number)).name)}</p><p>${time(attempt.elapsedMs)} · ${attempt.assisted ? '借了一点灵感' : '独立修复'}${practice ? ' · 试玩' : ''}</p></div><div class="result-actions">${btn(attempt.number === 100 ? '回到拾光藏阁' : '奔向下一件', 'next', 'button primary')}<div class="row">${btn('分享这份美好', 'share-result', 'button small')}${btn('返回长廊', 'gallery', 'button small')}</div></div>`,
  );
  await view.prepareCeremony(attempt, 'win');
  ceremonyStart = performance.now();
  ceremonyKind = 'win';
  autoNextAt = attempt.number < 100 ? ceremonyStart + 9000 : 0;
  view.burst();
}
async function travel(number) {
  pendingNext = number;
  setScreen('travel', `<div class="ceremony-copy">下一份美好，就在前方</div>`);
  ceremonyStart = Infinity;
  await view.prepareCeremony(attempt, 'win');
  ceremonyStart = performance.now();
  ceremonyKind = 'travel';
}
function settings() {
  setScreen(
    'settings',
    back('设置') +
      `<div class="panel" style="top:140px;border-radius:25px"><h2>自在拾光</h2>${[
        ['sound', '音效'],
        ['motion', '画面轻震'],
        ['haptics', '触感反馈'],
      ]
        .map(
          ([k, label]) =>
            `<div class="setting-row"><span>${label}</span>${btn(save.settings[k] ? '已开启' : '已关闭', `setting:${k}`, `switch ${save.settings[k] ? 'enabled' : ''}`)}</div>`,
        )
        .join('')}${btn('返回', 'home', 'quiet')}</div>`,
  );
  view.clear('settings');
  view.background(true);
}
function help() {
  setScreen(
    'help',
    back('玩法') +
      `<div class="panel" style="top:125px;border-radius:25px"><h2>拾起一片青花</h2><div class="help-text"><p>拖动碎片，让相邻花纹靠近。拼对后会自动吸附，连成的一组可以一起拖动。</p><p>在倒计时结束前拼完整件器物。超时后可重新挑战，或观看广告再添45秒，每次挑战限一次。</p><p>提示会点亮可以拼合的两组；整理会腾开空间。双指缩放，放大后可拖动空白处移动画布。</p><p>好友各自挑战同一关。大家完成、跳过或超时后，一起奔向下一关；退出不影响其他人。</p></div>${btn('知道了', 'home', 'button primary')}</div>`,
  );
  view.clear('help');
  view.background(true);
}
function friends() {
  if (!roomsAvailable) {
    void home();
    notify('好友房暂时连不上，可以先独自闯关');
    return;
  }
  remember();
  attempt = null;
  setScreen(
    'friends',
    back('好友闯关') +
      `<div class="gallery-subtitle">一起出发，看谁先把时光拼完整</div><div class="room-form"><label for="nickname">你的称呼</label><input id="nickname" value="小瓷友" maxlength="12" autocomplete="nickname"/><label for="room-level">从哪一关出发</label><select id="room-level">${levels
        .slice(0, isDev() ? 100 : save.unlocked)
        .map(
          (l) =>
            `<option value="${l.number}" ${l.number === save.unlocked ? 'selected' : ''}>第 ${l.number} 关 · ${esc(vesselFor(l).name)}</option>`,
        )
        .join(
          '',
        )}</select>${btn('邀请好友闯关', 'create-room', 'button primary')}<div class="divider">已有好友邀请</div><label for="room-code">输入六位邀请码</label><input id="room-code" maxlength="6" placeholder="例如 A1B2C3" autocomplete="off" style="text-transform:uppercase;letter-spacing:5px"/>${btn('加入这段旅程', 'join-room')}<p class="error" id="room-error" role="status"></p></div>`,
  );
  view.clear('friends');
  view.background(true);
  const code = new URL(location.href).searchParams.get('room');
  if (code)
    ui.querySelector('#room-code').value = code
      .toUpperCase()
      .replace(/[^A-F0-9]/g, '')
      .slice(0, 6);
}
function lobby() {
  setScreen(
    'room',
    back('好友闯关', 'leave-room') +
      `<div class="room-form"><div class="eyebrow" style="text-align:center">第 ${room.level} 关 · 邀请码</div><div class="room-code">${esc(room.code)}</div><div id="members"></div>${btn('邀请好友', 'invite-room', 'button small')}${btn(room.players.find((p) => p.id === room.me)?.ready ? '等好友准备…' : '准备好了', 'ready-room', 'button primary', room.players.find((p) => p.id === room.me)?.ready ? 'disabled' : '')}<p style="font-size:12px;text-align:center;color:#788783;line-height:1.8">2～5 人，大家准备好就一起出发。<br/>比赛期间使用相同提示额度。</p></div>`,
  );
  view.clear('room');
  view.background(true);
  updateMembers();
}
function updateMembers() {
  const el = ui.querySelector('#members');
  if (el)
    el.innerHTML = room.players
      .map(
        (p, i) =>
          `<div class="member"><span class="avatar">${i + 1}</span><span class="name">${esc(p.name)}${room.host === p.id ? ' · 房主' : ''}</span><small>${p.ready ? '已准备' : '等一等'}</small></div>`,
      )
      .join('');
}
async function acceptRoom(data) {
  if (!rooms.session || data.code !== rooms.session.code) return;
  if (
    room?.code === data.code &&
    (data.serverNow < room.serverNow ||
      data.round < room.round ||
      (data.round === room.round && data.seq < room.seq))
  )
    return;
  const previous = room;
  const { token, ...snapshot } = data;
  room = snapshot;
  serverOffset = data.serverNow - Date.now();
  document.body.dataset.room = 'true';
  if (room.status === 'waiting') {
    if (screen !== 'room') lobby();
    else {
      updateMembers();
      const b = ui.querySelector('[data-action="ready-room"]');
      if (b && room.players.find((p) => p.id === room.me)?.ready) {
        b.disabled = true;
        b.textContent = '等好友准备…';
      }
    }
    return;
  }
  if (room.status === 'finished') {
    await leaveRoom();
    notify('这一段旅程结束啦');
    return;
  }
  if (!room.attempt) {
    if (screen !== 'spectator') {
      setScreen(
        'spectator',
        back('好友正在挑战', 'leave-room') +
          `<div class="panel"><h2>下一关，一起出发</h2><p>好友们正在拼合这一关，稍等片刻。</p>${btn('离开房间', 'leave-room', 'quiet')}</div>`,
      );
      view.clear('spectator');
      view.background(true);
    }
    return;
  }
  if (!attempt || attempt.id !== room.attempt.id) {
    attempt = room.attempt;
    practice = false;
    puzzle = makePuzzle(levelAt(attempt.number));
    if (Date.now() + serverOffset < room.startAt) {
      await intro();
    } else {
      await play();
    }
    return;
  }
  if (!drag && !roomBusy) {
    attempt = room.attempt;
    view.apply(attempt);
  }
  if (room.status === 'result') {
    if (screen !== 'room-result') await roomResult();
    else updateRoomResult();
    return;
  }
  if (screen === 'intro' && Date.now() + serverOffset >= room.startAt) {
    attempt = room.attempt;
    start(attempt);
    await play();
    return;
  }
  if (screen === 'playing' && attempt.phase !== 'playing' && attempt.phase !== 'intro')
    showRoomWait();
  if (screen === 'playing') updateHUD();
  if (previous?.round !== room.round) notify('新的一关，一起出发');
}
function showRoomWait() {
  if (ui.querySelector('.room-wait')) return;
  clearGesture(false);
  ui.insertAdjacentHTML(
    'beforeend',
    `<div class="room-wait">${attempt.phase === 'won' ? '拼好了！等好友一起出发' : '本轮时间到，稍等好友完成'}<p style="font-size:12px">${room.players.filter((p) => !p.spectator && !['won', 'timeout', 'skipped'].includes(p.phase)).length} 位好友仍在挑战</p>${btn('离开房间', 'leave-room', 'quiet')}</div>`,
  );
  if (attempt.phase === 'won') {
    feedback.play('win');
    view.burst();
  }
}
async function roomResult() {
  clearGesture(false);
  setScreen(
    'room-result',
    back('这一关的时光', 'leave-room') +
      `<div class="panel" style="top:210px;border-radius:24px;padding:16px"><h2>一起拾光</h2><div id="members">${room.players
        .filter((p) => !p.spectator)
        .sort(
          (a, b) =>
            (a.phase === 'won' ? 0 : 1) - (b.phase === 'won' ? 0 : 1) || a.elapsedMs - b.elapsedMs,
        )
        .map(
          (p, i) =>
            `<div class="member"><span class="avatar">${p.phase === 'won' ? i + 1 : '—'}</span><span class="name">${esc(p.name)}</span><small>${p.phase === 'won' ? time(p.elapsedMs) : p.phase === 'skipped' ? '暂歇一关' : '时间到'}</small></div>`,
        )
        .join('')}</div><p id="next-countdown"></p>${btn('离开房间', 'leave-room', 'quiet')}</div>`,
  );
  await view.prepareCeremony(attempt, 'win', true);
  if (screen !== 'room-result') return;
  if (attempt.phase !== 'won' && view.hero) view.hero.active = false;
  ceremonyStart = performance.now();
  updateRoomResult();
}
function updateRoomResult() {
  const el = ui.querySelector('#next-countdown');
  if (el)
    el.textContent = `${Math.max(0, Math.ceil((room.nextAt - Date.now() - serverOffset) / 1000))} 秒后，一起奔向下一件`;
}
function roomMenu() {
  notify('好友闯关计时继续，大家都在等你');
  if (ui.querySelector('.room-wait')) return;
  ui.insertAdjacentHTML(
    'beforeend',
    `<div class="room-wait">这一关要歇一歇吗？${btn('继续拼合', 'dismiss-room-menu', 'button primary')}${btn('跳过这一关', 'skip-room', 'button small')}${btn('离开房间', 'leave-room', 'quiet')}</div>`,
  );
  clearGesture();
}
async function leaveRoom() {
  const current = rooms.session;
  room = null;
  roomBusy = false;
  attempt = null;
  clearGesture();
  try {
    await rooms.leave();
  } catch {
    rooms.session = null;
    notify('连接已断开，房间稍后会为好友继续');
  }
  if (current) document.body.dataset.room = 'false';
  await home();
}
async function roomAction(input) {
  if (roomBusy || !room) return;
  const session = rooms.session;
  roomBusy = true;
  try {
    const data = await rooms.action({ ...input, round: room.round, seq: room.seq + 1 });
    if (session !== rooms.session) return null;
    roomBusy = false;
    await acceptRoom(data);
    return data;
  } catch (e) {
    if (session !== rooms.session) return null;
    roomBusy = false;
    notify(e.message);
    try {
      const data = await rooms.poll();
      if (session === rooms.session) await acceptRoom(data);
    } catch {}
    return null;
  }
}
async function doShare(kind) {
  autoNextAt = 0;
  const result = await share({
    title: kind === 'room' ? '邀请你一起拾光' : '青花拾光 · 关卡挑战',
    text:
      kind === 'room'
        ? '好友已就位，一起把时光拼完整。'
        : `我在第 ${attempt?.number || save.unlocked} 关等你，来挑战这一关。`,
    level: attempt?.number || save.unlocked,
    room: kind === 'room' ? room.code : undefined,
  });
  if (result === 'copied') notify('邀请已复制，发给好友就能一起出发');
  else if (result !== 'shared' && result !== 'cancelled') {
    ui.insertAdjacentHTML(
      'beforeend',
      `<div class="room-wait">长按复制，分享给好友<div class="share-box">${esc(result)}</div>${btn('收起', 'dismiss-room-menu', 'quiet')}</div>`,
    );
  }
}
async function action(name) {
  feedback.unlock();
  if (adPending && !['home', 'gallery'].includes(name)) return;
  if (name === 'start')
    return begin(save.attempt?.number || save.unlocked, { continuing: !!save.attempt });
  if (name === 'home') return home();
  if (name === 'gallery') return gallery();
  if (name === 'collection') return collection();
  if (name === 'settings') return settings();
  if (name === 'help') return help();
  if (name === 'friends') return friends();
  if (name.startsWith('level:')) {
    const number = Number(name.split(':')[1]);
    if (number <= save.unlocked || isDev()) return begin(number);
    return;
  }
  if (name === 'gallery-prev') {
    galleryPage = Math.max(0, galleryPage - 1);
    return gallery();
  }
  if (name === 'gallery-next') {
    galleryPage = Math.min(19, galleryPage + 1);
    return gallery();
  }
  if (name === 'collection-prev') {
    collectionPage = Math.max(0, collectionPage - 1);
    return collection();
  }
  if (name === 'collection-next') {
    collectionPage = Math.min(16, collectionPage + 1);
    return collection();
  }
  if (name.startsWith('setting:')) {
    const k = name.split(':')[1];
    save.settings[k] = !save.settings[k];
    view.motion = save.settings.motion;
    persist(port, save);
    return settings();
  }
  if (name === 'pause') return pauseScreen();
  if (name === 'resume') {
    return play();
  }
  if (name === 'retry') return begin(attempt.number, { shared: challengeOnly });
  if (name === 'next') {
    if (attempt.number === 100) return collection();
    return travel(attempt.number + 1);
  }
  if (name === 'revive') {
    const id = attempt.id,
      generation = screenGeneration;
    adPending = true;
    const b = ui.querySelector('[data-action="revive"]');
    if (b) {
      b.disabled = true;
      b.textContent = '等一段灵感…';
    }
    const result = await rewards.offer(`porcelain:${id}:revive`, {
      type: 'time',
      amount: levelAt(attempt.number).reviveMs / 1000,
    });
    if (generation !== screenGeneration) return;
    adPending = false;
    if (attempt?.id !== id || room) return;
    if (revive(attempt, id, result.status)) {
      remember();
      if (document.hidden) {
        pauseScreen();
        return;
      }
      await play();
      notify('再添45秒，美好等你拼完整');
    } else {
      timeoutScreen();
      notify(result.status === 'dismissed' ? '完整观看后才能续时' : '广告暂时不可用，可重新挑战');
    }
    return;
  }
  if (name === 'hint' && screen === 'playing' && attempt.phase === 'playing') {
    if (!room && attempt.hints === 0) {
      if (!rewards.available) {
        notify('提示暂时用完了，看看原图找找灵感');
        return;
      }
      const id = attempt.id;
      pause(attempt);
      setScreen(
        'hint-ad',
        `<div class="screen-wash"></div><div class="panel"><h2>借一点灵感</h2><p>完整观看广告，获得一次提示。<br/>等待期间不消耗挑战时间。</p>${btn('看广告 · 获得提示', 'hint-reward', 'button primary')}${btn('继续拼合', 'resume', 'quiet')}</div>`,
      );
      remember();
      return;
    }
    let pair;
    if (room) {
      const r = await roomAction({ type: 'hint' });
      pair = r?.hintPair;
    } else pair = hint(attempt, puzzle);
    if (!pair) {
      notify('本轮提示已用完，看看原图找找灵感');
      return;
    }
    const ids = attempt.groups
      .filter((g) => g.id === pair.from || g.id === pair.to)
      .flatMap((g) => g.pieces);
    view.highlight(ids);
    hintUntil = performance.now() + 3500;
    notify('亮起的两组，可以拼在一起');
    updateHUD();
    remember();
    return;
  }
  if (name === 'hint-reward' && !room && attempt?.phase === 'paused') {
    const id = attempt.id,
      generation = screenGeneration;
    adPending = true;
    const button = ui.querySelector('[data-action="hint-reward"]');
    if (button) {
      button.disabled = true;
      button.textContent = '等一段灵感…';
    }
    const result = await rewards.offer(`porcelain:${id}:hint:${attempt.revision}`, {
      type: 'hint',
      amount: 1,
    });
    if (generation !== screenGeneration || attempt?.id !== id) return;
    adPending = false;
    if (result.status === 'completed') {
      attempt.hints = 1;
      attempt.assisted = true;
      attempt.revision++;
      remember();
    }
    if (document.hidden) {
      pauseScreen();
      return;
    }
    await play();
    notify(result.status === 'completed' ? '灵感已到，点提示看看吧' : '广告未完成，可以继续挑战');
    return;
  }
  if (name === 'organize' && screen === 'playing' && !roomBusy) {
    if (room) {
      await roomAction({ type: 'organize' });
    } else {
      organize(attempt, puzzle);
      view.apply(attempt);
      remember();
    }
    notify('碎片整理好了');
    return;
  }
  if (name === 'original' && screen === 'playing') {
    original = !original;
    view.showGuide(original);
    ui.querySelector('[data-action="original"]').classList.toggle('on', original);
    return;
  }
  if (name === 'zoom' && screen === 'playing') {
    zoom = zoom === 1 ? 1.4 : 1;
    applyZoom();
    return;
  }
  if (name === 'share-result') return doShare('challenge');
  if (name === 'invite-room') return doShare('room');
  if (name === 'create-room' || name === 'join-room') {
    const nameValue = ui.querySelector('#nickname').value,
      code = ui.querySelector('#room-code').value.toUpperCase();
    const error = ui.querySelector('#room-error');
    if (name === 'join-room' && !/^[A-F0-9]{6}$/.test(code)) {
      error.textContent = '请输入六位邀请码';
      return;
    }
    const generation = screenGeneration;
    const buttons = ui.querySelectorAll('.room-form button');
    buttons.forEach((b) => (b.disabled = true));
    try {
      const data =
        name === 'create-room'
          ? await rooms.create({
              name: nameValue,
              level: Number(ui.querySelector('#room-level').value),
              capacity: 5,
            })
          : await rooms.join(code, nameValue);
      if (generation !== screenGeneration) {
        await rooms.leave();
        return;
      }
      await acceptRoom(data);
    } catch (e) {
      if (generation !== screenGeneration) return;
      error.textContent = e.message;
      buttons.forEach((b) => (b.disabled = false));
    }
    return;
  }
  if (name === 'ready-room') return roomAction({ type: 'ready' });
  if (name === 'leave-room') return leaveRoom();
  if (name === 'room-menu') return roomMenu();
  if (name === 'skip-room') {
    ui.querySelector('.room-wait')?.remove();
    return roomAction({ type: 'skip' });
  }
  if (name === 'dismiss-room-menu') {
    ui.querySelector('.room-wait')?.remove();
    return;
  }
  if (name === 'dev' && isDev()) {
    devPanel = !devPanel;
    ui.querySelector('.dev-panel')?.remove();
    if (devPanel)
      ui.insertAdjacentHTML(
        'beforeend',
        `<div class="dev-panel">开发试玩 · 不计成绩<br/><input id="dev-level" type="number" min="1" max="100" value="${attempt?.number || 1}"/>${btn('挑战', 'dev-level')}${btn('时间到', 'dev-timeout')}${btn('拼完整', 'dev-solve')}</div>`,
      );
    return;
  }
  if (name === 'dev-level' && isDev()) {
    const number = Math.max(1, Math.min(100, Number(ui.querySelector('#dev-level').value) || 1));
    await begin(number, { development: true });
    return;
  }
  if (name === 'dev-timeout' && isDev() && attempt && !room) {
    practice = true;
    tick(attempt, attempt.remainingMs);
    timeoutScreen();
    return;
  }
  if (name === 'dev-solve' && isDev() && attempt && !room) {
    practice = true;
    for (const g of attempt.groups) {
      g.x = 55;
      g.y = 90;
    }
    snap(attempt, attempt.groups[0].id, puzzle);
    view.apply(attempt);
    await win();
    return;
  }
}
ui.addEventListener('click', (event) => {
  const b = event.target.closest('[data-action]');
  if (b && !b.disabled)
    action(b.dataset.action).catch((e) => {
      console.error(e);
      notify('这一步没有完成，请再试一次');
    });
});
function applyZoom() {
  const base = Math.min(1, (height - 285) / 510);
  view.boardScale = base * zoom;
  view.boardOrigin = { x: (390 - 350 * view.boardScale) / 2, y: 158 - (zoom - 1) * 110 };
  if (view.board) {
    view.board.setScale(view.boardScale, view.boardScale, 1);
    view.board.setPosition(view.boardOrigin.x, -view.boardOrigin.y);
  }
}
function hit(point) {
  for (const g of [...attempt.groups].reverse())
    for (const id of g.pieces) {
      const local = { x: point.x - g.x, y: point.y - g.y };
      if (contains(local, puzzle.pieces[id].polygon) && contains(local, puzzle.silhouette))
        return g;
    }
  let best = null,
    d = 24;
  for (const g of attempt.groups)
    for (const id of g.pieces) {
      const c = puzzle.pieces[id].center,
        dist = Math.hypot(point.x - g.x - c.x, point.y - g.y - c.y);
      if (dist < d) {
        d = dist;
        best = g;
      }
    }
  return best;
}
canvas.addEventListener('pointerdown', (e) => {
  if (
    screen !== 'playing' ||
    attempt.phase !== 'playing' ||
    roomBusy ||
    ui.querySelector('.room-wait')
  )
    return;
  e.preventDefault();
  feedback.unlock();
  canvas.setPointerCapture(e.pointerId);
  const point = runtime.clientToDesign(e.clientX, e.clientY);
  pointers.set(e.pointerId, point);
  if (pointers.size === 2) {
    if (drag) {
      move(attempt, drag.id, drag.originalX, drag.originalY);
      view.apply(attempt, true);
      drag = null;
    }
    const [a, b] = [...pointers.values()];
    pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    return;
  }
  const bp = view.toBoard(point),
    g = hit(bp);
  if (g) {
    drag = {
      pointer: e.pointerId,
      id: g.id,
      offsetX: bp.x - g.x,
      offsetY: bp.y - g.y,
      originalX: g.x,
      originalY: g.y,
    };
    attempt.groups = attempt.groups.filter((v) => v !== g).concat(g);
    view.raise(g);
  } else if (zoom > 1)
    pan = { pointer: e.pointerId, point, x: view.boardOrigin.x, y: view.boardOrigin.y };
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  const point = runtime.clientToDesign(e.clientX, e.clientY);
  pointers.set(e.pointerId, point);
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    zoom = Math.max(
      0.85,
      Math.min(1.8, (pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.distance),
    );
    applyZoom();
    return;
  }
  if (pan && pan.pointer === e.pointerId) {
    view.boardOrigin.x = Math.max(-180, Math.min(150, pan.x + point.x - pan.point.x));
    view.boardOrigin.y = Math.max(30, Math.min(240, pan.y + point.y - pan.point.y));
    view.board.setPosition(view.boardOrigin.x, -view.boardOrigin.y);
    return;
  }
  if (drag && drag.pointer === e.pointerId) {
    const p = view.toBoard(point);
    move(
      attempt,
      drag.id,
      Math.max(-180, Math.min(330, p.x - drag.offsetX)),
      Math.max(-220, Math.min(480, p.y - drag.offsetY)),
    );
    view.apply(attempt, true);
  }
});
async function release(e, cancelled = false) {
  pointers.delete(e.pointerId);
  if (pinch) {
    pinch = null;
    drag = null;
    return;
  }
  if (pan) {
    pan = null;
    return;
  }
  if (!drag || drag.pointer !== e.pointerId) return;
  const current = drag;
  drag = null;
  if (cancelled) {
    move(attempt, current.id, current.originalX, current.originalY);
    view.apply(attempt, true);
    return;
  }
  const g = attempt.groups.find((g) => g.id === current.id);
  if (!g) return;
  if (room) {
    const before = attempt.groups.length;
    await roomAction({ type: 'move', group: g.id, x: g.x, y: g.y });
    if (attempt.groups.length < before) {
      feedback.play('snap');
      view.burst();
    }
  } else {
    if (snap(attempt, current.id, puzzle)) {
      feedback.play('snap');
      view.burst();
    }
    view.apply(attempt);
    updateHUD();
    remember();
    if (attempt.phase === 'won') await win();
  }
}
canvas.addEventListener('pointerup', (e) => release(e).catch(console.error));
canvas.addEventListener('pointercancel', (e) => release(e, true));
canvas.addEventListener('lostpointercapture', (e) => {
  if (drag?.pointer === e.pointerId) release(e, true);
});
function background() {
  clearGesture();
  autoNextAt = 0;
  if (!room && attempt?.phase === 'playing') pauseScreen();
  else remember();
  feedback.suspend();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) background();
  lastFrame = performance.now();
});
addEventListener('blur', background);
addEventListener('pagehide', () => {
  remember();
  rewards.cancel();
  feedback.suspend();
});
addEventListener('resize', fit);
function frame(dt) {
  const now = performance.now(),
    elapsed = Math.max(0, now - lastFrame);
  lastFrame = now;
  if (!view) return;
  view.update(dt);
  view.motion = save.settings.motion;
  if (screen === 'intro' && Number.isFinite(ceremonyStart)) {
    const duration = room
        ? Math.max(1, room.startAt - (Date.now() + serverOffset) + (now - ceremonyStart))
        : 2800,
      p = Math.max(0, Math.min(1, (now - ceremonyStart) / duration));
    view.ceremony(p, 'intro');
    if (p > 0.68 && ceremonyKind === 'intro') {
      feedback.play('break');
      view.burst();
      ceremonyKind = 'laugh';
    }
    if (p > 0.8 && ceremonyKind === 'laugh') {
      feedback.play('laugh');
      ceremonyKind = 'done';
    }
    if (p >= 1 && (!room || Date.now() + serverOffset >= room.startAt)) {
      ceremonyKind = 'done';
      play().catch(console.error);
    }
  }
  if (screen === 'travel' && Number.isFinite(ceremonyStart)) {
    const p = Math.min(1, (now - ceremonyStart) / 1300);
    view.ceremony(p, 'travel');
    if (p >= 1) begin(pendingNext, { shared: challengeOnly }).catch(console.error);
  }
  if (screen === 'result') {
    view.ceremony(Math.min(1, (now - ceremonyStart) / 1500), 'win');
    if (autoNextAt && now >= autoNextAt && !document.hidden) {
      autoNextAt = 0;
      travel(attempt.number + 1).catch(console.error);
    }
  }
  if (screen === 'playing' && attempt?.phase === 'playing') {
    if (!room) tick(attempt, elapsed);
    else
      attempt.remainingMs = Math.max(
        0,
        levelAt(attempt.number).timeMs - (Date.now() + serverOffset - room.startAt),
      );
    updateHUD();
    if (!room && attempt.phase === 'timeout') timeoutScreen();
    if (now >= peekAt && !drag) {
      lastPose = [5, 6, 7, 8, 9].filter((p) => p !== lastPose)[Math.floor(Math.random() * 4)];
      view.babyPose(lastPose);
      if (view.baby) {
        view.baby.active = true;
        peekSide = Math.random() < 0.5 ? 1 : -1;
        view.babyBase.x = peekSide === 1 ? 40 : 350;
      }
      peekUntil = now + 2600;
      peekAt = now + 26000 + Math.random() * 16000;
    }
    if (view.baby && now <= peekUntil && view.motion) {
      const left = peekUntil - now;
      const outside = left > 2150 ? (left - 2150) / 450 : left < 650 ? 1 - left / 650 : 0;
      view.babyBase.x = (peekSide === 1 ? 40 : 350) - peekSide * outside * 95;
      if (left < 650) view.babyPose(11);
    }
    if (now > peekUntil && view.baby) view.baby.active = false;
    if (hintUntil && now >= hintUntil) {
      hintUntil = 0;
      view.highlight([]);
    }
    if (now - saveAt > 1200) {
      saveAt = now;
      remember();
    }
  }
  if (room && now - pollAt > 800 && !pollBusy && !roomBusy) {
    pollAt = now;
    pollBusy = true;
    const session = rooms.session;
    rooms
      .poll()
      .then((data) => {
        if (session === rooms.session && data) return acceptRoom(data);
      })
      .catch((e) => {
        if (now - roomErrorAt > 9000) {
          roomErrorAt = now;
          notify(e.message);
        }
      })
      .finally(() => (pollBusy = false));
  }
  if (screen === 'room-result') {
    updateRoomResult();
    const left = room.nextAt - Date.now() - serverOffset;
    view.ceremony(
      left < 1300 ? Math.min(1, 1 - left / 1300) : Math.min(1, (now - ceremonyStart) / 1500),
      left < 1300 ? 'travel' : 'win',
    );
  }
}
try {
  fit();
  runtime = await startCocos(canvas, {
    width: 390,
    height,
    background: [245, 239, 223, 255],
    update: frame,
  });
  view = new View(runtime);
  await Promise.all([
    view.initialize(),
    rooms.available().then((available) => (roomsAvailable = available)),
  ]);
  view.motion = save.settings.motion;
  document.querySelector('#loading').remove();
  // Inspection exposes no actions. Interactive development actions remain behind SmallGamesDev.
  globalThis.PorcelainGame = {
    version: VERSION,
    get screen() {
      return screen;
    },
    get snapshot() {
      return attempt ? structuredClone(attempt) : null;
    },
    get room() {
      return room ? structuredClone({ ...room, attempt: null }) : null;
    },
    get puzzle() {
      return puzzle ? structuredClone(puzzle) : null;
    },
    get board() {
      return { origin: view.boardOrigin, scale: view.boardScale };
    },
  };
  globalThis.SmallGamesDev?.registerActions?.([
    { id: 'porcelain-jump', label: '选择试玩关卡', run: () => action('dev') },
    { id: 'porcelain-timeout', label: '触发超时（试玩）', run: () => action('dev-timeout') },
    { id: 'porcelain-complete', label: '完成拼合（试玩）', run: () => action('dev-solve') },
  ]);
  globalThis.SmallGamesDev?.registerSnapshot?.(() => ({
    screen,
    level: attempt?.number,
    groups: attempt?.groups.length,
    remainingMs: attempt?.remainingMs,
    practice,
  }));
  const params = new URL(location.href).searchParams;
  if (params.has('room')) friends();
  else if (
    /^\d{1,3}$/.test(params.get('level') || '') &&
    Number(params.get('level')) >= 1 &&
    Number(params.get('level')) <= 100
  )
    await begin(Number(params.get('level')), { shared: true });
  else await home();
} catch (error) {
  console.error(error);
  document.querySelector('#loading').innerHTML =
    '<div class="seal">瓷</div><p>暂时没能打开这份时光</p><button class="button" onclick="location.reload()">重新打开</button>';
}

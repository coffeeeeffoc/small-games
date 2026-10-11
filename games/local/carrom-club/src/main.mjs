import { LEVELS, CHAPTERS, CHAPTER_SIZE, validateLevels } from './content.mjs';
import {
  createGame,
  placeStriker,
  shoot,
  step,
  STEP,
  remaining,
  chooseShot,
  starsFor,
  scoreBreakdown,
  scoresFor,
} from './core.mjs';
import { createAimGesture, updateAimGesture, settleAimGesture } from './aim.mjs';
import { createRenderer } from './render.mjs';
import { readSave, writeSave, unlocked } from './storage.mjs';
import { createAudio } from './audio.mjs';
import { createFriendsClient, readInvitation, invitationURL } from './friends.mjs';
import {
  createMultiplayerMatch,
  placeFriendsStriker,
  shootFriends,
  stepFriends,
  remainingFriends,
  friendsScore,
  seatToWorld,
  worldToSeat,
} from './friends-core.mjs';
import { FRIEND_COLORS, FRIEND_LEVELS } from './friends-content.mjs';

validateLevels();
const $ = (id) => document.getElementById(id);
let storage;
try {
  storage = window.localStorage;
} catch {
  /* Private embedding may deny storage. */
}
const save = readSave(storage);
const audio = createAudio(() => save.sound);
const dev = window.SmallGamesDev?.isEnabled() ?? false;
let screen = 'home',
  game = save.match ?? createGame(),
  practice = false,
  gesture = null,
  aim = null;
let levelChapter = 0;
let previousTime = 0,
  accumulator = 0,
  aiDelay = 0,
  time = 0,
  raf = 0,
  settingsFrom = 'home',
  noticeTimer;
let lastHud = '',
  resultHandled = false,
  toastLife = 0;
let dirty = true,
  persistTimer,
  online = false,
  room = null,
  roomAction = false,
  networkError = '',
  authoritative = null,
  appliedShot = null,
  connectAction = null,
  boardBox = null,
  previewKey = '',
  syncedTurn = null,
  serverOffset = 0;
const effects = [],
  cleanups = [];
const board = $('board'),
  position = $('position');
const draw = createRenderer(board),
  drawHome = createRenderer($('home-board')),
  drawRoom = createRenderer($('room-preview-board'));
async function loadCompetitionClient() {
  if (!globalThis.__competition) {
    await import(new URL('../competition-client.js', import.meta.url).href);
    globalThis.__installCompetition({
      ...globalThis.__CARROM_COMPETITION_CONFIG__,
      ...globalThis.__COMPETITION_CONFIG__,
      game: 'carrom-club',
    });
  }
  return globalThis.__competition;
}
const multiplayer = createFriendsClient({
  storage,
  loadClient: loadCompetitionClient,
  onRoom: receiveRoom,
  onError: (error) => {
    networkError = error.message;
    cancelAim();
    lastHud = '';
    renderRoom();
  },
});
const homeGame = createGame();
homeGame.coins[5].x = 250;
homeGame.coins[5].y = 410;
homeGame.coins[11].x = 690;
homeGame.coins[11].y = 335;
homeGame.coins[15].x = 730;
homeGame.coins[15].y = 650;
homeGame.coins[17].x = 330;
homeGame.coins[17].y = 690;
const on = (target, type, handler, options) => {
  target.addEventListener(type, handler, options);
  cleanups.push(() => target.removeEventListener(type, handler, options));
};
const click = (id, action) =>
  on($(id), 'click', (event) => {
    audio.unlock();
    action(event);
  });

function flushPersist() {
  clearTimeout(persistTimer);
  persistTimer = null;
  const ok = writeSave(storage, save);
  if (!ok && !persist.warned) {
    persist.warned = true;
    notice('存储暂不可用，本次仍可继续游玩。');
  }
}
function persist(deferred = false) {
  if (!deferred) {
    flushPersist();
    return;
  }
  // Let release/input handlers and the next paint finish before synchronous storage I/O.
  clearTimeout(persistTimer);
  persistTimer = setTimeout(flushPersist, 120);
}
function notice(text) {
  $('notice').textContent = text;
  $('notice').hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    $('notice').hidden = true;
  }, 3600);
}
function snapshot() {
  if (!online && !practice && !game.multiplayerVersion && game.phase === 'ready') {
    save.match = structuredClone(game);
    save.match.events = [];
    persist(true);
  }
}
function cancelAim() {
  const old = gesture;
  gesture = null;
  aim = null;
  if (old && board.hasPointerCapture(old.id)) board.releasePointerCapture(old.id);
  $('cancel-aim').hidden = true;
  $('power-fill').style.width = '0%';
  $('aim-angle').hidden = true;
  lastHud = '';
  dirty = true;
}
function show(next) {
  cancelAim();
  screen = next;
  for (const element of document.querySelectorAll('.screen')) element.hidden = element.id !== next;
  document.body.dataset.phase = next;
  accumulator = 0;
  previousTime = 0;
  lastHud = '';
  dirty = true;
  if (next === 'home') {
    $('start').innerHTML =
      `${save.match ? (save.match.levelId ? '继续练习' : '继续对局') : '开始对局'} <span>›</span>`;
    $('practice-progress').textContent = `${Object.keys(save.stars).length} / ${LEVELS.length}`;
    $('home-progress').textContent = save.wins
      ? `已赢下 ${save.wins} 局 · 再约一场好棋`
      : '回拉指尖，听见落袋。';
    drawHome.resize();
    drawHome(homeGame);
  }
  if (next === 'levels') renderLevels();
  if (next === 'settings') updateSettings();
  if (next === 'play') {
    audio.unlock();
    aiDelay = 0;
    draw.resize();
    boardBox = board.getBoundingClientRect();
    updateHud();
  }
  $('play').classList.toggle('is-online', online);
  $('multiplayer-seats').hidden = !online;
  if (next === 'friends') renderRoom();
  if (window.parent !== window)
    window.parent.postMessage(
      {
        type: 'small-games:display-state',
        gameId: 'carrom-club',
        screen: next === 'home' ? 'home' : 'playing',
      },
      '*',
    );
}
function renderLevels() {
  const chapter = CHAPTERS[levelChapter];
  const lessons = LEVELS.slice(chapter.start, chapter.end);
  const completed = lessons.filter((level) => save.stars[level.id] > 0).length;
  $('chapter-label').textContent = `${levelChapter + 1}. ${chapter.title}`;
  $('chapter-progress').textContent =
    `${chapter.start + 1}–${chapter.end} 关 · 已通关 ${completed}/${lessons.length}`;
  $('chapter-prev').disabled = levelChapter === 0;
  $('chapter-next').disabled = levelChapter === CHAPTERS.length - 1;
  $('level-grid').replaceChildren();
  lessons.forEach((level, offset) => {
    const index = chapter.start + offset;
    const available = unlocked(save, index),
      button = document.createElement('button');
    button.className = 'level-card';
    button.disabled = !available;
    button.dataset.level = level.id;
    button.setAttribute(
      'aria-label',
      `${index + 1} ${level.title}${available ? `，${save.stars[level.id] ?? 0} 星` : '，尚未解锁'}`,
    );
    if (available && !save.stars[level.id]) button.setAttribute('aria-current', 'step');
    button.innerHTML = `<h3><span>${String(index + 1).padStart(2, '0')}</span>${level.title}</h3><canvas aria-hidden="true"></canvas><div class="level-rating">${available ? '★'.repeat(save.stars[level.id] ?? 0) + '☆'.repeat(3 - (save.stars[level.id] ?? 0)) : '待解锁'}</div>${available ? '' : '<svg class="lock" viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>'}`;
    button.addEventListener('click', () => {
      audio.unlock();
      start(level.id);
    });
    $('level-grid').append(button);
    createRenderer(button.querySelector('canvas'))(createGame(level.id));
  });
}
function start(levelId = null, isPractice = false) {
  if (room) return;
  online = false;
  board.dataset.side = '0';
  const index = LEVELS.findIndex((l) => l.id === levelId);
  if (levelId && !isPractice && !unlocked(save, index)) return;
  practice = isPractice;
  resultHandled = false;
  game = createGame(levelId);
  effects.length = 0;
  if (!practice) {
    save.match = null;
    snapshot();
  }
  show('play');
}
function pause() {
  if (screen !== 'play') return;
  $('pause-description').textContent = online
    ? '联网对局仍在继续，返回后同步棋局。'
    : game.levelId
      ? LEVELS.find((l) => l.id === game.levelId).title
      : '这一杆，等你回来。';
  show('pause-screen');
  $('restart').hidden = online;
  $('pause-home').textContent = online ? '离开房间' : '返回主页';
  $('online-rules').hidden = !online;
  if (online)
    $('online-rules-copy').textContent =
      game.mode === 'colors'
        ? '每人一种颜色。本色入袋续杆，误入他色则返摆并换手；击球子落袋罚一子。先清本色获胜，其余按剩余棋子排名。名次积分为 4 / 2 / 1 / 0，同名次同分，续局累计。每杆限时 45 秒。'
        : '开球方执白；双打对面同队，共享棋色和积分。本色入袋续杆；红后须同杆或下一杆补进本色，补进后加 3 分。本色每枚 1 分，清台后比较总分，同分清台方胜。每杆限时 45 秒。';
  audio.suspend();
}
function updateHud() {
  if (online) {
    updateFriendsHud();
    return;
  }
  $('multiplayer-seats').hidden = true;
  $('play').classList.remove('is-online');
  const crest = $('player-seat').querySelector('.disc-crest');
  crest.style.background = '';
  if ($('player-seat').querySelector('.friend-coin')) {
    const coin = document.createElement('i');
    coin.className = 'coin white';
    $('player-seat').querySelector('.friend-coin').replaceWith(coin);
  }
  const side = online ? (room?.you ?? 0) : 0;
  const opponent = 1 - side;
  const key = [
    game.phase,
    game.turn,
    game.shots,
    game.message,
    remaining(game, 0),
    remaining(game, 1),
    !!aim,
    game.queen,
    side,
    networkError,
    multiplayer.pending,
  ].join('|');
  if (lastHud === key) return;
  lastHud = key;
  const level = LEVELS.find((l) => l.id === game.levelId);
  $('opponent-name').innerHTML = level
    ? `${level.title} <small>练习</small>`
    : online
      ? `好友 <small>${opponent ? '黑子' : '白子'}</small>`
      : '阿洛 <small>电脑</small>';
  $('player-name').innerHTML = `你 <small>${side ? '黑子' : '白子'}</small>`;
  const scoreText = (seat) => {
    const score = scoreBreakdown(game, seat);
    return `${score.total} 分 · ${score.coins}/${game.totals[seat]}${score.queen ? ' · 红后+3' : ''}`;
  };
  $('opponent-score').textContent = level
    ? `余 ${Math.max(0, level.shots - game.playerShots)} 杆`
    : scoreText(opponent);
  $('player-score').textContent = scoreText(side);
  $('player-seat').querySelector('.coin').className = `coin ${side ? 'black' : 'white'}`;
  $('opponent-seat').querySelector('.coin').className = `coin ${opponent ? 'black' : 'white'}`;
  $('player-seat').classList.toggle('active-seat', game.turn === side && game.phase === 'ready');
  $('opponent-seat').classList.toggle(
    'active-seat',
    game.turn === opponent && game.phase === 'ready',
  );
  const player = canPlay();
  $('turn-pill').textContent =
    game.phase === 'moving'
      ? '棋子滑行中'
      : online && (networkError || multiplayer.pending)
        ? '等待同步'
        : game.turn === opponent
          ? online
            ? '好友的回合'
            : '阿洛在瞄准'
          : game.queen === `pending-${side}`
            ? '补进红后'
            : '你的回合';
  $('turn-pill').classList.toggle('ai', !player);
  position.disabled = !player || !!aim;
  position.value = side ? 1000 - game.striker.x : game.striker.x;
  $('play-hint').textContent = aim
    ? '松手击发 · 回到起点收杆'
    : player
      ? '滑动摆位 · 回拉击球子'
      : game.turn === opponent
        ? '看一看，下一杆怎么打'
        : '让棋子，再滑一会儿';
  if (aim) updateAimDisplay();
  $('status').textContent =
    online && multiplayer.pending
      ? '这一杆尚未确认，请重试同步。'
      : online && networkError
        ? networkError
        : online && game.phase === 'ready'
          ? `${game.turn === side ? '你的回合' : '好友的回合'} · ${game.message.replace('你的回合 · 白子先行', '白子先行')}`
          : game.message;
  $('sync-retry').hidden = !online || (!networkError && !multiplayer.pending);
  $('practice-badge').hidden = !practice;
  board.dataset.phase = game.phase;
  board.dataset.shots = game.shots;
  board.dataset.turn = game.turn;
}
function finish() {
  if (resultHandled) return;
  if (online) {
    finishFriends();
    return;
  }
  $('result-ranking').hidden = true;
  resultHandled = true;
  const side = online ? room.you : 0;
  const win = game.winner === side,
    stars = starsFor(game),
    index = LEVELS.findIndex((l) => l.id === game.levelId);
  if (!practice && !online) {
    save.match = null;
    if (win && game.levelId)
      save.stars[game.levelId] = Math.max(save.stars[game.levelId] ?? 0, stars);
    if (win && !game.levelId) save.wins++;
    persist();
  }
  $('result-title').textContent =
    online && game.winner === null
      ? '平分秋色'
      : win
        ? '这一局，漂亮'
        : game.levelId
          ? '再找一个好角度'
          : '好棋，棋逢对手';
  $('result-description').textContent =
    online && room.state.reason === 'resign'
      ? win
        ? '好友认输 · 本局结束'
        : '你已认输 · 本局结束'
      : practice
        ? '开发试玩 · 本次不记录进度'
        : win && game.levelId
          ? `${LEVELS[index].title} · ${index < LEVELS.length - 1 ? '下一关已解锁' : `${LEVELS.length} 关练习已完成`}`
          : game.message;
  $('result-stars').textContent =
    win && game.levelId ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '';
  const scores = scoresFor(game);
  $('result-score').textContent = game.levelId
    ? ''
    : `你 ${scores[side]} 分 · ${online ? '好友' : '阿洛'} ${scores[1 - side]} 分`;
  $('result-shots').textContent = side ? game.shots - game.playerShots : game.playerShots;
  $('result-pots').textContent = game.totals[side] - remaining(game, side);
  $('next').hidden = !win || !game.levelId || index === LEVELS.length - 1 || practice;
  $('retry').textContent = game.levelId ? '再练一次' : '再来一局';
  show('result');
  const resultBoard = $('result-board');
  resultBoard.width = board.width;
  resultBoard.height = board.height;
  resultBoard.getContext('2d').drawImage(board, 0, 0);
}
function updateSettings() {
  for (const id of ['sound', 'haptics']) {
    $(id).setAttribute('aria-pressed', save[id]);
    $(id).querySelector('strong').textContent = save[id] ? '开' : '关';
  }
}
function canPlay() {
  return (
    game.phase === 'ready' &&
    game.turn === (online ? myIndex() : 0) &&
    (!online ||
      (room?.status === 'playing' &&
        !networkError &&
        !multiplayer.pending &&
        !roomAction &&
        (!room.lastShot ||
          Date.now() + serverOffset >= room.lastShot.startedAt + room.lastShot.durationMs)))
  );
}
const friendName = (player, index) =>
  !player?.name || player.name === '棋友' ? `棋友 ${index + 1}` : player.name;
const modeNames = { singles: '经典单打', doubles: '经典双打 · 2v2', colors: '彩色个人战' };
const colorNames = {
  white: '白',
  black: '黑',
  ...Object.fromEntries(FRIEND_COLORS.map((color) => [color.id, color.name])),
};
function coinBadge(color, symbol) {
  const badge = document.createElement('i');
  badge.className = 'friend-coin';
  badge.dataset.color = color;
  badge.style.setProperty(
    '--coin-color',
    FRIEND_COLORS.find((entry) => entry.id === color)?.hex ??
      (color === 'black' ? '#24302f' : '#edcf97'),
  );
  badge.textContent = symbol;
  badge.setAttribute('aria-label', `${colorNames[color]}子`);
  return badge;
}
const myIndex = () =>
  online
    ? (game.players?.findIndex((player) => player.id === room?.players[room.you]?.id) ?? 0)
    : 0;
const mySeat = () => (online ? (game.players?.[myIndex()]?.seat ?? 0) : 0);
const layoutTitle = (settings) =>
  settings?.board === 'ordinary'
    ? '普通棋盘'
    : (FRIEND_LEVELS.find((level) => level.id === settings?.levelId)?.title ?? '随机关卡');
function previewGame() {
  const settings = room.settings;
  const count =
    settings.mode === 'doubles'
      ? 4
      : settings.mode === 'singles'
        ? 2
        : Math.max(2, room.players.length);
  const players = Array.from({ length: count }, (_, index) => ({
    id: room.players[index]?.id ?? `preview-${index}`,
    name: room.players[index]?.name ?? `棋友 ${index + 1}`,
  }));
  return createMultiplayerMatch({
    ...settings,
    players,
    round: Math.max(1, room.status === 'waiting' ? room.round + 1 : room.round),
  });
}
function renderRoom() {
  $('room-entry').hidden = !!room;
  $('room-details').hidden = !room;
  $('room-recover').hidden = !!room || !multiplayer.recoverable;
  $('room-retry').hidden = !networkError;
  $('room-status').textContent =
    networkError || (roomAction ? '正在同步…' : '创建房间，把邀请发给好友。');
  for (const id of [
    'room-create',
    'room-join',
    'room-recover',
    'room-ready',
    'room-start',
    'room-leave',
    'room-retry',
    'sync-retry',
    'room-reroll',
  ])
    $(id).disabled = roomAction;
  if (!room) return;
  const waiting = room.status === 'waiting';
  const host = room.players[room.you]?.id === room.hostId;
  const editable = waiting && host && !roomAction;
  const preview = previewGame();
  $('room-code').textContent = room.code;
  $('room-mode').value = room.settings.mode;
  $('room-board').value = room.settings.board;
  $('room-mode').disabled = !editable;
  $('room-board').disabled = !editable || room.settings.mode !== 'colors';
  $('room-level-choice').hidden = room.settings.board !== 'level';
  $('room-level').value = room.settings.levelId ?? FRIEND_LEVELS[0].id;
  $('room-level').disabled = !editable;
  $('room-reroll').hidden = room.settings.board !== 'random' || !host;
  $('room-reroll').disabled = !editable;
  $('room-layout-name').textContent = layoutTitle(room.settings);
  $('room-layout-note').textContent =
    room.settings.mode === 'colors'
      ? `${preview.players.length} 人预览 · 每人 ${preview.totals[0]} 枚${room.settings.board === 'random' ? ' · 已随机选定' : ''}`
      : '黑白两方 · 红后需补进';
  const nextPreviewKey = JSON.stringify([room.settings, room.players.length, room.round]);
  if (screen === 'friends' && previewKey !== nextPreviewKey) {
    drawRoom.resize();
    drawRoom(preview, { controllable: false });
    previewKey = nextPreviewKey;
  }
  const capacity = room.settings.mode === 'singles' ? 2 : 4;
  $('room-seat-count').textContent =
    `已入座 ${room.players.length} / ${capacity}${room.settings.mode === 'doubles' ? ' · 1、3 号同队，2、4 号同队' : ''}`;
  $('room-players').replaceChildren();
  for (let seat = 0; seat < capacity; seat++) {
    const player = room.players[seat];
    const role = preview.players[seat];
    const row = document.createElement('div');
    row.className = 'room-player';
    const disc = role
      ? coinBadge(role.color, role.symbol)
      : coinBadge(FRIEND_COLORS[seat].id, FRIEND_COLORS[seat].symbol);
    const name = document.createElement('strong');
    name.textContent = !player
      ? `${seat + 1} 号空位`
      : `${seat === room.you ? '你' : friendName(player, seat)}${player.id === room.hostId ? ' · 房主' : ''}`;
    const state = document.createElement('span');
    state.textContent = !player
      ? '等待加入'
      : !player.connected
        ? '暂离 · 等待重连'
        : player.ready
          ? '✓ 已准备'
          : '未准备';
    row.append(disc, name, state);
    $('room-players').append(row);
  }
  $('room-ready').textContent = waiting
    ? room.players[room.you]?.ready
      ? '已准备 ✓'
      : '准备'
    : room.status === 'playing'
      ? '返回对局'
      : '返回房间';
  $('room-ready').setAttribute('aria-pressed', String(!!room.players[room.you]?.ready));
  $('room-start').hidden = !host || !waiting;
  const enough =
    room.settings.mode === 'doubles'
      ? room.players.length === 4
      : room.settings.mode === 'singles'
        ? room.players.length === 2
        : room.players.length >= 2;
  $('room-start').textContent = `开始 ${room.players.length} 人对战`;
  $('room-start').disabled =
    roomAction || !enough || !room.players.every((player) => player.ready && player.connected);
  if (!networkError && !roomAction)
    $('room-status').textContent = waiting
      ? room.reason === 'series-reset'
        ? '玩法或成员已变更，积分重新开始；请重新准备。'
        : host
          ? '设置变更后需重新准备，全部准备后由你开局。'
          : '确认玩法和棋盘后准备，等待房主开局。'
      : room.status === 'playing'
        ? '本局已开始，席位已锁定。'
        : room.status === 'finished'
          ? '本局已结束，回房间准备下一局。'
          : '本局已结束，可回房间重新准备。';
}
function updateFriendsHud() {
  const me = game.players[myIndex()];
  if (!me) return;
  const seconds = Math.max(0, Math.ceil((room.turnDeadline - (Date.now() + serverOffset)) / 1000));
  const key = JSON.stringify([
    game.turnNumber,
    game.phase,
    game.shots,
    game.message,
    game.coins.filter((coin) => coin.pocketed).map((coin) => coin.id),
    game.queen,
    !!aim,
    networkError,
    multiplayer.pending,
    roomAction,
    seconds,
  ]);
  if (lastHud === key) return;
  lastHud = key;
  $('play').classList.add('is-online');
  $('multiplayer-seats').hidden = false;
  $('multiplayer-seats').replaceChildren();
  const scoreText = (index) =>
    `${friendsScore(game, index)} 分 · ${game.totals[game.players[index].team] - remainingFriends(game, index)}/${game.totals[game.players[index].team]}`;
  game.players.forEach((player, index) => {
    if (index === myIndex()) return;
    const card = document.createElement('div');
    card.className = `multiplayer-seat${index === game.turn && game.phase === 'ready' ? ' active-seat' : ''}`;
    const title = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = `${friendName(player, index)}${game.mode === 'doubles' && player.team === me.team ? ' · 队友' : ''}`;
    title.append(coinBadge(player.color, player.symbol), name);
    const score = document.createElement('p');
    score.textContent = scoreText(index);
    card.append(title, score);
    $('multiplayer-seats').append(card);
  });
  $('opponent-name').textContent = `${modeNames[game.mode]} · ${layoutTitle(room.settings)}`;
  $('player-name').textContent =
    `你 · ${colorNames[me.color]}${game.mode === 'doubles' ? '队' : '子'}`;
  $('player-score').textContent = scoreText(myIndex());
  const crest = $('player-seat').querySelector('.disc-crest');
  crest.dataset.symbol = me.symbol;
  crest.style.background =
    FRIEND_COLORS.find((entry) => entry.id === me.color)?.hex ??
    (me.color === 'white' ? '#e5c590' : '#24302f');
  const oldCoin = $('player-seat').querySelector('.coin,.friend-coin');
  oldCoin.replaceWith(coinBadge(me.color, me.symbol));
  $('player-seat').classList.toggle(
    'active-seat',
    game.turn === myIndex() && game.phase === 'ready',
  );
  const playable = canPlay();
  $('turn-pill').textContent =
    game.phase === 'moving'
      ? '棋子滑行中'
      : networkError || multiplayer.pending
        ? '等待同步'
        : `${game.turn === myIndex() ? '你的回合' : `${game.turn + 1} 号出杆`} · ${seconds}s`;
  $('turn-pill').classList.toggle('ai', !playable);
  position.disabled = !playable || !!aim;
  position.value = worldToSeat(game.striker, me.seat).x;
  $('play-hint').textContent = aim
    ? '松手击发 · 回到起点收杆'
    : playable
      ? '滑动摆位 · 回拉击球子'
      : '看一看，下一杆怎么打';
  if (aim) updateAimDisplay();
  $('status').textContent = multiplayer.pending
    ? '这一杆尚未确认，请重试同步。'
    : networkError || game.message;
  $('sync-retry').hidden = !networkError && !multiplayer.pending;
  $('practice-badge').hidden = true;
  board.dataset.phase = game.phase;
  board.dataset.shots = game.shots;
  board.dataset.turn = game.turn;
}
function finishFriends() {
  resultHandled = true;
  const me = game.players[myIndex()];
  const won = me.team === game.winnerTeam;
  $('result-title').textContent = won ? '这一局，漂亮' : '好棋，再切磋一局';
  $('result-description').textContent = game.message;
  $('result-stars').textContent = '';
  $('result-score').textContent = `${modeNames[game.mode]} · 第 ${room.round} 局`;
  $('result-shots').textContent = game.shots;
  $('result-pots').textContent = game.totals[me.team] - remainingFriends(game, myIndex());
  $('next').hidden = true;
  $('retry').textContent =
    room.players[room.you]?.id === room.hostId ? '回房间 · 再来一局' : '回房间等下一局';
  $('result-ranking').hidden = false;
  $('result-ranking').replaceChildren();
  for (const entry of game.ranking) {
    const player = game.players.find((member) => member.id === entry.playerId);
    const row = document.createElement('div');
    row.className = 'ranking-row';
    const name = document.createElement('strong');
    name.textContent = `${entry.rank}. ${player.id === me.id ? '你' : friendName(player, game.players.indexOf(player))}`;
    const points = document.createElement('span');
    const total = room.series.find((member) => member.playerId === player.id);
    points.textContent = `本局 +${entry.points} · 累计 ${total?.points ?? 0}`;
    row.append(coinBadge(player.color, player.symbol), name, points);
    $('result-ranking').append(row);
  }
  show('result');
  const resultBoard = $('result-board');
  resultBoard.width = board.width;
  resultBoard.height = board.height;
  resultBoard.getContext('2d').drawImage(board, 0, 0);
}
async function roomTask(action) {
  if (roomAction) return;
  roomAction = true;
  networkError = '';
  renderRoom();
  lastHud = '';
  try {
    await action();
  } catch (error) {
    networkError = error.message;
    notice(error.message);
  } finally {
    roomAction = false;
    lastHud = '';
    dirty = true;
    renderRoom();
  }
}
function receiveRoom(next) {
  const previous = room;
  room = next;
  if (previous?.code !== next?.code) {
    try {
      const url = new URL(location.href);
      if (next) url.searchParams.set('pk', next.code);
      else url.searchParams.delete('pk');
      history.replaceState(null, '', url);
    } catch {
      /* The saved room also supports hosts without history access. */
    }
  }
  networkError = '';
  lastHud = '';
  dirty = true;
  if (!next) {
    online = false;
    game = structuredClone(save.match ?? createGame());
    authoritative = null;
    appliedShot = syncedTurn = null;
    previewKey = '';
    $('play').classList.remove('is-online');
    $('multiplayer-seats').hidden = true;
    renderRoom();
    return;
  }
  serverOffset = next.serverNow - Date.now();
  online = true;
  practice = false;
  renderRoom();
  if (!next.state || next.status === 'waiting') {
    cancelAim();
    authoritative = null;
    appliedShot = syncedTurn = null;
    resultHandled = false;
    if (screen !== 'friends') {
      previewKey = '';
      show('friends');
    }
    return;
  }
  const fresh =
    !previous ||
    previous.code !== next.code ||
    previous.round !== next.round ||
    previous.status === 'waiting';
  const latest = next.state;
  authoritative = structuredClone(latest);
  if (fresh) {
    game = structuredClone(latest);
    appliedShot = latest.shots;
    syncedTurn = latest.turnNumber;
    effects.length = 0;
    resultHandled = false;
    show('play');
  } else if (game.phase === 'moving' && game.shots === latest.shots && screen === 'play') {
    // Adopt the authoritative snapshot when the currently shown shot has settled.
  } else if (
    screen === 'play' &&
    next.lastShot &&
    next.lastShot.initialState.shots === game.shots + 1
  ) {
    cancelAim();
    game = structuredClone(next.lastShot.initialState);
    accumulator = 0;
  } else if (
    game.shots !== latest.shots ||
    game.phase !== latest.phase ||
    syncedTurn !== latest.turnNumber
  ) {
    cancelAim();
    game = structuredClone(latest);
    appliedShot = latest.shots;
    syncedTurn = latest.turnNumber;
  }
  if (['abandoned', 'expired'].includes(next.status)) {
    cancelAim();
    show('friends');
    $('room-status').textContent =
      next.status === 'expired'
        ? '房间已过期，请重新约一局。'
        : '有玩家离开，本局结束；可回房间重新准备。';
  }
  if (next.status === 'finished' && game.phase !== 'moving' && screen !== 'result') {
    game = structuredClone(latest);
    if (game.phase === 'over') finish();
  }
}
async function leaveRoom() {
  if (room) await multiplayer.leave();
  show('home');
}
async function nextFriendRound() {
  if (!room) return;
  if (room.status === 'expired') {
    await multiplayer.leave();
    await multiplayer.create();
    return;
  }
  if (room.status === 'waiting') {
    show('friends');
    return;
  }
  if (room.players[room.you]?.id === room.hostId) await multiplayer.rematch();
  else {
    show('friends');
    notice('等待房主返回房间开启下一局。');
  }
}
click('friends-open', () => {
  show('friends');
  if (!room && multiplayer.recoverable) void roomTask(() => multiplayer.resume());
});
click('friends-back', () => void roomTask(leaveRoom));
click('room-create', () => {
  connectAction = () => multiplayer.create();
  void roomTask(connectAction);
});
click('room-join', () => {
  connectAction = () => multiplayer.join($('room-input').value);
  void roomTask(connectAction);
});
click('room-recover', () => void roomTask(() => multiplayer.resume()));
click('room-ready', () => {
  if (room?.status === 'playing') show('play');
  else if (room?.status === 'waiting')
    void roomTask(() => multiplayer.ready(!room.players[room.you]?.ready));
  else void roomTask(nextFriendRound);
});
click('room-start', () => void roomTask(() => multiplayer.start()));
for (const level of FRIEND_LEVELS) {
  const option = document.createElement('option');
  option.value = level.id;
  option.textContent = level.title;
  $('room-level').append(option);
}
const changeRoomSettings = () => {
  const mode = $('room-mode').value;
  const board = mode === 'colors' ? $('room-board').value : 'ordinary';
  const levelId = board === 'level' ? $('room-level').value : null;
  void roomTask(() =>
    multiplayer.settings({
      mode,
      board,
      levelId,
    }),
  );
};
for (const id of ['room-mode', 'room-board', 'room-level']) on($(id), 'change', changeRoomSettings);
click(
  'room-reroll',
  () => void roomTask(() => multiplayer.settings({ ...room.settings, levelId: null })),
);
click('room-leave', () => void roomTask(leaveRoom));
const retrySync = () =>
  void roomTask(() =>
    room ? multiplayer.retry() : multiplayer.recoverable ? multiplayer.resume() : connectAction?.(),
  );
click('room-retry', retrySync);
// During a board update, mobile browsers may deliver touch pointerup without
// the later compatibility click. Recover on the owned tap release as well.
let retryTouch = null,
  retryClickUntil = 0;
const retryButton = $('sync-retry');
on(retryButton, 'pointerdown', (event) => {
  if (event.pointerType === 'mouse' || !event.isPrimary || retryButton.disabled) return;
  retryTouch = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
});
on(retryButton, 'pointermove', (event) => {
  if (
    retryTouch?.id === event.pointerId &&
    Math.hypot(event.clientX - retryTouch.x, event.clientY - retryTouch.y) > 12
  )
    retryTouch.moved = true;
});
on(retryButton, 'pointercancel', (event) => {
  if (retryTouch?.id === event.pointerId) retryTouch = null;
});
on(retryButton, 'pointerup', (event) => {
  const tap = retryTouch;
  if (!tap || tap.id !== event.pointerId) return;
  retryTouch = null;
  if (tap.moved || retryButton.disabled) return;
  const box = retryButton.getBoundingClientRect();
  if (
    event.clientX < box.left ||
    event.clientX > box.right ||
    event.clientY < box.top ||
    event.clientY > box.bottom
  )
    return;
  retryClickUntil = performance.now() + 800;
  audio.unlock();
  retrySync();
});
click('sync-retry', (event) => {
  if (event.detail && performance.now() < retryClickUntil) return;
  retrySync();
});
click('room-invite', () => {
  if (!room) return;
  const link = invitationURL(room.code);
  $('room-link').value = link;
  $('room-link').hidden = false;
  void navigator.clipboard
    ?.writeText(link)
    .then(() => {
      $('room-link').hidden = true;
      notice('邀请已复制，发给好友即可加入。');
    })
    .catch(() => notice('长按邀请链接即可复制。'));
});
click('start', () => {
  online = false;
  board.dataset.side = '0';
  if (save.match) {
    game = structuredClone(save.match);
    placeStriker(game, game.striker.x);
    practice = false;
    resultHandled = false;
    show('play');
  } else start();
});
click('levels-open', () => {
  const next = LEVELS.findIndex((level) => !save.stars[level.id]);
  levelChapter = Math.floor((next < 0 ? LEVELS.length - 1 : next) / CHAPTER_SIZE);
  $('levels').scrollTop = 0;
  show('levels');
});
for (const [id, direction] of [
  ['chapter-prev', -1],
  ['chapter-next', 1],
])
  click(id, () => {
    levelChapter = Math.max(0, Math.min(CHAPTERS.length - 1, levelChapter + direction));
    $('levels').scrollTop = 0;
    renderLevels();
  });
click('help-open', () => show('help'));
click('help-practice', () => start(LEVELS[0].id));
click('settings-open', () => {
  settingsFrom = 'home';
  show('settings');
});
click('pause-settings', () => {
  settingsFrom = 'pause-screen';
  show('settings');
});
click('settings-back', () => show(settingsFrom));
click('sound', () => {
  save.sound = !save.sound;
  updateSettings();
  persist();
  if (save.sound) {
    audio.unlock();
    audio.play('pocket');
  } else audio.suspend();
});
click('haptics', () => {
  save.haptics = !save.haptics;
  updateSettings();
  persist();
});
click('pause', pause);
click('resume', () => {
  if (online && authoritative) game = structuredClone(authoritative);
  show('play');
  if (online) void roomTask(() => multiplayer.refresh());
});
click('restart', () => start(game.levelId, practice));
click('pause-home', () => {
  if (online) {
    void roomTask(leaveRoom);
    return;
  }
  snapshot();
  show('home');
});
click('retry', () => (online ? void roomTask(nextFriendRound) : start(game.levelId, practice)));
click('next', () => {
  const i = LEVELS.findIndex((l) => l.id === game.levelId);
  if (i >= 0 && LEVELS[i + 1]) start(LEVELS[i + 1].id);
});
for (const button of document.querySelectorAll('[data-home]'))
  on(button, 'click', () => (online ? void roomTask(leaveRoom) : show('home')));
click('cancel-aim', cancelAim);
on(position, 'input', () => {
  if (screen === 'play' && canPlay()) {
    if (online) placeFriendsStriker(game, Number(position.value));
    else placeStriker(game, Number(position.value));
    position.value = online ? worldToSeat(game.striker, mySeat()).x : game.striker.x;
    dirty = true;
  }
});
on(position, 'pointerdown', () => audio.unlock());
on(position, 'change', snapshot);
function point(e) {
  const box = boardBox ?? board.getBoundingClientRect();
  const x = ((e.clientX - box.left) / box.width) * 1000;
  const y = ((e.clientY - box.top) / box.height) * 1000;
  return online ? seatToWorld({ x, y }, mySeat()) : { x, y };
}
on(board, 'pointerdown', (e) => {
  if (e.button !== 0 || gesture || screen !== 'play' || !canPlay()) return;
  boardBox = board.getBoundingClientRect();
  const p = point(e),
    radius = Math.max(42, (26 / boardBox.width) * 1000);
  if (Math.hypot(p.x - game.striker.x, p.y - game.striker.y) > radius) {
    notice('先拖动下方滑轨摆位，再按住大白子回拉。');
    return;
  }
  audio.unlock();
  e.preventDefault();
  gesture = createAimGesture(e.pointerId, p.x, p.y, boardBox.width / 1000, performance.now(), game);
  board.setPointerCapture(e.pointerId);
  aim = { dx: 0, dy: 0, power: 0, pull: 0 };
  lastHud = '';
  dirty = true;
});
function updateAimDisplay() {
  const power = aim.power;
  $('cancel-aim').hidden = false;
  $('power-fill').style.width = `${power * 100}%`;
  $('aim-angle').hidden = power <= 0.025;
  const vector = online
    ? worldToSeat({ x: 500 + aim.dx, y: 500 + aim.dy }, mySeat())
    : { x: 500 + aim.dx, y: 500 + aim.dy };
  const angle = (Math.atan2(vector.x - 500, 500 - vector.y) * 180) / Math.PI;
  $('aim-angle').textContent = `${Math.abs(angle) < 0.05 ? '0.0' : angle.toFixed(1)}°`;
  $('play-hint').textContent =
    power > 0.025 ? `力度 ${Math.round(power * 100)}% · 松手击发` : '回到起点 · 松手收杆';
}
on(board, 'pointermove', (e) => {
  if (!gesture || e.pointerId !== gesture.id) return;
  e.preventDefault();
  aim = updateAimGesture(gesture, point(e), performance.now());
  dirty = true;
  updateAimDisplay();
});
on(board, 'pointerup', (e) => {
  if (!gesture || e.pointerId !== gesture.id) return;
  const allowed = canPlay();
  const shot = aim;
  cancelAim();
  if (allowed && shot?.power > 0.025) {
    snapshot();
    const position = online ? worldToSeat(game.striker, mySeat()).x : game.striker.x;
    (online ? shootFriends : shoot)(game, shot.dx, shot.dy, shot.power);
    if (online)
      void roomTask(async () => {
        try {
          await multiplayer.shoot({ position, ...shot });
        } catch (error) {
          if (!multiplayer.pending && authoritative) game = structuredClone(authoritative);
          dirty = true;
          throw error;
        }
      });
    updateHud();
  }
});
for (const type of ['pointercancel', 'lostpointercapture'])
  on(board, type, (e) => {
    if (gesture?.id === e.pointerId) cancelAim();
  });
on(window, 'keydown', (e) => {
  if (e.key === 'Escape') {
    if (gesture) cancelAim();
    else if (screen === 'play') pause();
    else if (screen === 'pause-screen') show('play');
  }
});
on(window, 'blur', () => {
  retryTouch = null;
  cancelAim();
  pause();
});
on(document, 'visibilitychange', () => {
  if (document.hidden) {
    if (persistTimer) flushPersist();
    cancelAim();
    pause();
    audio.suspend();
  }
  previousTime = 0;
  accumulator = 0;
});
on(window, 'resize', () => {
  cancelAim();
  previousTime = 0;
  boardBox = null;
  dirty = true;
  if (screen === 'play') {
    draw.resize();
    boardBox = board.getBoundingClientRect();
  }
  if (screen === 'home') {
    drawHome.resize();
    drawHome(homeGame);
  }
  if (screen === 'levels') renderLevels();
  if (screen === 'friends') {
    previewKey = '';
    renderRoom();
  }
});
if (typeof ResizeObserver !== 'undefined') {
  const observer = new ResizeObserver(() => {
    if (screen !== 'play') return;
    if (draw.resize()) dirty = true;
    boardBox = null;
  });
  observer.observe(board);
  cleanups.push(() => observer.disconnect());
}

function frame(now) {
  const dt = previousTime ? Math.min((now - previousTime) / 1000, 0.05) : 0;
  previousTime = now;
  time += dt;
  if (screen === 'play') {
    const animated = game.phase === 'moving' || effects.length > 0;
    if (gesture) {
      const settled = settleAimGesture(gesture, performance.now());
      if (settled !== aim) {
        aim = settled;
        dirty = true;
        updateAimDisplay();
      }
    }
    if (game.phase === 'moving') {
      accumulator += dt;
      while (accumulator >= STEP && game.phase === 'moving') {
        (online ? stepFriends : step)(game);
        accumulator -= STEP;
      }
    } else accumulator = 0;
    for (const event of game.events.splice(0)) {
      if (event.type === 'settled') snapshot();
      else {
        audio.play(event.type, event.strength);
        if (event.type === 'pocket') {
          effects.push({ ...event, life: 1 });
          $('pocket-toast').textContent =
            event.kind === 'striker'
              ? '击球子落袋'
              : event.kind === 'queen'
                ? '红后入袋'
                : '好球，落袋';
          toastLife = 1.6;
          if (save.haptics) {
            try {
              navigator.vibrate?.(event.kind === 'striker' ? [12, 30, 12] : 12);
            } catch {
              /* Optional feedback. */
            }
          }
        }
      }
    }
    // Adopt every confirmed board once after its animation; never keep client-only
    // coin positions, and do not overwrite placement on later identical polls.
    if (
      online &&
      authoritative &&
      game.phase !== 'moving' &&
      game.shots === authoritative.shots &&
      (appliedShot !== authoritative.shots ||
        game.phase !== authoritative.phase ||
        game.message !== authoritative.message)
    ) {
      game = structuredClone(authoritative);
      appliedShot = authoritative.shots;
      syncedTurn = authoritative.turnNumber;
      dirty = true;
    }
    for (let i = effects.length - 1; i >= 0; i--) {
      effects[i].life -= dt * 2;
      if (effects[i].life <= 0) effects.splice(i, 1);
    }
    if (toastLife > 0) {
      toastLife = Math.max(0, toastLife - dt);
      $('pocket-toast').style.opacity = Math.min(1, toastLife);
    }
    if (!online && game.phase === 'ready' && game.turn === 1) {
      aiDelay += dt;
      if (aiDelay > 0.85) {
        const shot = chooseShot(game);
        placeStriker(game, shot.x);
        snapshot();
        shoot(game, shot.dx, shot.dy, shot.power);
        dirty = true;
        aiDelay = 0;
      }
    } else aiDelay = 0;
    updateHud();
    if (dirty || animated || game.phase === 'moving') {
      draw(game, {
        aim,
        effects,
        time,
        controllable: canPlay(),
        seat: mySeat(),
        alpha: game.phase === 'moving' ? accumulator / STEP : 1,
      });
      dirty = false;
    }
    if (game.phase === 'over' && !effects.length && (!online || room.status === 'finished'))
      finish();
  }
  raf = requestAnimationFrame(frame);
}
if (dev) {
  cleanups.push(
    window.SmallGamesDev.registerActions(
      LEVELS.map((level) => ({
        id: `practice-${level.id}`,
        label: `试玩：${level.title}`,
        run: () => start(level.id, true),
      })),
    ),
  );
  cleanups.push(window.SmallGamesDev.registerSnapshot(() => ({ screen, practice, game })));
  window.__carrom = {
    snapshot: () => structuredClone({ screen, practice, game, save, aim, online, room }),
    previewShot: () => chooseShot(game),
  };
}
on(window, 'pagehide', (event) => {
  snapshot();
  if (persistTimer) flushPersist();
  cancelAim();
  audio.suspend();
  if (!event.persisted) {
    cancelAnimationFrame(raf);
    cleanups.forEach((fn) => fn?.());
    audio.close();
    multiplayer.destroy();
    delete window.__carrom;
  }
});
show('home');
const invitation = readInvitation();
if (invitation) {
  $('room-input').value = invitation;
  show('friends');
  connectAction = () =>
    multiplayer.recoveryCode === invitation ? multiplayer.resume() : multiplayer.join(invitation);
  void roomTask(connectAction);
}
raf = requestAnimationFrame(frame);

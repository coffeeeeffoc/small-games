import { LEVELS, validateLevels } from './content.mjs';
import {
  createGame,
  placeStriker,
  shoot,
  step,
  STEP,
  remaining,
  chooseShot,
  starsFor,
  clamp,
} from './core.mjs';
import { createRenderer } from './render.mjs';
import { readSave, writeSave, unlocked } from './storage.mjs';
import { createAudio } from './audio.mjs';

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
const effects = [],
  cleanups = [];
const board = $('board'),
  position = $('position');
const draw = createRenderer(board),
  drawHome = createRenderer($('home-board'));
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
  on($(id), 'click', () => {
    audio.unlock();
    action();
  });

function persist() {
  const ok = writeSave(storage, save);
  if (!ok && !persist.warned) {
    persist.warned = true;
    notice('存储暂不可用，本次仍可继续游玩。');
  }
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
  if (!practice && game.phase === 'ready') {
    save.match = structuredClone(game);
    save.match.events = [];
    persist();
  }
}
function cancelAim() {
  const old = gesture;
  gesture = null;
  aim = null;
  if (old && board.hasPointerCapture(old.id)) board.releasePointerCapture(old.id);
  $('cancel-aim').hidden = true;
  $('power-fill').style.width = '0%';
  lastHud = '';
}
function show(next) {
  cancelAim();
  screen = next;
  for (const element of document.querySelectorAll('.screen')) element.hidden = element.id !== next;
  document.body.dataset.phase = next;
  accumulator = 0;
  previousTime = 0;
  lastHud = '';
  if (next === 'home') {
    $('start').innerHTML = `${save.match ? '继续对局' : '开始对局'} <span>›</span>`;
    $('practice-progress').textContent = `${Object.keys(save.stars).length} / ${LEVELS.length}`;
    $('home-progress').textContent = save.wins
      ? `已赢下 ${save.wins} 局 · 再约一场好棋`
      : '回拉指尖，听见落袋。';
    drawHome(homeGame);
  }
  if (next === 'levels') renderLevels();
  if (next === 'settings') updateSettings();
  if (next === 'play') {
    audio.unlock();
    aiDelay = 0;
    updateHud();
  }
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
  $('level-grid').replaceChildren();
  LEVELS.forEach((level, index) => {
    const available = unlocked(save, index),
      button = document.createElement('button');
    button.className = 'level-card';
    button.disabled = !available;
    button.dataset.level = level.id;
    button.setAttribute(
      'aria-label',
      `${index + 1} ${level.title}${available ? '' : '，尚未解锁'}`,
    );
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
  $('pause-description').textContent = game.levelId
    ? LEVELS.find((l) => l.id === game.levelId).title
    : '这一杆，等你回来。';
  show('pause-screen');
  audio.suspend();
}
function updateHud() {
  const key = [
    game.phase,
    game.turn,
    game.shots,
    game.message,
    remaining(game, 0),
    remaining(game, 1),
    !!aim,
  ].join('|');
  if (lastHud === key) return;
  lastHud = key;
  const level = LEVELS.find((l) => l.id === game.levelId);
  $('opponent-name').innerHTML = level
    ? `${level.title} <small>练习</small>`
    : '阿洛 <small>电脑</small>';
  $('opponent-score').textContent = level
    ? `余 ${Math.max(0, level.shots - game.playerShots)} 杆`
    : `${game.totals[1] - remaining(game, 1)} / ${game.totals[1]}`;
  $('player-score').textContent = `${game.totals[0] - remaining(game, 0)} / ${game.totals[0]}`;
  const player = game.turn === 0 && game.phase === 'ready';
  $('turn-pill').textContent =
    game.phase === 'moving'
      ? '棋子滑行中'
      : game.turn === 1
        ? '阿洛在瞄准'
        : game.queen === 'pending-0'
          ? '补进红后'
          : '你的回合';
  $('turn-pill').classList.toggle('ai', !player);
  position.disabled = !player || !!aim;
  position.value = game.striker.x;
  $('play-hint').textContent = aim
    ? '松手击发 · 回到起点收杆'
    : player
      ? '滑动摆位 · 回拉击球子'
      : game.turn === 1
        ? '看一看，下一杆怎么打'
        : '让棋子，再滑一会儿';
  $('status').textContent = game.message;
  $('practice-badge').hidden = !practice;
  board.dataset.phase = game.phase;
  board.dataset.shots = game.shots;
  board.dataset.turn = game.turn;
}
function finish() {
  if (resultHandled) return;
  resultHandled = true;
  const win = game.winner === 0,
    stars = starsFor(game),
    index = LEVELS.findIndex((l) => l.id === game.levelId);
  if (!practice) {
    save.match = null;
    if (win && game.levelId)
      save.stars[game.levelId] = Math.max(save.stars[game.levelId] ?? 0, stars);
    if (win && !game.levelId) save.wins++;
    persist();
  }
  $('result-title').textContent = win
    ? '这一局，漂亮'
    : game.levelId
      ? '再找一个好角度'
      : '好棋，棋逢对手';
  $('result-description').textContent = practice
    ? '开发试玩 · 本次不记录进度'
    : win && game.levelId
      ? `${LEVELS[index].title} · ${index < LEVELS.length - 1 ? '下一关已解锁' : '六关练习已完成'}`
      : game.message;
  $('result-stars').textContent =
    win && game.levelId ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '';
  $('result-shots').textContent = game.playerShots;
  $('result-pots').textContent = game.totals[0] - remaining(game, 0);
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
click('start', () => {
  if (save.match) {
    game = structuredClone(save.match);
    placeStriker(game, game.striker.x);
    practice = false;
    resultHandled = false;
    show('play');
  } else start();
});
click('levels-open', () => show('levels'));
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
click('resume', () => show('play'));
click('restart', () => start(game.levelId, practice));
click('pause-home', () => {
  snapshot();
  show('home');
});
click('retry', () => start(game.levelId, practice));
click('next', () => {
  const i = LEVELS.findIndex((l) => l.id === game.levelId);
  if (i >= 0 && LEVELS[i + 1]) start(LEVELS[i + 1].id);
});
for (const button of document.querySelectorAll('[data-home]'))
  on(button, 'click', () => show('home'));
click('cancel-aim', cancelAim);
on(position, 'input', () => {
  if (screen === 'play' && game.turn === 0) {
    placeStriker(game, Number(position.value));
    position.value = game.striker.x;
    lastHud = '';
  }
});
on(position, 'pointerdown', () => audio.unlock());
on(position, 'change', snapshot);
function point(e) {
  const box = board.getBoundingClientRect();
  return {
    x: ((e.clientX - box.left) / box.width) * 1000,
    y: ((e.clientY - box.top) / box.height) * 1000,
  };
}
on(board, 'pointerdown', (e) => {
  if (e.button !== 0 || gesture || screen !== 'play' || game.phase !== 'ready' || game.turn !== 0)
    return;
  const p = point(e),
    radius = Math.max(42, (26 / board.getBoundingClientRect().width) * 1000);
  if (Math.hypot(p.x - game.striker.x, p.y - game.striker.y) > radius) {
    notice('先拖动下方滑轨摆位，再按住大白子回拉。');
    return;
  }
  audio.unlock();
  e.preventDefault();
  gesture = { id: e.pointerId, x: p.x, y: p.y };
  board.setPointerCapture(e.pointerId);
  aim = { dx: 0, dy: 0, power: 0, pull: 0 };
  lastHud = '';
});
on(board, 'pointermove', (e) => {
  if (!gesture || e.pointerId !== gesture.id) return;
  e.preventDefault();
  const p = point(e),
    dx = gesture.x - p.x,
    dy = gesture.y - p.y;
  const pull = Math.hypot(dx, dy),
    power = Math.pow(clamp((pull - 12) / 195, 0, 1), 1.35);
  aim = { dx, dy, pull: Math.min(pull, 207), power };
  $('cancel-aim').hidden = false;
  $('power-fill').style.width = `${power * 100}%`;
  $('play-hint').textContent =
    power > 0.025 ? `力度 ${Math.round(power * 100)}% · 松手击发` : '回到起点 · 松手收杆';
});
on(board, 'pointerup', (e) => {
  if (!gesture || e.pointerId !== gesture.id) return;
  const shot = aim;
  cancelAim();
  if (shot?.power > 0.025) {
    snapshot();
    shoot(game, shot.dx, shot.dy, shot.power);
    updateHud();
  }
});
on(board, 'pointercancel', cancelAim);
on(board, 'lostpointercapture', cancelAim);
on(window, 'keydown', (e) => {
  if (e.key === 'Escape') {
    if (gesture) cancelAim();
    else if (screen === 'play') pause();
    else if (screen === 'pause-screen') show('play');
  }
});
on(window, 'blur', () => {
  cancelAim();
  pause();
});
on(document, 'visibilitychange', () => {
  if (document.hidden) {
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
  if (screen === 'home') drawHome(homeGame);
  if (screen === 'levels') renderLevels();
});

function frame(now) {
  const dt = previousTime ? Math.min((now - previousTime) / 1000, 0.05) : 0;
  previousTime = now;
  time += dt;
  if (screen === 'play') {
    if (game.phase === 'moving') {
      accumulator += dt;
      while (accumulator >= STEP && game.phase === 'moving') {
        step(game);
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
    for (let i = effects.length - 1; i >= 0; i--) {
      effects[i].life -= dt * 2;
      if (effects[i].life <= 0) effects.splice(i, 1);
    }
    toastLife = Math.max(0, toastLife - dt);
    $('pocket-toast').style.opacity = Math.min(1, toastLife);
    if (game.phase === 'ready' && game.turn === 1) {
      aiDelay += dt;
      if (aiDelay > 0.85) {
        const shot = chooseShot(game);
        placeStriker(game, shot.x);
        snapshot();
        shoot(game, shot.dx, shot.dy, shot.power);
        aiDelay = 0;
      }
    } else aiDelay = 0;
    updateHud();
    draw(game, { aim, effects, time, alpha: game.phase === 'moving' ? accumulator / STEP : 1 });
    if (game.phase === 'over' && !effects.length) finish();
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
    snapshot: () => structuredClone({ screen, practice, game, save }),
    previewShot: () => chooseShot(game),
  };
}
on(window, 'pagehide', (event) => {
  snapshot();
  cancelAim();
  audio.suspend();
  if (!event.persisted) {
    cancelAnimationFrame(raf);
    cleanups.forEach((fn) => fn?.());
    audio.close();
    delete window.__carrom;
  }
});
show('home');
raf = requestAnimationFrame(frame);

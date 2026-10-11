import { createH5Publishing } from './publishing.js';
import { LEVELS } from './levels.mjs';
import { createGame, step, rotate, brake, resumeCheckpoint, getLanding } from './engine.mjs';
import { TowerRenderer, drawRadar } from './render.mjs';
import { readProgress, saveProgress, recordWin } from './progress.mjs';

const $ = (id) => document.getElementById(id);
let storage;
try {
  storage = window.localStorage;
} catch {
  /* Storage is optional. */
}
const progress = readProgress(storage, LEVELS);
const renderer = new TowerRenderer($('scene'));
const screens = [
  'home',
  'play-screen',
  'levels-screen',
  'pause-screen',
  'result-screen',
  'help-screen',
  'settings-screen',
];
let screen = 'home';
let selected = progress.selected;
let game = createGame(LEVELS[selected]);
let demo = createGame(LEVELS[selected]);
let practice = false;
let challenge = false;
const incoming = new URL(location.href).searchParams;
const targetValue = Number(incoming.get('targetScore'));
const targetScore = incoming.has('targetScore') && Number.isInteger(targetValue) && targetValue >= 0 && targetValue <= 20000 ? targetValue : null;
const challengeIndex = incoming.get('challenge') === 'tower-v1' ? LEVELS.findIndex((level) => level.id === incoming.get('level')) : -1;
const publishing = createH5Publishing({ gameId: 'tower-brake', title: '转塔留一脚刹车', adMode: globalThis.SmallGamesPublishingConfig?.adMode ?? 'mock', provider: globalThis.SmallGamesPublishingConfig?.provider, publicUrl: globalThis.SmallGamesPublishingConfig?.publicUrl, pause: () => { pause(); return () => {}; } });
let previousTime = 0;
let frameId;
let feedbackUntil = 0;
let dragged = 0;
let drag = null;
let audio;
let resultSaved = false;
let lastUiKey = '';
const keys = new Set();
const listeners = new AbortController();
const listen = (el, event, fn, options = {}) =>
  el.addEventListener(event, fn, { ...options, signal: listeners.signal });
// Some touch browsers suppress the compatibility click immediately after a drag.
// Activate on touch release and suppress its later click; keyboard/mouse still use click.
function action(element, fn) {
  element.addEventListener('pointerup', (event) => {
    if (event.pointerType !== 'touch' || element.disabled) return;
    event.preventDefault();
    lastTouchActionAt = now();
    fn(event);
  });
  element.addEventListener('click', (event) => {
    if (event.detail === 0 || now() - lastTouchActionAt > 700) fn(event);
  });
}
const on = (id, fn) => action($(id), fn);
let lastTouchActionAt = -Infinity;
// A compatibility click may target a newly opened overlay, not the original button.
// Reset on the next real contact so a deliberate close is never swallowed.
listen(document, 'pointerdown', (event) => {
  if (event.pointerType === 'touch') lastTouchActionAt = -Infinity;
}, { capture: true });
listen(document, 'click', (event) => {
  if (event.isTrusted && event.detail > 0 && now() - lastTouchActionAt <= 700 && !event.target.closest('[data-game-fullscreen]')) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, { capture: true });
const pad = (value) => String(value).padStart(2, '0');
const now = () => performance.now();

function save() {
  if (!saveProgress(storage, progress)) {
    $('storage-notice').hidden = false;
    setTimeout(() => {
      $('storage-notice').hidden = true;
    }, 3500);
  }
}

function sound(kind) {
  if (!progress.sound) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') void audio.resume();
    const frequencies = {
      bounce: 210,
      pass: 460 + Math.min(game.streak, 8) * 65,
      brake: 700,
      recharge: 1050,
      lost: 100,
      won: 880,
      click: 350,
    };
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = kind === 'lost' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(frequencies[kind] || 400, audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      (frequencies[kind] || 400) * (kind === 'lost' ? 0.3 : 0.75),
      audio.currentTime + 0.15,
    );
    gain.gain.setValueAtTime(0.045, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.19);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.2);
  } catch {
    /* Browsers may not provide audio. */
  }
}

function clearInput() {
  drag = null;
  keys.clear();
}
function show(name) {
  clearInput();
  screen = name;
  $('app').dataset.screen = name;
  for (const id of screens) $(id).hidden = id !== name;
  $('play-screen').dataset.phase =
    name === 'play-screen' ? 'playing' : name === 'pause-screen' ? 'paused' : name;
  previousTime = 0;
  if (name === 'home') updateHome();
  if (name === 'levels-screen') updateLevels();
  if (name === 'settings-screen') updateSettings();
  $('feedback').classList.remove('visible');
  $('share-status').textContent = '';
}

function updateHome() {
  if (practice || challenge) {
    challenge = false;
    selected = progress.selected;
    practice = false;
  }
  const level = LEVELS[selected];
  $('home-route').textContent = `${pad(selected + 1)} / ${level.name}`;
  $('unlocked-count').textContent = `${pad(progress.unlocked)} / 08`;
  $('home').dataset.ready = 'true';
  demo = createGame(level);
}

function updateLevels() {
  const grid = $('level-grid');
  grid.replaceChildren();
  LEVELS.forEach((level, index) => {
    const button = document.createElement('button');
    button.className = `level-card${index === selected ? ' selected' : ''}`;
    button.dataset.level = String(index);
    button.disabled = index >= progress.unlocked;
    const best = progress.best[level.id];
    const continued = progress.continuedBest[level.id];
    button.innerHTML = `<i class="mini-ring" aria-hidden="true"></i><span class="level-num">${pad(index + 1)}</span><span class="level-mark" aria-hidden="true">${button.disabled ? '−' : best || continued ? '✓' : '·'}</span><span class="level-name"></span><span class="level-best"></span>`;
    button.querySelector('.level-name').textContent = level.name;
    button.querySelector('.level-best').textContent = button.disabled
      ? '完成前一路线解锁'
      : best
        ? `最佳 ${best.elapsed.toFixed(1)}s · 无续关`
        : continued
          ? `续关 ${continued.elapsed.toFixed(1)}s`
          : '12 层 · 等你下落';
    button.setAttribute(
      'aria-label',
      `路线 ${index + 1} ${level.name}${button.disabled ? '，尚未解锁' : ''}`,
    );
    action(button, () => start(index));
    grid.append(button);
  });
  $('levels-progress').textContent = `已解锁 ${progress.unlocked} / 8 · 完成一条，开启下一条`;
}

function updateSettings() {
  $('sound-toggle').setAttribute('aria-pressed', String(progress.sound));
  $('sound-toggle').querySelector('strong').textContent = progress.sound ? '开启' : '关闭';
  document
    .querySelectorAll('[data-skin]')
    .forEach((button) =>
      button.setAttribute('aria-pressed', String(button.dataset.skin === progress.skin)),
    );
}

function start(index = selected, isPractice = false, isChallenge = false) {
  if (!LEVELS[index] || (!isPractice && !isChallenge && index >= progress.unlocked)) return;
  selected = index;
  practice = isPractice;
  challenge = isChallenge;
  if (!practice && !challenge) {
    progress.selected = index;
    save();
  }
  game = createGame(LEVELS[index]);
  resultSaved = false;
  dragged = 0;
  $('gesture-hint').style.opacity = '1';
  $('gesture-hint').innerHTML = '<span aria-hidden="true">↔</span> 左右滑动，转出缺口';
  $('level-label').textContent =
    `${pad(index + 1)} / ${LEVELS[index].name}${practice ? ' · 试玩' : challenge ? ' · 好友挑战' : ''}`;
  show('play-screen');
  lastUiKey = '';
  updateGameUI();
  sound('click');
}

function toast(message, duration = 1600) {
  $('feedback').textContent = message;
  $('feedback').classList.add('visible');
  feedbackUntil = now() + duration;
}

function useBrake() {
  if (screen !== 'play-screen' || game.status !== 'playing') return;
  if (brake(game)) {
    sound('brake');
    toast('刹住了。现在转出缺口。', 800);
    updateGameUI();
  }
}

function pause() {
  if (screen !== 'play-screen' || game.status !== 'playing') return;
  show('pause-screen');
  if (audio?.state === 'running') void audio.suspend();
}

function updateGameUI() {
  const landing = getLanding(game);
  const following = getLanding(game, 1);
  const current = Math.min(12, game.nextLayer + 1);
  const key = [
    current,
    game.streak,
    game.charge,
    Math.ceil(game.brakeLeft * 10),
    landing?.type,
    following?.type,
    game.rotation.toFixed(3),
  ].join('|');
  if (key === lastUiKey) return;
  lastUiKey = key;
  $('floor-count').textContent = pad(current);
  $('floor-fill').style.width = `${(game.nextLayer / 12) * 100}%`;
  $('combo-count').textContent = String(game.streak);
  const pips = game.streak > 0 && game.streak % 3 === 0 ? 3 : game.streak % 3;
  [...$('combo-pips').children].forEach((el, index) => el.classList.toggle('filled', index < pips));
  $('brake-button').dataset.charges = String(game.charge);
  $('brake-button').disabled = !game.charge || game.brakeLeft > 0;
  $('brake-button').classList.toggle('active', game.brakeLeft > 0);
  $('brake-label').textContent =
    game.brakeLeft > 0 ? `${game.brakeLeft.toFixed(1)}s` : game.charge ? '刹车' : '充能中';
  $('brake-note').textContent =
    game.brakeLeft > 0
      ? '球已冻结 · 塔可转动'
      : game.charge
        ? '0.8 秒 · 点击使用'
        : `再连穿 ${3 - (game.streak % 3)} 层`;
  $('charge-hint').textContent = game.continued
    ? '续关挑战 · 成绩单独记录'
    : practice
      ? '开发试玩 · 不记录成绩'
      : `${game.score} 分 · 连穿倍率 ×${Math.max(1, Math.min(5, game.streak))}`;
  $('landing-label').textContent = `第 ${landing?.number ?? 12} 层落点`;
  const names = {
    normal: '普通区 · 会弹起',
    gap: '缺口 · 可穿过',
    danger: '危险区 · 快转开',
    finish: '终点 · 安全落地',
  };
  $('landing-type').textContent = names[landing?.type] || '终点';
  $('following-type').textContent = following
    ? `再下一层：${{ normal: '平台', gap: '缺口', danger: '危险区', finish: '终点' }[following.type]}`
    : '';
  $('landing-type').closest('.landing-preview').className =
    `landing-preview ${landing?.type || ''}`;
  $('play-screen').dataset.angle = game.rotation.toFixed(4);
  $('play-screen').dataset.layer = String(current);
  $('play-screen').dataset.streak = String(game.streak);
  drawRadar($('radar'), landing, game.rotation, progress.skin);
}

function finish() {
  if (resultSaved) return;
  resultSaved = true;
  const won = game.status === 'won';
  const bucket = game.continued ? progress.continuedBest : progress.best;
  const previousBest = bucket[LEVELS[selected].id]?.elapsed;
  if (won && !practice && !challenge) {
    recordWin(progress, selected, LEVELS[selected].id, game, { practice });
    save();
  }
  sound(won ? 'won' : 'lost');
  $('result-kicker').textContent = won ? 'THE LAST FLOOR IS YOURS' : 'ONE MORE DROP';
  $('result-number').innerHTML =
    `${pad(won ? 12 : Math.min(12, game.nextLayer + 1))}<span>/ 12</span>`;
  $('result-number').style.color = won ? 'var(--mint)' : '#fbab8d';
  $('result-title').textContent = won ? '稳稳落地。' : '差一点，就过去了。';
  $('result-copy').textContent = won
    ? selected === 7
      ? '八条路线全部完成。再试一次，留下更好的成绩。'
      : '这一次，你掌握了下落的节奏。'
    : `第 ${game.nextLayer + 1} 层碰到了危险区。${game.charge ? '下次试试先刹住，再转塔。' : '看准落点，普通平台也能给你喘息。'}`;
  $('result-streak').textContent = String(game.maxStreak);
  $('result-time').innerHTML = `${game.elapsed.toFixed(1)}<small>s</small>`;
  $('result-brakes').textContent = String(game.brakesUsed);
  $('record-note').textContent = challenge
    ? `好友自报目标 ${targetScore ?? "—"} 分 · ${targetScore === null ? "同路线体验" : game.score >= targetScore ? "已达成！" : `还差 ${targetScore - game.score} 分`} · 不改变进度`
    : practice
    ? '开发试玩 · 不记录成绩与解锁'
    : game.continued
      ? '续关成绩 · 与无续关挑战分开记录'
      : won
        ? previousBest === undefined || game.elapsed < previousBest
          ? '新的最佳时间 · 无续关完成'
          : '无续关完成 · 最佳时间已保留'
        : '重来不会消耗任何次数';
  $('next-game').hidden = !won || selected === LEVELS.length - 1 || practice || challenge;
  $('share-game').hidden = practice;
  $('result-score').textContent = `${game.score} 分 · 连穿越久，单层分数越高`;
  $('share-status').textContent = '';
  $('retry-game').className =
    won && selected < LEVELS.length - 1 && !practice ? 'secondary' : 'primary';
  $('continue-game').hidden = won || game.continued || practice;
  show('result-screen');
}

on('start-game', () => start());
on('choose-level', () => show('levels-screen'));
on('levels-home', () => show('home'));
on('help-button', () => show('help-screen'));
on('help-home', () => show('home'));
on('help-start', () => start());
on('settings-button', () => show('settings-screen'));
on('settings-home', () => show('home'));
on('pause-button', pause);
on('resume-game', () => {
  show('play-screen');
  if (audio?.state === 'suspended') void audio.resume();
});
on('restart-game', () => start(selected, practice, challenge));
on('pause-home', () => show('home'));
on('retry-game', () => start(selected, practice, challenge));
on('next-game', async () => { const target = selected + 1, attempt = game; $('next-game').disabled = true; await publishing.interstitial({ placement: 'route-complete', naturalBreak: true }); $('next-game').disabled = false; if (screen === 'result-screen' && game === attempt && !document.hidden) start(target); });
on('result-home', () => show('home'));
on('challenge-game', () => start(challengeIndex, false, true));
on('share-game', async () => {
  const outcome = await publishing.share({ text: `我在${LEVELS[selected].name}获得 ${game.score} 分，最高连穿 ${game.maxStreak} 层${game.continued ? '（续关）' : ''}。来挑战同一条路线！`, params: { challenge: 'tower-v1', level: LEVELS[selected].id, targetScore: game.score } });
  $('share-status').textContent = outcome.status === 'copied' ? '挑战链接已复制，发给好友即可玩同一路线' : outcome.status === 'shared' ? '已打开系统分享' : outcome.status === 'cancelled' ? '已取消分享' : '暂时无法分享，请稍后重试';
});
on('continue-game', () => {
  if (resumeCheckpoint(game)) {
    resultSaved = false;
    lastUiKey = '';
    show('play-screen');
    updateGameUI();
    toast('回到最近平台 · 续关成绩单独记录');
  }
});
on('sound-toggle', () => {
  progress.sound = !progress.sound;
  save();
  updateSettings();
  sound('click');
});
document.querySelectorAll('[data-skin]').forEach((el) =>
  action(el, () => {
    progress.skin = el.dataset.skin;
    save();
    updateSettings();
    lastUiKey = '';
  }),
);

// Separate touch IDs let one thumb rotate while the other taps the brake.
listen($('brake-button'), 'pointerdown', (event) => {
  event.preventDefault();
  event.stopPropagation();
  useBrake();
});
on('brake-button', (event) => {
  if (event.detail === 0) useBrake();
});
listen($('app'), 'pointerdown', (event) => {
  if (screen !== 'play-screen' || event.target.closest('button') || drag) return;
  event.preventDefault();
  drag = { id: event.pointerId, x: event.clientX };
  $('app').setPointerCapture(event.pointerId);
});
listen($('app'), 'pointermove', (event) => {
  if (!drag || event.pointerId !== drag.id || screen !== 'play-screen') return;
  const delta = event.clientX - drag.x;
  drag.x = event.clientX;
  rotate(game, (-delta / Math.max(280, $('app').clientWidth)) * Math.PI * 1.7);
  dragged += Math.abs(delta);
  if (dragged > 45) $('gesture-hint').style.opacity = '0';
  updateGameUI();
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
  listen($('app'), type, (event) => {
    if (drag?.id === event.pointerId) drag = null;
  });
listen(window, 'keydown', (event) => {
  if (event.code === 'Escape') {
    if (screen === 'play-screen') pause();
    else if (screen === 'pause-screen') show('play-screen');
    return;
  }
  if (screen !== 'play-screen' || (event.target.closest('button') && event.code === 'Space'))
    return;
  if (['ArrowLeft', 'ArrowRight', 'Space', 'KeyA', 'KeyD'].includes(event.code))
    event.preventDefault();
  if (event.code === 'Space' && !event.repeat) useBrake();
  keys.add(event.code);
});
listen(window, 'keyup', (event) => keys.delete(event.code));
listen(window, 'blur', () => {
  clearInput();
  pause();
});
listen(document, 'visibilitychange', () => {
  if (document.hidden) pause();
  previousTime = 0;
});
listen(window, 'resize', () => renderer.resize());
listen(document, 'game-displaychange', () => renderer.resize());

function frame(time) {
  const dt = previousTime ? Math.min((time - previousTime) / 1000, 0.1) : 0;
  previousTime = time;
  if (screen === 'play-screen') {
    const direction =
      (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) -
      (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
    if (direction) {
      rotate(game, -direction * dt * 2.7);
      $('gesture-hint').style.opacity = '0';
    }
    step(game, dt);
    for (const event of game.events.splice(0)) {
      if (event.type === 'bounce' || event.type === 'land') sound('bounce');
      if (event.type === 'pass') {
        sound('pass');
        if (event.streak > 0 && event.streak % 3 === 0) toast(`${event.streak} 层连落 · +${event.points} 分`);
      }
      if (event.type === 'charge') {
        sound('recharge');
        toast(`${game.streak} 层连落 · 刹车已补充`);
      }
    }
    updateGameUI();
    if (game.status === 'lost' || game.status === 'won') finish();
  }
  if (time > feedbackUntil) $('feedback').classList.remove('visible');
  if (screen === 'home' || screen === 'settings-screen') {
    renderer.draw(demo, { mode: 'home', time, skin: progress.skin });
  } else if (screen === 'play-screen' || screen === 'pause-screen' || screen === 'result-screen') {
    renderer.draw(game, { mode: 'play', time, skin: progress.skin });
  }
  frameId = requestAnimationFrame(frame);
}

const cleanups = [];
if (window.SmallGamesDev?.isEnabled()) {
  cleanups.push(
    window.SmallGamesDev.registerActions(
      LEVELS.map((level, index) => ({
        id: `route-${index + 1}`,
        label: `试玩 ${index + 1} · ${level.name}`,
        run: () => start(index, true),
      })),
    ),
  );
  cleanups.push(
    window.SmallGamesDev.registerSnapshot(() => ({
      screen,
      route: selected + 1,
      layer: game.nextLayer + 1,
      streak: game.streak,
      charge: game.charge,
      brakeLeft: game.brakeLeft,
      rotation: game.rotation,
      y: game.y,
      v: game.v,
      practice,
    })),
  );
  // Enabled explicitly, so browser rule replays never expose debug controls to players.
  window.__towerBrake = {
    start: (index) => start(index, true),
    snapshot: () => ({ ...game, screen, practice }),
    getState: () => game,
    rotate: (delta) => rotate(game, delta),
    brake: useBrake,
    pause,
  };
}
listen(window, 'pagehide', (event) => {
  pause();
  cancelAnimationFrame(frameId);
  if (!event.persisted) {
    publishing.dispose();
    listeners.abort();
    cleanups.forEach((cleanup) => cleanup?.());
    renderer.dispose();
    if (audio) void audio.close();
    delete window.__towerBrake;
  }
});
listen(window, 'pageshow', (event) => {
  if (event.persisted) {
    previousTime = 0;
    frameId = requestAnimationFrame(frame);
  }
});
$('challenge-game').hidden = challengeIndex < 0;
if (challengeIndex >= 0) $('challenge-game').textContent = `好友挑战 · ${LEVELS[challengeIndex].name}${targetScore === null ? "" : ` · 自报 ${targetScore} 分`}`;
updateHome();
updateSettings();
frameId = requestAnimationFrame(frame);

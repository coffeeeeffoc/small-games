import {
  WIDTH,
  HEIGHT,
  FIELD,
  LEVELS,
  UPGRADES,
  createGame,
  fire,
  step,
  recall,
  applyUpgrade,
  previewAim,
} from './core.mjs';
import { createRenderer } from './render.mjs';
import { createStorage } from './storage.mjs';
import { createAudio } from './audio.mjs';

const $ = (id) => document.getElementById(id);
const canvas = $('arena');
const renderer = createRenderer(canvas);
const homeRenderer = createRenderer($('home-arena'));
const storage = createStorage(LEVELS);
const audio = createAudio();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let progress = storage.load();
let game = null;
let phase = 'home';
let pausedFrom = 'playing';
let pointerId = null;
let aim = null;
let shots = 0;
let outcomeProcessed = false;
let last = performance.now();
let frameId;
let toastTimer;
let comboUntil = 0;
let disposed = false;
const screens = {
  home: 'home',
  levels: 'levels',
  playing: 'playing',
  paused: 'paused',
  help: 'help-screen',
  upgrade: 'upgrade',
  result: 'result',
};
const listeners = [];
let pressedControl = null;
let lastTouchActionAt = -Infinity;
let lastTouchControl = null;
function fitArena() {
  const box = canvas.parentElement.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return;
  const scale = Math.min(box.width / WIDTH, box.height / HEIGHT);
  canvas.style.width = `${WIDTH * scale}px`;
  canvas.style.height = `${HEIGHT * scale}px`;
  renderer.resize();
}
function listen(target, name, callback, options) {
  target.addEventListener(name, callback, options);
  listeners.push(() => target.removeEventListener(name, callback, options));
}
// Touch controls consume the native pointer gesture directly. Some Android
// browsers omit the compatibility click after a captured Canvas drag.
listen($('app'), 'pointerdown', (event) => {
  if (event.pointerType !== 'touch' || !event.isPrimary) return;
  const button = event.target.closest('button');
  pressedControl =
    button && !button.disabled && typeof button.onclick === 'function'
      ? { button, id: event.pointerId, x: event.clientX, y: event.clientY }
      : null;
});
listen($('app'), 'pointerup', (event) => {
  if (event.pointerId !== pressedControl?.id) return;
  const { button, x, y } = pressedControl;
  pressedControl = null;
  const hit = document.elementFromPoint(event.clientX, event.clientY);
  if (
    button.disabled ||
    !hit ||
    !button.contains(hit) ||
    Math.hypot(event.clientX - x, event.clientY - y) > 14
  )
    return;
  lastTouchActionAt = performance.now();
  lastTouchControl = button;
  button.onclick.call(button, event);
});
listen($('app'), 'pointercancel', () => {
  pressedControl = null;
});
listen(
  document,
  'click',
  (event) => {
    // Keyboard/assistive clicks have detail=0; mouse clicks remain unchanged.
    if (
      event.detail > 0 &&
      event.target.closest('button') === lastTouchControl &&
      event.pointerType !== 'mouse' &&
      performance.now() - lastTouchActionAt < 650
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true,
);
function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => {
    $('toast').hidden = true;
  }, 2600);
}
function cancelAim() {
  pressedControl = null;
  const id = pointerId;
  pointerId = null;
  aim = null;
  if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
}
function show(next) {
  cancelAim();
  phase = next;
  document.body.dataset.phase = next;
  for (const [key, id] of Object.entries(screens)) $(id).hidden = key !== next;
  last = performance.now();
  if (next === 'home') syncHome();
  if (next === 'levels') syncLevels();
  if (next === 'playing') fitArena();
  if (next === 'home') homeRenderer.resize();
}
function syncSettings() {
  audio.setEnabled(progress.sound);
  audio.setHaptics(progress.haptics);
  $('sound').setAttribute('aria-pressed', String(progress.sound));
  $('sound').setAttribute('aria-label', progress.sound ? '关闭音效' : '开启音效');
  $('sound').querySelector('.sound-waves').style.opacity = progress.sound ? '1' : '.2';
  $('pause-sound').textContent = `音效：${progress.sound ? '开' : '关'}`;
  $('pause-sound').setAttribute('aria-pressed', String(progress.sound));
  $('haptics').textContent = `震动：${progress.haptics ? '开' : '关'}`;
  $('haptics').setAttribute('aria-pressed', String(progress.haptics));
}
function syncHome() {
  const index = Math.max(
    0,
    LEVELS.findIndex((level) => level.id === progress.lastLevel),
  );
  $('home-number').textContent = String(index + 1).padStart(2, '0');
  $('home-progress').textContent = `余烬之路 · ${LEVELS[index].title}`;
  $('start').firstChild.textContent = progress.completed[progress.lastLevel]
    ? '再次弹射 '
    : '开始弹射 ';
}
function syncLevels() {
  const grid = $('level-grid');
  grid.replaceChildren();
  $('level-progress').textContent =
    `余烬之路 · ${Object.keys(progress.completed).length} / ${LEVELS.length} 已点亮`;
  LEVELS.forEach((level, index) => {
    const unlocked = progress.unlocked.includes(level.id);
    const completed = progress.completed[level.id];
    const tile = document.createElement('button');
    tile.className = `level-tile${unlocked ? '' : ' locked'}${completed ? ' cleared' : ''}${progress.lastLevel === level.id ? ' current' : ''}`;
    tile.dataset.level = level.id;
    tile.disabled = !unlocked;
    tile.setAttribute(
      'aria-label',
      `${index + 1} ${level.title}${unlocked ? (completed ? `，${completed.stars}星` : '，已解锁') : '，尚未解锁'}`,
    );
    const number = document.createElement('span');
    number.className = 'level-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const title = document.createElement('span');
    title.className = 'level-title';
    title.textContent = level.title;
    const marker = document.createElement('span');
    marker.className = unlocked ? 'level-stars' : 'lock';
    marker.setAttribute('aria-hidden', 'true');
    marker.textContent = completed
      ? '★'.repeat(completed.stars) + '☆'.repeat(3 - completed.stars)
      : unlocked
        ? '· · ·'
        : '';
    tile.append(number, title, marker);
    tile.onclick = () => startLevel(level.id);
    grid.append(tile);
  });
}
function startLevel(id = progress.lastLevel, practice = false) {
  if (!practice && !progress.unlocked.includes(id)) return;
  void audio.unlock();
  game = createGame(id, { practice });
  shots = 0;
  outcomeProcessed = false;
  comboUntil = 0;
  renderer.reset();
  if (!practice) {
    progress.lastLevel = id;
    progress = storage.save(progress);
  }
  $('practice-label').hidden = !practice;
  const index = LEVELS.findIndex((level) => level.id === id);
  $('level-name').textContent = `${String(index + 1).padStart(2, '0')} ${game.level.title}`;
  show('playing');
  syncPlay();
}
function syncPlay() {
  if (!game) return;
  $('turn-label').textContent = `第 ${game.turn} 轮`;
  $('score').textContent = String(game.score);
  $('ball-count').textContent = `× ${game.ballCount}`;
  $('wave-label').textContent = `余烬 ${game.destroyed} / ${game.totalTargets}`;
  $('recall').disabled = game.phase !== 'flight' || game.recalled;
  $('aim-hint').textContent =
    game.phase === 'flight'
      ? game.recalled
        ? '弹珠正在返回'
        : '连击中 · 等待弹珠返回'
      : pointerId !== null
        ? '松手发射'
        : '拖动瞄准 · 松手发射';
  const visible = game.combo >= 4 && performance.now() < comboUntil && phase === 'playing';
  $('combo').classList.toggle('visible', visible);
  if (visible) $('combo').textContent = `${game.combo} 连击`;
}
function pause() {
  if (!game || (phase !== 'playing' && phase !== 'upgrade')) return;
  pausedFrom = phase;
  $('pause-level').textContent = `${game.level.title} · 第 ${game.turn} 轮`;
  audio.suspend();
  show('paused');
}
function resume() {
  if (!game || phase !== 'paused') return;
  void audio.unlock();
  show(pausedFrom);
  syncPlay();
}
function home() {
  audio.suspend();
  show('home');
}
function syncUpgrade() {
  const choices = $('upgrade-choices');
  choices.replaceChildren();
  const icons = { extra: '✦', power: '↗', blast: '◎' };
  for (const upgrade of UPGRADES) {
    const button = document.createElement('button');
    button.className = 'upgrade-choice';
    button.dataset.upgrade = upgrade.id;
    const icon = document.createElement('span');
    icon.className = 'upgrade-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = icons[upgrade.id];
    const text = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = upgrade.title;
    const description = document.createElement('small');
    description.textContent = upgrade.description;
    text.append(title, description);
    button.append(icon, text);
    button.onclick = () => {
      void audio.unlock();
      if (!applyUpgrade(game, upgrade.id)) return;
      consumeEvents();
      show('playing');
      syncPlay();
      toast(upgrade.title);
    };
    choices.append(button);
  }
  show('upgrade');
}
function result() {
  if (outcomeProcessed) return;
  outcomeProcessed = true;
  const won = game.phase === 'won';
  const index = LEVELS.findIndex((level) => level.id === game.levelId);
  const next = LEVELS[index + 1];
  if (won)
    progress = storage.complete(game.levelId, {
      score: game.score,
      turns: game.completedTurns,
      practice: game.practice,
    });
  $('result').dataset.outcome = game.phase;
  $('result-eyebrow').textContent = won ? 'NIGHT ALIGHT' : 'ONE MORE SPARK';
  $('result-emblem').textContent = won ? '◇' : '◌';
  $('result-title').textContent = won ? '这片夜色，亮了。' : '余烬越过了边界';
  $('result-description').textContent = game.practice
    ? '试玩结束，成绩与解锁不计入存档'
    : won
      ? next
        ? `${next.title}，已为你点亮`
        : '你已点亮整条余烬之路'
      : '目标碰到了顶部警戒线，试着先清除上排。';
  const stars = won ? (game.completedTurns <= 6 ? 3 : game.completedTurns <= 9 ? 2 : 1) : 0;
  $('result-stars').textContent = won ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '';
  $('result-stars').setAttribute('aria-label', `${stars}星`);
  $('result-score').textContent = String(game.score);
  $('result-turns').textContent = String(game.completedTurns);
  $('next').hidden = !won || !next || game.practice;
  $('next').onclick = () => next && startLevel(next.id);
  show('result');
}
function consumeEvents() {
  if (!game || !game.events.length) return;
  const events = game.events.splice(0);
  renderer.consume(events);
  for (const event of events) {
    const tone = {
      fire: 'fire',
      collision: 'hit',
      break: 'break',
      pickup: 'pickup',
      win: 'win',
      loss: 'loss',
      upgrade: 'upgrade',
    }[event.type];
    if (tone) audio.play(tone, game.combo);
    if (event.type === 'collision') comboUntil = performance.now() + 950;
    if (event.type === 'pickup') toast(`弹珠 +${event.value} · 下一轮加入`);
    if (event.type === 'timeout') toast('已收回弹珠，继续下一轮');
  }
}
function point(event) {
  const box = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - box.left) * WIDTH) / box.width,
    y: ((event.clientY - box.top) * HEIGHT) / box.height,
  };
}
function updateAim(event) {
  const target = point(event);
  aim = { dx: target.x - game.launch.x, dy: Math.max(28, target.y - FIELD.launchY) };
}
listen(canvas, 'pointerdown', (event) => {
  if (phase !== 'playing' || game?.phase !== 'aim' || pointerId !== null || event.button !== 0)
    return;
  event.preventDefault();
  void audio.unlock();
  pointerId = event.pointerId;
  canvas.setPointerCapture(pointerId);
  updateAim(event);
  syncPlay();
});
listen(canvas, 'pointermove', (event) => {
  if (event.pointerId !== pointerId || phase !== 'playing') return;
  event.preventDefault();
  updateAim(event);
});
listen(canvas, 'pointerup', (event) => {
  if (event.pointerId !== pointerId) return;
  updateAim(event);
  const vector = aim;
  cancelAim();
  if (phase === 'playing' && vector && fire(game, vector.dx, vector.dy)) {
    shots += 1;
    consumeEvents();
  }
  syncPlay();
});
listen(canvas, 'pointercancel', (event) => {
  if (event.pointerId === pointerId) {
    cancelAim();
    syncPlay();
  }
});
listen(canvas, 'lostpointercapture', (event) => {
  if (event.pointerId === pointerId) {
    cancelAim();
    syncPlay();
  }
});
$('start').onclick = () => startLevel();
$('levels-button').onclick = () => show('levels');
$('levels-back').onclick = home;
$('help').onclick = () => show('help');
$('help-back').onclick = home;
$('pause').onclick = pause;
$('resume').onclick = resume;
$('back-home').onclick = home;
$('result-home').onclick = home;
$('retry').onclick = () => startLevel(game.levelId, game.practice);
$('recall').onclick = () => {
  if (recall(game)) {
    consumeEvents();
    syncPlay();
  }
};
function toggleSound() {
  progress = storage.settings({ sound: !progress.sound });
  syncSettings();
  if (progress.sound) {
    void audio.unlock();
    audio.play('pickup');
  }
}
$('sound').onclick = toggleSound;
$('pause-sound').onclick = toggleSound;
$('haptics').onclick = () => {
  progress = storage.settings({ haptics: !progress.haptics });
  syncSettings();
  void audio.unlock();
};
listen(document, 'keydown', (event) => {
  if (event.key === 'Escape') {
    if (phase === 'playing' || phase === 'upgrade') pause();
    else if (phase === 'paused') resume();
    else if (phase === 'levels' || phase === 'help') home();
  }
});
listen(window, 'blur', () => {
  pressedControl = null;
  pause();
});
listen(document, 'visibilitychange', () => {
  if (document.hidden) {
    pause();
    cancelAim();
    audio.suspend();
  }
  last = performance.now();
});
listen(window, 'resize', () => {
  fitArena();
  homeRenderer.resize();
});
listen(document, 'game-displaychange', () => {
  fitArena();
  homeRenderer.resize();
});
const resizeObserver = new ResizeObserver(fitArena);
resizeObserver.observe(canvas.parentElement);
function readSnapshot() {
  return {
    phase,
    corePhase: game?.phase ?? null,
    aiming: pointerId !== null,
    levelId: game?.levelId ?? progress.lastLevel,
    turn: game?.turn ?? 0,
    completedTurns: game?.completedTurns ?? 0,
    shots,
    score: game?.score ?? 0,
    ballCount: game?.ballCount ?? 0,
    destroyed: game?.destroyed ?? 0,
    practice: game?.practice ?? false,
    targets: game?.targets.map(({ id, x, y, hp, kind }) => ({ id, x, y, hp, kind })) ?? [],
    progress: { unlocked: [...progress.unlocked], completed: structuredClone(progress.completed) },
  };
}
// Read-only inspection also supports the Shell's real-input acceptance checks.
canvas.getEmberSnapshot = readSnapshot;
let cleanupActions = () => {};
let cleanupSnapshot = () => {};
if (window.SmallGamesDev?.isEnabled()) {
  window.__emberBounce = { snapshot: readSnapshot };
  cleanupSnapshot = window.SmallGamesDev.registerSnapshot(readSnapshot);
  cleanupActions = window.SmallGamesDev.registerActions([
    ...LEVELS.map((level, index) => ({
      id: `practice-${level.id}`,
      label: `试玩 ${index + 1} · ${level.title}`,
      run: () => startLevel(level.id, true),
    })),
    {
      id: 'recall',
      label: '回收当前弹珠',
      run: () => {
        if (game) recall(game);
      },
    },
  ]);
}
function animate(now) {
  if (disposed) return;
  const dt = Math.max(0, Math.min((now - last) / 1000, 1 / 30));
  last = now;
  if (!document.hidden) {
    if (phase === 'home')
      homeRenderer.render(null, {
        time: now / 1000,
        dt,
        home: true,
        reducedMotion: reducedMotion.matches,
      });
    if (phase === 'playing' && game) {
      step(game, dt);
      consumeEvents();
      renderer.render(game, {
        time: now / 1000,
        dt,
        aim: aim ? previewAim(game, aim.dx, aim.dy) : [],
        aiming: pointerId !== null,
        reducedMotion: reducedMotion.matches,
      });
      syncPlay();
      if (game.phase === 'upgrade') syncUpgrade();
      if (game.phase === 'won' || game.phase === 'lost') result();
    }
  }
  frameId = requestAnimationFrame(animate);
}
listen(window, 'pagehide', (event) => {
  pause();
  audio.suspend();
  if (event.persisted) return;
  disposed = true;
  cancelAnimationFrame(frameId);
  clearTimeout(toastTimer);
  cleanupActions();
  cleanupSnapshot();
  delete window.__emberBounce;
  renderer.dispose();
  homeRenderer.dispose();
  resizeObserver.disconnect();
  audio.dispose();
  listeners.splice(0).forEach((cleanup) => cleanup());
});
listen(window, 'pageshow', () => {
  last = performance.now();
});
syncSettings();
show('home');
frameId = requestAnimationFrame(animate);

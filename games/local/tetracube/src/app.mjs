import { Game } from './engine.mjs';
import { Renderer, drawMini } from './render.mjs';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const AXES = ['X', 'Y', 'Z'];
const SAVE = 'tetracube.save.v1';
const BEST = 'tetracube.best.v1';
const SETTINGS = 'tetracube.settings.v1';
const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};
const remove = (key) => {
  try {
    localStorage.removeItem(key);
  } catch {
    /* Local play remains available. */
  }
};
let game = new Game();
let phase = 'home';
let best = Math.max(0, Number(read(BEST, 0)) || 0);
let saved = read(SAVE, null);
let settings = read(SETTINGS, {});
if (!settings || typeof settings !== 'object') settings = {};
let rescueUsed = false,
  debugRun = false,
  runStarted = false,
  tutorialStep = 0,
  helpOrigin = 'home',
  gravityOrigin = 'playing';
let elapsed = 0,
  lastTime = 0,
  raf = 0,
  toastTimer,
  flashTimer;
let animations = [],
  animation = null;
let audioContext;
let drag = null;
const held = new Map();
const renderer = new Renderer($('#game-canvas'));
const homeRenderer = new Renderer($('#home-canvas'));
const homeBoard = [];
for (let z = 0; z < 4; z++)
  for (let x = 0; x < 4; x++)
    for (let y = 0; y < 4; y++) {
      if ((x * 3 + y * 2 + z) % 5 < 2 && z < 4 - Math.abs(x - 2))
        homeBoard.push({
          x,
          y,
          z,
          color: ['#5bbbd3', '#78e6ce', '#93add3', '#d4b781'][(x + y + z) % 4],
        });
    }
const homeActive = [
  [1, 1, 7],
  [2, 1, 7],
  [2, 2, 7],
  [2, 2, 8],
].map(([x, y, z]) => ({ x, y, z, color: '#86f9df' }));

function feedback(text) {
  clearTimeout(toastTimer);
  $('#toast').textContent = text;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => {
    $('#toast').hidden = true;
  }, 2100);
}

function sound(kind = 'move') {
  if (!settings.sound) return;
  try {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    void audioContext.resume().catch(() => {});
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const t = audioContext.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(
      { move: 280, rotate: 380, drop: 140, clear: 620, gravity: 220 }[kind] || 300,
      t,
    );
    oscillator.frequency.exponentialRampToValueAtTime(kind === 'clear' ? 1120 : 90, t + 0.16);
    gain.gain.setValueAtTime(0.055, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(t);
    oscillator.stop(t + 0.2);
  } catch {
    /* Audio is optional. */
  }
}

function stopInput() {
  for (const item of held.values()) {
    clearTimeout(item.timer);
    clearInterval(item.repeat);
  }
  held.clear();
  if (drag) {
    try {
      $('#game-canvas').releasePointerCapture(drag.id);
    } catch {}
  }
  drag = null;
}

function show(next) {
  stopInput();
  phase = next;
  document.body.dataset.phase = next;
  $$('.screen').forEach((node) => {
    node.hidden = node.id !== ({ playing: 'play', paused: 'pause', over: 'result' }[next] || next);
  });
  elapsed = 0;
  if (next === 'home') updateHome();
  if (next !== 'playing') persist();
  if (next === 'playing') updateHUD();
}

function persist() {
  if (!runStarted || game.status === 'over' || debugRun) return;
  if (game.placed || phase !== 'home') {
    saved = { version: 1, game: game.getSnapshot(), rescueUsed, tutorialStep };
    write(SAVE, saved);
  }
}

function updateHome() {
  $('#home-best').textContent = String(best).padStart(6, '0');
  $('#continue-game').hidden = !saved;
  updateSound();
}

function updateSound() {
  $$('.sound-toggle').forEach((button) => {
    button.textContent = settings.sound ? '音效 开' : '音效 关';
    button.setAttribute('aria-label', settings.sound ? '关闭音效' : '开启音效');
    button.setAttribute('aria-pressed', String(!!settings.sound));
  });
}

function freeAxes() {
  return [0, 1, 2].filter((axis) => axis !== game.gravity.axis);
}
function updateHUD() {
  $('#score').textContent = String(game.score).padStart(6, '0');
  $('#lines').textContent = String(game.lines).padStart(2, '0');
  $('#occupancy').textContent = `${game.board.length} / 250`;
  $('#gravity-badge').textContent =
    `重力 ${AXES[game.gravity.axis]}${game.gravity.sign < 0 ? '−' : '+'}`;
  const [a, b] = freeAxes();
  for (const button of $$('[data-move]')) {
    const direction = button.dataset.move;
    const axis = ['left', 'right'].includes(direction) ? a : b;
    const positive = ['up', 'right'].includes(direction);
    button.querySelector('small').textContent = `${AXES[axis]}${positive ? '+' : '−'}`;
    button.setAttribute('aria-label', `向 ${AXES[axis]} ${positive ? '正' : '负'}方向移动`);
  }
  const next = game.next[0];
  if (next) drawMini($('#next-canvas'), next.cells, next.color);
  const tutorial = [
    '用左下方向区移动，虚线就是落点。',
    '点击 XY、XZ 或 YZ，试着旋转方块。',
    '点击「直接落下」，将方块放到虚线处。',
    '局面拥挤时，试试「重力翻转」。',
  ];
  $('#tutorial').hidden = !!settings.tutorialDone || tutorialStep >= tutorial.length;
  $('#tutorial-text').textContent = tutorial[tutorialStep] || '';
}

function advanceTutorial(action) {
  if (['move', 'rotate', 'drop', 'gravity'][tutorialStep] === action) tutorialStep++;
  if (tutorialStep === 4) {
    settings.tutorialDone = true;
    write(SETTINGS, settings);
  }
}

function finish() {
  animations = [];
  animation = null;
  game.end();
  if (!debugRun) {
    if (game.score > best) {
      best = game.score;
      write(BEST, best);
    }
    saved = null;
    remove(SAVE);
  }
  $('#final-score').textContent = String(game.score);
  $('#final-lines').textContent = String(game.lines);
  $('#final-combo').textContent = `×${game.bestCombo}`;
  show('over');
}

function settle() {
  updateHUD();
  if (!debugRun && game.score > best) {
    best = game.score;
    write(BEST, best);
  }
  persist();
  if (game.status === 'danger') {
    if (rescueUsed) finish();
    else show('danger');
  }
}

function consumeEvents() {
  const events = game.drainEvents();
  const drop = events.find((e) => e.type === 'drop');
  for (const event of events) {
    if (event.type === 'lock' && drop) {
      const starts = new Map(event.added.map((cell, i) => [cell.id, drop.from[i]]));
      animations.push({
        ...event,
        type: 'compact',
        before: event.after.map((cell) => {
          const p = starts.get(cell.id);
          return p ? { ...cell, x: p[0], y: p[1], z: p[2] } : cell;
        }),
        duration: 160,
      });
    } else if (event.type === 'compact' || event.type === 'clear') {
      animations.push({ ...event, duration: event.type === 'clear' ? 340 : 480 });
    } else if (event.type === 'gravity') {
      animations.push({ ...event, after: event.before, duration: 150 });
    }
  }
  if (!animations.length) settle();
  else updateHUD();
}

function command(action, ...args) {
  if (phase !== 'playing' || animation || animations.length) return false;
  const ok = game[action](...args);
  if (!ok) {
    if (action === 'rotate') feedback('这里放不下，先移动一点');
    return false;
  }
  const kind = { move: 'move', rotate: 'rotate', hardDrop: 'drop', changeGravity: 'gravity' }[
    action
  ];
  if (kind) {
    sound(kind);
    advanceTutorial(kind);
  }
  if (action === 'hardDrop') elapsed = 0;
  consumeEvents();
  return true;
}

function move(direction) {
  const [a, b] = freeAxes();
  command(
    'move',
    ['left', 'right'].includes(direction) ? a : b,
    ['right', 'up'].includes(direction) ? 1 : -1,
  );
}

function start({ debug = false } = {}) {
  game = new Game();
  game.drainEvents();
  rescueUsed = false;
  debugRun = debug;
  runStarted = true;
  animations = [];
  animation = null;
  tutorialStep = settings.tutorialDone ? 4 : 0;
  renderer.setView('iso');
  updateViews('iso');
  show('playing');
  persist();
}

function openGravity(origin = 'playing') {
  if (animation || animations.length) {
    feedback('等待方块压实后再改变重力');
    return;
  }
  gravityOrigin = origin;
  $$('[data-gravity]').forEach((button) => {
    const [axis, sign] = button.dataset.gravity.split(',').map(Number);
    const selected = axis === game.gravity.axis && sign === game.gravity.sign;
    button.disabled = selected;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  $('#gravity-cancel').textContent = origin === 'danger' ? '返回空间干预' : '返回对局';
  show('gravity');
}

function updateViews(view) {
  $$('[data-view]').forEach((button) =>
    button.setAttribute('aria-pressed', String(button.dataset.view === view)),
  );
}

$('#start-game').addEventListener('click', start);
$('#retry-game').addEventListener('click', start);
$('#continue-game').addEventListener('click', () => {
  try {
    game = new Game().restore(saved.game);
    rescueUsed = !!saved.rescueUsed;
    tutorialStep = Number(saved.tutorialStep) || 0;
    debugRun = false;
    runStarted = true;
    animations = [];
    animation = null;
    show('playing');
    settle();
  } catch {
    saved = null;
    remove(SAVE);
    updateHome();
    feedback('存档无法读取，可以开始新的一局');
  }
});
$('#pause-game').addEventListener('click', () => show('paused'));
$('#resume-game').addEventListener('click', () => show('playing'));
$('#home-game').addEventListener('click', () => {
  persist();
  show('home');
});
$('#result-home').addEventListener('click', () => show('home'));
for (const origin of ['home', 'pause'])
  $(`#help-${origin}`).addEventListener('click', () => {
    helpOrigin = phase;
    show('help');
  });
$('#help-back').addEventListener('click', () => show(helpOrigin));
$('#hard-drop').addEventListener('click', () => command('hardDrop'));
$('#gravity-open').addEventListener('click', () => openGravity());
$('#gravity-cancel').addEventListener('click', () => show(gravityOrigin));
$('#rescue-game').addEventListener('click', () => openGravity('danger'));
$('#end-game').addEventListener('click', finish);
$('#skip-tutorial').addEventListener('click', () => {
  settings.tutorialDone = true;
  write(SETTINGS, settings);
  updateHUD();
});
$$('.sound-toggle').forEach((button) =>
  button.addEventListener('click', () => {
    settings.sound = !settings.sound;
    write(SETTINGS, settings);
    updateSound();
    sound();
  }),
);
$$('[data-rotate]').forEach((button) =>
  button.addEventListener('click', () => command('rotate', button.dataset.rotate)),
);
$$('[data-gravity]').forEach((button) =>
  button.addEventListener('click', () => {
    const [axis, sign] = button.dataset.gravity.split(',').map(Number);
    if (gravityOrigin === 'danger') rescueUsed = true;
    show('playing');
    command('changeGravity', axis, sign);
  }),
);
$$('[data-view]').forEach((button) =>
  button.addEventListener('click', () => {
    renderer.setView(button.dataset.view);
    updateViews(button.dataset.view);
  }),
);

$$('[data-move]').forEach((button) => {
  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    move(button.dataset.move);
    const item = {};
    item.timer = setTimeout(() => {
      item.repeat = setInterval(() => move(button.dataset.move), 130);
    }, 300);
    held.set(event.pointerId, item);
  });
  const release = (event) => {
    const item = held.get(event.pointerId);
    if (item) {
      clearTimeout(item.timer);
      clearInterval(item.repeat);
      held.delete(event.pointerId);
    }
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
    button.addEventListener(type, release);
  button.addEventListener('click', (event) => {
    if (event.detail === 0) move(button.dataset.move);
  });
});

const canvas = $('#game-canvas');
canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || drag || phase !== 'playing') return;
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (!drag || drag.id !== event.pointerId) return;
  renderer.orbit(event.clientX - drag.x, event.clientY - drag.y);
  drag.x = event.clientX;
  drag.y = event.clientY;
  updateViews('');
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
  canvas.addEventListener(type, (event) => {
    if (drag?.id === event.pointerId) drag = null;
  });

function keydown(event) {
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.target.closest('input,textarea,select')
  )
    return;
  const key = event.key.toLowerCase();
  if (key === 'p' || key === 'escape') {
    if (phase === 'playing') show('paused');
    else if (phase === 'paused') show('playing');
    else if (phase === 'gravity') show(gravityOrigin);
    event.preventDefault();
    return;
  }
  if (phase !== 'playing') return;
  const direction = {
    arrowup: 'up',
    w: 'up',
    arrowdown: 'down',
    s: 'down',
    arrowleft: 'left',
    a: 'left',
    arrowright: 'right',
    d: 'right',
  }[key];
  if (direction) {
    event.preventDefault();
    move(direction);
  } else if (['q', 'e', 'r', ' ', 'g'].includes(key)) {
    event.preventDefault();
    if (event.repeat) return;
    if (key === ' ') command('hardDrop');
    else if (key === 'g') openGravity();
    else command('rotate', { q: 'XY', e: 'XZ', r: 'YZ' }[key]);
  }
}
window.addEventListener('keydown', keydown);
function autoPause() {
  stopInput();
  if (phase === 'playing') show('paused');
  persist();
}
window.addEventListener('blur', autoPause);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    autoPause();
    void audioContext?.suspend();
  }
  lastTime = 0;
});

function animatedBoard(dt) {
  if (!animation && animations.length) {
    animation = { ...animations.shift(), elapsed: 0 };
    if (animation.type === 'clear') {
      sound('clear');
      $('#combo-flash').textContent =
        animation.combo > 1 ? `COMBO ×${animation.combo}` : '整层消除';
      $('#combo-flash').classList.add('visible');
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => $('#combo-flash').classList.remove('visible'), 900);
    }
  }
  if (!animation) return game.board;
  animation.elapsed += dt;
  const t = Math.min(1, animation.elapsed / animation.duration);
  const eased = 1 - Math.pow(1 - t, 3);
  let board = animation.after;
  if (animation.type === 'compact') {
    const start = new Map(animation.before.map((cell) => [cell.id, cell]));
    board = animation.after.map((cell) => {
      const from = start.get(cell.id) || cell;
      return {
        ...cell,
        x: from.x + (cell.x - from.x) * eased,
        y: from.y + (cell.y - from.y) * eased,
        z: from.z + (cell.z - from.z) * eased,
      };
    });
  } else if (animation.type === 'clear') {
    board = animation.before.map((cell) =>
      animation.removed.some((removed) => removed.id === cell.id)
        ? { ...cell, color: t < 0.45 ? '#e3fff4' : '#437e79', opacity: 1 - t }
        : cell,
    );
  }
  if (t >= 1) {
    animation = null;
    if (!animations.length) settle();
  }
  return board;
}

function frame(now) {
  const dt = lastTime ? Math.min(now - lastTime, 80) : 0;
  lastTime = now;
  if (phase === 'home') {
    homeRenderer.camera.yaw = 0.65 + Math.sin(now / 6500) * 0.25;
    homeRenderer.draw({
      board: homeBoard,
      active: homeActive,
      ghost: [],
      gravity: { axis: 2, sign: -1 },
      dims: [5, 5, 10],
      time: now,
    });
  } else if (phase === 'playing') {
    if (!animation && !animations.length) {
      elapsed += dt;
      if (elapsed >= game.fallInterval) {
        elapsed = 0;
        command('tick');
      }
    }
    const board = animatedBoard(dt);
    const busy = !!animation || animations.length > 0;
    const color = game.active?.color || '#78f4d3';
    renderer.draw({
      board,
      active: busy ? [] : game.cells().map(([x, y, z]) => ({ x, y, z, color })),
      ghost: busy ? [] : game.ghost().map(([x, y, z]) => ({ x, y, z, color })),
      gravity: game.gravity,
      dims: game.dims,
      time: now,
    });
    $('#stage-hint').textContent = busy ? '空间重构中…' : '拖动画面 · 转动视角';
    $('#hard-drop').disabled = busy;
  }
  raf = requestAnimationFrame(frame);
}

window.tetracubeSnapshot = () => ({
  phase,
  game: game.getSnapshot(),
  camera: { ...renderer.camera },
  rescueUsed,
  debugRun,
  animating: !!animation || !!animations.length,
  input: { held: held.size, dragging: !!drag },
});
const dev = window.SmallGamesDev;
let cleanActions = () => {},
  cleanSnapshot = () => {};
if (dev?.isEnabled()) {
  cleanSnapshot = dev.registerSnapshot(() => window.tetracubeSnapshot());
  cleanActions = dev.registerActions([
    {
      id: 'cascade',
      label: '连锁测试局面（不计纪录）',
      run: () => {
        start({ debug: true });
        game.board = [];
        game.serial = 0;
        for (let x = 0; x < 5; x++)
          for (let y = 0; y < 5; y++)
            for (let layer = 0; layer < 2; layer++)
              game.board.push({
                id: ++game.serial,
                x,
                y,
                z: ((x + y) % 4) + layer * 4,
                color: ['#7cf0bf', '#92b5ff'][layer],
              });
        game.gravity = { axis: 0, sign: -1 };
        game.active = null;
        game.spawn();
        game.drainEvents();
        updateHUD();
        feedback('选择 Z− 重力，观察连续消层');
      },
    },
    {
      id: 'danger',
      label: '危险状态（不计纪录）',
      run: () => {
        start({ debug: true });
        game.board = [];
        game.serial = 0;
        for (let x = 0; x < 5; x++)
          for (let y = 0; y < 5; y++)
            game.board.push({ id: ++game.serial, x, y, z: 9, color: '#ffae7a' });
        const piece = game.active;
        game.active = null;
        game.spawn(piece);
        game.drainEvents();
        settle();
      },
    },
  ]);
}

if (saved) {
  try {
    if (saved.version !== 1) throw new Error();
    new Game().restore(saved.game);
  } catch {
    saved = null;
    remove(SAVE);
  }
}
updateHome();
$('#app').dataset.ready = 'true';
raf = requestAnimationFrame(frame);
window.addEventListener('pagehide', (event) => {
  autoPause();
  cancelAnimationFrame(raf);
  clearTimeout(toastTimer);
  clearTimeout(flashTimer);
  if (event.persisted) return;
  cleanActions();
  cleanSnapshot();
  renderer.dispose();
  homeRenderer.dispose();
  void audioContext?.close();
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    lastTime = 0;
    raf = requestAnimationFrame(frame);
  }
});

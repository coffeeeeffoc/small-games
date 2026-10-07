import { Game } from './engine.mjs';
import { Renderer, drawMini } from './render.mjs';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
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
  helpOrigin = 'home';
let elapsed = 0,
  lastTime = 0,
  raf = 0,
  toastTimer,
  flashTimer;
let animations = [],
  animation = null;
let audioContext;
let drag = null;
let pieceMotion = null;
let orbitVelocity = [0, 0];
const touchPointers = new Set();
let inputMode = 'move';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
      { move: 280, rotate: 380, drop: 140, clear: 620, flip: 220 }[kind] || 300,
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
  orbitVelocity = [0, 0];
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

function updateHUD() {
  $('#score').textContent = String(game.score).padStart(6, '0');
  $('#lines').textContent = String(game.lines).padStart(2, '0');
  $('#occupancy').textContent = `${game.board.length} / ${game.dims.reduce((n, d) => n * d, 1)}`;
  $('#gravity-badge').textContent = game.dims.join(' × ');
  const next = game.next[0];
  if (next) drawMini($('#next-canvas'), next.cells, next.color);
  const tutorial = [
    '在画面中拖动方块，虚线就是落点。',
    '点击 XY、XZ 或 YZ，试着旋转方块。',
    '点击「直接落下」，将方块放到虚线处。',
    '点击「颠倒容器」，让所有方块重新下落。',
  ];
  $('#tutorial').hidden = !!settings.tutorialDone || tutorialStep >= tutorial.length;
  $('#tutorial-text').textContent = tutorial[tutorialStep] || '';
}

function advanceTutorial(action) {
  if (['move', 'rotate', 'drop', 'flip'][tutorialStep] === action) tutorialStep++;
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
    } else if (event.type === 'flip') {
      animations.push({ ...event, duration: reducedMotion ? 180 : 720 });
    }
  }
  if (!animations.length) settle();
  else updateHUD();
}

function command(action, ...args) {
  if (phase !== 'playing' || animation || animations.length) return false;
  const now = performance.now();
  const from = visualPiece(now);
  const before = game.active ? structuredClone(game.active) : null;
  const placed = game.placed;
  const interrupted = !!pieceMotion;
  const ok = game[action](...args);
  if (!ok) {
    if (action === 'rotate') feedback('这个方向被挡住，试试反转或移开');
    return false;
  }
  if (
    ['move', 'rotate', 'tick'].includes(action) &&
    before &&
    game.active &&
    game.placed === placed &&
    from.length &&
    game.cells().some((cell, i) => cell.some((v, a) => v !== from[i]?.[a]))
  ) {
    pieceMotion = reducedMotion
      ? null
      : {
          from,
          to: game.cells(),
          started: now,
          duration: action === 'rotate' ? 120 : 75,
          turn:
            action === 'rotate' && !interrupted
              ? { before, plane: args[0], direction: args[1] ?? 1 }
              : null,
        };
  }
  if (game.placed !== placed) pieceMotion = null;
  if (action === 'rotate') elapsed = Math.min(elapsed, game.fallInterval * 0.4);
  const kind = { move: 'move', rotate: 'rotate', hardDrop: 'drop', flipContainer: 'flip' }[action];
  if (kind) {
    sound(kind);
    advanceTutorial(kind);
  }
  if (action === 'hardDrop' || action === 'flipContainer') {
    elapsed = 0;
    pieceMotion = null;
    stopInput();
  }
  consumeEvents();
  return true;
}

function visualPiece(now) {
  if (!pieceMotion) return game.cells();
  const t = Math.min(1, Math.max(0, (now - pieceMotion.started) / pieceMotion.duration));
  const eased = 1 - Math.pow(1 - t, 3);
  const { from, to, turn } = pieceMotion;
  let cells;
  if (turn) {
    const [a, b] = { XY: [0, 1], XZ: [0, 2], YZ: [1, 2] }[String(turn.plane).toUpperCase()];
    const angle = eased * (Math.PI / 2) * turn.direction;
    const kick = game.active.pos.map((v, axis) => v - turn.before.pos[axis]);
    cells = turn.before.cells.map((cell) => {
      const rotated = [...cell];
      rotated[a] = cell[a] * Math.cos(angle) + cell[b] * Math.sin(angle);
      rotated[b] = cell[b] * Math.cos(angle) - cell[a] * Math.sin(angle);
      return rotated.map((v, axis) => v + turn.before.pos[axis] + kick[axis] * eased);
    });
  } else {
    cells = to.map((cell, i) => cell.map((v, axis) => from[i][axis] + (v - from[i][axis]) * eased));
  }
  if (t >= 1) pieceMotion = null;
  return cells;
}

function move(direction) {
  const [a, b] = [0, 1];
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
  pieceMotion = null;
  tutorialStep = settings.tutorialDone ? 4 : 0;
  renderer.setView('iso');
  updateViews('iso');
  setInputMode('move');
  show('playing');
  persist();
}

function setInputMode(mode) {
  stopInput();
  inputMode = mode;
  $('#view-tools').hidden = mode !== 'observe';
  $$('[data-input]').forEach((button) =>
    button.setAttribute('aria-pressed', String(button.dataset.input === mode)),
  );
  $('#game-canvas').setAttribute(
    'aria-label',
    mode === 'observe' ? '观察模式，拖动转动视角' : '移动模式，拖动移动方块',
  );
}

function flip(turn = 'invert') {
  command('flipContainer', turn);
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
    pieceMotion = null;
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
$('#flip-container').addEventListener('click', () => flip());
$('#rescue-game').addEventListener('click', () => {
  rescueUsed = true;
  show('playing');
  flip();
});
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
  button.addEventListener('click', () => {
    const ok = command(
      'rotate',
      button.dataset.rotate,
      Number(button.dataset.rotateDirection) || 1,
    );
    button.classList.remove('rotation-success', 'rotation-blocked');
    void button.offsetWidth;
    button.classList.add(ok ? 'rotation-success' : 'rotation-blocked');
  }),
);
$$('[data-flip]').forEach((button) =>
  button.addEventListener('click', () => flip(button.dataset.flip)),
);
$$('[data-input]').forEach((button) =>
  button.addEventListener('click', () => setInputMode(button.dataset.input)),
);
$$('[data-view]').forEach((button) =>
  button.addEventListener('click', () => {
    stopInput();
    renderer.setView(button.dataset.view);
    updateViews(button.dataset.view);
  }),
);

const canvas = $('#game-canvas');
canvas.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'touch') {
    touchPointers.add(event.pointerId);
    if (touchPointers.size > 1) {
      stopInput();
      return;
    }
  }
  if (event.button !== 0 || drag || phase !== 'playing' || animation || animations.length) return;
  event.preventDefault();
  orbitVelocity = [0, 0];
  drag = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    time: event.timeStamp,
    remainder: [0, 0],
  };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (!drag || drag.id !== event.pointerId) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  drag.x = event.clientX;
  drag.y = event.clientY;
  if (inputMode === 'observe') {
    renderer.orbit(dx, dy);
    const interval = Math.max(12, event.timeStamp - drag.time);
    orbitVelocity = [dx, dy].map(
      (v, axis) => orbitVelocity[axis] * 0.4 + Math.max(-0.7, Math.min(0.7, v / interval)) * 0.6,
    );
    drag.time = event.timeStamp;
    updateViews('');
    return;
  }
  const cells = game.cells();
  const anchor = cells.length
    ? [0, 1, 2].map((axis) => cells.reduce((n, cell) => n + cell[axis] + 0.5, 0) / cells.length)
    : undefined;
  const delta = renderer.planeDelta(dx, dy, anchor);
  drag.remainder[0] += delta.x;
  drag.remainder[1] += delta.y;
  // Keep the grab relative to the finger; blocked movement is consumed, so reversing
  // at a wall responds immediately instead of unwinding an invisible backlog.
  for (const axis of [0, 1]) {
    const steps = Math.trunc(drag.remainder[axis]);
    drag.remainder[axis] -= steps;
    for (let i = 0; i < Math.min(Math.abs(steps), game.dims[axis]); i++)
      if (!command('move', axis, Math.sign(steps))) break;
  }
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
  canvas.addEventListener(type, (event) => {
    if (drag?.id === event.pointerId) {
      if (type !== 'pointerup' || inputMode !== 'observe' || event.timeStamp - drag.time > 80)
        orbitVelocity = [0, 0];
      drag = null;
      elapsed = 0;
    }
  });
for (const type of ['pointerup', 'pointercancel'])
  window.addEventListener(type, (event) => touchPointers.delete(event.pointerId), true);

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
    else if (key === 'g') flip();
    else command('rotate', { q: 'XY', e: 'XZ', r: 'YZ' }[key], event.shiftKey ? -1 : 1);
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
  if (!animation) return { board: game.board };
  animation.elapsed += dt;
  const t = Math.min(1, animation.elapsed / animation.duration);
  const eased = 1 - Math.pow(1 - t, 3);
  let board = animation.after;
  const geometry = {};
  if (animation.type === 'flip') {
    board = animation.before;
    geometry.dims = animation.beforeDims;
    geometry.orientation = animation.beforeOrientation;
    geometry.flip = { axis: animation.axis, angle: animation.angle * (t * t * (3 - 2 * t)) };
  } else if (animation.type === 'compact') {
    const start = new Map(animation.before.map((cell) => [cell.id, cell]));
    board = animation.after.map((cell) => {
      const from = start.get(cell.id) || cell;
      return {
        ...cell,
        x: from.x + (cell.x - from.x) * eased,
        y: from.y + (cell.y - from.y) * eased,
        z: from.z + (cell.z - from.z) * (t * t),
      };
    });
  } else if (animation.type === 'clear') {
    board = animation.before.map((cell) =>
      animation.removed.some((removed) => removed.id === cell.id)
        ? { ...cell, color: t < 0.35 ? '#e3fff4' : cell.color, scale: 1 - t }
        : cell,
    );
  }
  if (t >= 1) {
    animation = null;
    if (!animations.length) settle();
  }
  return { board, ...geometry };
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
      dims: [6, 6, 12],
      time: now,
    });
  } else if (phase === 'playing') {
    if (inputMode === 'observe' && !drag && !animation && !animations.length) {
      renderer.orbit(orbitVelocity[0] * dt, orbitVelocity[1] * dt);
      orbitVelocity = orbitVelocity.map((v) => (Math.abs(v) < 0.005 ? 0 : v * Math.exp(-dt / 95)));
    }
    if (!animation && !animations.length && !drag) {
      elapsed += dt;
      if (elapsed >= game.fallInterval) {
        elapsed = 0;
        command('tick');
      }
    }
    const wasBusy = !!animation || animations.length > 0;
    const visual = animatedBoard(dt);
    const busy = wasBusy || !!animation || animations.length > 0;
    const color = game.active?.color || '#78f4d3';
    renderer.draw({
      ...visual,
      active: busy ? [] : visualPiece(now).map(([x, y, z]) => ({ x, y, z, color })),
      ghost: busy ? [] : game.ghost().map(([x, y, z]) => ({ x, y, z, color })),
      gravity: game.gravity,
      dims: visual.dims || game.dims,
      orientation: visual.orientation || game.orientation,
      time: now,
    });
    $('#stage-hint').textContent = busy
      ? animation?.type === 'flip'
        ? '容器翻转中…'
        : '方块向下落定…'
      : inputMode === 'observe'
        ? '观察模式 · 拖动转视角'
        : `拖动方块 · 落点 ${renderer.layers.landing.join(' / ')}层`;
    $$('[data-rotate], [data-flip], #flip-container, #hard-drop').forEach((button) => {
      button.disabled = busy;
    });
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
  animationKind: animation?.type || animations[0]?.type || null,
  inputMode,
  input: { held: held.size, dragging: !!drag },
  projection: {
    mode: 'perspective',
    scale: renderer.scale,
    distance: renderer.distance,
    samples: [
      [1.5, 1.5, 0.5],
      [1.5, 1.5, 2.5],
    ].map((p) => renderer.project(p)),
  },
  layers: { ...renderer.layers },
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
        for (let x = 0; x < game.dims[0]; x++)
          for (let y = 0; y < game.dims[1]; y++)
            for (let layer = 0; layer < 2; layer++)
              game.board.push({
                id: ++game.serial,
                x,
                y,
                z: ((x + y) % 4) + layer * 4,
                color: ['#7cf0bf', '#92b5ff'][layer],
              });
        game.active = null;
        game.spawn();
        game.drainEvents();
        updateHUD();
        feedback('点击颠倒容器，观察下落与连续消层');
      },
    },
    {
      id: 'danger',
      label: '危险状态（不计纪录）',
      run: () => {
        start({ debug: true });
        game.board = [];
        game.serial = 0;
        for (let x = 0; x < game.dims[0]; x++)
          for (let y = 0; y < game.dims[1]; y++)
            game.board.push({ id: ++game.serial, x, y, z: game.dims[2] - 1, color: '#ffae7a' });
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

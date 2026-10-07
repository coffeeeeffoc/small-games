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
let motion = null,
  impact = null,
  particles = [],
  lastTrailCount = 0;
let audioContext;
let drag = null;
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
  if ($('#held-name')) $('#held-name').textContent = game.held?.name || '空';
  if ($('#hold-piece')) {
    $('#hold-piece').disabled = game.holdUsed || game.status !== 'playing';
    $('#hold-piece').setAttribute(
      'aria-label',
      `暂存交换方块，${game.held ? `已暂存${game.held.name}` : '暂存槽为空'}${game.holdUsed ? '，本块已使用' : ''}`,
    );
  }
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
  motion = impact = null;
  particles = [];
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

function motionCells() {
  if (!motion) return game.cells();
  const t = Math.min(1, motion.elapsed / motion.duration);
  const eased = 1 - Math.pow(1 - t, 3);
  if (motion.type === 'rotate' && motion.arc) {
    const [a, b] = { XY: [0, 1], XZ: [0, 2], YZ: [1, 2] }[motion.plane];
    const angle = (-Math.PI / 2) * eased;
    return motion.before.cells.map((cell) => {
      const p = [...cell];
      p[a] = cell[a] * Math.cos(angle) - cell[b] * Math.sin(angle);
      p[b] = cell[a] * Math.sin(angle) + cell[b] * Math.cos(angle);
      return p.map((v, axis) => v + motion.before.pos[axis] + motion.kick[axis] * eased);
    });
  }
  return motion.to.map((cell, i) =>
    cell.map((v, axis) => motion.from[i][axis] + (v - motion.from[i][axis]) * eased),
  );
}

function burst(cells, strength = 1, clear = false) {
  if (!cells?.length) return;
  const color = clear ? '#ffdc87' : cells[0].color || '#78f4d3';
  impact = { cells, color, strength, elapsed: 0, duration: reducedMotion ? 90 : 460 };
  if (reducedMotion) return;
  const count = Math.min(clear ? 72 : 24, cells.length * (clear ? 3 : 6));
  for (let i = 0; i < count; i++) {
    const cell = cells[i % cells.length];
    const angle = i * 2.39996;
    const speed = (1.2 + (i % 5) * 0.24) * strength;
    particles.push({
      x: cell.x + 0.5,
      y: cell.y + 0.5,
      z: cell.z + 0.4,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      vz: 1.8 + (i % 4) * 0.6,
      color,
      elapsed: 0,
      duration: 360 + (i % 5) * 65,
      size: clear ? 0.12 : 0.09,
    });
  }
  particles = particles.slice(-96);
  if (!clear) sound('drop');
}

function consumeEvents() {
  const events = game.drainEvents();
  const drop = events.find((e) => e.type === 'drop');
  const visualFrom = motion ? motionCells() : null;
  for (const event of events) {
    if (['move', 'rotate', 'fall'].includes(event.type)) {
      motion = {
        ...event,
        from: visualFrom || event.from,
        elapsed: 0,
        duration: reducedMotion
          ? 65
          : event.type === 'rotate'
            ? 210
            : event.type === 'fall'
              ? 180
              : 110,
        arc: event.type === 'rotate' && !visualFrom,
      };
    } else if (event.type === 'hold') {
      motion = null;
      elapsed = 0;
      stopInput();
    } else if (event.type === 'lock') {
      const from = visualFrom || (drop ? drop.from : event.from);
      const starts = new Map(event.added.map((cell, i) => [cell.id, from?.[i]]));
      animations.push({
        ...event,
        type: drop || visualFrom ? 'compact' : 'lock',
        role: drop ? 'drop' : 'land',
        landing: event.added,
        before: event.after.map((cell) => {
          const p = starts.get(cell.id);
          return p ? { ...cell, x: p[0], y: p[1], z: p[2] } : cell;
        }),
        duration: reducedMotion ? 80 : drop ? Math.min(420, 210 + drop.distance * 10) : 110,
      });
      motion = null;
    } else if (event.type === 'compact' || event.type === 'clear') {
      animations.push({
        ...event,
        duration: reducedMotion ? 90 : event.type === 'clear' ? 360 : 450,
      });
    } else if (event.type === 'flip') {
      if (visualFrom) {
        const ids = new Map(
          event.before.slice(-visualFrom.length).map((cell, i) => [cell.id, visualFrom[i]]),
        );
        animations.push({
          type: 'compact',
          role: 'align',
          duration: reducedMotion ? 40 : 90,
          before: event.before.map((cell) => {
            const p = ids.get(cell.id);
            return p ? { ...cell, x: p[0], y: p[1], z: p[2] } : cell;
          }),
          after: event.before,
          dims: event.beforeDims,
          orientation: event.beforeOrientation,
        });
      }
      animations.push({ ...event, duration: reducedMotion ? 90 : 720 });
      motion = null;
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
  const kind = {
    move: 'move',
    rotate: 'rotate',
    hardDrop: 'drop',
    flipContainer: 'flip',
    hold: 'hold',
  }[action];
  if (kind) {
    sound(kind === 'hold' ? 'rotate' : kind);
    advanceTutorial(kind);
  }
  if (action === 'hardDrop' || action === 'flipContainer') {
    elapsed = 0;
    stopInput();
  }
  consumeEvents();
  return true;
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
  motion = impact = null;
  particles = [];
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
    motion = impact = null;
    particles = [];
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
$('#hold-piece').addEventListener('click', () => command('hold'));
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
  button.addEventListener('click', () => command('rotate', button.dataset.rotate)),
);
$$('[data-flip]').forEach((button) =>
  button.addEventListener('click', () => flip(button.dataset.flip)),
);
$$('[data-input]').forEach((button) =>
  button.addEventListener('click', () => setInputMode(button.dataset.input)),
);
$$('[data-view]').forEach((button) =>
  button.addEventListener('click', () => {
    renderer.setView(button.dataset.view);
    updateViews(button.dataset.view);
  }),
);

const canvas = $('#game-canvas');
canvas.addEventListener('pointerdown', (event) => {
  if (drag && drag.id !== event.pointerId) {
    stopInput();
    return;
  }
  if (event.button !== 0 || drag || phase !== 'playing' || animation || animations.length) return;
  event.preventDefault();
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, remainder: [0, 0] };
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
    updateViews('');
    return;
  }
  const delta = renderer.planeDelta(dx, dy);
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
      drag = null;
      elapsed = 0;
    }
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
  } else if (['q', 'e', 'r', ' ', 'g', 'c'].includes(key)) {
    event.preventDefault();
    if (event.repeat) return;
    if (key === ' ') command('hardDrop');
    else if (key === 'g') flip();
    else if (key === 'c') command('hold');
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
      burst(animation.removed, Math.min(1.8, 1 + animation.combo * 0.2), true);
      $('#combo-flash').textContent =
        animation.combo > 1 ? `COMBO ×${animation.combo}` : '整层消除';
      $('#combo-flash').classList.add('visible');
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => $('#combo-flash').classList.remove('visible'), 900);
    } else if (animation.type === 'lock') {
      burst(animation.landing);
    }
  }
  if (!animation) return { board: game.board };
  animation.elapsed += dt;
  const t = Math.min(1, animation.elapsed / animation.duration);
  const eased = 1 - Math.pow(1 - t, 3);
  let board = animation.after;
  const geometry = { trail: [] };
  if (animation.role === 'align') {
    geometry.dims = animation.dims;
    geometry.orientation = animation.orientation;
  }
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
    if (!reducedMotion && animation.role === 'drop' && t < 0.94) {
      for (const cell of board) {
        const from = start.get(cell.id);
        if (!from || Math.abs(from.z - cell.z) < 0.2) continue;
        for (let i = 1; i <= 3; i++)
          geometry.trail.push({
            ...cell,
            z: Math.min(from.z, cell.z + i * 0.72),
            alpha: (0.18 - i * 0.035) * Math.sin(Math.PI * t),
          });
      }
    }
  } else if (animation.type === 'clear') {
    board = animation.before.map((cell) =>
      animation.removed.some((removed) => removed.id === cell.id)
        ? { ...cell, color: t < 0.35 ? '#e3fff4' : cell.color, scale: 1 - t }
        : cell,
    );
  }
  if (t >= 1) {
    if (animation.type === 'compact' && animation.role !== 'align') {
      const before = new Map(animation.before.map((cell) => [cell.id, cell]));
      const landed =
        animation.landing || animation.after.filter((cell) => before.get(cell.id)?.z !== cell.z);
      burst(landed, animation.role === 'drop' ? 1.2 : 0.8);
    }
    animation = null;
    if (!animations.length) settle();
  }
  return { board, ...geometry };
}

function animatedEffects(dt) {
  if (impact) {
    impact.elapsed += dt;
    if (impact.elapsed >= impact.duration) impact = null;
  }
  particles.forEach((p) => {
    p.elapsed += dt;
  });
  particles = particles.filter((p) => p.elapsed < p.duration);
  return {
    impact: impact ? { ...impact, t: impact.elapsed / impact.duration } : null,
    shake:
      impact && !reducedMotion
        ? 3.6 * impact.strength * Math.pow(1 - impact.elapsed / impact.duration, 3)
        : 0,
    particles: particles.map((p) => {
      const seconds = p.elapsed / 1000;
      return {
        ...p,
        x: p.x + p.vx * seconds,
        y: p.y + p.vy * seconds,
        z: p.z + p.vz * seconds - 4 * seconds * seconds,
        alpha: Math.pow(1 - p.elapsed / p.duration, 2),
      };
    }),
  };
}

function frame(now) {
  const dt = lastTime ? Math.min(now - lastTime, 80) : 0;
  lastTime = now;
  if (phase === 'home') {
    homeRenderer.camera.yaw = 0.65 + (reducedMotion ? 0 : Math.sin(now / 6500) * 0.25);
    homeRenderer.draw({
      board: homeBoard,
      active: homeActive,
      ghost: [],
      gravity: { axis: 2, sign: -1 },
      dims: [6, 6, 18],
      time: reducedMotion ? 0 : now,
    });
  } else if (phase === 'playing') {
    if (motion) {
      motion.elapsed += dt;
      if (motion.elapsed >= motion.duration) motion = null;
    }
    const effects = animatedEffects(dt);
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
    lastTrailCount = visual.trail?.length || 0;
    renderer.draw({
      ...visual,
      active: busy ? [] : motionCells().map(([x, y, z]) => ({ x, y, z, color })),
      ghost: busy ? [] : game.ghost().map(([x, y, z]) => ({ x, y, z, color })),
      gravity: game.gravity,
      dims: visual.dims || game.dims,
      orientation: visual.orientation || game.orientation,
      time: reducedMotion ? 0 : now,
      ...effects,
    });
    $('#stage-hint').textContent = busy
      ? animation?.type === 'flip'
        ? '容器翻转中…'
        : '方块向下落定…'
      : inputMode === 'observe'
        ? '观察模式 · 拖动转视角'
        : '拖动方块 · 虚线是落点';
    $$('[data-rotate], [data-flip], #flip-container, #hard-drop').forEach((button) => {
      button.disabled = busy;
    });
    $('#hold-piece').disabled = busy || game.holdUsed || game.status !== 'playing';
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
  animationRole: animation?.role || animations[0]?.role || null,
  motionKind: motion?.type || null,
  impact: !!impact,
  trails: lastTrailCount,
  reducedMotion,
  inputMode,
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

import { createGame } from './game.mjs';
import { saveKey } from './progress.mjs';
import { W, H } from './render.mjs';
const canvas = document.querySelector('#game'),
  stage = document.querySelector('#stage'),
  controls = document.querySelector('#controls'),
  status = document.querySelector('#status');
let saved;
try {
  saved = JSON.parse(localStorage.getItem(saveKey));
} catch {}
let listener = () => {},
  signature = '',
  last = performance.now(),
  frame;
const target = {
  canvas,
  onPointer(fn) {
    listener = fn;
    return () => {
      listener = () => {};
    };
  },
  createSound(src) {
    const a = new Audio(src);
    a.volume = 0.35;
    return {
      play() {
        a.currentTime = 0;
        void a.play().catch(() => {});
      },
      stop() {
        a.pause();
        a.currentTime = 0;
      },
      dispose() {
        a.pause();
        a.removeAttribute('src');
        a.load();
      },
    };
  },
};
const game = createGame(target, {
  save: saved,
  saveProgress(save) {
    if (window.SmallGamesDev?.isEnabled()) return;
    try {
      localStorage.setItem(saveKey, JSON.stringify(save));
    } catch {}
  },
  onRender(app) {
    document.body.dataset.phase = app.screen;
    canvas.dataset.turn = String(app.state?.turn ?? 0);
    canvas.dataset.shots = String(app.state?.shots ?? 0);
    canvas.dataset.active = String(app.state?.active ?? 0);
    const key = app.screen + app.buttons.map((b) => b.id + b.label).join('|');
    const box = stage.getBoundingClientRect(),
      s = Math.min(box.width / W, box.height / H),
      ox = (box.width - W * s) / 2,
      oy = (box.height - H * s) / 2;
    if (signature !== key) {
      signature = key;
      controls.replaceChildren(
        ...app.buttons.map((b) => {
          const el = document.createElement('button');
          el.id = b.id;
          el.textContent = b.label;
          el.setAttribute('aria-label', b.label);
          el.addEventListener('click', () => game.action(b.id));
          return el;
        }),
      );
      status.textContent =
        app.screen === 'playing'
          ? '按住蓝色圆盘，向后拉，松手弹出'
          : app.screen === 'result'
            ? '本局结束'
            : app.screen === 'matching'
              ? '准备人机对局'
              : '';
    }
    app.buttons.forEach((b) => {
      const el = document.getElementById(b.id);
      Object.assign(el.style, {
        left: ox + b.x * s + 'px',
        top: oy + b.y * s + 'px',
        width: b.w * s + 'px',
        height: b.h * s + 'px',
      });
    });
    document.querySelector('#fullscreen').hidden = !['home', 'paused'].includes(app.screen);
  },
});
function resize() {
  const b = stage.getBoundingClientRect(),
    dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(b.width * dpr);
  canvas.height = Math.round(b.height * dpr);
  game.render();
}
const observer = new ResizeObserver(resize);
observer.observe(stage);
resize();
function input(e) {
  if (e.type === 'pointerdown') {
    canvas.setPointerCapture(e.pointerId);
  }
  const box = canvas.getBoundingClientRect();
  listener({
    phase: {
      pointerdown: 'down',
      pointermove: 'move',
      pointerup: 'up',
      pointercancel: 'cancel',
      lostpointercapture: 'cancel',
    }[e.type],
    pointerId: e.pointerId,
    x: ((e.clientX - box.left) * canvas.width) / box.width,
    y: ((e.clientY - box.top) * canvas.height) / box.height,
  });
  e.preventDefault();
}
for (const type of [
  'pointerdown',
  'pointermove',
  'pointerup',
  'pointercancel',
  'lostpointercapture',
])
  canvas.addEventListener(type, input);
function lifecycle() {
  if (document.hidden) game.pause();
  else {
    last = performance.now();
    game.resume();
  }
}
function blur() {
  game.pause();
}
function focus() {
  last = performance.now();
  game.resume();
}
document.addEventListener('visibilitychange', lifecycle);
window.addEventListener('blur', blur);
window.addEventListener('focus', focus);
function loop(now) {
  game.tick((now - last) / 1000);
  last = now;
  frame = requestAnimationFrame(loop);
}
frame = requestAnimationFrame(loop);
const dev = window.SmallGamesDev;
let cleanActions, cleanSnapshot;
if (dev?.isEnabled()) {
  window.__flickArena = game;
  cleanActions = dev.registerActions([
    { id: 'practice', label: '试玩：初入江湖', run: () => game.debugStart(0) },
  ]);
  cleanSnapshot = dev.registerSnapshot(() => game.debug());
}
window.addEventListener(
  'pagehide',
  (e) => {
    if (e.persisted) {
      game.pause();
      return;
    }
    cancelAnimationFrame(frame);
    observer.disconnect();
    game.dispose();
    cleanActions?.();
    cleanSnapshot?.();
    document.removeEventListener('visibilitychange', lifecycle);
    window.removeEventListener('blur', blur);
    window.removeEventListener('focus', focus);
    for (const type of [
      'pointerdown',
      'pointermove',
      'pointerup',
      'pointercancel',
      'lostpointercapture',
    ])
      canvas.removeEventListener(type, input);
  },
  { once: false },
);
window.addEventListener('pageshow', (e) => {
  if (e.persisted) {
    last = performance.now();
    game.resume();
  }
});

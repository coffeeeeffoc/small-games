import { createH5Publishing } from '../publishing.js';
import { layouts } from './layouts.mjs';
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
const query = new URLSearchParams(location.search);
const requestedSeed = query.get('seed');
const requestedLayout = layouts.find((layout) => layout.id === query.get('layout'));
const targetShots = /^\d{1,3}$/.test(query.get('targetShots') || '') && Number(query.get('targetShots')) >= 1 && Number(query.get('targetShots')) <= 999 ? Number(query.get('targetShots')) : null;
const challenge = requestedLayout && /^\d{1,16}$/.test(requestedSeed || '') && Number.isSafeInteger(Number(requestedSeed)) ? { layout: requestedLayout.id, seed: Number(requestedSeed), targetShots } : null;
let publishingBusy = false;
const publishingConfig = globalThis.SmallGamesPublishingConfig ?? {};
const publishing = createH5Publishing({ gameId: 'flick-arena', title: '弹指擂台', adMode: publishingConfig.adMode ?? 'mock', provider: publishingConfig.provider, publicUrl: publishingConfig.publicUrl, pause() {
  const wasSuspended = game.isSuspended();
  game.pause(); return () => { last = performance.now(); if (!wasSuspended && !document.hidden) game.resume(); };
} });
async function action(id) {
  if (publishingBusy) return;
  if (game.app.screen === 'result' && ['again', 'rematch', 'home'].includes(id)) {
    publishingBusy = true;
    try { await publishing.interstitial({ placement: 'result-exit', naturalBreak: true }); }
    finally { publishingBusy = false; }
  }
  game.action(id);
}
const game = createGame(target, {
  challenge,
  async share(state) {
    const result = await publishing.share({ text: `弹指擂台：${state.winner === 0 ? '守擂成功' : '再战同一擂台'}，${state.turn} 回合，出手 ${state.playerShots} 次。相同摆位，看看你的走位！`, params: { seed: state.seed, layout: state.layout, targetShots: state.winner === 0 && state.playerShots > 0 ? Math.min(999, state.playerShots) : undefined } });
    return result.status === 'copied' ? '同擂台挑战链接已复制' : ['failed', 'unavailable'].includes(result.status) ? '分享暂不可用，可以继续切磋' : '';
  },
  save: saved,
  saveProgress(save) {
    if (window.SmallGamesDev?.isEnabled()) return;
    try {
      localStorage.setItem(saveKey, JSON.stringify(save));
    } catch {}
  },
  onRender(app) {
    document.body.dataset.phase = app.screen;
    canvas.dataset.seed = String(app.state?.seed ?? '');
    canvas.dataset.layout = app.state?.layout ?? '';
    canvas.dataset.targetShots = String(app.targetShots ?? '');
    canvas.dataset.turn = String(app.state?.turn ?? 0);
    canvas.dataset.shots = String(app.state?.shots ?? 0);
    canvas.dataset.active = String(app.state?.active ?? 0);
    canvas.dataset.playerShots = String(app.state?.playerShots ?? 0);
    canvas.dataset.radius = String(app.state?.radius ?? 0);
    canvas.dataset.physicsPhase = app.state?.phase ?? '';
    // Read-only visible positions support touch/accessibility checks without a developer API.
    canvas.dataset.discs = JSON.stringify(
      app.state?.discs.map(({ id, x, y, alive }) => ({ id, x, y, alive })) ?? [],
    );
    const key = app.screen + app.buttons.map((b) => b.id + b.label).join('|');
    const box = stage.getBoundingClientRect(),
      s = Math.min(box.width / W, box.height / H),
      ox = (box.width - W * s) / 2,
      oy = (box.height - H * s) / 2;
    if (signature !== key) {
      signature = key;
      if (window.parent !== window) {
        try {
          window.parent.postMessage(
            {
              type: 'small-games:display-state',
              gameId: 'flick-arena',
              screen: ['home', 'layouts', 'help'].includes(app.screen) ? 'home' : 'playing',
            },
            new URL(document.referrer).origin,
          );
        } catch {
          /* Missing referrer must not prevent local play. */
        }
      }
      controls.replaceChildren(
        ...app.buttons.map((b) => {
          const el = document.createElement('button');
          el.id = b.id;
          el.textContent = b.label;
          el.setAttribute('aria-label', b.label);
          el.addEventListener('click', () => { void action(b.id); });
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
        left: ox + (b.x + b.w / 2) * s - Math.max(44, b.w * s) / 2 + 'px',
        top: oy + (b.y + b.h / 2) * s - Math.max(44, b.h * s) / 2 + 'px',
        width: Math.max(44, b.w * s) + 'px',
        height: Math.max(44, b.h * s) + 'px',
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
    if (!publishingBusy) game.resume();
  }
}
function blur() {
  game.pause();
}
function focus() {
  last = performance.now();
  if (!publishingBusy) game.resume();
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
    publishing.dispose();
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
    if (!publishingBusy) game.resume();
  }
});

import { shareChallenge } from './publishing.js';
import { LEVELS } from './levels.mjs';
import { createState, toggleGate, previewGate, solve, isGateLocked } from './engine.mjs';
import { readProgress, saveProgress } from './progress.mjs';
import { unlockedThrough } from './layout.mjs';
import { createView } from './render.mjs';
const stage = document.querySelector('#stage'),
  canvas = document.querySelector('#GameCanvas');
const listeners = new AbortController(),
  signal = listeners.signal;
let storage;
try {
  storage = localStorage;
} catch {
  storage = null;
}
let progress = readProgress(storage, LEVELS);
let unlocked = unlockedThrough(progress, LEVELS);
const invitation = new URLSearchParams(location.search),
  invitedIndex = LEVELS.findIndex((l) => l.id === invitation.get('station'));
let challenge = invitedIndex >= 0,
  targetMoves =
    challenge && /^[1-9]\d?$/.test(invitation.get('target') || '')
      ? Number(invitation.get('target'))
      : null;
let levelIndex = challenge ? invitedIndex : progress.selected,
  chapter = Math.floor(levelIndex / 10),
  state = createState(LEVELS[levelIndex]);
let screen = 'home',
  returnScreen = 'home',
  history = [],
  prediction = false,
  selectedGate = null,
  preview = null,
  animating = false,
  extraClaimed = false,
  assisted = false,
  practice = false;
let message = '点一道阀门，让水位联动',
  shareStatus = '',
  displayed = [...state.volumes],
  animationFrom = [...state.volumes],
  animationTime = 0,
  time = 0;
let runId = 0;
let runtime,
  view,
  audioSource,
  disposed = false,
  activeTouch = null,
  lastTouch = -1000,
  pressed = null,
  clips = {},
  cleanups = [];
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const dev = Boolean(window.SmallGamesDev?.isEnabled());
function dimensions() {
  return { width: Math.round(stage.clientWidth), height: Math.round(stage.clientHeight) };
}
function model() {
  return {
    screen,
    returnScreen,
    progress,
    levelIndex,
    chapter,
    state,
    historyLength: history.length,
    prediction,
    selectedGate,
    preview,
    animating,
    extraClaimed,
    assisted,
    challenge,
    targetMoves,
    practice,
    dev,
    message,
    shareStatus,
    displayed,
    time,
  };
}
function persist() {
  if (!challenge && !practice) {
    progress.unlocked = unlocked;
    saveProgress(storage, progress);
  }
}
function announce(text) {
  message = text;
  document.querySelector('#announcement').textContent = text;
}
function emitDisplay() {
  if (parent === window) return;
  try {
    const origin = new URL(document.referrer).origin;
    if (origin !== 'null')
      parent.postMessage(
        {
          type: 'small-games:display-state',
          gameId: 'waterline-station',
          screen: screen === 'home' ? 'home' : 'playing',
        },
        origin,
      );
  } catch {}
}
function draw() {
  if (disposed) return;
  view?.render(model());
  emitDisplay();
}
function cancelInput() {
  activeTouch = null;
  pressed = null;
}
function show(next) {
  cancelInput();
  document.querySelector('#share-fallback').close();
  screen = next;
  draw();
}
function sound(kind) {
  if (!progress.sound || document.hidden || disposed || !audioSource || !clips[kind]) return;
  try {
    audioSource.playOneShot(clips[kind], 0.6);
  } catch {}
}
function clearChallenge() {
  challenge = false;
  targetMoves = null;
  const url = new URL(location.href);
  url.searchParams.delete('station');
  url.searchParams.delete('target');
  window.history.replaceState(null, '', url);
  progress = readProgress(storage, LEVELS);
  unlocked = unlockedThrough(progress, LEVELS);
}
function load(index, { trial = false } = {}) {
  runId++;
  cancelInput();
  levelIndex = index;
  chapter = Math.floor(index / 10);
  state = createState(LEVELS[index]);
  history = [];
  extraClaimed = false;
  assisted = false;
  practice = trial;
  prediction = false;
  selectedGate = null;
  preview = null;
  animating = false;
  animationTime = 0;
  displayed = [...state.volumes];
  shareStatus = '';
  message = index === 0 ? '点击 A—B 阀门，看看箱子和小船' : '点一道阀门，让水位联动';
  if (!challenge && !practice) {
    progress.selected = index;
    persist();
  }
  show('playing');
}
function gate(id) {
  if (screen !== 'playing' || animating || state.won || state.lost) return;
  const l = LEVELS[levelIndex];
  selectedGate = id;
  if (isGateLocked(l, state, id)) {
    const g = l.gates.find((g) => g.id === id);
    announce(`先点亮 ${[g.requires].flat().join('、')} 箱子机关`);
    sound('locked');
    draw();
    return;
  }
  if (prediction && preview?.gateId !== id) {
    assisted = true;
    preview = { ...previewGate(l, state, id), gateId: id };
    announce('白色虚线为预测水位，再点同一阀门确认');
    draw();
    return;
  }
  const next = toggleGate(l, state, id);
  if (next.moves === state.moves) return;
  history.push(structuredClone(state));
  animationFrom = [...displayed];
  state = next;
  preview = null;
  animating = true;
  animationTime = 0;
  announce(
    next.events.find((e) => e.type === 'switch')?.text ||
      next.events.find((e) => e.type === 'gate')?.text ||
      '水位联动中',
  );
  sound(next.won ? 'win' : 'valve');
  if (state.won && !challenge && !practice) {
    const prev = progress.best[l.id];
    if (!prev || state.moves < prev) progress.best[l.id] = state.moves;
    unlocked = Math.max(unlocked, Math.min(LEVELS.length - 1, levelIndex + 1));
    progress.selected = Math.min(LEVELS.length - 1, levelIndex + 1);
    persist();
  }
  draw();
}
function undo() {
  if (!history.length) return;
  assisted = true;
  state = history.pop();
  if (extraClaimed) state.bonusMoves = 1;
  state.lost = !state.won && state.moves >= LEVELS[levelIndex].maxMoves + (state.bonusMoves || 0);
  displayed = [...state.volumes];
  preview = null;
  animating = false;
  prediction = false;
  if (!challenge && !practice) {
    progress.selected = levelIndex;
    persist();
  }
  announce('已撤销，水量与机关回到上一步');
  show('playing');
}
function pause() {
  cancelInput();
  if (screen === 'playing') {
    audioSource?.stop();
    show('paused');
  }
}
async function share() {
  const session = runId;
  const result = await shareChallenge({
    title: '水位联动站 · 同关挑战',
    text: `第 ${levelIndex + 1} 站，${assisted || practice ? '一起解开联动水位' : `我用了 ${state.moves} 次操作`}。`,
    params: {
      station: LEVELS[levelIndex].id,
      ...(!assisted && !practice && state.won ? { target: state.moves } : {}),
    },
  });
  if (disposed || session !== runId || screen !== 'result') return;
  shareStatus =
    result.status === 'shared'
      ? '已打开分享面板'
      : result.status === 'copied'
        ? '同关链接已复制'
        : result.status === 'cancelled'
          ? '已取消分享'
          : '请复制挑战链接';
  draw();
  if (['unavailable', 'failed'].includes(result.status) && result.url) {
    const input = document.querySelector('#share-url');
    input.value = result.url;
    document.querySelector('#share-fallback').showModal();
    input.focus();
    input.select();
  }
}
function activate(action) {
  if (disposed) return;
  sound('tap');
  if (action.startsWith('gate:')) return gate(action.slice(5));
  if (action.startsWith('focus:')) {
    selectedGate = action.slice(6);
    announce(
      selectedGate.startsWith('overflow:')
        ? '已选溢流管：超过出口线的水量推动水轮'
        : '已选管线 ' + selectedGate + '，点击圆形阀门调度',
    );
    return draw();
  }
  if (action.startsWith('level:')) {
    const i = Number(action.slice(6));
    if (i > unlocked && !dev) return;
    if (challenge) clearChallenge();
    return load(i, { trial: i > unlocked });
  }
  switch (action) {
    case 'start':
      if (state.won || state.lost) return load(challenge ? levelIndex : progress.selected);
      return show('playing');
    case 'home':
      prediction = false;
      preview = null;
      return show('home');
    case 'levels':
      chapter = Math.floor((challenge ? levelIndex : progress.selected) / 10);
      return show('levels');
    case 'chapter-prev':
      chapter = Math.max(0, chapter - 1);
      return draw();
    case 'chapter-next':
      chapter = Math.min(4, chapter + 1);
      return draw();
    case 'pause':
      return pause();
    case 'resume':
      return show('playing');
    case 'restart':
      return load(levelIndex, { trial: practice });
    case 'undo':
      return undo();
    case 'predict':
      if (screen !== 'playing' || animating) return;
      prediction = !prediction;
      preview = null;
      assisted = true;
      announce(prediction ? '点阀门看预测，再点一次确认' : '已退出预测');
      return draw();
    case 'hint':
      if (screen !== 'playing' || animating) return;
      assisted = true;
      {
        const solution = solve(LEVELS[levelIndex], state);
        announce(
          solution?.length
            ? `试试 ${solution[0]} 阀门，还需 ${solution.length} 步`
            : solution
              ? '目标已完成'
              : '当前步数不足，撤销或重来试试',
        );
      }
      return draw();
    case 'extra':
      if (extraClaimed || !state.lost) return;
      extraClaimed = true;
      assisted = true;
      state = { ...state, bonusMoves: 1, lost: false };
      announce('已增加 1 步，本局仅一次');
      return show('playing');
    case 'next': {
      const next = levelIndex + 1;
      if (next >= LEVELS.length) return;
      if (challenge) clearChallenge();
      if (next > unlocked && !dev) return show('levels');
      return load(next, { trial: next > unlocked });
    }
    case 'exit-challenge':
      clearChallenge();
      practice = false;
      load(progress.selected);
      return show('home');
    case 'share':
      return void share();
    case 'help':
    case 'settings':
      returnScreen = screen;
      return show(action);
    case 'sound':
      progress.sound = !progress.sound;
      if (!challenge && !practice) persist();
      if (!progress.sound) audioSource?.stop();
      else sound('valve');
      return draw();
    case 'playing':
    case 'paused':
      return show(action);
  }
}
function tick(dt) {
  if (disposed || !view) return;
  if (screen !== 'playing' || document.hidden) return;
  time += dt;
  if (animating) {
    animationTime += dt;
    const duration = motion.matches ? 0.14 : 0.55;
    const f = Math.min(1, animationTime / duration),
      e = 1 - (1 - f) ** 3;
    displayed = state.volumes.map((v, i) => animationFrom[i] + (v - animationFrom[i]) * e);
    if (f === 1) {
      animating = false;
      displayed = [...state.volumes];
      if (state.won || state.lost) {
        show('result');
        return;
      }
      draw();
    }
  }
  if (animating || (!motion.matches && Math.floor(time * 24) !== Math.floor((time - dt) * 24)))
    view.update(model());
}
function wireInput(cc) {
  const point = (e) => {
    const p = e.getUILocation();
    return { x: p.x, y: runtime.height - p.y };
  };
  const begin = (e, id) => {
    if (activeTouch !== null) return;
    const p = point(e),
      h = view.hit(p.x, p.y);
    activeTouch = id;
    pressed = h ? { ...h, start: p } : null;
  };
  const move = (e, id) => {
    if (activeTouch !== id || !pressed) return;
    const p = point(e);
    if (Math.hypot(p.x - pressed.start.x, p.y - pressed.start.y) > 14) pressed = null;
  };
  const end = (e, id) => {
    if (activeTouch !== id) return;
    const p = point(e),
      h = view.hit(p.x, p.y),
      action = h && pressed && h.id === pressed.id ? h.action : null;
    cancelInput();
    if (action) activate(action);
  };
  const subs = [
    [
      cc.Input.EventType.TOUCH_START,
      (e) => {
        lastTouch = performance.now();
        begin(e, e.getID());
      },
    ],
    [cc.Input.EventType.TOUCH_MOVE, (e) => move(e, e.getID())],
    [
      cc.Input.EventType.TOUCH_END,
      (e) => {
        lastTouch = performance.now();
        end(e, e.getID());
      },
    ],
    [
      cc.Input.EventType.TOUCH_CANCEL,
      (e) => {
        if (activeTouch === e.getID()) cancelInput();
      },
    ],
    [
      cc.Input.EventType.MOUSE_DOWN,
      (e) => {
        if (e.getButton() === 0 && performance.now() - lastTouch > 600) begin(e, 'mouse');
      },
    ],
    [cc.Input.EventType.MOUSE_MOVE, (e) => move(e, 'mouse')],
    [cc.Input.EventType.MOUSE_UP, (e) => end(e, 'mouse')],
  ];
  subs.forEach(([type, fn]) => cc.input.on(type, fn));
  cleanups.push(() => subs.forEach(([type, fn]) => cc.input.off(type, fn)));
}
async function initAudio(cc) {
  const n = new cc.Node('Station audio');
  runtime.scene.addChild(n);
  audioSource = n.addComponent(cc.AudioSource);
  audioSource.playOnAwake = false;
  for (const name of ['tap', 'valve', 'win', 'locked'])
    cc.assetManager.loadRemote(
      new URL(`./assets/audio/${name}.wav`, import.meta.url).href,
      { ext: '.wav' },
      (err, clip) => {
        if (err) return;
        if (disposed) {
          clip?.destroy();
          return;
        }
        clips[name] = clip;
      },
    );
}
function snapshot() {
  return structuredClone({
    ...model(),
    engine: 'Cocos Engine 3.8.8',
    ready: Boolean(view),
    unlocked,
    history: history.map((s) => structuredClone(s)),
    activeTouch,
    hits: view?.hits || [],
    viewport: dimensions(),
    layout: view?.layout || null,
  });
}
async function boot() {
  try {
    const { startCocos } = await import('./vendor/cocos/bootstrap.mjs');
    runtime = await startCocos(canvas, {
      ...dimensions(),
      background: [6, 29, 42, 255],
      update: tick,
    });
    if (disposed) return;
    view = createView(runtime, activate);
    wireInput(runtime.cc);
    await initAudio(runtime.cc);
    window.__waterlineSnapshot = snapshot;
    document.querySelector('#loading').hidden = true;
    draw();
    if (dev) {
      cleanups.push(
        window.SmallGamesDev.registerActions([
          { id: 'station-levels', label: '调试选关', run: () => show('levels') },
        ]),
        window.SmallGamesDev.registerSnapshot(snapshot),
      );
    }
  } catch (error) {
    console.error(error);
    document.querySelector('#loading-message').textContent =
      '水站暂时无法启动。请确认浏览器支持 WebGL，然后重试。';
    document.querySelector('#load-retry').hidden = false;
  }
}
document.querySelector('#share-select').addEventListener(
  'click',
  () => {
    const input = document.querySelector('#share-url');
    input.focus();
    input.select();
  },
  { signal },
);
document
  .querySelector('#share-close')
  .addEventListener('click', () => document.querySelector('#share-fallback').close(), { signal });
document
  .querySelector('#load-retry')
  .addEventListener('click', () => location.reload(), { signal });
window.addEventListener(
  'resize',
  () => {
    cancelInput();
    if (runtime && view) {
      runtime.resize(dimensions().width, dimensions().height);
      view.resize();
      draw();
    }
  },
  { signal },
);
window.addEventListener('blur', pause, { signal });
document.addEventListener(
  'visibilitychange',
  () => {
    if (document.hidden) {
      pause();
      runtime?.pause();
      audioSource?.stop();
    } else runtime?.resume();
  },
  { signal },
);
document.addEventListener(
  'keydown',
  (e) => {
    if (document.querySelector('#share-fallback').open) return;
    if (e.target instanceof HTMLElement && e.target.closest('#small-games-dev-panel')) return;
    if (e.key === 'Escape') {
      if (screen === 'playing')
        prediction ? ((prediction = false), (preview = null), draw()) : pause();
      else if (screen === 'paused') activate('resume');
      else if (screen === 'help' || screen === 'settings') show(returnScreen);
      else show('home');
      return;
    }
    if (screen !== 'playing') return;
    const key = e.key.toLowerCase();
    if (/^[1-4]$/.test(key)) {
      const g = LEVELS[levelIndex].gates[Number(key) - 1];
      if (g) gate(g.id);
    } else {
      const action = { z: 'undo', p: 'predict', h: 'hint', r: 'restart', '?': 'help' }[key];
      if (action) activate(action);
    }
  },
  { signal },
);
window.addEventListener(
  'pagehide',
  (e) => {
    pause();
    audioSource?.stop();
    if (e.persisted) {
      runtime?.pause();
      return;
    }
    disposed = true;
    cleanups.forEach((fn) => fn?.());
    Object.values(clips).forEach((clip) => clip.destroy());
    view?.dispose();
    runtime?.destroy();
    listeners.abort();
    delete window.__waterlineSnapshot;
  },
  { signal },
);
window.addEventListener(
  'pageshow',
  (e) => {
    if (e.persisted && !disposed) runtime?.resume();
  },
  { signal },
);
void boot();

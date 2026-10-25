import { createH5Publishing } from './publishing.js';
import { createPlatformAdProvider } from './platform-ads.js';
import { LEVELS, levelById } from './levels.mjs';
import {
  createGame,
  fire,
  update,
  recall,
  chooseUpgrade,
  restoreGame,
  drainEvents,
  canReward,
  grantReward,
  FIELD,
  aimVelocity,
} from './core.mjs';
import { createStorage } from './storage.mjs';
import { prepareArt } from './src/art.mjs';
import { createView } from './render.mjs';
import { createGlassAudio } from './src/audio.mjs';
import { createRewardRequests, rewardProvider } from './src/rewarded.mjs';

const storage = createStorage(),
  audio = createGlassAudio(() => storage.read().sound);
const listeners = new AbortController(),
  { signal } = listeners,
  canvas = document.getElementById('GameCanvas');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let runtime,
  view,
  game = null,
  screen = 'home',
  overlays = [],
  confirmation = null,
  levelPage = 0,
  supplyReturn = 'playing',
  aim = null,
  touchId = null,
  lastTouch = -Infinity,
  disposed = false,
  finished = false,
  lastPhase = '',
  shareStatus = '',
  rewardMessage = '';
const incoming = new URL(location.href).searchParams,
  sharedLevel = levelById(incoming.get('level')),
  sharedSeed = Number(incoming.get('seed'));
const hasChallenge =
  ['orbit-v1', 'orbit-v2', 'orbit-v3', 'orbit-v4'].includes(incoming.get('challenge')) &&
  sharedLevel &&
  Number.isInteger(sharedSeed) &&
  sharedSeed > 0 &&
  sharedSeed <= 0xffffffff;
const publishing = createH5Publishing({
  gameId: 'ball-roguelite',
  title: '星轨弹珠',
  adMode: 'off',
  publicUrl: globalThis.SmallGamesPublishingConfig?.publicUrl,
});
const rewards = createRewardRequests({
  provider: rewardProvider(globalThis, createPlatformAdProvider),
  isCurrent: (run) => run === game && screen === 'supply-panel',
  eligible: canReward,
  grant: (run, kind) => {
    if (!grantReward(run, kind)) return false;
    finished = false;
    storage.saveRun(run);
    return true;
  },
});
const devCleanups = [];
function dimensions() {
  const frame = document.getElementById('viewport'),
    box = frame.getBoundingClientRect();
  const inset = getComputedStyle(frame),
    usableWidth = box.width - parseFloat(inset.paddingLeft) - parseFloat(inset.paddingRight),
    usableHeight = box.height - parseFloat(inset.paddingTop) - parseFloat(inset.paddingBottom);
  const width = Math.min(usableWidth, (usableHeight * 390) / 620, 480),
    height = usableHeight,
    scale = width / 390;
  const stage = document.getElementById('GameDiv');
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  return { width: 390, height: height / scale, scale };
}
function cancelAim() {
  aim = null;
  touchId = null;
}
function notifyHost() {
  if (parent === window) return;
  try {
    parent.postMessage(
      {
        type: 'small-games:display-state',
        gameId: 'ball-roguelite',
        screen: ['home', 'levels'].includes(overlays[0] || screen) ? 'home' : 'playing',
      },
      new URL(document.referrer).origin,
    );
  } catch {
    /* Unrelated embeds. */
  }
}
function nextLevel() {
  return game?.phase === 'won' && !game.level.endless
    ? LEVELS[LEVELS.findIndex((l) => l.id === game.levelId) + 1]?.id
    : null;
}
function renderScreen() {
  if (!view) return;
  const data = storage.read();
  if (screen === 'home')
    view.home(
      data,
      storage.getResume(data.lastMode),
      hasChallenge
        ? incoming.get('challenge') !== 'orbit-v4'
          ? '旧版种子 · 按新规则重试'
          : '好友同场挑战 →'
        : null,
    );
  if (screen === 'levels')
    view.levels(data, storage.getResume('campaign'), storage.isUnlocked, levelPage);
  if (screen === 'playing') view.playing(game);
  if (screen === 'upgrade') view.upgrade(game);
  if (screen === 'paused') view.paused(data);
  if (screen === 'help') view.help(storage.persistent, inBattle());
  if (screen === 'settings') view.settings(data, inBattle(), !!game && inBattle());
  if (screen === 'confirm') view.confirm(confirmation?.kind, inBattle());
  if (screen === 'result') view.result(game, nextLevel(), data.bestEndless, shareStatus);
  if (screen === 'supply-panel')
    view.supply(game, {
      available: rewards.available,
      pending: rewards.pending,
      message: rewardMessage,
      canResonance: canReward(game, 'resonance'),
      canRescue: canReward(game, 'rescue'),
    });
  document.body.dataset.screen = screen;
  notifyHost();
  view.draw(game, null, 0, motion.matches);
}
function inBattle() {
  return !!game && !['home', 'levels'].includes(overlays[0] || screen);
}
function syncAudio() {
  audio.setActive(screen === 'playing' && storage.read().sound && !document.hidden);
  if (screen !== 'playing' || !storage.read().sound) audio.suspend();
}
function openOverlay(name) {
  if (screen === 'supply-panel') rewards.cancel();
  audio.suspend();
  overlays.push(screen);
  show(name);
}
function closeOverlay() {
  if (screen === 'confirm') confirmation = null;
  show(overlays.pop() || 'home');
}
function ask(kind) {
  confirmation = { kind, run: game };
  openOverlay('confirm');
}
function show(name) {
  cancelAim();
  screen = name;
  syncAudio();
  renderScreen();
}
function start(id, practice = false, seed = null) {
  if (!practice && !seed && !storage.isUnlocked(id)) return;
  rewards.cancel();
  overlays = [];
  confirmation = null;
  game = createGame(id, {
    seed: seed || crypto.getRandomValues(new Uint32Array(1))[0] || 1,
    practice,
    challenge: !!seed,
  });
  finished = false;
  lastPhase = game.phase;
  shareStatus = '';
  rewardMessage = '';
  view.reset();
  storage.saveRun(game);
  show('playing');
}
function continueRun(mode = storage.read().lastMode) {
  rewards.cancel();
  overlays = [];
  confirmation = null;
  const restored = restoreGame(storage.getResume(mode));
  if (!restored) {
    start(mode === 'endless' ? 'endless' : storage.read().lastLevel);
    return;
  }
  game = restored;
  finished = false;
  lastPhase = game.phase;
  shareStatus = '';
  view.reset();
  show(game.phase === 'upgrade' ? 'upgrade' : 'playing');
}
function home() {
  rewards.cancel();
  overlays = [];
  confirmation = null;
  audio.suspend();
  if (game) storage.saveRun(game);
  show('home');
}
function pause() {
  cancelAim();
  audio.suspend();
  if (screen === 'playing') show('paused');
  else overlays = overlays.map((name) => (name === 'playing' ? 'paused' : name));
}
function processState() {
  if (!game) return;
  if (game.phase === 'upgrade') {
    storage.saveRun(game);
    show('upgrade');
  } else if (['won', 'lost'].includes(game.phase)) {
    if (!finished) {
      storage.finish(game);
      finished = true;
    }
    show('result');
  } else {
    storage.saveRun(game);
    show('playing');
  }
  lastPhase = game.phase;
}
function feedback() {
  const events = drainEvents(game);
  view.consume(events, motion.matches);
  audio.play(events, game.collisionCount);
  if (events.some((e) => e.type === 'pickup') && storage.read().haptics) {
    try {
      navigator.vibrate?.(10);
    } catch {
      /* Optional capability. */
    }
  }
}
async function activate(action) {
  if (disposed) return;
  if (action === 'continue') continueRun();
  else if (action === 'campaign') continueRun('campaign');
  else if (action === 'endless') continueRun('endless');
  else if (action === 'levels') {
    levelPage = Math.floor(
      Math.max(
        0,
        LEVELS.findIndex((l) => l.id === storage.read().lastLevel),
      ) / 4,
    );
    show('levels');
  } else if (action === 'levels-prev' || action === 'levels-next') {
    levelPage = Math.max(
      0,
      Math.min(Math.ceil(LEVELS.length / 4) - 1, levelPage + (action === 'levels-next' ? 1 : -1)),
    );
    renderScreen();
  } else if (action === 'settings') openOverlay('settings');
  else if (action === 'overlay-back') closeOverlay();
  else if (action === 'leave') ask('leave');
  else if (action === 'restart-run' && game) ask('restart-run');
  else if (action === 'restart-endless') {
    if (storage.getResume('endless')) ask('restart-endless');
    else start('endless');
  } else if (action === 'confirm-accept' && screen === 'confirm' && confirmation) {
    const choice = confirmation;
    confirmation = null;
    overlays = [];
    if (choice.kind === 'leave') home();
    else if (choice.kind === 'restart-endless') start('endless');
    else if (choice.run === game)
      start(game.levelId, game.practice, game.challenge ? game.initialSeed : null);
  } else if (action === 'home') home();
  else if (action === 'pause') pause();
  else if (action === 'resume') show('playing');
  else if (action === 'help') {
    openOverlay('help');
  } else if (action === 'help-back') closeOverlay();
  else if (action === 'sound') {
    storage.setting('sound', !storage.read().sound);
    syncAudio();
    renderScreen();
  } else if (action === 'haptics') {
    storage.setting('haptics', !storage.read().haptics);
    renderScreen();
  } else if (action.startsWith('level:')) {
    const id = action.slice(6);
    if (storage.getResume('campaign')?.levelId === id) continueRun('campaign');
    else start(id);
  } else if (action === 'challenge') start(sharedLevel.id, false, sharedSeed);
  else if (action.startsWith('upgrade:')) {
    if (chooseUpgrade(game, action.slice(8))) {
      feedback();
      storage.saveRun(game);
      show('playing');
      lastPhase = game.phase;
    }
  } else if (action === 'recall') {
    if (recall(game)) {
      feedback();
      processState();
    }
  } else if (action === 'retry')
    start(game.levelId, game.practice, game.challenge ? game.initialSeed : null);
  else if (action === 'next') {
    const next = nextLevel();
    if (next && !game.challenge && !game.practice) start(next);
  } else if (action === 'supply') {
    if (game.practice || game.challenge || ['flight', 'recall'].includes(game.phase)) return;
    supplyReturn = screen;
    rewardMessage = '';
    audio.suspend();
    show('supply-panel');
  } else if (action === 'supply-back') {
    rewards.cancel();
    rewardMessage = '';
    if (game.phase === 'won') processState();
    else if (game.phase === 'lost') show('result');
    else
      show(game.phase === 'upgrade' ? 'upgrade' : supplyReturn === 'paused' ? 'paused' : 'playing');
  } else if (action.startsWith('reward:')) {
    const run = game,
      kind = action.slice(7);
    if (screen !== 'supply-panel') return;
    const request = rewards.request(run, kind);
    rewardMessage = '';
    audio.suspend();
    renderScreen();
    const result = await request;
    if (disposed || game !== run || screen !== 'supply-panel') return;
    rewardMessage = result.granted
      ? kind === 'rescue'
        ? '顶部两行已清除 · 准备继续'
        : '晶体共鸣已生效 · 本局持续'
      : result.status === 'dismissed'
        ? '未完整观看，未领取奖励'
        : '广告暂不可用，未消耗领取次数';
    renderScreen();
    feedback();
  } else if (action === 'share') {
    const run = game;
    if (!run?.initialSeed || run.practice || run.rewards?.rescue || run.rewards?.resonance) return;
    const outcome = await publishing.share({
      text: `${run.level.title}击碎 ${run.score} 颗球珠，最佳 ${run.bestCombo} 连碎。挑战同一组晶体！`,
      params: {
        challenge: 'orbit-v4',
        level: run.levelId,
        seed: run.initialSeed,
        targetScore: run.score,
      },
    });
    if (game !== run || screen !== 'result') return;
    shareStatus =
      { copied: '同场挑战链接已复制', shared: '已打开系统分享', cancelled: '已取消分享' }[
        outcome.status
      ] || '暂时无法分享，请稍后重试';
    renderScreen();
  }
}
function snapshot() {
  return game
    ? {
        screen,
        engine: 'cocos-3.8.8',
        phase: game.phase,
        levelId: game.levelId,
        turn: game.turn,
        score: game.score,
        count: game.count,
        damage: game.damage,
        seed: game.seed,
        initialSeed: game.initialSeed,
        challenge: game.challenge,
        nextId: game.nextId,
        cards: [...game.cards],
        shots: game.shots,
        waveIndex: game.waveIndex,
        practice: game.practice,
        launchX: game.launchX,
        launchY: FIELD.launchY,
        launchSpeed: game.direction?.speed ?? 0,
        aimPower: aim ? aimVelocity(aim.x - game.launchX, aim.y - FIELD.launchY)?.power ?? 0 : 0,
        upgrades: { ...game.upgrades },
        rewards: { ...game.rewards },
        collisionCount: game.collisionCount,
        emitted: game.emitted,
        volley: game.volley,
        absorbed: game.absorbed,
        elapsed: game.elapsed,
        bestCombo: game.bestCombo,
        balls: game.balls.map(({ id, x, y, vx, vy, returning }) => ({
          id,
          x,
          y,
          vx,
          vy,
          returning: !!returning,
        })),
        bricks: game.bricks.filter((b) => b.hp > 0).map((b) => ({ ...b })),
        aiming: touchId !== null,
        audio: audio.stats,
        visuals: view.stats,
        flight: game.flight,
      }
    : { screen, phase: 'home', engine: 'cocos-3.8.8', shots: 0 };
}
function frame(dt) {
  if (disposed || !view || document.hidden) return;
  if (screen === 'playing' && game) {
    update(game, dt);
    feedback();
    view.updateHud(game, aim);
    if (lastPhase !== game.phase) {
      if (game.phase !== 'flight') processState();
      else {
        lastPhase = game.phase;
        renderScreen();
      }
    }
  }
  view.draw(
    game,
    aim,
    ['playing', 'home', 'result', 'upgrade'].includes(screen) ? dt : 0,
    motion.matches,
  );
}
function wireInput(cc) {
  const point = (event) => {
    const p = event.getUILocation();
    return {
      x: (p.x - view.board.x) / view.board.scale,
      y: (view.height - p.y - view.board.y) / view.board.scale,
    };
  };
  const begin = (event, id) => {
    if (screen !== 'playing' || game?.phase !== 'aim' || touchId !== null) return;
    const p = point(event);
    if (p.x < FIELD.left || p.x > FIELD.right || p.y < FIELD.top || p.y > FIELD.floor + 12) return;
    touchId = id;
    aim = p;
    audio.unlock();
  };
  const move = (event, id) => {
    if (touchId === id) aim = point(event);
  };
  const end = (event, id) => {
    if (touchId !== id) return;
    const p = point(event);
    cancelAim();
    if (
      screen === 'playing' &&
      fire(game, p.x - game.launchX, p.y - FIELD.launchY)
    ) {
      lastPhase = 'flight';
      renderScreen();
    }
  };
  const subscriptions = [
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
        if (touchId === e.getID()) cancelAim();
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
  subscriptions.forEach(([type, handler]) => cc.input.on(type, handler));
  devCleanups.push(() => subscriptions.forEach(([type, handler]) => cc.input.off(type, handler)));
}
window.addEventListener('blur', pause, { signal });
document.addEventListener(
  'visibilitychange',
  () => {
    if (document.hidden) pause();
  },
  { signal },
);
window.addEventListener(
  'resize',
  () => {
    cancelAim();
    if (runtime && view) {
      const d = dimensions();
      runtime.resize(d.width, d.height);
      view.setDimensions(d);
      renderScreen();
    }
  },
  { signal },
);
document.addEventListener('game-displaychange', renderScreen, { signal });
document.addEventListener(
  'keydown',
  (event) => {
    if (event.key === 'Escape') {
      if (screen === 'playing') pause();
      else if (screen === 'paused') activate('resume');
      else if (screen === 'supply-panel') activate('supply-back');
      else if (['settings', 'help', 'confirm'].includes(screen)) activate('overlay-back');
    }
  },
  { signal },
);
window.addEventListener(
  'pagehide',
  (event) => {
    pause();
    rewards.cancel();
    if (!event.persisted) {
      disposed = true;
      rewards.dispose();
      publishing.dispose();
      audio.dispose();
      devCleanups.forEach((fn) => fn?.());
      view?.dispose();
      runtime?.destroy();
      listeners.abort();
      delete window.__orbit;
    }
  },
  { signal },
);
try {
  const { startCocos } = await import('./vendor/cocos/bootstrap.mjs'),
    d = dimensions();
  runtime = await startCocos(canvas, { width: d.width, height: d.height, update: frame });
  await prepareArt();
  view = createView(runtime.cc, runtime.ui, d, { activate });
  view.arenaAccess.getOrbitSnapshot = snapshot;
  canvas.getOrbitSnapshot = snapshot;
  wireInput(runtime.cc);
  if (window.SmallGamesDev?.isEnabled()) {
    window.__orbit = { snapshot, startPractice: (id) => start(id, true) };
    devCleanups.push(
      window.SmallGamesDev.registerActions(
        LEVELS.map((level) => ({
          id: `orbit-${level.id}`,
          label: `试玩：${level.title}`,
          run: () => start(level.id, true),
        })),
      ),
    );
    devCleanups.push(window.SmallGamesDev.registerSnapshot(snapshot));
  }
  document.body.dataset.engine = 'cocos-3.8.8';
  document.getElementById('loading').remove();
  show('home');
} catch (error) {
  document.getElementById('loading').innerHTML =
    '<strong>星轨暂时未能启动</strong><p>请确认浏览器支持 WebGL，然后重试。</p><button id="reload">重新加载</button>';
  document.getElementById('reload').onclick = () => location.reload();
  console.error('Cocos startup failed', error);
}

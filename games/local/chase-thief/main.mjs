import { LEVELS, validateLevels } from './levels.mjs';
import { RULES, createRun, updateRun, act } from './engine.mjs';
import { loadProgress, recordWin } from './progress.mjs';
import { createAudio } from './audio.mjs';

const $ = (id) => document.getElementById(id);
const game = $('game');
const saveKey = 'chase-thief.progress.v1';
const listeners = new AbortController();
const on = (target, name, handler, options = {}) =>
  target.addEventListener(name, handler, { ...options, signal: listeners.signal });
let progress;
try {
  progress = loadProgress(localStorage.getItem(saveKey));
} catch {
  progress = loadProgress(null);
}
const audio = createAudio();
audio.setEnabled(progress.sound);
let scene,
  run,
  screen = 'home',
  settingsReturn = 'home',
  lastFrame = 0,
  frameId = 0;
let manualClock = false,
  ambientTime = 0,
  feedbackUntil = 0,
  impact = 0,
  settledRun,
  captureTimer;
const pointers = new Map();
const buttonPointers = new Map();
const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function persist() {
  try {
    localStorage.setItem(saveKey, JSON.stringify(progress));
  } catch {
    /* Continue with in-memory progress. */
  }
}
function currentLevel() {
  return LEVELS.find((level) => level.id === (run?.levelId ?? progress.selected)) ?? LEVELS[0];
}
function syncHost() {
  if (window.parent === window) return;
  try {
    const active =
      ['running', 'caught', 'paused', 'won', 'lost'].includes(screen) ||
      (screen === 'settings' && settingsReturn === 'paused');
    window.parent.postMessage(
      {
        type: 'small-games:display-state',
        gameId: 'chase-thief',
        screen: active ? 'playing' : 'home',
      },
      new URL(document.referrer).origin,
    );
  } catch {
    /* Standalone or a host without a referrer needs no shell bridge. */
  }
}
function setScreen(value) {
  screen = value;
  document.body.dataset.phase = value;
  const sections = {
    home: 'home',
    levels: 'levels',
    help: 'help-screen',
    settings: 'settings',
    running: 'play',
    caught: 'play',
    paused: 'paused',
    won: 'result',
    lost: 'result',
  };
  for (const id of new Set(Object.values(sections))) $(id).hidden = id !== sections[value];
  // The frozen HUD and scene remain behind the pause menu.
  if (value === 'paused') $('play').hidden = false;
  pointers.clear();
  buttonPointers.clear();
  document
    .querySelectorAll('.control.pressed')
    .forEach((control) => control.classList.remove('pressed'));
  lastFrame = 0;
  syncHost();
  paint();
}
function toHome() {
  clearTimeout(captureTimer);
  audio.stop();
  run = undefined;
  settledRun = undefined;
  manualClock = false;
  impact = 0;
  renderHome();
  setScreen('home');
}
function renderHome() {
  const level = LEVELS.find((item) => item.id === progress.selected) ?? LEVELS[0];
  $('home-progress').textContent =
    `${String(LEVELS.indexOf(level) + 1).padStart(2, '0')} / ${level.name}`;
  $('start').querySelector('span').textContent = progress.best[level.id] ? '再追一次' : '开始追捕';
  $('sound').setAttribute('aria-pressed', String(progress.sound));
  $('haptics').setAttribute('aria-pressed', String(progress.haptics));
}
function preview(level) {
  const { sky, wall, wallAccent, roof, road, accent } = level.palette;
  return `<svg class="level-preview" viewBox="0 0 360 170" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="360" height="170" fill="${sky}"/><circle cx="230" cy="40" r="25" fill="#ffe1a6" opacity=".6"/><path d="M132 78H248L354 170H24Z" fill="${road}"/><path d="m167 78-47 92M212 78l55 92M145 95h93M128 112h131M108 134h177M72 160h247" stroke="#edd6b0" opacity=".5" stroke-width="2"/><path d="M0 12 145 63v58L0 170Z" fill="${wall}"/><path d="m360 6-119 57v56l119 51Z" fill="${wallAccent}"/><path d="m0 19 145 49-4 10L0 41Zm360-8L240 53l4 12 116-39" fill="${roof}"/><path d="m15 60 30 6v58l-30 7ZM70 75l22 5v36l-22 6Zm209-1 24-8v44l-24-6Zm44-22 25-10v88l-25-7Z" fill="#285d5c" stroke="#1d414c" stroke-width="4"/><path d="M20 72v39m9-39v38m8-33v32m36-22v24m7-22v19m7-20v19m198-29v26m8-30v35m39-54v53m8-55v58" stroke="#548b78" stroke-width="2"/><path d="m146 63 15-15h25v16m22 0V48h24l11 16" fill="${roof}"/><path d="M121 38Q215 70 297 35" stroke="#28414a" fill="none"/><path d="M289 38v20" stroke="#28414a"/><rect x="281" y="47" width="17" height="22" rx="7" fill="${accent}"/><path d="m46 148 7 22h24l6-22" fill="#af7352"/><path d="M64 151v-23m-1 11-15-10m15 3 15-16" stroke="#42765c" stroke-width="8" stroke-linecap="round"/><path d="M171 76h22v21h-22z" fill="#255c5b"/></svg>`;
}
function renderLevels() {
  $('level-list').innerHTML = LEVELS.map((level, index) => {
    const unlocked = progress.unlocked.includes(level.id);
    const best = progress.best[level.id];
    const lock =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
    return `<button class="level-card ${level.id === progress.selected ? 'selected' : ''}" data-level="${level.id}" ${unlocked ? '' : 'disabled'} aria-label="${level.name}${unlocked ? '' : '，通关前一街区解锁'}">${preview(level)}<div class="level-top"><span class="level-number">${String(index + 1).padStart(2, '0')}</span><span class="level-name">${level.name}</span></div><p class="level-subtitle">${level.subtitle}</p><div class="level-bottom"><span class="level-tag">60 秒</span>${best ? `<span class="level-tag">最快 ${best.time.toFixed(1)} 秒</span>` : ''}<span class="level-state">${unlocked ? (best ? '已抓捕 · 再挑战 ↗' : '开始追捕 ↗') : lock + ' 待解锁'}</span></div></button>`;
  }).join('');
}
function startLevel(id = progress.selected, practice = false) {
  const level = LEVELS.find((item) => item.id === id);
  if (!level || (!practice && !progress.unlocked.includes(id))) return false;
  audio.unlock();
  audio.stop();
  clearTimeout(captureTimer);
  run = createRun(level);
  run.practice = practice;
  manualClock = false;
  settledRun = undefined;
  impact = 0;
  feedbackUntil = 0;
  $('feedback').hidden = true;
  $('tutorial').hidden = true;
  if (!practice) {
    progress.selected = id;
    persist();
  }
  $('street-name').textContent = level.name;
  setScreen('running');
  updateHud();
  return true;
}
function pause() {
  if (screen !== 'running' || run?.phase !== 'running') return;
  run.phase = 'paused';
  audio.stop();
  setScreen('paused');
}
function resume() {
  if (!run || run.phase !== 'paused') return;
  audio.unlock();
  run.phase = 'running';
  setScreen('running');
}
function feedback(type, headline, detail = '') {
  const box = $('feedback');
  box.dataset.type = type;
  box.replaceChildren(document.createTextNode(headline));
  if (detail) {
    const text = document.createElement('small');
    text.textContent = detail;
    box.append(text);
  }
  box.hidden = false;
  feedbackUntil = (run?.elapsed ?? 0) + (type === 'boost' ? 2 : 1.45);
  $('tutorial').hidden = true;
}
function vibrate(pattern) {
  if (progress.haptics)
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* Optional feedback. */
    }
}
function consumeEvents() {
  if (!run) return;
  for (const event of run.events.splice(0)) {
    if (event.type === 'action') {
      audio.play(event.action === 'left' || event.action === 'right' ? 'switch' : event.action);
    } else if (event.type === 'success') {
      audio.play('success');
      if (event.combo < RULES.comboTarget)
        feedback(
          'success',
          `稳住了！连续 ${event.combo}/3`,
          `再过 ${RULES.comboTarget - event.combo} 段，冲刺追近`,
        );
    } else if (event.type === 'boost') {
      audio.play('boost');
      vibrate([25, 40, 40]);
      feedback('boost', '冲刺！追近 3 米', '看清下一段，小偷就在前面');
    } else if (event.type === 'collision') {
      impact = 1;
      audio.play('collision');
      vibrate([60, 30, 70]);
      const name = { barrier: '路障', beam: '低杆', crate: '木箱' }[event.obstacle] ?? '障碍';
      feedback('collision', `撞到${name}！拉开 2.5 米`, '连续次数清空，下一段重新稳住');
    } else if (event.type === 'win' || event.type === 'lose') {
      audio.play(event.type);
      if (event.type === 'win') vibrate([45, 50, 80]);
      if (event.type === 'win') {
        showResult(event, false);
        feedback('win', '抓到了！', '稳住每一段，真的能追上。');
        setScreen('caught');
        captureTimer = setTimeout(() => {
          if (screen === 'caught') setScreen('won');
        }, 850);
      } else showResult(event);
    }
  }
}
function doAction(action) {
  if (screen !== 'running' || !run) return false;
  audio.unlock();
  const accepted = act(run, action);
  consumeEvents();
  updateHud();
  paint();
  if (accepted) {
    const control = document.querySelector(`.control[data-action="${action}"]`);
    if (control) {
      control.classList.add('pressed');
      setTimeout(() => control.classList.remove('pressed'), 120);
    }
  }
  return accepted;
}
function showResult(event, reveal = true) {
  if (!run || settledRun === run) return;
  settledRun = run;
  const won = run.phase === 'won';
  const previous = progress.best[run.levelId];
  if (won) {
    progress = recordWin(progress, run);
    persist();
  }
  $('result-stamp').textContent = won ? '抓到了' : '差一点';
  $('result-kicker').textContent = won ? '稳住了，追上了' : '下一次，稳住那一段';
  $('result-title').textContent = won
    ? '这次，没让他跑掉。'
    : event.reason === 'timeout'
      ? '时间到了，他跑远了。'
      : '三次碰撞，追丢了。';
  $('result-detail').textContent = won
    ? '每一段成功，都让你离他更近。'
    : `还差 ${Math.max(0, run.distance - RULES.captureDistance).toFixed(1)} 米。${event.reason === 'timeout' ? '三连冲刺，能追得更快。' : '跳路障、钻低杆、绕木箱。'}`;
  $('result-time').textContent = run.elapsed.toFixed(1);
  $('result-boosts').textContent = run.boosts;
  $('result-collisions').textContent = run.collisions;
  const nextLevel = LEVELS[LEVELS.findIndex((item) => item.id === run.levelId) + 1];
  $('next').hidden = !won || run.practice || !nextLevel;
  $('retry').classList.toggle('secondary', won && !run.practice && Boolean(nextLevel));
  const bestText = run.practice
    ? '开发试玩 · 不记录成绩与解锁'
    : won
      ? !previous || run.elapsed < previous.time
        ? '本街区最佳追捕！'
        : '这条街，又稳稳抓住了。'
      : '';
  $('best-result').textContent =
    won && !nextLevel && !run.practice ? `${bestText} 三条街全部完成。` : bestText;
  if (reveal) setScreen(won ? 'won' : 'lost');
}
function updateHud() {
  if (!run) return;
  game.dataset.lane = String(run.lane);
  game.dataset.action = run.action;
  game.dataset.collisions = String(run.collisions);
  game.dataset.combo = String(run.combo);
  game.dataset.distance = run.distance.toFixed(2);
  game.dataset.elapsed = run.elapsed.toFixed(2);
  game.dataset.practice = String(Boolean(run.practice));
  $('distance').textContent = run.distance.toFixed(1);
  const seconds = Math.ceil(run.remaining);
  $('time').textContent =
    `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  $('time').style.color = run.remaining <= 10 ? '#ffc273' : '';
  $('combo-label').textContent = run.boostRemaining > 0 ? '冲刺追近！' : `连续 ${run.combo}/3`;
  [...$('combo-dots').children].forEach((dot, index) =>
    dot.classList.toggle('lit', run.boostRemaining > 0 || index < run.combo),
  );
  $('mistakes').querySelector('b').textContent = run.collisions;
  $('chase-runner').style.left =
    `${Math.max(0, Math.min(95, (1 - (run.distance - RULES.captureDistance) / 14) * 95))}%`;
  $('practice-label').hidden = !run.practice;
  if (run.elapsed >= feedbackUntil) $('feedback').hidden = true;
  const wave = run.level.waves.find((item) => !run.clearedWaveIds.includes(item.id));
  const obstacle = wave?.obstacles.find((item) => item.lane === run.lane);
  const showHint =
    screen === 'running' &&
    wave?.hint &&
    wave.at - run.world <= 28 &&
    wave.at - run.world > 1 &&
    $('feedback').hidden;
  $('tutorial').hidden = !showHint;
  if (showHint) {
    const hint = wave.hint;
    const instructions = {
      jump: ['↑', '跳过红白路障', '上滑 · 或点 ↑'],
      slide: ['↓', '钻过蓝色低杆', '下滑 · 或点 ↓'],
      switch: ['↔', '换道绕开木箱', '左右滑 · 或点 ← →'],
    };
    const [symbol, title, detail] = instructions[hint];
    $('tutorial-icon').textContent = symbol;
    $('tutorial-title').textContent = obstacle ? title : '这道安全，继续稳住';
    const ready = wave.at - run.world <= 7;
    const timing = hint === 'jump' ? '接近路障时再上滑' : '接近低杆时再下滑';
    $('tutorial-title').textContent =
      obstacle && ready && hint !== 'switch'
        ? hint === 'jump'
          ? '现在跳！'
          : '现在滑铲！'
        : $('tutorial-title').textContent;
    $('tutorial-detail').textContent = obstacle
      ? hint === 'switch' || ready
        ? detail
        : timing
      : '等下一段进入，再做动作';
  }
}
function paint() {
  if (!scene) return;
  const level = currentLevel();
  const mode =
    screen === 'home'
      ? 'home'
      : ['levels', 'help', 'settings'].includes(screen)
        ? 'levels'
        : ['won', 'lost'].includes(screen)
          ? 'result'
          : 'play';
  const demo = run ?? {
    world: 0,
    distance: 12,
    lane: 1,
    laneVisual: 1,
    thiefLane: 1,
    action: 'run',
    actionRemaining: 0,
    elapsed: ambientTime,
    boostRemaining: 0,
    slowRemaining: 0,
    clearedWaveIds: [],
    phase: 'running',
  };
  scene.render(demo, level, {
    mode,
    time: ambientTime,
    impact: reducedMotion ? 0 : impact,
    boost: run?.boostRemaining ?? 0,
  });
}
function advance(dt) {
  if (!run) return;
  updateRun(run, dt);
  consumeEvents();
  updateHud();
  paint();
}
function frame(now) {
  const dt = lastFrame ? Math.min(0.1, Math.max(0, (now - lastFrame) / 1000)) : 0;
  lastFrame = now;
  if (!document.hidden) {
    if (screen === 'running' && !manualClock) {
      updateRun(run, dt);
      consumeEvents();
      updateHud();
    }
    if (screen === 'home' && !reducedMotion) ambientTime += dt;
    if (impact > 0) impact = Math.max(0, impact - dt * 2.5);
    // Paused and menu backgrounds stay still; no physics clock runs here.
    if (screen === 'running' || screen === 'caught' || screen === 'home' || impact > 0) paint();
  }
  frameId = requestAnimationFrame(frame);
}

// Touch browsers may suppress a compatibility click immediately after a swipe.
// Local buttons respond to the pointer itself; keyboard activation uses click.
// The shared fullscreen control keeps its own browser activation handler.
on(game, 'pointerdown', (event) => {
  const button = event.target.closest('button');
  if (
    !button ||
    button.disabled ||
    button.hasAttribute('data-game-fullscreen') ||
    (event.pointerType === 'mouse' && event.button !== 0)
  )
    return;
  event.preventDefault();
  if (button.dataset.action || button.id === 'pause') activateButton(button);
  else {
    buttonPointers.set(event.pointerId, { button, x: event.clientX, y: event.clientY });
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      /* Pointer may have ended. */
    }
  }
});
on(game, 'pointermove', (event) => {
  const pointer = buttonPointers.get(event.pointerId);
  if (
    pointer &&
    Math.max(Math.abs(event.clientX - pointer.x), Math.abs(event.clientY - pointer.y)) > 12
  )
    buttonPointers.delete(event.pointerId);
});
on(game, 'pointerup', (event) => {
  const pointer = buttonPointers.get(event.pointerId);
  buttonPointers.delete(event.pointerId);
  if (!pointer) return;
  const box = pointer.button.getBoundingClientRect();
  if (
    event.clientX >= box.left &&
    event.clientX <= box.right &&
    event.clientY >= box.top &&
    event.clientY <= box.bottom
  )
    activateButton(pointer.button);
});
on(game, 'pointercancel', (event) => buttonPointers.delete(event.pointerId));
on(game, 'lostpointercapture', (event) => buttonPointers.delete(event.pointerId));
on(document, 'click', (event) => {
  const button = event.target.closest('button');
  if (event.detail === 0 && button && game.contains(button)) activateButton(button);
});
function activateButton(button) {
  if (button.disabled || button.hasAttribute('data-game-fullscreen')) return;
  const action = button.dataset.action;
  if (action) {
    doAction(action);
    return;
  }
  if (button.dataset.level) {
    startLevel(button.dataset.level);
    return;
  }
  if (button.hasAttribute('data-back')) {
    if (screen === 'settings' && settingsReturn === 'paused') setScreen('paused');
    else toHome();
    return;
  }
  switch (button.id) {
    case 'reload':
      location.reload();
      break;
    case 'start':
      startLevel();
      break;
    case 'choose-levels':
      renderLevels();
      setScreen('levels');
      break;
    case 'help':
      setScreen('help');
      break;
    case 'settings-open':
      settingsReturn = 'home';
      renderHome();
      setScreen('settings');
      break;
    case 'pause':
      pause();
      break;
    case 'resume':
      resume();
      break;
    case 'pause-retry':
    case 'retry':
      startLevel(run?.levelId, Boolean(run?.practice));
      break;
    case 'pause-home':
    case 'result-home':
      toHome();
      break;
    case 'pause-settings':
      settingsReturn = 'paused';
      renderHome();
      setScreen('settings');
      break;
    case 'sound':
      progress.sound = !progress.sound;
      audio.setEnabled(progress.sound);
      if (progress.sound) {
        audio.unlock();
        audio.play('success');
      }
      renderHome();
      persist();
      break;
    case 'haptics':
      progress.haptics = !progress.haptics;
      renderHome();
      persist();
      if (progress.haptics) vibrate(25);
      break;
    case 'next': {
      const next = LEVELS[LEVELS.findIndex((level) => level.id === run?.levelId) + 1];
      if (next) startLevel(next.id);
      break;
    }
  }
}
on($('scene'), 'pointerdown', (event) => {
  if (screen !== 'running' || (event.pointerType === 'mouse' && event.button !== 0)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, acted: false });
  audio.unlock();
  try {
    $('scene').setPointerCapture(event.pointerId);
  } catch {
    /* Pointer may have ended. */
  }
});
on($('scene'), 'pointermove', (event) => {
  const pointer = pointers.get(event.pointerId);
  if (!pointer || pointer.acted || screen !== 'running') return;
  const dx = event.clientX - pointer.x,
    dy = event.clientY - pointer.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 26) return;
  pointer.acted = true;
  doAction(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'jump' : 'slide');
});
const endPointer = (event) => {
  pointers.delete(event.pointerId);
};
on($('scene'), 'pointerup', endPointer);
on($('scene'), 'pointercancel', endPointer);
on($('scene'), 'lostpointercapture', endPointer);
on(window, 'keydown', (event) => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === ' ' && event.target.closest('button')) return;
  if (event.key === 'Escape') {
    if (screen === 'running') pause();
    else if (screen === 'paused') resume();
    else if (screen === 'settings' && settingsReturn === 'paused') setScreen('paused');
    else if (['help', 'levels', 'settings'].includes(screen)) toHome();
    event.preventDefault();
    return;
  }
  const action = {
    ArrowLeft: 'left',
    a: 'left',
    A: 'left',
    ArrowRight: 'right',
    d: 'right',
    D: 'right',
    ArrowUp: 'jump',
    w: 'jump',
    W: 'jump',
    ' ': 'jump',
    ArrowDown: 'slide',
    s: 'slide',
    S: 'slide',
  }[event.key];
  if (action && screen === 'running' && !event.target.closest('small-games-devtools')) {
    event.preventDefault();
    doAction(action);
  }
});
on(window, 'blur', () => {
  pointers.clear();
  buttonPointers.clear();
  pause();
  lastFrame = 0;
});
on(document, 'visibilitychange', () => {
  if (document.hidden) {
    pause();
    audio.stop();
  }
  lastFrame = 0;
});
on(window, 'resize', () => {
  scene?.resize();
  lastFrame = 0;
  paint();
});
on(document, 'game-displaychange', () => {
  scene?.resize();
  lastFrame = 0;
  paint();
});

let cleanActions, cleanSnapshot;
function setupDev() {
  if (!globalThis.SmallGamesDev?.isEnabled()) return;
  const snapshot = () =>
    run ? { ...structuredClone(run), screen } : { screen, progress: structuredClone(progress) };
  const practice = () => {
    if (run) {
      run.practice = true;
      updateHud();
    }
  };
  window.__chaseDev = {
    snapshot,
    start: (id = LEVELS[0].id) => startLevel(id, true),
    manual: (value = true) => {
      manualClock = Boolean(value);
      practice();
      lastFrame = 0;
    },
    step: (seconds) => {
      if (!manualClock) throw new Error('Enable manual clock first.');
      practice();
      advance(Math.min(120, Math.max(0, Number(seconds) || 0)));
      return snapshot();
    },
    action: doAction,
    set: (values) => {
      if (!run) return;
      practice();
      for (const key of ['distance', 'remaining', 'world', 'combo', 'collisions'])
        if (Number.isFinite(values?.[key])) run[key] = Math.max(0, values[key]);
      if (Number.isFinite(values?.remaining)) {
        run.remaining = Math.min(run.level.duration, run.remaining);
        run.elapsed = run.level.duration - run.remaining;
      }
      updateHud();
      paint();
    },
  };
  cleanActions = SmallGamesDev.registerActions(
    LEVELS.map((level) => ({
      id: `chase-${level.id}`,
      label: `试玩 · ${level.name}`,
      run: () => startLevel(level.id, true),
    })),
  );
  cleanSnapshot = SmallGamesDev.registerSnapshot(snapshot);
}
on(window, 'pagehide', (event) => {
  clearTimeout(captureTimer);
  if (screen === 'caught') setScreen('won');
  pause();
  cancelAnimationFrame(frameId);
  audio.stop();
  if (!event.persisted) {
    listeners.abort();
    cleanActions?.();
    cleanSnapshot?.();
    scene?.destroy();
    audio.destroy();
    delete window.__chaseDev;
  }
});
on(window, 'pageshow', (event) => {
  if (event.persisted) {
    lastFrame = 0;
    frameId = requestAnimationFrame(frame);
    syncHost();
  }
});

try {
  const errors = validateLevels();
  if (errors.length) throw new Error(errors.join('\n'));
  const { createScene } = await import('./scene.mjs');
  scene = createScene($('scene'));
  renderHome();
  renderLevels();
  setupDev();
  game.dataset.ready = 'true';
  setScreen('home');
  frameId = requestAnimationFrame(frame);
} catch (error) {
  console.error('追捕场景加载失败', error);
  $('loading').hidden = false;
}

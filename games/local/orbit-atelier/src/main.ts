import '../dev-mode.js';
import './fullscreen.js';
import './style.css';
import {
  angleDistance,
  createState,
  findHint,
  getBlockers,
  isComplete,
  isLocked,
  normalizeAngle,
  rotateRing,
  tryRelease,
  type State,
} from './core.ts';
import { CHAPTERS, LEVELS } from './levels.ts';
import { fitScene, heroArt, ringArt, skyArt, star } from './art.ts';
import { SAVE_KEY, parseProgress, settle, unlockedIndex, type Run } from './storage.ts';

type Screen = 'home' | 'levels' | 'playing' | 'paused' | 'result' | 'settings' | 'help';
const app = document.querySelector<HTMLDivElement>('#orbit-app')!;
let raw: string | null = null;
try {
  raw = localStorage.getItem(SAVE_KEY);
} catch {
  /* Memory-only play remains available. */
}
const progress = parseProgress(raw);
let screen: Screen = 'home';
let returnScreen: Screen = 'home';
let run: Run | null = progress.run ? structuredClone(progress.run) : null;
let history: Run[] = [];
let practice = false;
let selectedRingId: string | null = null;
let hint: { ringId: string; angle: number } | null = null;
let drag: { id: number; ringId: string; pointerAngle: number; before: Run; moved: boolean } | null =
  null;
let toastTimer: ReturnType<typeof setTimeout>;
let animationTimer: ReturnType<typeof setTimeout>;
let ghost: { state: State; ringId: string } | null = null;
let audio: AudioContext | null = null;
let medal = 0;
const icons = {
  back: '<path d="m15 5-7 7 7 7"/>',
  pause:
    '<rect x="7" y="5" width="3" height="14" rx=".6" fill="currentColor" stroke="none"/><rect x="14" y="5" width="3" height="14" rx=".6" fill="currentColor" stroke="none"/>',
  undo: '<path d="M8 5 3 10l5 5M3 10h10a6 6 0 0 1 0 12"/>',
  hint: '<path d="M8 17c0-3-3-4-3-8a7 7 0 1 1 14 0c0 4-3 5-3 8M8 17h8M9 21h6"/>',
  settings:
    '<circle cx="12" cy="12" r="4"/><path d="m9 3 1-2h4l1 2 3 2 2-1 2 4-2 2v4l2 2-2 4-2-1-3 2-1 2h-4l-1-2-3-2-2 1-2-4 2-2v-4L2 8l2-4 2 1Z"/>',
  levels:
    '<ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-30 12 12)"/><circle cx="12" cy="12" r="7"/><path d="M12 1v4M12 19v4"/>',
  lock: '<rect x="6" y="10" width="12" height="11" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',
};
const icon = (name: keyof typeof icons) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;
const button = (action: string, label: string, cls = '', content = label) =>
  `<button type="button" data-action="${action}" class="${cls}" aria-label="${label}">${content}</button>`;
const topbar = (title: string, back = 'home', right = '') =>
  `<header class="topbar">${button(back, '返回', 'icon-button', icon('back'))}<div><h1>${title}</h1><span class="title-rule">✦</span></div>${right || '<span class="top-spacer"></span>'}</header>`;

function save() {
  if (!practice) progress.run = run && !isComplete(run.state) ? structuredClone(run) : null;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
  } catch {
    /* Storage is optional. */
  }
}
function announceHost() {
  if (window.parent === window) return;
  try {
    window.parent.postMessage(
      {
        type: 'small-games:display-state',
        gameId: 'orbit-atelier',
        screen: ['playing', 'paused', 'result'].includes(screen) ? 'playing' : 'home',
      },
      new URL(document.referrer).origin,
    );
  } catch {
    /* Independent and unrelated embeds need no Shell navigation. */
  }
}
function sound(success = true) {
  if (!progress.settings.sound) return;
  try {
    audio ??= new AudioContext();
    void audio.resume();
    const now = audio.currentTime;
    for (const [offset, frequency] of success
      ? [
          [0, 523.25],
          [0.07, 783.99],
          [0.14, 1046.5],
        ]
      : [[0, 180]]) {
      const oscillator = audio.createOscillator(),
        gain = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now + offset);
      gain.gain.linearRampToValueAtTime(0.065, now + offset + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.28);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.3);
    }
  } catch {
    /* Audio may be unavailable in an embedded WebView. */
  }
  if (success && progress.settings.vibration) navigator.vibrate?.(20);
}
function notify(message: string) {
  clearTimeout(toastTimer);
  const output = app.querySelector<HTMLElement>('#feedback');
  if (!output) return;
  output.textContent = message;
  output.classList.add('visible');
  toastTimer = setTimeout(() => output.classList.remove('visible'), 2400);
}
function start(index: number, trial = false) {
  if (!LEVELS[index] || (!trial && index > unlockedIndex(progress))) return;
  cancelDrag();
  clearTimeout(animationTimer);
  ghost = null;
  practice = trial;
  history = [];
  hint = null;
  selectedRingId = null;
  run = { state: createState(LEVELS[index]), moves: 0, hints: 0 };
  save();
  screen = 'playing';
  render();
}
function cancelDrag() {
  if (drag && run) run = structuredClone(drag.before);
  drag = null;
}
function navigate(next: Screen) {
  cancelDrag();
  ghost = null;
  clearTimeout(animationTimer);
  if (next === 'home' && practice) {
    run = progress.run ? structuredClone(progress.run) : null;
    practice = false;
    history = [];
    hint = null;
    selectedRingId = null;
  }
  if ((next === 'playing' || next === 'paused') && run && isComplete(run.state)) next = 'result';
  save();
  screen = next;
  render();
}
function render() {
  app.dataset.ready = 'true';
  app.dataset.screen = screen;
  app.classList.toggle('reduced-motion', progress.settings.reducedMotion);
  const complete = LEVELS.filter((level) => progress.medals[level.id]).length;
  let content = '';
  if (screen === 'home')
    content = `<section class="home"><div class="home-eyebrow">✧ 慢一点，解开每一道星光 ✧</div><div class="compass" aria-hidden="true"><span>✦</span></div><h1 class="wordmark">星扣工坊</h1><p class="english">ORBIT ATELIER</p><div class="hero">${heroArt()}</div><div class="home-bottom">${button('start', run ? '继续解扣' : '开始解扣', 'primary start-button', `<span>✧</span>${run ? '继续解扣' : '开始解扣'}<span>✧</span>`)}<div class="home-links">${button('levels', '选关', 'home-link', `${icon('levels')}<span>选关</span>`)}<i></i>${button('settings', '设置', 'home-link', `${icon('settings')}<span>设置</span>`)}</div><p class="progress-caption">${complete ? `已点亮 ${complete} / ${LEVELS.length} 张星盘` : '一指旋转 · 慢慢解扣'}</p></div></section>`;
  if (screen === 'levels')
    content = `${topbar('选择星盘')}<section class="chapters">${CHAPTERS.map(
      (chapter, chapterIndex) => {
        const levels = LEVELS.filter((level) => level.chapter === chapter.id);
        const earned = levels.filter((level) => progress.medals[level.id]).length;
        return `<article class="chapter"><div class="chapter-heading"><div class="chapter-emblem emblem-${chapterIndex}">${icon(chapterIndex === 1 ? 'lock' : 'levels')}</div><div><span class="chapter-kicker">CHAPTER 0${chapter.id}</span><h2>${chapter.name}</h2><p>${chapter.description}</p></div><span class="chapter-count">${earned}/8</span></div><div class="level-grid">${levels
          .map((level, i) => {
            const index = LEVELS.indexOf(level),
              unlocked = index <= unlockedIndex(progress),
              score = progress.medals[level.id];
            return `<button type="button" data-level="${level.id}" class="level ${score ? 'completed' : ''} ${index === unlockedIndex(progress) ? 'current' : ''}" ${unlocked ? '' : 'disabled'} aria-label="第${index + 1}关 ${level.name}${unlocked ? '' : '，未解锁'}"><span>${unlocked ? i + 1 : icon('lock')}</span>${score ? `<small>${'✦'.repeat(score)}</small>` : ''}</button>`;
          })
          .join('')}</div></article>`;
      },
    ).join('')}</section>`;
  if (screen === 'playing' && run) {
    const index = LEVELS.findIndex((level) => level.id === run!.state.levelId);
    content = `${topbar(`第 ${index + 1} 关`, 'pause', button('pause', '暂停', 'icon-button', icon('pause')))}<section class="play"><p class="level-caption">${practice ? '开发试玩 · 不记录进度' : LEVELS[index].name} <span>${run.state.releasedCount} / ${run.state.rings.length}</span></p><svg id="ring-board" viewBox="0 0 360 430" role="application" aria-label="拖动圆环转动缺口，松手解扣" tabindex="0"></svg><div class="in-scene-note">${index < 2 ? '拖动圆环，让缺口对准连接处' : LEVELS[index].intro || ''}</div><div class="play-tools">${button('undo', '撤回', 'secondary', `${icon('undo')}撤回`)}${button('hint', '提示', 'primary', `${icon('hint')}提示`)}</div></section>`;
  }
  if (screen === 'paused')
    content = `${topbar('歇一会儿', 'resume')}<section class="center-page"><div class="large-emblem">✦</div><p class="english">A MOMENT OF STILLNESS</p><h2>星光会等你</h2><p>这张星盘已为你保留。</p><div class="stack">${button('resume', '继续解扣', 'primary')}${button('retry', '重新开始', 'secondary')}${button('home', '返回工坊', 'text-button')}</div></section>`;
  if (screen === 'result' && run) {
    const index = LEVELS.findIndex((level) => level.id === run!.state.levelId);
    content = `${topbar('星盘点亮')}<section class="center-page result"><div class="result-art">${heroArt()}</div><p class="english">CONSTELLATION RESTORED</p><h2>${practice ? '试玩完成' : index === LEVELS.length - 1 ? '满天星光，因你亮起' : '又解开一片星光'}</h2><div class="medals" aria-label="${medal}颗星">${[1, 2, 3].map((n) => `<span class="${n <= medal ? 'earned' : ''}">✦</span>`).join('')}</div><p>${run.moves} 次转动${run.hints ? ` · ${run.hints} 次提示` : ' · 独立解扣'}</p><div class="stack">${index < LEVELS.length - 1 ? button('next', '下一张星盘', 'primary') : button('levels', '查看全部星盘', 'primary')}${button('retry', '再解一次', 'secondary')}${button('home', '返回工坊', 'text-button')}</div></section>`;
  }
  if (screen === 'settings')
    content = `${topbar('工坊设置')}<section class="settings"><p class="english">MAKE YOURSELF AT HOME</p>${[
      ['sound', '声音', '轻柔的解扣音'],
      ['vibration', '触感', '解开时轻轻震动'],
      ['reducedMotion', '减少动态', '收起飞离与浮动效果'],
    ]
      .map(
        ([key, label, description]) =>
          `<label class="setting"><span><strong>${label}</strong><small>${description}</small></span><input type="checkbox" data-setting="${key}" ${progress.settings[key as keyof typeof progress.settings] ? 'checked' : ''}><i aria-hidden="true"></i></label>`,
      )
      .join(
        '',
      )}<div class="stack">${button('help', '解扣指南', 'secondary')}<button type="button" data-game-fullscreen>全屏</button></div></section>`;
  if (screen === 'help')
    content = `${topbar('解扣指南', 'back')}<section class="help"><div class="help-illustration">${heroArt()}</div><h2>转一转，找一个出口</h2><p>按住圆环的实心部分，沿圆周拖动。让缺口盖住与其他圆环的两处交点，再松手。</p><h3>从外围开始</h3><p>一只圆环连着多个方向时，先解开它旁边的圆环。已经没有连接的圆环，点一下即可收起。</p><h3>解开星栓</h3><p>带锁标记的圆环暂时固定。先解开其他圆环，达到所需数量后，星栓会自动开启。</p><h3>随时慢下来</h3><p>撤回可恢复上一次转动。提示会标出能解开的圆环和缺口方向。使用提示会获得一颗星，独立完成可获得更多星光。</p>${button('back', '明白了', 'primary')}</section>`;
  app.innerHTML = `<div class="paper-frame">${content}<div id="feedback" role="status" aria-live="polite"></div></div>`;
  if (screen === 'playing') {
    drawBoard();
    const board = app.querySelector<SVGSVGElement>('#ring-board')!;
    board.addEventListener('pointerdown', pointerDown);
    board.addEventListener('pointermove', pointerMove);
    board.addEventListener('pointerup', pointerUp);
    board.addEventListener('pointercancel', () => {
      cancelDrag();
      drawBoard();
      save();
    });
    board.addEventListener('lostpointercapture', () => {
      if (drag) {
        cancelDrag();
        drawBoard();
        save();
      }
    });
    board.addEventListener('keydown', keyInput);
  }
  announceHost();
}
function drawBoard() {
  const board = app.querySelector('#ring-board');
  if (!board || !run) return;
  const fit = fitScene(run.state);
  board.innerHTML = `${skyArt()}<g data-scene transform="${fit.transform}">${run.state.rings.map((ring, i) => (ring.removed ? '' : ringArt(ring, i, ring.id === selectedRingId || ring.id === hint?.ringId, isLocked(run!.state, ring.id), Math.max(0, (ring.unlockAfter || 0) - run!.state.releasedCount)))).join('')}${
    hint
      ? (() => {
          const ring = run!.state.rings.find((r) => r.id === hint!.ringId)!;
          return `<g class="hint-target" transform="translate(${ring.x} ${ring.y})"><path d="M${Math.cos(hint.angle) * (ring.r + 20)} ${Math.sin(hint.angle) * (ring.r + 20)} L${Math.cos(hint.angle) * (ring.r + 36)} ${Math.sin(hint.angle) * (ring.r + 36)}" stroke="#27766e" stroke-width="2"/>${star(Math.cos(hint.angle) * (ring.r + 40), Math.sin(hint.angle) * (ring.r + 40), 6, '#27766e')}</g>`;
        })()
      : ''
  }${ghost ? `<g class="escaping">${ringArt(ghost.state.rings.find((r) => r.id === ghost!.ringId)!, 0)}</g>` : ''}</g>`;
  const undo = app.querySelector<HTMLButtonElement>('[data-action="undo"]');
  if (undo) undo.disabled = !history.length || isComplete(run.state);
  const hintButton = app.querySelector<HTMLButtonElement>('[data-action="hint"]');
  if (hintButton) hintButton.disabled = !!ghost || isComplete(run.state);
  const caption = app.querySelector('.level-caption span');
  if (caption) caption.textContent = `${run.state.releasedCount} / ${run.state.rings.length}`;
}
function boardPoint(event: PointerEvent) {
  const scene = app.querySelector<SVGGraphicsElement>('[data-scene]');
  const matrix = scene?.getScreenCTM();
  if (!matrix) return null;
  return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
}
function pointerDown(event: PointerEvent) {
  if (!run || drag || event.button !== 0 || screen !== 'playing' || ghost) return;
  const point = boardPoint(event);
  if (!point) return;
  const scale =
    (fitScene(run.state).scale * app.querySelector('#ring-board')!.getBoundingClientRect().width) /
    360;
  const candidates = run.state.rings
    .filter((ring) => {
      if (ring.removed) return false;
      const distance = Math.hypot(point.x - ring.x, point.y - ring.y),
        angle = Math.atan2(point.y - ring.y, point.x - ring.x);
      return (
        Math.abs(distance - ring.r) <= Math.max(16, 22 / scale) &&
        angleDistance(angle, ring.angle) > ring.gap / 2 - Math.asin(Math.min(1, 8 / ring.r))
      );
    })
    .sort(
      (a, b) =>
        Math.abs(Math.hypot(point.x - a.x, point.y - a.y) - a.r) -
        Math.abs(Math.hypot(point.x - b.x, point.y - b.y) - b.r),
    );
  const ring = candidates[0];
  if (!ring) return;
  event.preventDefault();
  selectedRingId = ring.id;
  if (isLocked(run.state, ring.id)) {
    notify(`再解开 ${(ring.unlockAfter || 0) - run.state.releasedCount} 个圆环，星栓就会开启`);
    sound(false);
    drawBoard();
    return;
  }
  drag = {
    id: event.pointerId,
    ringId: ring.id,
    pointerAngle: Math.atan2(point.y - ring.y, point.x - ring.x),
    before: structuredClone(run),
    moved: false,
  };
  (event.currentTarget as SVGSVGElement).setPointerCapture(event.pointerId);
  drawBoard();
}
function pointerMove(event: PointerEvent) {
  if (!run || !drag || drag.id !== event.pointerId) return;
  const point = boardPoint(event);
  if (!point) return;
  const ring = run.state.rings.find((r) => r.id === drag!.ringId)!;
  if (Math.hypot(point.x - ring.x, point.y - ring.y) < ring.r * 0.28) return;
  const angle = Math.atan2(point.y - ring.y, point.x - ring.x);
  const delta = normalizeAngle(angle - drag.pointerAngle);
  drag.moved ||= Math.abs(delta) > 0.004;
  rotateRing(run.state, ring.id, ring.angle + delta);
  drag.pointerAngle = angle;
  drawBoard();
}
function pointerUp(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.id || !run) return;
  const action = drag;
  drag = null;
  finishGesture(action.ringId, action.before, action.moved);
}
function finishGesture(ringId: string, before: Run, moved: boolean) {
  if (!run) return;
  const released = tryRelease(run.state, ringId);
  if (moved || released) {
    history.push(before);
    if (history.length > 80) history.shift();
    run.moves++;
  }
  if (released) {
    ghost = { state: structuredClone(before.state), ringId };
    const ring = ghost.state.rings.find((r) => r.id === ringId)!;
    ring.angle = run.state.rings.find((r) => r.id === ringId)!.angle;
    hint = null;
    selectedRingId = null;
    sound();
    if (isComplete(run.state)) medal = practice ? 0 : settle(progress, run);
    save();
    drawBoard();
    clearTimeout(animationTimer);
    animationTimer = setTimeout(
      () => {
        ghost = null;
        if (!run || screen !== 'playing') return;
        if (isComplete(run.state)) {
          screen = 'result';
          render();
        } else drawBoard();
      },
      progress.settings.reducedMotion ? 0 : 330,
    );
  } else {
    if (moved) {
      const blockers = getBlockers(run.state, ringId);
      notify(blockers.length > 1 ? '连接还在，先试试外围的圆环' : '再转一点，让缺口盖住两处交点');
    }
    save();
    drawBoard();
  }
}
function keyInput(event: KeyboardEvent) {
  if (!run || ghost || drag) return;
  const live = run.state.rings.filter((r) => !r.removed);
  if (event.key === 'Tab') return;
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault();
    const i = live.findIndex((r) => r.id === selectedRingId);
    selectedRingId =
      live[(i + (event.key === 'ArrowDown' ? 1 : live.length - 1) + live.length) % live.length]
        ?.id || null;
    drawBoard();
  }
  const ring = live.find((r) => r.id === selectedRingId) || live[0];
  if (!ring) return;
  if (
    event.key === 'ArrowLeft' ||
    event.key === 'ArrowRight' ||
    event.key === 'Enter' ||
    event.key === ' '
  ) {
    event.preventDefault();
    const before = structuredClone(run);
    selectedRingId = ring.id;
    if (isLocked(run.state, ring.id)) {
      notify('先解开其他圆环，让星栓开启');
      return;
    }
    const moved = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
    if (moved)
      rotateRing(
        run.state,
        ring.id,
        ring.angle + ((event.key === 'ArrowRight' ? 1 : -1) * Math.PI) / 18,
      );
    finishGesture(ring.id, before, moved);
  }
}
app.addEventListener('click', (event) => {
  const target = (event.target as Element).closest<HTMLElement>('[data-action],[data-level]');
  if (!target) return;
  if (target.dataset.level) {
    const index = LEVELS.findIndex((level) => level.id === target.dataset.level);
    start(index);
    return;
  }
  const action = target.dataset.action;
  if (action === 'start') {
    if (run && !isComplete(run.state)) {
      practice = false;
      history = [];
      screen = 'playing';
      render();
    } else start(unlockedIndex(progress));
  }
  if (action === 'levels') navigate('levels');
  if (action === 'settings') navigate('settings');
  if (action === 'home') navigate('home');
  if (action === 'pause' && screen === 'playing') navigate('paused');
  if (action === 'resume' && run) navigate('playing');
  if (action === 'retry' && run)
    start(
      LEVELS.findIndex((level) => level.id === run!.state.levelId),
      practice,
    );
  if (action === 'next' && run)
    start(LEVELS.findIndex((level) => level.id === run!.state.levelId) + 1, practice);
  if (action === 'help') {
    returnScreen = screen;
    navigate('help');
  }
  if (action === 'back') navigate(returnScreen);
  if (action === 'undo' && run && !isComplete(run.state) && history.length) {
    cancelDrag();
    clearTimeout(animationTimer);
    ghost = null;
    run = history.pop()!;
    hint = null;
    selectedRingId = null;
    save();
    drawBoard();
  }
  if (action === 'hint' && run && !isComplete(run.state) && !ghost && screen === 'playing') {
    cancelDrag();
    hint = findHint(run.state);
    if (hint) {
      run.hints++;
      save();
      drawBoard();
      notify('转动高亮圆环，让缺口朝向星标');
    } else notify('先解开外围圆环，让星栓开启');
  }
});
app.addEventListener('change', (event) => {
  const input = event.target as HTMLInputElement;
  const key = input.dataset.setting as keyof typeof progress.settings;
  if (key && key in progress.settings) {
    progress.settings[key] = input.checked;
    save();
    app.classList.toggle('reduced-motion', progress.settings.reducedMotion);
  }
});
function suspend() {
  if (screen === 'playing') navigate('paused');
  else cancelDrag();
  void audio?.suspend();
}
window.addEventListener('blur', suspend);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) suspend();
  else announceHost();
});
window.addEventListener('pagehide', () => {
  cancelDrag();
  save();
  void audio?.close();
  audio = null;
});
const unregisterSnapshot = window.SmallGamesDev.registerSnapshot(() => ({
  state: run?.state,
  progress,
  screen,
  selectedRingId,
  drag: drag ? { ringId: drag.ringId } : null,
  practice,
}));
const unregisterActions = window.SmallGamesDev.registerActions([
  {
    id: 'next-puzzle',
    label: '试玩下一关（不存进度）',
    run: () => {
      if (window.SmallGamesDev.isEnabled())
        start(
          ((run ? LEVELS.findIndex((l) => l.id === run!.state.levelId) : -1) + 1) % LEVELS.length,
          true,
        );
    },
  },
  {
    id: 'last-puzzle',
    label: '试玩最终星盘（不存进度）',
    run: () => {
      if (window.SmallGamesDev.isEnabled()) start(LEVELS.length - 1, true);
    },
  },
  {
    id: 'trial-map',
    label: '试玩全部星盘（不存进度）',
    run: () => {
      if (!window.SmallGamesDev.isEnabled()) return;
      navigate('levels');
      for (const node of app.querySelectorAll<HTMLButtonElement>('[data-level]')) {
        node.disabled = false;
        node.addEventListener('click', (e) => {
          e.stopPropagation();
          start(
            LEVELS.findIndex((level) => level.id === node.dataset.level),
            true,
          );
        });
      }
      notify('开发试玩，不改变玩家解锁');
    },
  },
]);
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) {
    unregisterSnapshot();
    unregisterActions();
  }
});
render();

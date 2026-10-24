import type { GameHost, JsonValue } from '@coffeeeeffoc/game-contract';
import type { CanvasPointerEvent } from '@coffeeeeffoc/canvas-game-adapter';
import { createHintRewards } from './rewards.ts';
import '../dev-mode.js';
import { createMossGame } from './controller.ts';
import { isAccessibleActionClick } from './web-input.ts';
import { defaultMossGardenEnvelope, mossGardenManifest, validateMossContent } from './canvas.ts';
import { resultTitle, type View, type HitArea } from './render.ts';
import './style.css';
import { createH5Publishing, type AdProvider } from '../../../../platforms/h5/publishing.js';

const root = document.querySelector<HTMLElement>('#garden')!;
const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const controls = document.querySelector<HTMLElement>('#controls')!;
const status = document.querySelector<HTMLElement>('#status')!;
const abort = new AbortController();
const options = { signal: abort.signal };
let memory: JsonValue | null = null;
const hintRewards = createHintRewards(
  globalThis as typeof globalThis & Parameters<typeof createHintRewards>[0],
);
const host: GameHost = {
  session: {
    gameId: 'moss-garden',
    gameVersion: mossGardenManifest.version,
    releaseChannel: 'stable',
    adAuthority: 'none',
    sessionId: 'moss-garden-local',
    locale: 'zh-CN',
    capabilities: ['content', 'storage', 'advertising'],
  },
  content: {
    async load() {
      return defaultMossGardenEnvelope;
    },
  },
  storage: {
    async read() {
      try {
        const raw = localStorage.getItem('moss-garden.save.v1');
        memory = raw ? JSON.parse(raw) : null;
      } catch {
        /* Storage is optional. */
      }
      return memory === null ? null : { value: memory, version: 'local' };
    },
    async write(_key, value) {
      memory = value;
      try {
        localStorage.setItem('moss-garden.save.v1', JSON.stringify(value));
      } catch {
        /* Keep the session save in memory. */
      }
      return { value, version: 'local' };
    },
  },
  ads: hintRewards,
  telemetry: { async track() {} },
  navigation: { async navigate() {} },
};
let pointerListener: ((event: CanvasPointerEvent) => void) | null = null;
let actionListener: ((id: string) => void) | null = null;
const activePointers = new Map<number, { x: number; y: number }>();
const buttons = new Map<string, HTMLButtonElement>();
let game: Awaited<ReturnType<typeof createMossGame>> | null = null;
let audio: AudioContext | undefined;
let publishingPaused = false;
const challengeParams = new URLSearchParams(location.search);
const challengeNumber = (key: string, maximum: number) => {
  const raw = challengeParams.get(key);
  return /^\d{1,9}$/.test(raw || '') && Number(raw) <= maximum ? Number(raw) : null;
};
const challengeHints = challengeNumber('targetHints', 10000),
  challengeMistakes = challengeNumber('targetMistakes', 10000),
  challengeTime = challengeNumber('targetTime', 604800000);
const challengeGoal =
  challengeHints !== null && challengeMistakes !== null && challengeTime !== null
    ? { hints: challengeHints, mistakes: challengeMistakes, elapsedMs: challengeTime }
    : undefined;
const publishingConfig = (
  globalThis as typeof globalThis & {
    SmallGamesPublishingConfig?: {
      adMode?: 'mock' | 'off' | 'host';
      provider?: AdProvider;
      publicUrl?: string;
    };
  }
).SmallGamesPublishingConfig;
const publishing = createH5Publishing({
  gameId: 'moss-garden',
  title: '苔光花园',
  adMode: publishingConfig?.adMode ?? 'mock',
  provider: publishingConfig?.provider,
  publicUrl: publishingConfig?.publicUrl,
  pause() {
    const wasSuspended = game?.isSuspended() ?? false;
    publishingPaused = true;
    cancel();
    game?.pause();
    void audio?.suspend().catch(() => {});
    return () => {
      publishingPaused = false;
      if (!wasSuspended && !document.hidden) game?.resume();
    };
  },
});

function resize() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(root.clientWidth * ratio);
  canvas.height = Math.round(root.clientHeight * ratio);
  game?.redraw();
}
function emit(event: PointerEvent, phase: CanvasPointerEvent['phase']) {
  const bounds = canvas.getBoundingClientRect();
  const x = ((event.clientX - bounds.left) * canvas.width) / bounds.width;
  const y = ((event.clientY - bounds.top) * canvas.height) / bounds.height;
  if (phase === 'down') {
    activePointers.set(event.pointerId, { x, y });
    root.setPointerCapture?.(event.pointerId);
  } else if (!activePointers.has(event.pointerId)) return;
  if (phase === 'move') activePointers.set(event.pointerId, { x, y });
  if (phase === 'up' || phase === 'cancel') activePointers.delete(event.pointerId);
  pointerListener?.({ phase, x, y, pointerId: event.pointerId });
  if ((phase === 'up' || phase === 'cancel') && root.hasPointerCapture?.(event.pointerId))
    root.releasePointerCapture(event.pointerId);
  event.preventDefault();
}
function cancel() {
  for (const [pointerId, point] of activePointers)
    pointerListener?.({ ...point, pointerId, phase: 'cancel' });
  activePointers.clear();
}
for (const [name, phase] of [
  ['pointerdown', 'down'],
  ['pointermove', 'move'],
  ['pointerup', 'up'],
  ['pointercancel', 'cancel'],
  ['lostpointercapture', 'cancel'],
] as const)
  root.addEventListener(name, (event) => emit(event, phase), options);
root.addEventListener(
  'click',
  (event) => {
    // Pointer gestures already dispatch once; keyboard and screen-reader clicks use actions.
    if (!isAccessibleActionClick(event)) return;
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-hit-id]');
    if (button) actionListener?.(button.dataset.hitId!);
  },
  options,
);
function mirror(view: View, hits: HitArea[]) {
  const live = new Set(hits.map((hit) => hit.id));
  for (const [id, button] of buttons)
    if (!live.has(id)) {
      button.remove();
      buttons.delete(id);
    }
  for (const hit of hits) {
    let button = buttons.get(hit.id);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.dataset.hitId = hit.id;
      controls.append(button);
      buttons.set(hit.id, button);
    }
    button.setAttribute('aria-label', hit.label);
    button.textContent = hit.label;
    button.dataset.action = hit.id === 'home:start' ? 'start' : hit.id;
    button.style.left = `${(hit.x / view.width) * 100}%`;
    button.style.top = `${(hit.y / view.height) * 100}%`;
    button.style.width = `${(hit.width / view.width) * 100}%`;
    button.style.height = `${(hit.height / view.height) * 100}%`;
    if (hit.id.startsWith('cell:'))
      button.setAttribute(
        'aria-pressed',
        String(view.puzzle.placed.includes(Number(hit.id.slice(5)))),
      );
    else if (hit.id === 'play:seed' || hit.id === 'play:mark')
      button.setAttribute('aria-pressed', String(hit.id === `play:${view.mode}`));
  }
  const title =
    view.page === 'result'
      ? resultTitle(view)
      : view.page === 'play' || view.page === 'pause'
        ? `第 ${view.level.number} 关 · ${view.level.title}`
        : view.page === 'levels'
          ? `关卡选择 · 第 ${view.levelChapter ?? 1} 章`
          : '苔光花园';
  canvas.setAttribute('aria-label', title);
  status.textContent =
    view.page === 'result'
      ? `${title}，${view.level.title}`
      : view.notice || view.puzzle.message || '';
  root.dataset.page = view.page;
}
function feedback(kind: 'place' | 'mark' | 'win', sound: boolean, vibration: boolean) {
  if (vibration)
    try {
      navigator.vibrate?.(kind === 'win' ? [25, 30, 25] : 12);
    } catch {
      /* Optional platform capability. */
    }
  if (!sound) return;
  try {
    audio ??= new AudioContext();
    void audio.resume().catch(() => {});
    const tones = kind === 'win' ? [440, 554, 660] : kind === 'place' ? [520] : [330];
    for (const [index, frequency] of tones.entries()) {
      const oscillator = audio.createOscillator(),
        gain = audio.createGain();
      const time = audio.currentTime + index * 0.09;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(0.04, time + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.13);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(time);
      oscillator.stop(time + 0.14);
    }
  } catch {
    /* Audio never blocks a puzzle move. */
  }
}
resize();
window.addEventListener('resize', resize, options);
window.addEventListener(
  'blur',
  () => {
    cancel();
    game?.pause();
    void audio?.suspend().catch(() => {});
  },
  options,
);
window.addEventListener(
  'focus',
  () => {
    if (!publishingPaused) game?.resume();
  },
  options,
);
document.addEventListener(
  'visibilitychange',
  () => {
    if (document.hidden) {
      cancel();
      game?.pause();
      void audio?.suspend().catch(() => {});
    } else if (!publishingPaused) game?.resume();
  },
  options,
);
window.addEventListener(
  'pagehide',
  () => {
    cancel();
    game?.cancelPendingHint();
    game?.pause();
  },
  options,
);
window.addEventListener(
  'pageshow',
  () => {
    if (!publishingPaused) game?.resume();
    resize();
  },
  options,
);

try {
  validateMossContent(defaultMossGardenEnvelope);
  game = await createMossGame(
    {
      canvas,
      native: false,
      challengeLevel: challengeParams.get('level') ?? undefined,
      challengeGoal,
      cancelHint: () => hintRewards.cancel(),
      minimumTouchSize: () => 44 * Math.min(window.devicePixelRatio || 1, 2),
      async naturalBreak() {
        await publishing.interstitial({ placement: 'result-exit', naturalBreak: true });
      },
      async shareChallenge(result) {
        const response = await publishing.share({
          text: `苔光花园第 ${result.levelNumber} 关：${Math.floor(result.elapsedMs / 1000)} 秒，${result.hints} 次提示、${result.mistakes} 次调整。来点亮同一片花圃！`,
          params: {
            level: result.levelId,
            targetHints: Math.min(10000, result.hints),
            targetMistakes: Math.min(10000, result.mistakes),
            targetTime: Math.min(604800000, Math.floor(result.elapsedMs)),
          },
        });
        return response.status === 'copied'
          ? '同关挑战链接已复制'
          : ['failed', 'unavailable'].includes(response.status)
            ? '分享暂不可用，仍可继续播种'
            : '';
      },
      dev: window.SmallGamesDev?.isEnabled() ?? false,
      onTap() {
        return () => {};
      },
      onPointer(listener) {
        pointerListener = listener;
        return () => {
          pointerListener = null;
        };
      },
      onAction(listener) {
        actionListener = listener;
        return () => {
          actionListener = null;
        };
      },
      onView: mirror,
      feedback,
    },
    host,
  );
  if (window.SmallGamesDev?.isEnabled()) {
    window.SmallGamesDev.registerActions([
      { id: 'moss-select', label: '任意选关（1–1000）', run: () => game?.act('dev:select') },
      { id: 'moss-next', label: '下一关（试玩）', run: () => game?.act('dev:next') },
      { id: 'moss-solve', label: '完成本关（试玩）', run: () => game?.act('dev:solve') },
    ]);
    window.SmallGamesDev.registerSnapshot(() => game?.snapshot());
  }
} catch {
  const error = document.createElement('div');
  error.id = 'load-error';
  const text = document.createElement('p');
  text.textContent = '花园暂时没有打开，请重新试一次。';
  const button = document.createElement('button');
  button.textContent = '重新打开';
  button.addEventListener('click', () => location.reload());
  error.append(text, button);
  root.append(error);
}

import type { GameHost, JsonValue } from '@coffeeeeffoc/game-contract';
import type { CanvasPointerEvent } from '@coffeeeeffoc/canvas-game-adapter';
import { createMossGame } from './controller.ts';
import { defaultMossGardenEnvelope, mossGardenManifest, validateMossContent } from './canvas.ts';
import type { View, HitArea } from './render.ts';
import './style.css';

const root = document.querySelector<HTMLElement>('#garden')!;
const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const controls = document.querySelector<HTMLElement>('#controls')!;
const status = document.querySelector<HTMLElement>('#status')!;
const abort = new AbortController();
const options = { signal: abort.signal };
let memory: JsonValue | null = null;
const host: GameHost = {
  session: {
    gameId: 'moss-garden',
    gameVersion: mossGardenManifest.version,
    releaseChannel: 'stable',
    adAuthority: 'none',
    sessionId: 'moss-garden-local',
    locale: 'zh-CN',
    capabilities: ['content', 'storage'],
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
  ads: {
    async offer() {
      return { status: 'unavailable' };
    },
  },
  telemetry: { async track() {} },
  navigation: { async navigate() {} },
};
let pointerListener: ((event: CanvasPointerEvent) => void) | null = null;
let actionListener: ((id: string) => void) | null = null;
const activePointers = new Map<number, { x: number; y: number }>();
const buttons = new Map<string, HTMLButtonElement>();
let game: Awaited<ReturnType<typeof createMossGame>> | null = null;
let audio: AudioContext | undefined;

function resize() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(root.clientWidth * ratio);
  canvas.height = Math.round(root.clientHeight * ratio);
  game?.redraw();
}
function emit(event: PointerEvent, phase: CanvasPointerEvent['phase']) {
  if ((event.target as HTMLElement).closest?.('[data-game-fullscreen]')) return;
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
    if (event.detail !== 0) return;
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-hit-id]');
    if (button && !button.hasAttribute('data-game-fullscreen'))
      actionListener?.(button.dataset.hitId!);
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
    if (hit.id === 'settings:fullscreen') button.setAttribute('data-game-fullscreen', '');
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
  status.textContent = view.puzzle.message || view.notice || '';
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
    game?.resume();
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
    } else game?.resume();
  },
  options,
);
window.addEventListener(
  'pagehide',
  () => {
    cancel();
    game?.pause();
  },
  options,
);
window.addEventListener(
  'pageshow',
  () => {
    game?.resume();
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
      async fullscreen() {
        buttons.get('settings:fullscreen')?.click();
      },
    },
    host,
  );
  if (window.SmallGamesDev?.isEnabled()) {
    window.SmallGamesDev.registerActions([
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

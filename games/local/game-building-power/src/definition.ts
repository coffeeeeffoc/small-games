import type { GameDefinition, GameInstance } from '@coffeeeeffoc/game-contract';
import type { CanvasPointerEvent, CanvasSound } from '@coffeeeeffoc/canvas-game-adapter';
import { buildingPowerCanvasDefinition, buildingPowerManifest } from './index.js';
import { WIDTH, HEIGHT, COMPACT_HEIGHT, type Hit } from './view.js';
import './style.css';
export { defaultBuildingPowerEnvelope } from './index.js';

const audioUrls: Record<string, string> = {
  connect: new URL('../public/building-power-audio/connect.wav', import.meta.url).href,
  disconnect: new URL('../public/building-power-audio/disconnect.wav', import.meta.url).href,
  complete: new URL('../public/building-power-audio/complete.wav', import.meta.url).href,
  alarm: new URL('../public/building-power-audio/alarm.wav', import.meta.url).href,
  win: new URL('../public/building-power-audio/win.wav', import.meta.url).href,
  lose: new URL('../public/building-power-audio/lose.wav', import.meta.url).href,
};

export const buildingPowerGameDefinition: GameDefinition = {
  manifest: buildingPowerManifest,
  async mount(target, host) {
    const root = document.createElement('section');
    root.className = 'bp-root';
    root.setAttribute('aria-label', '忙碌的电工');
    if (target.classList.contains('game-slot')) root.dataset.embedded = 'true';
    const toolbar = document.createElement('div');
    toolbar.className = 'bp-toolbar';
    const fullscreen = document.createElement('button');
    fullscreen.textContent = '全屏游玩';
    fullscreen.type = 'button';
    const help = document.createElement('span');
    help.textContent = '拖线 · 点击 · Tab + 回车';
    toolbar.append(help, fullscreen);
    const stage = document.createElement('div');
    stage.className = 'bp-stage';
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    canvas.setAttribute('aria-label', '楼宇供电调度画面');
    const controls = document.createElement('div');
    controls.className = 'bp-controls';
    controls.setAttribute('aria-label', '游戏操作');
    const status = document.createElement('p');
    status.className = 'bp-sr';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    stage.append(canvas, controls);
    root.append(toolbar, stage, status);
    target.append(root);
    let instance: GameInstance | null = null,
      pointerListener: ((event: CanvasPointerEvent) => void) | null = null,
      actionListener: ((id: string) => void) | null = null;
    let disposed = false,
      statusSecond = -1;
    let redraw: (() => void) | null = null;
    let logicalHeight = HEIGHT;
    const active = new Map<number, { x: number; y: number }>(),
      buttons = new Map<string, HTMLButtonElement>();
    const abort = new AbortController(),
      options = { signal: abort.signal };
    const resize = () => {
      const available = window.innerHeight - Math.max(0, root.getBoundingClientRect().top);
      root.style.setProperty('--bp-available', `${available}px`);
      logicalHeight = available < 730 ? COMPACT_HEIGHT : HEIGHT;
      stage.style.aspectRatio = `${WIDTH} / ${logicalHeight}`;
      stage.style.setProperty('--bp-ratio', String(WIDTH / logicalHeight));
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = WIDTH * ratio;
      canvas.height = logicalHeight * ratio;
      redraw?.();
    };
    resize();
    window.addEventListener('resize', resize, options);
    function emit(event: PointerEvent, phase: CanvasPointerEvent['phase']) {
      const bounds = canvas.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) * canvas.width) / bounds.width,
        y = ((event.clientY - bounds.top) * canvas.height) / bounds.height;
      if (phase === 'down') {
        active.set(event.pointerId, { x, y });
        canvas.setPointerCapture?.(event.pointerId);
      } else if (!active.has(event.pointerId)) return;
      if (phase === 'move') active.set(event.pointerId, { x, y });
      if (phase === 'up' || phase === 'cancel') active.delete(event.pointerId);
      pointerListener?.({ phase, x, y, pointerId: event.pointerId });
      if (phase === 'up' || phase === 'cancel') {
        if (canvas.hasPointerCapture?.(event.pointerId))
          canvas.releasePointerCapture(event.pointerId);
      }
      event.preventDefault();
    }
    for (const [name, phase] of [
      ['pointerdown', 'down'],
      ['pointermove', 'move'],
      ['pointerup', 'up'],
      ['pointercancel', 'cancel'],
      ['lostpointercapture', 'cancel'],
    ] as const)
      canvas.addEventListener(name, (event) => emit(event, phase), options);
    function cancel() {
      for (const [pointerId, point] of active)
        pointerListener?.({ phase: 'cancel', pointerId, ...point });
      active.clear();
    }
    const visibility = () => {
      cancel();
      if (document.hidden) instance?.pause();
      else instance?.resume();
    };
    document.addEventListener('visibilitychange', visibility, options);
    window.addEventListener(
      'blur',
      () => {
        cancel();
        instance?.pause();
      },
      options,
    );
    window.addEventListener('focus', () => instance?.resume(), options);
    root.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape') {
          cancel();
          actionListener?.('pause');
        }
      },
      options,
    );
    const fullscreenLabel = () => {
      fullscreen.textContent = document.fullscreenElement ? '退出全屏' : '全屏游玩';
      resize();
      cancel();
    };
    document.addEventListener('fullscreenchange', fullscreenLabel, options);
    fullscreen.addEventListener(
      'click',
      () => {
        const operation = document.fullscreenElement
          ? document.exitFullscreen()
          : root.requestFullscreen?.();
        if (operation)
          void operation.catch(() => {
            status.textContent = '当前浏览器未允许全屏，可继续在页面游玩。';
          });
        else status.textContent = '当前浏览器不支持全屏，可继续在页面游玩。';
      },
      options,
    );
    function present(hits: readonly Hit[], text: string) {
      const ids = new Set(hits.map((h) => h.id));
      for (const [id, button] of buttons)
        if (!ids.has(id)) {
          button.remove();
          buttons.delete(id);
        }
      for (const hit of hits) {
        let button = buttons.get(hit.id);
        if (!button) {
          button = document.createElement('button');
          button.type = 'button';
          button.dataset.action = hit.id;
          button.addEventListener('click', () => actionListener?.(hit.id), options);
          buttons.set(hit.id, button);
          controls.append(button);
        }
        button.textContent = hit.label;
        button.disabled = !!hit.disabled;
        button.style.left = `${(hit.x / WIDTH) * 100}%`;
        button.style.top = `${(hit.y / logicalHeight) * 100}%`;
        button.style.width = `${(hit.w / WIDTH) * 100}%`;
        button.style.height = `${(hit.h / logicalHeight) * 100}%`;
      }
      // Text is available immediately for assistive controls; live announcements are throttled.
      canvas.setAttribute('aria-label', text);
      const second = Math.floor(Date.now() / 1000);
      if (second !== statusSecond) {
        statusSecond = second;
        status.textContent = text;
      }
    }
    try {
      instance = await buildingPowerCanvasDefinition.mount(
        {
          canvas,
          onTap: () => () => {},
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
          onResize(listener) {
            redraw = listener;
            return () => {
              redraw = null;
            };
          },
          present,
          createSound(src, settings): CanvasSound {
            const name = src.split('/').at(-1)?.replace('.wav', '') ?? '';
            const audio = new Audio(audioUrls[name] ?? src);
            audio.volume = settings?.volume ?? 0.55;
            audio.loop = settings?.loop ?? false;
            return {
              play() {
                audio.currentTime = 0;
                void audio.play().catch(() => undefined);
              },
              stop() {
                audio.pause();
                audio.currentTime = 0;
              },
              setVolume(volume) {
                audio.volume = volume;
              },
              dispose() {
                audio.pause();
                audio.removeAttribute('src');
                audio.load();
              },
            };
          },
        },
        host,
      );
      if (document.hidden) instance.pause();
    } catch (error) {
      abort.abort();
      root.remove();
      throw error;
    }
    return {
      pause() {
        cancel();
        instance?.pause();
      },
      resume() {
        instance?.resume();
      },
      async dispose() {
        if (disposed) return;
        disposed = true;
        cancel();
        abort.abort();
        if (document.fullscreenElement === root)
          await document.exitFullscreen().catch(() => undefined);
        await instance?.dispose();
        root.remove();
      },
    };
  },
};

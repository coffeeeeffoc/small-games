import type { GameDefinition, GameInstance } from '@coffeeeeffoc/game-contract';
import { browserMedia } from './browser-media.js';
import type { CanvasPointerEvent, CanvasSound } from '@coffeeeeffoc/canvas-game-adapter';
import { castleCannonCanvasDefinition, castleCannonManifest } from './index.js';
import type { Hit } from './view.js';
import { W, H } from './duel-hud.js';
import { editServer } from './duel-server-editor.js';
import './style.css';
export const castleCannonGameDefinition: GameDefinition = {
  manifest: castleCannonManifest,
  async mount(target, host) {
    const root = document.createElement('section');
    root.className = 'castle-root';
    root.setAttribute('aria-label', '一炮拆城');
    root.dataset.gameDisplayHost = '';
    const stage = document.createElement('div');
    stage.className = 'castle-stage';
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    canvas.id = 'battle';
    canvas.tabIndex = 0;
    const controls = document.createElement('div');
    controls.className = 'castle-controls';
    const full = document.createElement('button');
    full.dataset.gameFullscreen = '';
    full.textContent = '全屏';
    full.className = 'castle-fullscreen';
    const status = document.createElement('p');
    status.className = 'sr';
    status.setAttribute('role', 'status');
    stage.append(canvas, controls);
    root.append(stage, full, status);
    target.append(root);
    let pointerListener: ((e: CanvasPointerEvent) => void) | null = null,
      actionListener: ((id: string) => void) | null = null,
      redraw: (() => void) | null = null,
      instance: GameInstance | null = null,
      layoutViewport = '';
    const buttons = new Map<string, HTMLButtonElement>(),
      active = new Set<number>(),
      abort = new AbortController(),
      options = { signal: abort.signal };
    function cancel() {
      for (const pointerId of active) pointerListener?.({ phase: 'cancel', pointerId, x: 0, y: 0 });
      active.clear();
    }
    function resize() {
      cancel();
      const width = window.innerWidth,
        height = window.innerHeight,
        portrait = height > width;
      layoutViewport = `${width}:${height}`;
      root.dataset.rotated = String(portrait);
      root.style.width = `${portrait ? height : width}px`;
      root.style.height = `${portrait ? width : height}px`;
      const rw = portrait ? height : width,
        rh = portrait ? width : height;
      const scale = Math.min(rw / W, rh / H);
      stage.style.width = `${W * scale}px`;
      stage.style.height = `${H * scale}px`;
      redraw?.();
    }
    function point(e: PointerEvent, phase: CanvasPointerEvent['phase']) {
      if (layoutViewport !== `${window.innerWidth}:${window.innerHeight}`) {
        resize();
        if (phase !== 'down') return;
      }
      if (phase === 'down') {
        active.add(e.pointerId);
        canvas.focus({ preventScroll: true });
        try {
          canvas.setPointerCapture?.(e.pointerId);
        } catch {
          /* Window fallback retains this gesture. */
        }
      } else if (!active.has(e.pointerId)) return;
      const rect = canvas.getBoundingClientRect(),
        rotated = root.dataset.rotated === 'true';
      const x = rotated
        ? ((e.clientY - rect.top) / rect.height) * W
        : ((e.clientX - rect.left) / rect.width) * W;
      const y = rotated
        ? ((rect.right - e.clientX) / rect.width) * H
        : ((e.clientY - rect.top) / rect.height) * H;
      if (phase === 'up' || phase === 'cancel') active.delete(e.pointerId);
      pointerListener?.({ phase, x, y, pointerId: e.pointerId });
      e.preventDefault();
      if ((phase === 'up' || phase === 'cancel') && canvas.hasPointerCapture?.(e.pointerId))
        canvas.releasePointerCapture(e.pointerId);
    }
    for (const [name, phase] of [
      ['pointerdown', 'down'],
      ['pointermove', 'move'],
      ['pointerup', 'up'],
      ['pointercancel', 'cancel'],
      ['lostpointercapture', 'cancel'],
    ] as const)
      canvas.addEventListener(name, (e) => point(e, phase), options);
    window.addEventListener(
      'pointermove',
      (e) => {
        if (e.target !== canvas) point(e, 'move');
      },
      { ...options, capture: true },
    );
    window.addEventListener(
      'pointerup',
      (e) => {
        if (active.has(e.pointerId)) {
          point(e, 'up');
          e.stopPropagation();
        }
      },
      { ...options, capture: true },
    );
    window.addEventListener('pointercancel', (e) => point(e, 'cancel'), {
      ...options,
      capture: true,
    });
    window.addEventListener('resize', resize, options);
    document.addEventListener('fullscreenchange', resize, options);
    document.addEventListener('game-displaychange', resize, options);
    window.addEventListener(
      'blur',
      () => {
        cancel();
        instance?.pause();
      },
      options,
    );
    window.addEventListener('focus', () => instance?.resume(), options);
    document.addEventListener(
      'visibilitychange',
      () => {
        cancel();
        if (document.hidden) instance?.pause();
        else instance?.resume();
      },
      options,
    );
    root.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') {
          cancel();
          actionListener?.('pause');
        }
      },
      options,
    );
    function present(hits: readonly Hit[], label: string, screen: string) {
      root.dataset.screen = screen;
      root.dataset.ready = 'true';
      full.hidden = screen !== 'home' && screen !== 'settings' && screen !== 'paused';
      const ids = new Set(hits.map((h) => h.id));
      for (const [id, b] of buttons)
        if (!ids.has(id)) {
          b.remove();
          buttons.delete(id);
        }
      for (const h of hits) {
        let b = buttons.get(h.id);
        if (!b) {
          b = document.createElement('button');
          b.type = 'button';
          b.dataset.action = h.id;
          b.addEventListener(
            'pointerdown',
            (e) => {
              point(e, 'down');
            },
            options,
          );
          b.addEventListener(
            'click',
            (e) => {
              if (e.detail === 0 && !e.pointerType) actionListener?.(h.id);
            },
            options,
          );
          controls.append(b);
          buttons.set(h.id, b);
        }
        b.textContent = h.label;
        b.setAttribute('aria-label', h.label);
        b.disabled = !!h.disabled;
        b.style.left = `${(h.x / W) * 100}%`;
        b.style.top = `${(h.y / H) * 100}%`;
        b.style.width = `${(h.w / W) * 100}%`;
        b.style.height = `${(h.h / H) * 100}%`;
      }
      canvas.setAttribute('aria-label', label);
      if (status.textContent !== label) status.textContent = label;
    }
    resize();
    try {
      instance = await castleCannonCanvasDefinition.mount(
        {
          canvas,
          onTap: () => () => {},
          onPointer(fn) {
            pointerListener = fn;
            return () => {
              pointerListener = null;
            };
          },
          onAction(fn) {
            actionListener = fn;
            return () => {
              actionListener = null;
            };
          },
          onResize(fn) {
            redraw = fn;
            return () => {
              redraw = null;
            };
          },
          present,
          configureServer: (current) => editServer(root, current),
          ...browserMedia(target),
          installScene(sceneCanvas) {
            sceneCanvas.className = 'castle-scene';
            sceneCanvas.setAttribute('aria-hidden', 'true');
            stage.prepend(sceneCanvas);
            return true;
          },
          presentTargets(points, metrics) {
            canvas.dataset.targets = JSON.stringify(points);
            canvas.dataset.renderer = JSON.stringify(metrics);
          },
          createSound(src, settings): CanvasSound {
            const audio = new Audio(
              new URL(
                src,
                new URL(
                  document.baseURI.includes('/games/castle-cannon/')
                    ? './'
                    : target.closest('.game-page')
                      ? './games/castle-cannon/'
                      : './',
                  document.baseURI,
                ),
              ).href,
            );
            audio.volume = settings?.volume ?? 0.35;
            return {
              play() {
                audio.currentTime = 0;
                void audio.play().catch(() => undefined);
              },
              stop() {
                audio.pause();
                audio.currentTime = 0;
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
        cancel();
        abort.abort();
        await instance?.dispose();
        root.remove();
      },
    };
  },
};

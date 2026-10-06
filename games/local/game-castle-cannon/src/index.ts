import { gameManifestSchema, HostError, type GameDefinition } from '@coffeeeeffoc/game-contract';
import type {
  CanvasGameTarget,
  CanvasPointerEvent,
  CanvasSound,
} from '@coffeeeeffoc/canvas-game-adapter';
import type { DynamicContentEnvelope } from '@coffeeeeffoc/content-schema';
import manifest from './manifest.json';
import { aimPoint } from './projection.js';
import { createSiegeScene } from './scene-factory.js';
import type { TargetPoint } from './scene.js';
import { createSession } from './session.js';
import { draw, W, H, type Hit } from './view.js';
export const castleCannonManifest = gameManifestSchema.parse(manifest);
export const defaultCastleCannonEnvelope: DynamicContentEnvelope = {
  gameId: 'castle-cannon',
  schemaVersion: 1,
  revision: 1,
  payload: { title: '一炮拆城' },
};
export type CastleTarget = CanvasGameTarget & {
  present?(hits: readonly Hit[], status: string, screen: string): void;
  onAction?(fn: (id: string) => void): () => void;
  onResize?(fn: () => void): () => void;
  presentTargets?(points: TargetPoint[], metrics: object): void;
  installScene?(canvas: HTMLCanvasElement): boolean;
};
export const castleCannonCanvasDefinition: GameDefinition<CastleTarget> = {
  manifest: castleCannonManifest,
  async mount(target, host) {
    const content = await host.content.load();
    if (
      content.gameId !== 'castle-cannon' ||
      content.schemaVersion !== 1 ||
      host.session.gameId !== 'castle-cannon' ||
      host.session.gameVersion !== castleCannonManifest.version
    )
      throw new HostError({
        code: 'CONTENT_INCOMPATIBLE',
        message: 'Invalid castle-cannon content/session',
      });
    const ctx = target.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    const sounds = new Map<string, CanvasSound>();
    const play = (name: string) => {
      try {
        let clip = sounds.get(name);
        if (!clip) {
          clip = target.createSound?.(`castle-cannon-audio/${name}.wav`);
          if (clip) sounds.set(name, clip);
        }
        clip?.play();
      } catch {
        /* Optional audio. */
      }
    };
    const dev = typeof window !== 'undefined' && window.SmallGamesDev?.isEnabled();
    const configured =
      typeof content.payload === 'object' &&
      content.payload !== null &&
      !Array.isArray(content.payload) &&
      'advertisingConfigured' in content.payload &&
      content.payload.advertisingConfigured === true;
    const session = await createSession(host, play, !!dev, configured);
    // An explicit developer-only benchmark compares the same real scene without its static cache.
    const cacheWorld = !(
      dev && new URLSearchParams(window.location.search).get('renderProbe') === 'uncached'
    );
    const scene = createSiegeScene(target.createRenderSurface, cacheWorld);
    if (scene && target.loadImage) await scene.loadMaterials(target.loadImage);
    const sceneAttached = scene
      ? (target.installScene?.(scene.renderer.domElement) ?? false)
      : false;
    let hits: Hit[] = [],
      disposed = false,
      suspended = false,
      signature = '',
      previous = Date.now();
    const geometry = () => {
      const width = target.canvas.width,
        height = target.canvas.height,
        rotated = height > width;
      const rw = rotated ? height : width,
        rh = rotated ? width : height,
        scale = Math.min(rw / W, rh / H);
      return { width, height, rotated, scale, ox: (rw - W * scale) / 2, oy: (rh - H * scale) / 2 };
    };
    function render(updateScene = true) {
      if (disposed) return;
      signature = JSON.stringify([
        session.v.screen,
        session.v.message,
        session.v.busy,
        session.v.p.materials,
      ]);
      const g = geometry();
      ctx!.save();
      ctx!.clearRect(0, 0, g.width, g.height);
      if (!sceneAttached) {
        ctx!.fillStyle = '#b8dac7';
        ctx!.fillRect(0, 0, g.width, g.height);
      }
      if (g.rotated) {
        ctx!.translate(g.width, 0);
        ctx!.rotate(Math.PI / 2);
      }
      ctx!.translate(g.ox, g.oy);
      ctx!.scale(g.scale, g.scale);
      // Input updates state immediately; expensive GPU submission belongs to the frame timer.
      const image = updateScene ? scene?.render(session.v) : scene?.image;
      hits = draw(ctx!, session.v, sceneAttached ? true : image);
      ctx!.restore();
      const b = session.v.b;
      if (scene) target.presentTargets?.(scene.targets(b), scene.metrics());
      target.present?.(
        hits,
        `${session.v.screen}；兵力 ${b.units.filter((u) => u.hp > 0).length}；损失 ${b.losses}；占领 ${Math.round(b.capture * 100)}%；${b.notice}；发射 ${b.events.filter((e) => e.type === 'solid' || e.type === 'blast').length}；装填 ${b.reload.toFixed(2)}；${session.v.feedbackUntil > b.time ? session.v.feedback : ''}`,
        session.v.screen,
      );
    }
    function pointer(e: CanvasPointerEvent) {
      const g = geometry();
      const rawX = g.rotated ? e.y : e.x,
        rawY = g.rotated ? g.width - e.x : e.y;
      const x = (rawX - g.ox) / g.scale,
        y = (rawY - g.oy) / g.scale;
      const hit = hits.find(
        (h) => !h.disabled && x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h,
      );
      const aim =
        session.v.screen === 'playing'
          ? (scene?.pick(x, y, session.v.b) ?? aimPoint(x, y, session.v.b))
          : { x, y };
      session.input(e.phase, e.pointerId, aim.x, aim.y, hit?.id ?? null);
      render(false);
    }
    const stops = [
      target.onPointer?.(pointer) ??
        target.onTap((x, y) => {
          pointer({ phase: 'down', x, y, pointerId: 0 });
          pointer({ phase: 'up', x, y, pointerId: 0 });
        }),
      target.onAction?.((id) => {
        session.action(id);
        render();
      }),
      target.onResize?.(render),
    ];
    if (dev) {
      stops.push(
        window.SmallGamesDev.registerActions(
          [0, 1, 2].map((i) => ({
            id: `castle-${i}`,
            label: `试玩第 ${i + 1} 城（不存奖励）`,
            run() {
              session.practice(i);
              render();
            },
          })),
        ),
      );
      stops.push(
        window.SmallGamesDev.registerSnapshot(() => ({
          screen: session.v.screen,
          level: session.v.level,
          time: session.v.b.time,
          losses: session.v.b.losses,
          modules: session.v.b.modules.map((m) => ({ id: m.id, hp: m.hp })),
          events: session.v.b.events,
          reload: session.v.b.reload,
          feedback: session.v.feedback,
        })),
      );
    }
    render();
    const timer = setInterval(() => {
      const now = Date.now(),
        dt = Math.min(1, (now - previous) / 1000);
      previous = now;
      if (!suspended && session.v.screen === 'playing') {
        session.tick(dt);
        render();
      } else if (
        scene?.needsFrame() ||
        signature !==
          JSON.stringify([
            session.v.screen,
            session.v.message,
            session.v.busy,
            session.v.p.materials,
          ])
      )
        render();
    }, 33);
    return {
      pause() {
        suspended = true;
        session.pause();
        for (const clip of sounds.values()) clip.stop();
        previous = Date.now();
        render();
      },
      resume() {
        suspended = false;
        previous = Date.now();
        session.resume();
        render();
      },
      async dispose() {
        if (disposed) return;
        disposed = true;
        clearInterval(timer);
        for (const stop of stops) stop?.();
        for (const clip of sounds.values()) clip.dispose();
        await session.dispose();
        scene?.dispose();
        ctx.clearRect(0, 0, target.canvas.width, target.canvas.height);
      },
    };
  },
};

import { gameManifestSchema, HostError, type GameDefinition } from '@coffeeeeffoc/game-contract';
import type {
  CanvasGameTarget,
  CanvasPointerEvent,
  CanvasSound,
} from '@coffeeeeffoc/canvas-game-adapter';
import type { DynamicContentEnvelope } from '@coffeeeeffoc/content-schema';
import manifest from './manifest.json';
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
    let hits: Hit[] = [],
      disposed = false,
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
    function render() {
      if (disposed) return;
      const g = geometry();
      ctx!.save();
      ctx!.fillStyle = '#b8dac7';
      ctx!.fillRect(0, 0, g.width, g.height);
      if (g.rotated) {
        ctx!.translate(g.width, 0);
        ctx!.rotate(Math.PI / 2);
      }
      ctx!.translate(g.ox, g.oy);
      ctx!.scale(g.scale, g.scale);
      hits = draw(ctx!, session.v);
      ctx!.restore();
      const b = session.v.b;
      target.present?.(
        hits,
        `${session.v.screen}；兵力 ${b.units.filter((u) => u.hp > 0).length}；损失 ${b.losses}；占领 ${Math.round(b.capture * 100)}%；${b.notice}`,
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
      session.input(e.phase, e.pointerId, x, y, hit?.id ?? null);
      render();
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
        })),
      );
    }
    render();
    const timer = setInterval(() => {
      const now = Date.now(),
        dt = Math.min(0.1, (now - previous) / 1000);
      previous = now;
      session.tick(dt);
      render();
    }, 33);
    return {
      pause() {
        session.pause();
        for (const clip of sounds.values()) clip.stop();
        previous = Date.now();
        render();
      },
      resume() {
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
        ctx.clearRect(0, 0, target.canvas.width, target.canvas.height);
      },
    };
  },
};

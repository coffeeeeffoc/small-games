import { gameManifestSchema, HostError, type GameDefinition } from '@coffeeeeffoc/game-contract';
import type {
  CanvasGameTarget,
  CanvasPointerEvent,
  CanvasSound,
} from '@coffeeeeffoc/canvas-game-adapter';
import type { DynamicContentEnvelope } from '@coffeeeeffoc/content-schema';
import manifest from './manifest.json';
import { createDuelSession } from './duel-session.js';
import { createDuelScene } from './duel-scene.js';
import { drawDuel, W, H } from './duel-hud.js';
import { activeGun } from './duel-actions.js';
import type { Hit } from './view.js';
export const castleCannonManifest = gameManifestSchema.parse(manifest);
export const defaultCastleCannonEnvelope: DynamicContentEnvelope = {
  gameId: 'castle-cannon',
  schemaVersion: 1,
  revision: 2,
  payload: { title: '一炮拆城' },
};
export type CastleTarget = CanvasGameTarget & {
  present?(hits: readonly Hit[], status: string, screen: string): void;
  onAction?(fn: (id: string) => void): () => void;
  onResize?(fn: () => void): () => void;
  presentTargets?(points: object[], metrics: object): void;
  installScene?(canvas: HTMLCanvasElement): boolean;
  configureServer?(current: string): Promise<string | null>;
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
        let sound = sounds.get(name);
        if (!sound) {
          sound = target.createSound?.(`castle-cannon-audio/${name}.wav`);
          if (sound) sounds.set(name, sound);
        }
        sound?.play();
      } catch {
        /* Optional audio. */
      }
    };
    const dev = typeof window !== 'undefined' && !!window.SmallGamesDev?.isEnabled();
    const session = await createDuelSession(host, play, dev, target.configureServer);
    const scene = createDuelScene(target.createRenderSurface);
    if (scene) scene.render(session.v);
    if (scene && target.loadImage) await scene.loadMaterials(target.loadImage);
    const attached = scene ? (target.installScene?.(scene.renderer.domElement) ?? false) : false;
    let hits: Hit[] = [],
      disposed = false,
      previous = Date.now();
    function geometry() {
      const width = target.canvas.width,
        height = target.canvas.height,
        rotated = height > width;
      const rw = rotated ? height : width,
        rh = rotated ? width : height,
        scale = Math.min(rw / W, rh / H);
      return { width, height, rotated, scale, ox: (rw - W * scale) / 2, oy: (rh - H * scale) / 2 };
    }
    function render() {
      if (disposed) return;
      const g = geometry();
      ctx!.save();
      ctx!.clearRect(0, 0, g.width, g.height);
      if (g.rotated) {
        ctx!.translate(g.width, 0);
        ctx!.rotate(Math.PI / 2);
      }
      ctx!.translate(g.ox, g.oy);
      ctx!.scale(g.scale, g.scale);
      const image = scene?.render(session.v);
      hits = drawDuel(ctx!, session.v, attached ? true : (image ?? null));
      ctx!.restore();
      const v = session.v,
        p = v.duel.fighters[v.side],
        gun = activeGun(p);
      target.present?.(
        hits,
        `${v.screen}；${v.mode}；生命 ${Math.ceil(p.hp)}；装填 ${gun?.reload.toFixed(2) ?? '-'}；医疗 ${p.medicines}；发射 ${v.duel.nextId - 1}；${v.message}`,
        v.screen,
      );
      target.presentTargets?.(
        v.duel.fighters.map((p) => ({ side: p.side, hp: p.hp, position: p.position })),
        {
          ...scene?.metrics(),
          version: v.duel.version,
          matchId: v.matchId,
          side: v.side,
          mode: v.mode,
          tick: v.duel.tick,
          fighters: v.duel.fighters,
          structures: v.duel.structures,
          shells: v.duel.shells,
          impacts: v.duel.impacts,
          result: v.duel.result,
          scope: v.scope,
          scopeX: v.scopeX,
          scopeY: v.scopeY,
        },
      );
    }
    function pointer(e: CanvasPointerEvent) {
      const g = geometry(),
        rawX = g.rotated ? e.y : e.x,
        rawY = g.rotated ? g.width - e.x : e.y;
      const x = (rawX - g.ox) / g.scale,
        y = (rawY - g.oy) / g.scale;
      const hit = hits.find(
        (h) => !h.disabled && x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h,
      );
      session.input(e.phase, e.pointerId, x, y, hit?.id ?? null);
    }
    const stops = [
      target.onPointer?.(pointer) ??
        target.onTap((x, y) => {
          pointer({ phase: 'down', pointerId: 0, x, y });
          pointer({ phase: 'up', pointerId: 0, x, y });
        }),
      target.onAction?.((id) => session.action(id)),
      target.onResize?.(() => {
        session.cancel();
        render();
      }),
    ];
    if (dev) {
      stops.push(
        window.SmallGamesDev.registerActions([
          {
            id: 'castle-duel',
            label: '双城炮战试玩（不存战绩）',
            run() {
              session.practice(true);
            },
          },
          {
            id: 'castle-injury',
            label: '试玩濒死状态',
            run() {
              session.practice(true);
              session.v.duel.fighters[0].hp = 12;
            },
          },
          {
            id: 'castle-collapse',
            label: '试玩城毁地堡',
            run() {
              session.practice(true);
              for (const s of session.v.duel.structures) if (s.side === 0) s.hp = 0;
            },
          },
        ]),
      );
      stops.push(
        window.SmallGamesDev.registerSnapshot(() => ({
          screen: session.v.screen,
          mode: session.v.mode,
          side: session.v.side,
          ...session.v.duel,
        })),
      );
    }
    render();
    const timer = setInterval(() => {
      const now = Date.now();
      session.tick(Math.min(0.25, (now - previous) / 1000));
      previous = now;
      render();
    }, 16);
    return {
      pause() {
        session.pause();
        for (const sound of sounds.values()) sound.stop();
        previous = Date.now();
        render();
      },
      resume() {
        session.resume();
        previous = Date.now();
        render();
      },
      async dispose() {
        if (disposed) return;
        disposed = true;
        clearInterval(timer);
        for (const stop of stops) stop?.();
        for (const sound of sounds.values()) sound.dispose();
        await session.dispose();
        scene?.dispose();
        ctx.clearRect(0, 0, target.canvas.width, target.canvas.height);
      },
    };
  },
};

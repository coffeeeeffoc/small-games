import { describe, expect, it } from 'vitest';
import { draw, WIDTH, HEIGHT, COMPACT_HEIGHT, type ViewState } from './view.js';

const ui: ViewState = {
  screen: 'playing',
  levelIndex: 0,
  levels: Array.from({ length: 20 }, (_, i) => ({
    title: `关卡${i + 1}`,
    unlocked: true,
    stars: 3,
  })),
  rooms: [1, 2, 3, 4, 5, 6].flatMap((floor) =>
    Array.from({ length: floor <= 4 ? 3 : 1 }, (_, i) => ({
      id: String(floor) + '-' + i,
      floor: String(floor),
      name: '邻居',
      device: i === 1 ? ('ac' as const) : ('computer' as const),
      progress: 0.5,
      remaining: 30,
      status: 'running',
      source: i === 0 ? 'solar' : 'grid',
      power: 25,
      normalPower: 25,
      canDefer: true,
    })),
  ),
  load: 5100,
  capacity: 4000,
  gridLimit: 3400,
  temperature: 32,
  weather: '多云',
  heat: 40,
  remaining: 80,
  served: 2,
  target: 5,
  total: 6,
  solar: { output: 15, available: true },
  battery: { available: true, remaining: 0 },
  deferRemaining: 2,
  score: 200,
  stars: 2,
  assisted: false,
  reducedMotion: false,
  sound: true,
  time: 3,
  canBonus: true,
  won: true,
};
function context() {
  const operations: unknown[] = [];
  const ctx = new Proxy(
    {},
    {
      get: (_target, key) =>
        key === 'measureText'
          ? (value: string) => ({ width: value.length * 7 })
          : (...args: unknown[]) => {
              operations.push([key, ...args]);
            },
      set: (_target, key, value) => {
        operations.push([key, value]);
        return true;
      },
    },
  ) as CanvasRenderingContext2D;
  return { ctx, operations };
}
describe('Canvas controls', () => {
  it.each(
    (['lobby', 'playing', 'paused', 'result'] as const).flatMap((screen) =>
      [false, true].map((compact) => ({ screen, compact })),
    ),
  )(
    '$screen compact=$compact exposes only nonoverlapping reachable controls',
    ({ screen, compact }) => {
      const { ctx } = context();
      const hits = draw(ctx, { ...ui, screen, compact });
      for (const h of hits) {
        expect(h.w).toBeGreaterThanOrEqual(54);
        expect(h.h).toBeGreaterThanOrEqual(54);
        expect(h.x).toBeGreaterThanOrEqual(0);
        expect(h.y).toBeGreaterThanOrEqual(0);
        expect(h.x + h.w).toBeLessThanOrEqual(WIDTH);
        expect(h.y + h.h).toBeLessThanOrEqual(compact ? COMPACT_HEIGHT : HEIGHT);
      }
      for (let i = 0; i < hits.length; i++)
        for (let j = i + 1; j < hits.length; j++) {
          const a = hits[i],
            b = hits[j];
          expect(
            a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y,
            `${a.id} overlaps ${b.id}`,
          ).toBe(true);
        }
      if (screen === 'paused' || screen === 'result')
        expect(hits.some((h) => h.id.startsWith('room:') || h.id === 'grid')).toBe(false);
    },
  );
  it('reduced motion removes time-dependent changes, including overload shake', () => {
    const a = context(),
      b = context();
    draw(a.ctx, { ...ui, reducedMotion: true, time: 3 });
    draw(b.ctx, { ...ui, reducedMotion: true, time: 29 });
    expect(a.operations).toEqual(b.operations);
  });
});

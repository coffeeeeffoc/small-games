export interface Rect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
export type Direction = 'left-to-right' | 'right-to-left';
export interface Crease { readonly id: string; readonly x: number; readonly directions: readonly Direction[] }
export interface Fold { readonly crease: string; readonly direction: Direction }
export interface Entity extends Rect { readonly id: string; readonly kind: 'platform' | 'spike' | 'key' | 'exit' }
export interface WorldEntity extends Entity { readonly moved: boolean }
export interface Level {
  readonly title: string; readonly hint: string; readonly spawn: { readonly x: number; readonly y: number };
  readonly creases: readonly Crease[]; readonly entities: readonly Entity[];
}
export const WIDTH = 1200, HEIGHT = 600, SAFE_BAND = 12;
export const reflectPoint = (x: number, c: number): number => 2 * c - x;
export const reflectRect = <T extends Rect>(r: T, c: number): T => ({ ...r, x: 2 * c - (r.x + r.w) });
export const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w - 0.001 && a.x + a.w > b.x + 0.001 && a.y < b.y + b.h - 0.001 && a.y + a.h > b.y + 0.001;
export const movingSide = (r: Rect, c: number, d: Direction): boolean => d === 'right-to-left' ? r.x >= c : r.x + r.w <= c;
export function splitPlatforms(entities: readonly Entity[], creases: readonly Crease[]): Entity[] {
  return creases.reduce<Entity[]>((parts, c) => parts.flatMap(e => {
    if (e.x < c.x && e.x + e.w > c.x) {
      if (e.kind !== 'platform') throw new Error(`${e.id} crosses crease ${c.id}`);
      return [{ ...e, id: `${e.id}/${c.id}L`, w: c.x - e.x }, { ...e, id: `${e.id}/${c.id}R`, x: c.x, w: e.x + e.w - c.x }];
    }
    return [e];
  }), [...entities]);
}
export function buildWorld(level: Level, fold: Fold | null, collected: ReadonlySet<string> = new Set()): WorldEntity[] {
  const c = fold && level.creases.find(c => c.id === fold.crease);
  if (fold && (!c || !c.directions.includes(fold.direction))) throw new Error('Invalid fold');
  return level.entities.filter(e => e.kind !== 'key' || !collected.has(e.id)).map(e => {
    const moved = !!(fold && c && movingSide(e, c.x, fold.direction));
    return { ...(moved && c ? reflectRect(e, c.x) : e), moved };
  });
}
export function defineLevel(level: Level): Level {
  const entities = splitPlatforms(level.entities, level.creases);
  const result = { ...level, entities };
  const ids = new Set(entities.map(e => e.id));
  if (ids.size !== entities.length) throw new Error('Duplicate entity ID');
  if (new Set(level.creases.map(c => c.id)).size !== level.creases.length) throw new Error('Duplicate crease ID');
  if (entities.filter(e => e.kind === 'exit').length !== 1) throw new Error('Exactly one exit required');
  for (const c of level.creases) {
    if (!(c.x > 0 && c.x < WIDTH) || !c.directions.length) throw new Error('Invalid crease');
  }
  const folds: (Fold | null)[] = [null, ...level.creases.flatMap(c => c.directions.map(direction => ({ crease: c.id, direction })))];
  for (const fold of folds) for (const e of buildWorld(result, fold)) {
    if (![e.x,e.y,e.w,e.h].every(Number.isFinite) || e.w <= 0 || e.h <= 0 || e.x < 0 || e.x + e.w > WIDTH || e.y < 0 || e.y + e.h > HEIGHT) throw new Error(`Out of paper: ${level.title}/${e.id}/${fold?.crease ?? 'flat'}`);
  }
  return Object.freeze({ ...result, spawn: Object.freeze({ ...level.spawn }), creases: Object.freeze(level.creases.map(c => Object.freeze({ ...c, directions: Object.freeze([...c.directions]) }))), entities: Object.freeze(entities.map(e => Object.freeze(e))) });
}
// Actual coplanar edge contacts, also used by the renderer's connection marks.
export function connections(world: readonly WorldEntity[]): { x: number; y: number }[] {
  const p = world.filter(e => e.kind === 'platform');
  return p.flatMap((a, i) => p.slice(i + 1).flatMap(b => {
    if (a.moved === b.moved || a.y !== b.y) return [];
    if (Math.abs(a.x + a.w - b.x) < 0.01) return [{ x: b.x, y: a.y }];
    if (Math.abs(b.x + b.w - a.x) < 0.01) return [{ x: a.x, y: a.y }];
    return [];
  }));
}

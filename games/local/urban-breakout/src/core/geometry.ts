import { PLAYER_Z, type GameState, type Member, type Supply } from './types.ts';
export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export function randomFor(seed: number, eventId: string): number {
  let h = seed >>> 0;
  for (let i = 0; i < eventId.length; i++) h = Math.imul(h ^ eventId.charCodeAt(i), 16777619) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
export function memberPosition(state: GameState, member: Member) {
  const index = state.members.filter((m) => m.hp > 0).indexOf(member);
  const columns = state.formation === 'compact' ? 2 : 3;
  return {
    x:
      state.x +
      ((index % columns) - (columns - 1) / 2) * (state.formation === 'compact' ? 0.5 : 0.75),
    z: PLAYER_Z + Math.floor(index / columns) * 0.62,
  };
}
export function supplyPosition(supply: Supply, tick: number) {
  const c = supply.config,
    progress = clamp((tick - c.start) / (c.end - c.start), 0, 1);
  return { x: c.side * 4.65, z: (c.zStart ?? -3) + ((c.zEnd ?? 6) - (c.zStart ?? -3)) * progress };
}
export function supplyReachable(
  state: GameState,
  supply: Supply,
  x: number,
  z: number,
  range: number,
) {
  const p = supplyPosition(supply, state.tick);
  // All reward devices are on the inner curb; buildings occupy |x| > 5.3.
  return (
    supply.status === 'active' &&
    state.tick >= supply.config.start &&
    state.tick <= supply.config.end &&
    Math.hypot(p.x - x, p.z - z) <= range &&
    p.z <= z + 0.2
  );
}

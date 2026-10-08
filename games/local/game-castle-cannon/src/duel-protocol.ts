import type { Command, Duel, Side } from './duel-types.js';
export type MatchMode = 'human' | 'bot' | 'practice';
export type DuelMessage =
  | { kind: 'waiting'; seconds: number }
  | {
      kind: 'state';
      matchId: string;
      side: Side;
      mode: 'human' | 'bot';
      state: Duel;
    };
export function parseCommand(raw: unknown): Command | null {
  if (!raw || typeof raw !== 'object' || !('type' in raw)) return null;
  const c = raw as Record<string, unknown>;
  switch (c.type) {
    case 'aim':
      return typeof c.pitch === 'number' &&
        Number.isFinite(c.pitch) &&
        typeof c.yaw === 'number' &&
        Number.isFinite(c.yaw)
        ? { type: 'aim', pitch: c.pitch, yaw: c.yaw }
        : null;
    case 'station':
      return typeof c.id === 'string' && ['ground', 'wall', 'bunker'].includes(c.id)
        ? { type: 'station', id: c.id }
        : null;
    case 'ammo':
      return c.ammo === 'solid' || c.ammo === 'blast' ? { type: 'ammo', ammo: c.ammo } : null;
    case 'crouch':
      return typeof c.down === 'boolean' ? { type: 'crouch', down: c.down } : null;
    case 'charge':
    case 'fire':
    case 'cancel':
    case 'retreat':
    case 'heal':
    case 'leave':
      return { type: c.type };
    default:
      return null;
  }
}

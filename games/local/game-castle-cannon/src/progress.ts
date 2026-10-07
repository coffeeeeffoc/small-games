import type { JsonValue } from '@coffeeeeffoc/game-contract';
import { LEVELS } from './levels.js';
export interface Progress {
  version: 1;
  unlocked: number;
  cleared: string[];
  bonus: string[];
  materials: number;
  skin: 0 | 1 | 2;
  owned: number[];
  sound: boolean;
  motion: boolean;
  lowPower: boolean;
}
export const newProgress = (): Progress => ({
  version: 1,
  unlocked: 0,
  cleared: [],
  bonus: [],
  materials: 0,
  skin: 0,
  owned: [0],
  sound: true,
  motion: true,
  lowPower: false,
});
export function readProgress(raw: JsonValue): Progress {
  const p = newProgress();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== 1) return p;
  const ids = new Set(LEVELS.map((l) => l.id));
  p.cleared = Array.isArray(raw.cleared)
    ? [...new Set(raw.cleared.filter((id): id is string => typeof id === 'string' && ids.has(id)))]
    : [];
  p.bonus = Array.isArray(raw.bonus)
    ? raw.bonus.filter((id): id is string => typeof id === 'string' && p.cleared.includes(id))
    : [];
  for (let i = 0; i < LEVELS.length - 1; i++) {
    if (!p.cleared.includes(LEVELS[i].id)) break;
    p.unlocked = i + 1;
  }
  p.materials =
    typeof raw.materials === 'number' && Number.isSafeInteger(raw.materials)
      ? Math.max(0, Math.min(10000, raw.materials))
      : 0;
  p.owned = Array.isArray(raw.owned)
    ? [0, ...new Set(raw.owned.filter((n): n is number => n === 1 || n === 2))]
    : [0];
  p.skin = raw.skin === 1 || raw.skin === 2 ? (p.owned.includes(raw.skin) ? raw.skin : 0) : 0;
  p.sound = typeof raw.sound === 'boolean' ? raw.sound : true;
  p.motion = typeof raw.motion === 'boolean' ? raw.motion : true;
  p.lowPower = typeof raw.lowPower === 'boolean' ? raw.lowPower : false;
  return p;
}
export function settle(p: Progress, index: number, practice = false) {
  const level = LEVELS[index];
  if (practice || p.cleared.includes(level.id)) return 0;
  p.cleared.push(level.id);
  p.unlocked = Math.max(p.unlocked, Math.min(2, index + 1));
  p.materials += level.reward;
  return level.reward;
}

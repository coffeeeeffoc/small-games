import type { GameHost } from '@coffeeeeffoc/game-contract';
import type { Progress } from './progress.js';
import type { Duel, Side } from './duel-types.js';

export async function saveDuelRecord(
  host: GameHost,
  mode: string,
  record: {
    id: string;
    winner: Side | null;
    side: Side;
    reason: NonNullable<Duel['result']>['reason'];
  },
) {
  try {
    const key = `castle-cannon:duel-records:${mode}`,
      old = (await host.storage.read(key))?.value,
      records = Array.isArray(old)
        ? old.filter((r) => r && typeof r === 'object' && !Array.isArray(r))
        : [];
    if (
      records.some(
        (r) => r && typeof r === 'object' && !Array.isArray(r) && 'id' in r && r.id === record.id,
      )
    )
      return;
    records.push(record);
    await host.storage.write(key, records.slice(-50));
  } catch {
    /* Optional history does not alter a finished match. */
  }
}

export function preferenceAction(p: Progress, id: string, save: () => void) {
  if (id === 'sound' || id === 'motion' || id === 'lowPower') {
    p[id] = !p[id];
    save();
    return true;
  }
  if (!id.startsWith('skin:')) return false;
  const skin = Number(id.slice(5));
  if (skin === 0 || skin === 1 || skin === 2) {
    if (p.owned.includes(skin)) p.skin = skin;
    else if (p.materials >= 40) {
      p.materials -= 40;
      p.owned.push(skin);
      p.skin = skin;
    }
    save();
  }
  return true;
}

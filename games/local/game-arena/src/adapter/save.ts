import { HostError, jsonValueSchema, type GameHost } from '@coffeeeeffoc/game-contract';
import { z } from 'zod';
import type { ArenaSave } from '../domain/state.js';
const key = 'bili-pocket-arcade:v1';
const schema = z
  .object({
    coins: z.number().int().nonnegative().default(80),
    arenaWins: z.number().int().nonnegative().default(0),
    arenaLeague: z.number().int().min(1).max(5).default(1),
    collection: z.array(z.string()).default([]),
  })
  .catchall(jsonValueSchema);
/** Safe defaults used for a first run or unavailable storage. */
export const initialArenaSave: ArenaSave = {
  coins: 80,
  arenaWins: 0,
  arenaLeague: 1,
  collection: [],
};
/** Reads and validates the shared arcade save, falling back when unavailable. */
export async function loadArenaSave(
  host: GameHost,
): Promise<{ save: ArenaSave; version: string | null }> {
  try {
    const record = await host.storage.read(key);
    if (!record) return { save: initialArenaSave, version: null };
    const parsed = schema.safeParse(record.value);
    return parsed.success
      ? { save: parsed.data, version: record.version }
      : { save: initialArenaSave, version: record.version };
  } catch {
    return { save: initialArenaSave, version: null };
  }
}
/** Writes arena rewards and reconciles additive progress after a version conflict. */
export async function writeArenaSave(
  host: GameHost,
  previous: ArenaSave,
  save: ArenaSave,
  version: string | null,
): Promise<{ save: ArenaSave; version: string | null }> {
  try {
    const record = await host.storage.write(key, save, version);
    return { save, version: record.version };
  } catch (error) {
    if (!(error instanceof HostError) || error.code !== 'CONFLICT') return { save, version };
    try {
      const latest = await host.storage.read(key);
      const parsed = schema.safeParse(latest?.value);
      if (!latest || !parsed.success) return { save, version };
      const reconciled: ArenaSave = {
        ...parsed.data,
        coins: parsed.data.coins + (save.coins - previous.coins),
        arenaWins: parsed.data.arenaWins + (save.arenaWins - previous.arenaWins),
        arenaLeague: Math.max(parsed.data.arenaLeague, save.arenaLeague),
        collection: [...new Set([...parsed.data.collection, ...save.collection])],
      };
      const record = await host.storage.write(key, reconciled, latest.version);
      return { save: reconciled, version: record.version };
    } catch {
      return { save, version };
    }
  }
}

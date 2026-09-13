import { HostError, jsonValueSchema, type GameHost } from '@coffeeeeffoc/game-contract';
import { z } from 'zod';

import type { CultivationSave } from '../domain/state.js';

const saveKey = 'bili-pocket-arcade:v1';
const cultivationSaveSchema = z
  .object({
    coins: z.number().int().nonnegative().default(80),
    bestCultivation: z.number().int().nonnegative().default(0),
    cultivationChapter: z.number().int().min(1).max(3).default(1),
  })
  .catchall(jsonValueSchema);

/** Legacy-compatible defaults for cultivation fields in the shared save record. */
export const initialCultivationSave: CultivationSave = {
  coins: 80,
  bestCultivation: 0,
  cultivationChapter: 1,
};

/** Loads cultivation fields while retaining unrelated legacy game progress. */
export async function loadCultivationSave(
  host: GameHost,
): Promise<{ save: CultivationSave; version: string | null }> {
  try {
    const record = await host.storage.read(saveKey);
    if (!record) return { save: initialCultivationSave, version: null };
    const parsed = cultivationSaveSchema.safeParse(record.value);
    return parsed.success
      ? { save: parsed.data, version: record.version }
      : { save: initialCultivationSave, version: record.version };
  } catch {
    return { save: initialCultivationSave, version: null };
  }
}

/** Persists cultivation progress and reconciles one concurrent version conflict. */
export async function writeCultivationSave(
  host: GameHost,
  previousSave: CultivationSave,
  save: CultivationSave,
  expectedVersion: string | null,
): Promise<{ save: CultivationSave; version: string | null }> {
  try {
    const record = await host.storage.write(saveKey, save, expectedVersion);
    return { save, version: record.version };
  } catch (error) {
    if (!(error instanceof HostError) || error.code !== 'CONFLICT') {
      return { save, version: expectedVersion };
    }

    try {
      const latest = await host.storage.read(saveKey);
      const parsed = cultivationSaveSchema.safeParse(latest?.value);
      if (!latest || !parsed.success) return { save, version: expectedVersion };
      const reconciled: CultivationSave = {
        ...parsed.data,
        coins: parsed.data.coins + (save.coins - previousSave.coins),
        bestCultivation: Math.max(parsed.data.bestCultivation, save.bestCultivation),
        cultivationChapter: Math.max(parsed.data.cultivationChapter, save.cultivationChapter),
      };
      const record = await host.storage.write(saveKey, reconciled, latest.version);
      return { save: reconciled, version: record.version };
    } catch {
      return { save, version: expectedVersion };
    }
  }
}

import { HostError, jsonValueSchema, type GameHost } from '@coffeeeeffoc/game-contract';
import { z } from 'zod';

import type { OfficeSave } from '../domain/state.js';

const saveKey = 'bili-pocket-arcade:v1';
const officeSaveSchema = z
  .object({
    coins: z.number().int().nonnegative().default(80),
    bestOffice: z.number().int().nonnegative().default(0),
    officeDay: z.number().int().min(1).max(5).default(1),
  })
  .catchall(jsonValueSchema);

/** Legacy-compatible defaults for office fields in the shared save record. */
export const initialOfficeSave: OfficeSave = { coins: 80, bestOffice: 0, officeDay: 1 };

/** Loads office progress and tolerates unavailable or malformed storage. */
export async function loadOfficeSave(
  host: GameHost,
): Promise<{ save: OfficeSave; version: string | null }> {
  try {
    const record = await host.storage.read(saveKey);
    if (!record) return { save: initialOfficeSave, version: null };
    const parsed = officeSaveSchema.safeParse(record.value);
    return parsed.success
      ? { save: parsed.data, version: record.version }
      : { save: initialOfficeSave, version: record.version };
  } catch {
    return { save: initialOfficeSave, version: null };
  }
}

/** Persists office progress and reconciles one concurrent shared-save conflict. */
export async function writeOfficeSave(
  host: GameHost,
  previousSave: OfficeSave,
  save: OfficeSave,
  expectedVersion: string | null,
): Promise<{ save: OfficeSave; version: string | null }> {
  try {
    const record = await host.storage.write(saveKey, save, expectedVersion);
    return { save, version: record.version };
  } catch (error) {
    if (!(error instanceof HostError) || error.code !== 'CONFLICT') {
      return { save, version: expectedVersion };
    }
    try {
      const latest = await host.storage.read(saveKey);
      const parsed = officeSaveSchema.safeParse(latest?.value);
      if (!latest || !parsed.success) return { save, version: expectedVersion };
      const reconciled: OfficeSave = {
        ...parsed.data,
        coins: parsed.data.coins + (save.coins - previousSave.coins),
        bestOffice: Math.max(parsed.data.bestOffice, save.bestOffice),
        officeDay: Math.max(parsed.data.officeDay, save.officeDay),
      };
      const record = await host.storage.write(saveKey, reconciled, latest.version);
      return { save: reconciled, version: record.version };
    } catch {
      return { save, version: expectedVersion };
    }
  }
}

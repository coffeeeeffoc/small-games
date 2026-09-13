import { HostError, type GameHost } from '@coffeeeeffoc/game-contract';
import { z } from 'zod';
export const trialSaveKey = 'cultivation:trial:v1';
const recordSchema = z.object({
  runs: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  best: z.number().int().nonnegative(),
  recent: z.array(z.string()).max(32),
});
export type TrialRecord = z.infer<typeof recordSchema>;
export const emptyTrialRecord: TrialRecord = { runs: 0, wins: 0, best: 0, recent: [] };
export async function loadTrialRecord(host: GameHost): Promise<TrialRecord> {
  const record = await host.storage.read(trialSaveKey);
  return record ? recordSchema.parse(record.value) : { ...emptyTrialRecord, recent: [] };
}
/** Separate namespace preserves old campaign and other Games' saves byte-for-byte. */
export async function saveTrialResult(
  host: GameHost,
  result: { id: string; won: boolean; score: number },
): Promise<TrialRecord> {
  if (!result.id || !Number.isSafeInteger(result.score) || result.score < 0)
    throw new Error('Invalid trial result');
  for (let attempt = 0; attempt < 3; attempt++) {
    const stored = await host.storage.read(trialSaveKey);
    const previous = stored ? recordSchema.parse(stored.value) : emptyTrialRecord;
    if (previous.recent.includes(result.id)) return previous;
    // ponytail: retain 32 recent completions for local retries; use a durable ledger for cross-device history.
    const next: TrialRecord = {
      runs: previous.runs + 1,
      wins: previous.wins + Number(result.won),
      best: Math.max(previous.best, result.score),
      recent: [...previous.recent, result.id].slice(-32),
    };
    try {
      await host.storage.write(trialSaveKey, next, stored?.version ?? null);
      return next;
    } catch (error) {
      if (!(error instanceof HostError) || error.code !== 'CONFLICT' || attempt === 2) throw error;
    }
  }
  throw new Error('Trial save conflict');
}

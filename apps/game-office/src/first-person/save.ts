import { HostError, type GameHost } from '@coffeeeeffoc/game-contract';
import { z } from 'zod';

const key = 'office:first-person:v2';
const schema = z.object({
  version: z.literal(2),
  bestScore: z.number().finite().min(0).max(1000),
  cleared: z.boolean(),
});
export type OfficeRecord = z.infer<typeof schema>;
export const emptyOfficeRecord: OfficeRecord = { version: 2, bestScore: 0, cleared: false };

/** First-person records never overwrite the retired games or their shared wallet. */
export async function readOfficeRecord(host: GameHost) {
  const record = await host.storage.read(key);
  const parsed = schema.safeParse(record?.value);
  return {
    value: parsed.success ? parsed.data : emptyOfficeRecord,
    version: record?.version ?? null,
  };
}

/** Merge monotone records after conflicts without ever touching another game's save. */
export async function saveOfficeRecord(
  host: GameHost,
  result: OfficeRecord,
): Promise<OfficeRecord> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = await readOfficeRecord(host);
    const value = schema.parse({
      version: 2,
      bestScore: Math.max(current.value.bestScore, result.bestScore),
      cleared: current.value.cleared || result.cleared,
    });
    try {
      await host.storage.write(key, value, current.version);
      return value;
    } catch (error) {
      if (attempt === 1 || !(error instanceof HostError) || error.code !== 'CONFLICT') throw error;
    }
  }
  throw new Error('Office save retry exhausted');
}

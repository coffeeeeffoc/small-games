import { HostError, type GameHost } from '@coffeeeeffoc/game-contract';
import { z } from 'zod';

const key = 'office:desk-sample:v1';
const schema = z.object({
  version: z.literal(1),
  bestJoy: z.number().finite().min(0).max(90),
  cleared: z.boolean(),
});
export type SampleRecord = z.infer<typeof schema>;
export const emptySampleRecord: SampleRecord = { version: 1, bestJoy: 0, cleared: false };

/** Separate scoring avoids comparing the sample's seconds to the legacy campaign's points. */
export async function readSampleRecord(host: GameHost) {
  const record = await host.storage.read(key);
  const parsed = schema.safeParse(record?.value);
  return {
    value: parsed.success ? parsed.data : emptySampleRecord,
    version: record?.version ?? null,
  };
}

/** Merge monotone records after conflicts without ever touching another game's save. */
export async function saveSampleRecord(
  host: GameHost,
  result: SampleRecord,
): Promise<SampleRecord> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = await readSampleRecord(host);
    const value = schema.parse({
      version: 1,
      bestJoy: Math.max(current.value.bestJoy, result.bestJoy),
      cleared: current.value.cleared || result.cleared,
    });
    try {
      await host.storage.write(key, value, current.version);
      return value;
    } catch (error) {
      if (attempt === 1 || !(error instanceof HostError) || error.code !== 'CONFLICT') throw error;
    }
  }
  throw new Error('Sample save retry exhausted');
}

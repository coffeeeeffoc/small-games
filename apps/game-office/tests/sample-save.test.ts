import { describe, expect, it } from 'vitest';
import { HostError } from '@coffeeeeffoc/game-contract';
import { createInMemoryGameHost } from '@coffeeeeffoc/game-host';
import { readSampleRecord, saveSampleRecord } from '../src/sample/save.js';

describe('sample records', () => {
  it('retries a concurrent best score and preserves the legacy shared wallet', async () => {
    const base = createInMemoryGameHost();
    await base.storage.write('bili-pocket-arcade:v1', { coins: 123, arenaWins: 7 });
    let conflicted = false;
    const host = {
      ...base,
      storage: {
        ...base.storage,
        async write(
          key: string,
          value: Parameters<typeof base.storage.write>[1],
          version?: string | null,
        ) {
          if (!conflicted) {
            conflicted = true;
            await base.storage.write(key, { version: 1, bestJoy: 38, cleared: true });
            throw new HostError({ code: 'CONFLICT', message: 'Concurrent sample result' });
          }
          return base.storage.write(key, value, version);
        },
      },
    };
    expect(await saveSampleRecord(host, { version: 1, bestJoy: 25, cleared: false })).toEqual({
      version: 1,
      bestJoy: 38,
      cleared: true,
    });
    expect((await base.storage.read('bili-pocket-arcade:v1'))?.value).toEqual({
      coins: 123,
      arenaWins: 7,
    });
  });

  it('rejects unavailable persistence instead of reporting a saved record', async () => {
    const base = createInMemoryGameHost();
    const host = {
      ...base,
      storage: {
        ...base.storage,
        async write() {
          throw new Error('offline');
        },
      },
    };
    await expect(
      saveSampleRecord(host, { version: 1, bestJoy: 23, cleared: true }),
    ).rejects.toThrow('offline');
    expect((await readSampleRecord(base)).value.bestJoy).toBe(0);
  });
});

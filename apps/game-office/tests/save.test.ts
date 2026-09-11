import { describe, expect, it, vi } from 'vitest';
import { HostError } from '@coffeeeeffoc/game-contract';
import { createInMemoryGameHost } from '@coffeeeeffoc/game-host';
import { emptyOfficeRecord, readOfficeRecord, saveOfficeRecord } from '../src/first-person/save.js';

const key = 'office:first-person:v2';

describe('first-person office records', () => {
  it('merges a concurrent best score without changing legacy saves or the shared wallet', async () => {
    const base = createInMemoryGameHost();
    await base.storage.write('bili-pocket-arcade:v1', { coins: 123, arenaWins: 7 });
    await base.storage.write('office:desk-sample:v1', { version: 1, bestJoy: 38, cleared: true });
    let conflicted = false;
    const host = {
      ...base,
      storage: {
        ...base.storage,
        async write(...args: Parameters<typeof base.storage.write>) {
          if (!conflicted) {
            conflicted = true;
            await base.storage.write(key, { version: 2, bestScore: 700, cleared: true });
            throw new HostError({ code: 'CONFLICT', message: 'Concurrent office result' });
          }
          return base.storage.write(...args);
        },
      },
    };
    expect(await saveOfficeRecord(host, { version: 2, bestScore: 520, cleared: false })).toEqual({
      version: 2,
      bestScore: 700,
      cleared: true,
    });
    expect((await base.storage.read('bili-pocket-arcade:v1'))?.value).toEqual({
      coins: 123,
      arenaWins: 7,
    });
    expect((await base.storage.read('office:desk-sample:v1'))?.value).toEqual({
      version: 1,
      bestJoy: 38,
      cleared: true,
    });
  });

  it('recovers malformed records, but reports unavailable or repeatedly conflicting persistence', async () => {
    const base = createInMemoryGameHost();
    expect((await readOfficeRecord(base)).value).toEqual(emptyOfficeRecord);
    await base.storage.write(key, { version: 2, bestScore: -4, cleared: true });
    expect((await readOfficeRecord(base)).value).toEqual(emptyOfficeRecord);
    const result = { version: 2 as const, bestScore: 620, cleared: true };
    for (const code of ['OFFLINE', 'CONFLICT'] as const) {
      const write = vi.fn(async () => {
        throw new HostError({ code, message: code });
      });
      await expect(
        saveOfficeRecord({ ...base, storage: { ...base.storage, write } }, result),
      ).rejects.toMatchObject({ code });
      expect(write).toHaveBeenCalledTimes(code === 'CONFLICT' ? 2 : 1);
    }
    await expect(saveOfficeRecord(base, { ...result, bestScore: Infinity })).rejects.toThrow();
    expect((await readOfficeRecord(base)).value).toEqual(emptyOfficeRecord);
  });
});

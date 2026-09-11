import { expect, it } from 'vitest';
import { createInMemoryGameHost } from '@coffeeeeffoc/game-host';
import { saveTrialResult, loadTrialRecord, trialSaveKey } from '../src/adapter/trial-save.js';
it('saves a result once, merges concurrent completions and never touches the legacy namespace', async () => {
  const host = createInMemoryGameHost();
  const sentinel = { coins: 123, bestCultivation: 270, bestOffice: 15 };
  await host.storage.write('bili-pocket-arcade:v1', sentinel, null);
  const result = { id: 'one', won: true, score: 640 };
  await saveTrialResult(host, result);
  await saveTrialResult(host, result);
  await Promise.all([
    saveTrialResult(host, { id: 'two', won: false, score: 30 }),
    saveTrialResult(host, { id: 'three', won: true, score: 700 }),
  ]);
  expect(await loadTrialRecord(host)).toMatchObject({ runs: 3, wins: 2, best: 700 });
  expect((await host.storage.read('bili-pocket-arcade:v1'))?.value).toEqual(sentinel);
});
it('reports failed storage rather than pretending a result was saved or overwriting corrupt data', async () => {
  const host = createInMemoryGameHost();
  await host.storage.write(trialSaveKey, { unexpected: 'keep this' }, null);
  await expect(saveTrialResult(host, { id: 'one', won: false, score: 1 })).rejects.toThrow();
  expect((await host.storage.read(trialSaveKey))?.value).toEqual({ unexpected: 'keep this' });
  await expect(
    saveTrialResult(
      {
        ...host,
        storage: {
          ...host.storage,
          read: async () => {
            throw new Error('offline');
          },
        },
      },
      { id: 'two', won: false, score: 1 },
    ),
  ).rejects.toThrow('offline');
});

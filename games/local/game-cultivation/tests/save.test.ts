import { describe, expect, it } from 'vitest';

import { createInMemoryGameHost } from '@coffeeeeffoc/game-host';

import { loadCultivationSave, writeCultivationSave } from '@coffeeeeffoc/game-cultivation/adapter';

const saveKey = 'bili-pocket-arcade:v1';

describe('cultivation save adapter', () => {
  it('reconciles a concurrent write without erasing another game save', async () => {
    const host = createInMemoryGameHost();
    const initial = await host.storage.write(saveKey, {
      coins: 80,
      bestCultivation: 0,
      cultivationChapter: 1,
      bestOffice: 12,
    });
    const loaded = await loadCultivationSave(host);
    await host.storage.write(
      saveKey,
      {
        ...loaded.save,
        coins: 87,
        bestCultivation: 50,
        cultivationChapter: 3,
        bestOffice: 99,
      },
      initial.version,
    );

    const persisted = await writeCultivationSave(
      host,
      loaded.save,
      { ...loaded.save, coins: 90, cultivationChapter: 2 },
      loaded.version,
    );

    expect(persisted.save).toMatchObject({
      coins: 97,
      bestCultivation: 50,
      cultivationChapter: 3,
      bestOffice: 99,
    });
    await expect(host.storage.read(saveKey)).resolves.toMatchObject({ value: persisted.save });
  });
});

import { describe, expect, it } from 'vitest';

import { createInMemoryGameHost } from '@coffeeeeffoc/game-host';
import { loadOfficeSave, writeOfficeSave } from '@coffeeeeffoc/game-office/adapter';

const saveKey = 'bili-pocket-arcade:v1';

describe('office save adapter', () => {
  it('reconciles a concurrent write without erasing another game save', async () => {
    const host = createInMemoryGameHost();
    const initial = await host.storage.write(saveKey, {
      coins: 80,
      bestOffice: 0,
      officeDay: 1,
      arenaWins: 2,
    });
    const loaded = await loadOfficeSave(host);
    await host.storage.write(
      saveKey,
      { ...loaded.save, coins: 90, bestOffice: 50, arenaWins: 7 },
      initial.version,
    );
    const persisted = await writeOfficeSave(
      host,
      loaded.save,
      { ...loaded.save, coins: 85, bestOffice: 30, officeDay: 3 },
      loaded.version,
    );
    expect(persisted.save).toMatchObject({ coins: 95, bestOffice: 50, officeDay: 3, arenaWins: 7 });
  });
});

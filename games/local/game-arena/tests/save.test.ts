import { describe, expect, it } from 'vitest';
import { createInMemoryGameHost } from '@coffeeeeffoc/game-host';
import { loadArenaSave, writeArenaSave } from '@coffeeeeffoc/game-arena/adapter';
describe('arena save', () => {
  it('merges collection and additive rewards on conflict', async () => {
    const host = createInMemoryGameHost();
    const first = await host.storage.write('bili-pocket-arcade:v1', {
      coins: 80,
      arenaWins: 0,
      arenaLeague: 1,
      collection: ['鸡'],
      officeDay: 4,
    });
    const loaded = await loadArenaSave(host);
    await host.storage.write(
      'bili-pocket-arcade:v1',
      { ...loaded.save, coins: 90, arenaWins: 2, collection: ['鸡', '鹅'] },
      first.version,
    );
    const result = await writeArenaSave(
      host,
      loaded.save,
      { ...loaded.save, coins: 92, arenaWins: 1, arenaLeague: 3, collection: ['鸡', '狗'] },
      loaded.version,
    );
    expect(result.save).toMatchObject({ coins: 102, arenaWins: 3, arenaLeague: 3, officeDay: 4 });
    expect(result.save.collection).toEqual(['鸡', '鹅', '狗']);
  });
});

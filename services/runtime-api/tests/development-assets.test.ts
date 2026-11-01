import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  createDevelopmentAssets,
  type DevelopmentAssetAdapter,
} from '../src/competition/development-assets.js';
import { playerIdOf } from '../src/competition/auth.js';
import { createCompetitionStore } from '../src/competition/store.js';

// Two wallet fixtures prove adapter isolation, without registering new game currencies.
function wallet(asset: string): DevelopmentAssetAdapter {
  const balances = new Map<string, number>();
  const receipts = new Map<
    string,
    { input: string; result: { playerId: string; balance: number } }
  >();
  return {
    assets: [asset],
    async adjust(auth, command) {
      const playerId = playerIdOf(auth),
        key = playerId + ':' + command.requestId;
      const input = JSON.stringify(command),
        previous = receipts.get(key);
      if (previous) {
        if (previous.input !== input) throw Error('REQUEST_ID_CONFLICT');
        return previous.result;
      }
      const balance = (balances.get(playerId) ?? 0) + command.deltas[asset]!;
      if (!Number.isSafeInteger(balance) || balance < 0) throw Error('INVALID_DEV_BALANCE');
      const result = { playerId, balance };
      balances.set(playerId, balance);
      receipts.set(key, { input, result });
      return result;
    },
  };
}
it('dispatches two games to isolated atomic/idempotent adapters', async () => {
  const registry = new Map([
    ['fixture-alpha', wallet('coins')],
    ['fixture-beta', wallet('energy')],
  ]);
  const service = createDevelopmentAssets(true, registry),
    requestId = randomUUID();
  const a = { playerId: 'same-player', game: 'fixture-alpha' },
    b = { ...a, game: 'fixture-beta' };
  const command = { requestId, deltas: { coins: 10 } };
  expect(
    await Promise.all([
      service.adjustDevelopmentAssets(a, a.game, command),
      service.adjustDevelopmentAssets(a, a.game, command),
    ]),
  ).toEqual([
    { playerId: a.playerId, balance: 10 },
    { playerId: a.playerId, balance: 10 },
  ]);
  expect(
    await service.adjustDevelopmentAssets(b, b.game, { requestId, deltas: { energy: 30 } }),
  ).toMatchObject({ balance: 30 });
  expect(
    await service.adjustDevelopmentAssets({ ...a, playerId: 'other' }, a.game, command),
  ).toMatchObject({ balance: 10 });
  await expect(
    service.adjustDevelopmentAssets(a, a.game, { ...command, deltas: { coins: 11 } }),
  ).rejects.toThrow('REQUEST_ID_CONFLICT');
  expect(
    await service.adjustDevelopmentAssets(a, a.game, {
      requestId: randomUUID(),
      deltas: { coins: -3 },
    }),
  ).toMatchObject({ balance: 7 });
  expect(service.developmentAssetCapabilities(b.game)).toEqual({
    enabled: true,
    assets: ['energy'],
  });
  expect(service.developmentAssetCapabilities('unregistered')).toEqual({
    enabled: false,
    assets: [],
  });
  await expect(
    service.adjustDevelopmentAssets(a, b.game, { requestId, deltas: { energy: 1 } }),
  ).rejects.toMatchObject({ code: 'IDENTITY_SCOPE_MISMATCH' });
  await expect(
    service.adjustDevelopmentAssets({ ...a, game: 'unregistered' }, 'unregistered', command),
  ).rejects.toMatchObject({ code: 'DEVELOPMENT_ASSETS_UNSUPPORTED' });
  await expect(
    createDevelopmentAssets(false, registry).adjustDevelopmentAssets(a, a.game, command),
  ).rejects.toMatchObject({ code: 'DEV_TOOLS_DISABLED' });
});
it('rejects undeclared assets, empty adjustments and client-controlled authority', async () => {
  const service = createDevelopmentAssets(true, new Map([['fixture-alpha', wallet('coins')]]));
  const auth = { playerId: 'player', game: 'fixture-alpha' },
    requestId = randomUUID();
  for (const input of [
    { requestId, deltas: {} },
    { requestId, deltas: { coins: 0 } },
    { requestId, deltas: { coins: 1.5 } },
    { requestId, deltas: { coins: 1e9 + 1 } },
    { requestId, deltas: { coins: 1 }, playerId: 'other' },
    { requestId, deltas: { coins: 1 }, development: true },
    { requestId, deltas: { coins: 1 }, game: 'fixture-beta' },
    { requestId: 'not-a-uuid', deltas: { coins: 1 } },
  ])
    await expect(service.adjustDevelopmentAssets(auth, auth.game, input)).rejects.toThrow();
  await expect(
    service.adjustDevelopmentAssets(auth, auth.game, { requestId, deltas: { xp: 1 } }),
  ).rejects.toMatchObject({ code: 'DEVELOPMENT_ASSET_UNSUPPORTED' });
});
it('store registers only available real wallets and accepts an explicit additional adapter', async () => {
  const store = createCompetitionStore(
    {} as Parameters<typeof createCompetitionStore>[0],
    new Map(),
    Date.now,
    undefined,
    true,
    new Map([['fixture-alpha', wallet('energy')]]),
  );
  expect(store.developmentAssetCapabilities('night-overwatch')).toEqual({
    enabled: false,
    assets: [],
  });
  await expect(
    store.adjustDevelopmentAssets('internal-test', 'night-overwatch', {}),
  ).rejects.toMatchObject({ code: 'DEVELOPMENT_ASSETS_UNSUPPORTED' });
  expect(
    await store.adjustDevelopmentAssets(
      { playerId: 'test', game: 'fixture-alpha' },
      'fixture-alpha',
      { requestId: randomUUID(), deltas: { energy: 5 } },
    ),
  ).toMatchObject({ playerId: 'test', balance: 5 });
});

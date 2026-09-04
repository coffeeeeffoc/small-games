import { describe, expect, it } from 'vitest';

import {
  hostAdapterContractCases,
  type HostAdapterContractOptions,
} from '@coffeeeeffoc/game-contract-test';

import {
  createBrowserGameHost,
  createInMemoryGameHost,
  createTestGameHost,
  type KeyValueStorage,
} from '@coffeeeeffoc/game-host';

function createMemoryStorage(): KeyValueStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe('Game Host adapters', () => {
  const adapters = [
    ['in-memory', (options: HostAdapterContractOptions = {}) => createInMemoryGameHost(options)],
    [
      'browser',
      (options: HostAdapterContractOptions = {}) =>
        createBrowserGameHost({ ...options, storage: createMemoryStorage() }),
    ],
    ['test', (options: HostAdapterContractOptions = {}) => createTestGameHost(options).host],
  ] as const;

  for (const [adapterName, createHost] of adapters) {
    describe(adapterName, () => {
      for (const contractCase of hostAdapterContractCases) {
        it(contractCase.name, () => contractCase.run(createHost));
      }
    });
  }

  it('test adapter records observable calls', async () => {
    const { host, observations } = createTestGameHost();
    await host.telemetry.track('game.started', { source: 'test' });
    await host.navigation.navigate('/catalog');

    expect(observations).toEqual([
      { port: 'telemetry', operation: 'track', value: ['game.started', { source: 'test' }] },
      { port: 'navigation', operation: 'navigate', value: '/catalog' },
    ]);
  });
});

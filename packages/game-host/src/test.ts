import type { GameHost, StoragePort } from '@coffeeeeffoc/game-contract';

import { createInMemoryGameHost } from './in-memory.js';
import type { GameHostOptions, HostObservation } from './types.js';

/** Creates an observable adapter while preserving the same public Game Host behavior. */
export function createTestGameHost(options: GameHostOptions = {}): {
  host: GameHost;
  observations: HostObservation[];
} {
  const observations: HostObservation[] = [];
  const base = createInMemoryGameHost({
    ...options,
    telemetry: {
      async track(name, properties) {
        observations.push({ port: 'telemetry', operation: 'track', value: [name, properties] });
        await options.telemetry?.track(name, properties);
      },
    },
    navigation: {
      async navigate(destination) {
        observations.push({ port: 'navigation', operation: 'navigate', value: destination });
        await options.navigation?.navigate(destination);
      },
    },
    offer: async (opportunity) => {
      observations.push({ port: 'advertising', operation: 'offer', value: opportunity });
      return options.offer?.(opportunity) ?? { status: 'unavailable' };
    },
  });

  const storage: StoragePort = {
    async read(key) {
      observations.push({ port: 'storage', operation: 'read', value: key });
      return base.storage.read(key);
    },
    async write(key, value, expectedVersion) {
      observations.push({
        port: 'storage',
        operation: 'write',
        value: [key, value, expectedVersion],
      });
      return base.storage.write(key, value, expectedVersion);
    },
  };
  const host: GameHost = Object.freeze({
    ...base,
    content: {
      async load() {
        observations.push({ port: 'content', operation: 'load' });
        return base.content.load();
      },
    },
    storage,
  });
  return { host, observations };
}

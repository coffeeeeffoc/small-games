import type { GameHost, GameSessionContext, StoragePort } from '@coffeeeeffoc/game-contract';

import { defaultContent } from './session.js';
import { assertOnline } from './storage.js';
import type { GameHostOptions } from './types.js';

export function createDefaultPorts(
  options: GameHostOptions,
  storage: StoragePort,
  session: GameSessionContext,
): Omit<GameHost, 'session'> {
  const online = options.online ?? true;
  return {
    content: {
      async load() {
        assertOnline(online);
        return options.content ?? defaultContent;
      },
    },
    storage,
    ads: {
      async offer(opportunity) {
        if (!online || session.adAuthority === 'none') return { status: 'unavailable' };
        return options.offer?.(opportunity) ?? { status: 'unavailable' };
      },
    },
    telemetry: options.telemetry ?? { track: async () => undefined },
    navigation: options.navigation ?? { navigate: async () => undefined },
  };
}

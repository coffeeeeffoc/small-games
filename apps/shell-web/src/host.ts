import type { GameHost, HostCapability } from '@coffeeeeffoc/game-contract';
import { createBrowserGameHost } from '@coffeeeeffoc/game-host';

import type { BuiltInGame } from './registry.js';

/** Creates the immutable browser Game Session and capability adapters for one catalog launch. */
export function createWebGameHost(game: BuiltInGame): GameHost {
  return createBrowserGameHost({
    storage: window.localStorage,
    session: {
      gameId: game.definition.manifest.gameId,
      gameVersion: game.definition.manifest.version,
      sessionId: crypto.randomUUID(),
      capabilities: [...game.definition.manifest.capabilities] as HostCapability[],
      adAuthority: 'none',
    },
    content: game.content,
  });
}

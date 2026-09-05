import type { GameHost, GameManifest, HostCapability } from '@coffeeeeffoc/game-contract';
import { createBrowserGameHost } from '@coffeeeeffoc/game-host';
import { createAdRuntime } from '@coffeeeeffoc/ad-runtime';

import type { BuiltInGame } from './registry.js';

/** Creates the immutable browser Game Session and capability adapters for one catalog launch. */
export function createWebGameHost(
  game: BuiltInGame,
  manifest: GameManifest = game.definition.manifest,
): GameHost {
  return createBrowserGameHost({
    storage: window.localStorage,
    session: {
      gameId: manifest.gameId,
      gameVersion: manifest.version,
      sessionId: crypto.randomUUID(),
      capabilities: [...manifest.capabilities] as HostCapability[],
      adAuthority: 'none',
    },
    content: game.content,
    advertising: (session) => createAdRuntime({ authority: session.adAuthority }),
  });
}

import type { GameHost } from '@coffeeeeffoc/game-contract';

import { createDefaultPorts } from './ports.js';
import { createSession } from './session.js';
import { createMemoryStoragePort } from './storage.js';
import type { GameHostOptions } from './types.js';

/** Creates a deterministic Game Host suitable for Standalone Mode and tests. */
export function createInMemoryGameHost(options: GameHostOptions = {}): GameHost {
  const online = options.online ?? true;
  const session = createSession(options.session);
  return Object.freeze({
    session,
    ...createDefaultPorts(options, createMemoryStoragePort(online), session),
  });
}

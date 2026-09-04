import { createElement } from 'react';
import { gameManifestSchema } from '@coffeeeeffoc/game-contract';
import { createReactGameDefinition } from '@coffeeeeffoc/react-game-adapter';
import { arenaContentSchema } from './content/schema.js';
import { ArenaGame } from './view/ArenaGame.js';
export { defaultArenaEnvelope } from './content/data.js';
/** Host contract and deployment metadata for the arena artifact. */
export const arenaManifest = gameManifestSchema.parse({
  gameId: 'arena',
  version: '1.0.0',
  gameContractVersion: 1,
  contentSchemaVersion: 1,
  capabilities: ['content', 'storage', 'advertising'],
  loadModes: ['in-process'],
  entry: 'index.html',
  integrity: 'builtin:arena@1.0.0',
});
/** Framework-neutral entry for the arena Game Artifact. */
export const arenaGameDefinition = createReactGameDefinition({
  manifest: arenaManifest,
  requiredCapabilities: ['content', 'storage'],
  contentSchema: arenaContentSchema,
  render: (host, content, active) => createElement(ArenaGame, { host, content, active }),
});

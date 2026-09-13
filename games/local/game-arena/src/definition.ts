import { createElement } from 'react';
import { createReactGameDefinition } from '@coffeeeeffoc/react-game-adapter';
import { arenaContentSchema } from './content/schema.js';
import { ArenaGame } from './view/ArenaGame.js';
import { arenaManifest } from './manifest.js';
export { arenaManifest } from './manifest.js';
export { defaultArenaEnvelope } from './content/data.js';
/** Host contract and deployment metadata for the arena artifact. */
/** Framework-neutral entry for the arena Game Artifact. */
export const arenaGameDefinition = createReactGameDefinition({
  manifest: arenaManifest,
  requiredCapabilities: ['content', 'storage'],
  contentSchema: arenaContentSchema,
  render: (host, content, active) => createElement(ArenaGame, { host, content, active }),
});

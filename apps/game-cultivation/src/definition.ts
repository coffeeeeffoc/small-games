import { createElement } from 'react';

import { gameManifestSchema } from '@coffeeeeffoc/game-contract';
import { createReactGameDefinition } from '@coffeeeeffoc/react-game-adapter';

import { cultivationContentSchema } from './content/schema.js';
import { CultivationGame } from './view/CultivationGame.js';

export { defaultCultivationEnvelope } from './content/data.js';

const requiredCapabilities = ['content', 'storage'] as const;

/** Deployable metadata for the reference cultivation Game Artifact. */
export const cultivationManifest = gameManifestSchema.parse({
  gameId: 'cultivation',
  version: '1.0.0',
  gameContractVersion: 1,
  contentSchemaVersion: 1,
  capabilities: ['content', 'storage', 'advertising'],
  loadModes: ['in-process', 'iframe'],
  entry: 'index.html',
  integrity: 'builtin:cultivation@1.0.0',
});

/** Framework-neutral entry that mounts the cultivation Game through Game Host capabilities. */
export const cultivationGameDefinition = createReactGameDefinition({
  manifest: cultivationManifest,
  requiredCapabilities,
  contentSchema: cultivationContentSchema,
  render: (host, content, active) => createElement(CultivationGame, { host, content, active }),
});

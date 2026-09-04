import { createElement } from 'react';

import { gameManifestSchema } from '@coffeeeeffoc/game-contract';
import { createReactGameDefinition } from '@coffeeeeffoc/react-game-adapter';

import { officeContentSchema } from './content/schema.js';
import { OfficeGame } from './view/OfficeGame.js';

export { defaultOfficeEnvelope } from './content/data.js';

const requiredCapabilities = ['content', 'storage'] as const;

/** Deployable metadata for the office Game Artifact. */
export const officeManifest = gameManifestSchema.parse({
  gameId: 'office',
  version: '1.0.0',
  gameContractVersion: 1,
  contentSchemaVersion: 1,
  capabilities: ['content', 'storage', 'advertising'],
  loadModes: ['in-process'],
  entry: 'index.html',
  integrity: 'builtin:office@1.0.0',
});

/** Framework-neutral entry that mounts the office Game through Game Host capabilities. */
export const officeGameDefinition = createReactGameDefinition({
  manifest: officeManifest,
  requiredCapabilities,
  contentSchema: officeContentSchema,
  render: (host, content, active) => createElement(OfficeGame, { host, content, active }),
});

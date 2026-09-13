import { createElement } from 'react';

import { createReactGameDefinition } from '@coffeeeeffoc/react-game-adapter';

import { officeContentSchema } from './content/schema.js';
import { OfficeGame } from './first-person/OfficeGame.js';
import { officeManifest } from './manifest.js';
export { officeManifest } from './manifest.js';

export { defaultOfficeEnvelope } from './content/data.js';

const requiredCapabilities = ['content', 'storage'] as const;

/** Framework-neutral entry that mounts the office Game through Game Host capabilities. */
export const officeGameDefinition = createReactGameDefinition({
  manifest: officeManifest,
  requiredCapabilities,
  contentSchema: officeContentSchema,
  render: (host, content, active) =>
    createElement(OfficeGame, { host, active, seed: content.seed }),
});

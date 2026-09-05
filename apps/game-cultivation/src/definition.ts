import { createElement } from 'react';

import { createReactGameDefinition } from '@coffeeeeffoc/react-game-adapter';

import { cultivationContentSchema } from './content/schema.js';
import { CultivationGame } from './view/CultivationGame.js';
import { cultivationManifest } from './manifest.js';
export { cultivationManifest } from './manifest.js';

export { defaultCultivationEnvelope } from './content/data.js';

const requiredCapabilities = ['content', 'storage'] as const;

/** Framework-neutral entry that mounts the cultivation Game through Game Host capabilities. */
export const cultivationGameDefinition = createReactGameDefinition({
  manifest: cultivationManifest,
  requiredCapabilities,
  contentSchema: cultivationContentSchema,
  render: (host, content, active) => createElement(CultivationGame, { host, content, active }),
});

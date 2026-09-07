import { createElement } from 'react';

import { createReactGameDefinition } from '@coffeeeeffoc/react-game-adapter';

import { officeContentSchema } from './content/schema.js';
import { OfficeGame } from './view/OfficeGame.js';
import { OfficeSample } from './sample/OfficeSample.js';
import { officeManifest } from './manifest.js';
export { officeManifest } from './manifest.js';

export { defaultOfficeEnvelope } from './content/data.js';

const requiredCapabilities = ['content', 'storage'] as const;

/** Deployable metadata for the office Game Artifact. */
/** Framework-neutral entry that mounts the office Game through Game Host capabilities. */
export const officeGameDefinition = createReactGameDefinition({
  manifest: officeManifest,
  requiredCapabilities,
  contentSchema: officeContentSchema,
  render: (host, content, active) =>
    content.experience === 'desk-sample'
      ? createElement(OfficeSample, { host, active })
      : createElement(OfficeGame, { host, content, active }),
});

import { createElement } from 'react';
import { HostError, type GameDefinition } from '@coffeeeeffoc/game-contract';
import { normalizeCricketContent } from './content/migration.js';

import { createReactGameDefinition } from '@coffeeeeffoc/react-game-adapter';

import { cricketContentSchema } from './content/schema.js';
import { CricketGame } from './view/CricketGame.js';
import { cricketManifest } from './manifest.js';
export { cricketManifest } from './manifest.js';

export { defaultCricketEnvelope } from './content/data.js';

const requiredCapabilities = ['content', 'storage'] as const;

/** Framework-neutral entry that mounts the cricket Game through Game Host capabilities. */
const currentDefinition = createReactGameDefinition({
  manifest: cricketManifest,
  requiredCapabilities,
  contentSchema: cricketContentSchema,
  render: (host, content, active) => createElement(CricketGame, { host, content, active }),
});

/** Keep the cricket identity separate from the cultivation campaign it was moved out of. */
export const cricketGameDefinition: GameDefinition = {
  manifest: cricketManifest,
  async mount(target, host) {
    const result = normalizeCricketContent(await host.content.load());
    if (!result.success)
      throw new HostError({ code: 'CONTENT_INCOMPATIBLE', message: 'Invalid cricket content' });
    return currentDefinition.mount(target, { ...host, content: { load: async () => result.data } });
  },
};

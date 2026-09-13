import { createElement } from 'react';
import { HostError, type GameDefinition } from '@coffeeeeffoc/game-contract';
import { normalizeCultivationContent } from './content/migration.js';

import { createReactGameDefinition } from '@coffeeeeffoc/react-game-adapter';

import { cultivationContentSchema } from './content/schema.js';
import { CultivationGame } from './view/CultivationGame.js';
import { cultivationManifest } from './manifest.js';
export { cultivationManifest } from './manifest.js';

export { defaultCultivationEnvelope } from './content/data.js';

const requiredCapabilities = ['content', 'storage'] as const;

/** Framework-neutral entry that mounts the cultivation Game through Game Host capabilities. */
const currentDefinition = createReactGameDefinition({
  manifest: cultivationManifest,
  requiredCapabilities,
  contentSchema: cultivationContentSchema,
  render: (host, content, active) => createElement(CultivationGame, { host, content, active }),
});

/** Both old published content and current drafts enter through the Game-owned migration. */
export const cultivationGameDefinition: GameDefinition = {
  manifest: cultivationManifest,
  async mount(target, host) {
    const result = normalizeCultivationContent(await host.content.load());
    if (!result.success)
      throw new HostError({ code: 'CONTENT_INCOMPATIBLE', message: 'Invalid cultivation content' });
    return currentDefinition.mount(target, { ...host, content: { load: async () => result.data } });
  },
};

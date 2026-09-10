import { createBrowserGameHost } from '@coffeeeeffoc/game-host';

import { defaultCultivationEnvelope } from './content/data.js';
import { cultivationGameDefinition } from './definition.js';

const target = document.querySelector<HTMLElement>('#root');
if (!target) throw new Error('Missing #root mount target');

const host = createBrowserGameHost({
  storage: localStorage,
  session: {
    gameId: 'cultivation',
    gameVersion: cultivationGameDefinition.manifest.version,
    adAuthority: 'none',
    capabilities: ['content', 'storage', 'advertising'],
  },
  content: defaultCultivationEnvelope,
});

await cultivationGameDefinition.mount(target, host);

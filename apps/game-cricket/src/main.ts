import { createBrowserGameHost } from '@coffeeeeffoc/game-host';

import { defaultCricketEnvelope } from './content/data.js';
import { cricketGameDefinition } from './definition.js';

const target = document.querySelector<HTMLElement>('#root');
if (!target) throw new Error('Missing #root mount target');

const host = createBrowserGameHost({
  storage: localStorage,
  session: {
    gameId: 'cricket',
    gameVersion: cricketGameDefinition.manifest.version,
    adAuthority: 'none',
    capabilities: ['content', 'storage', 'advertising'],
  },
  content: defaultCricketEnvelope,
});

await cricketGameDefinition.mount(target, host);

import { createBrowserGameHost } from '@coffeeeeffoc/game-host';

import { defaultOfficeEnvelope } from './content/data.js';
import { officeGameDefinition } from './definition.js';
import './styles.css';

const target = document.querySelector<HTMLElement>('#root');
if (!target) throw new Error('Missing #root mount target');

const host = createBrowserGameHost({
  storage: localStorage,
  session: {
    gameId: 'office',
    gameVersion: officeGameDefinition.manifest.version,
    adAuthority: 'none',
    capabilities: ['content', 'storage', 'advertising'],
  },
  content: defaultOfficeEnvelope,
});

await officeGameDefinition.mount(target, host);

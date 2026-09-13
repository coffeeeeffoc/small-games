import { createBrowserGameHost } from '@coffeeeeffoc/game-host';
import { defaultArenaEnvelope } from './content/data.js';
import { arenaGameDefinition } from './definition.js';
import './styles.css';
const target = document.querySelector<HTMLElement>('#root');
if (!target) throw new Error('Missing #root mount target');
const host = createBrowserGameHost({
  storage: localStorage,
  session: {
    gameId: 'arena',
    gameVersion: arenaGameDefinition.manifest.version,
    adAuthority: 'none',
    capabilities: ['content', 'storage', 'advertising'],
  },
  content: defaultArenaEnvelope,
});
await arenaGameDefinition.mount(target, host);

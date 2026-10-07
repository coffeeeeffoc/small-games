import { createBrowserGameHost } from '@coffeeeeffoc/game-host';
import { castleCannonGameDefinition } from './definition.js';
import { defaultCastleCannonEnvelope } from './index.js';
const target = document.querySelector<HTMLElement>('#root');
if (!target) throw new Error('Missing root');
const host = createBrowserGameHost({
  storage: {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: (key) => localStorage.removeItem(key),
  },
  session: {
    gameId: 'castle-cannon',
    gameVersion: '1.0.0',
    adAuthority: 'none',
    capabilities: ['content', 'storage', 'advertising', 'telemetry'],
  },
  content: defaultCastleCannonEnvelope,
});
void castleCannonGameDefinition.mount(target, host).catch((error: unknown) => {
  target.textContent = `游戏未能启动：${error instanceof Error ? error.message : '请刷新重试'}`;
});

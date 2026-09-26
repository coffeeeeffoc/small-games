import { createBrowserGameHost } from '@coffeeeeffoc/game-host';
import { buildingPowerGameDefinition, defaultBuildingPowerEnvelope } from './definition.js';

const target = document.querySelector<HTMLElement>('#root');
if (!target) throw new Error('Missing game root');
const host = createBrowserGameHost({
  storage: {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: (key) => localStorage.removeItem(key),
  },
  session: {
    gameId: 'building-power',
    gameVersion: '1.0.0',
    adAuthority: 'none',
    capabilities: ['content', 'storage', 'advertising', 'telemetry'],
  },
  content: defaultBuildingPowerEnvelope,
});
void buildingPowerGameDefinition.mount(target, host).catch((error: unknown) => {
  target.textContent = `游戏未能启动：${error instanceof Error ? error.message : '请刷新重试'}`;
});

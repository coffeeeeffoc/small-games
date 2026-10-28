export const RULES_VERSION = 1;
export const SEGMENT_LENGTH = 240;
export const VEHICLES = Object.freeze({
  board: { name: '滑板', response: 7, steering: 1.5, wind: 0 },
  glider: { name: '滑翔机', response: 3.8, steering: 1.25, wind: 0.08 },
  surf: { name: '冲浪板', response: 4.5, steering: 1.35, wind: 0.04 },
});
export const BIOMES = Object.freeze({
  snow: {
    name: '雪山之脊',
    vehicle: 'board',
    sky: '#1e6476',
    haze: '#b8dbd5',
    road: '#e6f0df',
    edge: '#8bbcb6',
    dark: '#224853',
    accent: '#f5b65d',
    obstacle: '岩石',
    transition: '沿雪坡，滑向巨木',
  },
  forest: {
    name: '古树之巅',
    vehicle: 'board',
    sky: '#174f59',
    haze: '#8db8a1',
    road: '#a0b283',
    edge: '#465d45',
    dark: '#143d3c',
    accent: '#f3be72',
    obstacle: '树桩',
    transition: '枝梢起跳 · 展开翼面',
  },
  falls: {
    name: '瀑布之间',
    vehicle: 'glider',
    sky: '#226b80',
    haze: '#c4e6e4',
    road: '#68cbbd',
    edge: '#358b9a',
    dark: '#254d61',
    accent: '#f7cb8c',
    obstacle: '悬岩',
    transition: '借水雾，升入云海',
  },
  cloud: {
    name: '云海航道',
    vehicle: 'glider',
    sky: '#476c8b',
    haze: '#eddcc0',
    road: '#cce8da',
    edge: '#99c6c4',
    dark: '#455e7b',
    accent: '#ffd79b',
    obstacle: '浮岩',
    transition: '收拢翼面 · 掠过浪尖',
  },
  ocean: {
    name: '浪尖远征',
    vehicle: 'surf',
    sky: '#226678',
    haze: '#b4e5d6',
    road: '#2caeaa',
    edge: '#c9efda',
    dark: '#164e66',
    accent: '#ffd08c',
    obstacle: '礁石',
    transition: '冰海尽头 · 重返雪线',
  },
});
export const CONNECTIONS = Object.freeze({
  snow: ['snow', 'forest'],
  forest: ['forest', 'falls'],
  falls: ['cloud'],
  cloud: ['cloud', 'ocean'],
  ocean: ['ocean', 'snow'],
});
export const ROUTES = Object.freeze([
  {
    id: 'snowline',
    name: '雪线启程',
    caption: '读懂前路，再飞越瀑布',
    scenes: ['snow', 'forest', 'falls'],
    difficulty: 0,
    unlock: null,
  },
  {
    id: 'cloudpass',
    name: '云海穿越',
    caption: '顶着横风，穿过云中窄门',
    scenes: ['snow', 'forest', 'falls', 'cloud'],
    difficulty: 0.6,
    unlock: 'snowline',
  },
  {
    id: 'wavecrest',
    name: '浪尖远征',
    caption: '三种载具，一条完整航线',
    scenes: ['snow', 'forest', 'falls', 'cloud', 'ocean'],
    difficulty: 1,
    unlock: 'cloudpass',
  },
]);
export const ENDLESS_TEMPLATES = Object.freeze([
  ['snow', 'forest', 'falls', 'cloud', 'ocean'],
  ['snow', 'forest', 'forest', 'falls', 'cloud', 'ocean'],
  ['snow', 'forest', 'falls', 'cloud', 'cloud', 'ocean', 'ocean'],
]);
export function validateContent(routes = ROUTES) {
  const ids = new Set();
  for (const route of routes) {
    if (!route || typeof route.id !== 'string' || ids.has(route.id))
      throw new Error('Duplicate or invalid route ID');
    if (!Number.isFinite(route.difficulty) || route.difficulty < 0 || route.difficulty > 2)
      throw new Error('Invalid difficulty');
    if (route.unlock !== null && !ids.has(route.unlock)) throw new Error('Unreachable unlock');
    if (!Array.isArray(route.scenes) || !route.scenes.length) throw new Error('Empty route');
    route.scenes.forEach((scene, i) => {
      if (!BIOMES[scene] || !VEHICLES[BIOMES[scene].vehicle])
        throw new Error('Unknown scene or vehicle');
      if (i && !CONNECTIONS[route.scenes[i - 1]].includes(scene))
        throw new Error('Invalid scene connection');
    });
    ids.add(route.id);
  }
  return true;
}
validateContent();

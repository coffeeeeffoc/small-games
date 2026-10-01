import { restoreJourney } from './game.js';

// These v1 routes use existing sourced scenes. Questions suggest observation, not answers.
export const routes = Object.freeze([
  { id: 'market', name: '街巷有回声', symbol: '⌂', description: '三幕市井 · 从运输、店铺与日常生活找线索', scenes: ['kaifeng', 'changan', 'pingyao'], questions: ['木桥、货船和店铺之间，哪一条路线最繁忙？', '看看货物如何穿过长街：运输工具与屋顶材料有什么特点？', '从店铺门面、货物和记账工具看，这条街在忙什么？'] },
  { id: 'harbor', name: '跟着水路走', symbol: '≋', description: '三幕港湾 · 船只、货物和屋檐串起一条旅途', scenes: ['quanzhou', 'venice', 'macau'], questions: ['船帆与码头上的货物，怎样表现这里的运输生活？', '水道、桥梁与临水门窗，是怎样连在一起的？', '看看街边不同式样的屋檐与门窗：能找到几种建筑材料？'] },
  { id: 'craft', name: '石头也会说话', symbol: '◇', description: '三幕建筑 · 留意柱子、拱券与屋顶的形状', scenes: ['athens', 'angkor', 'florence'], questions: ['观察石柱的排列与屋顶的轮廓：人们怎样撑起一座建筑？', '塔的层次、石墙与水面，怎样组织眼前的空间？', '从穹顶、钟塔与街道看，哪些细节像是工匠留下的痕迹？'] },
]);
export function routeInfo(id) { return routes.find(route => route.id === id) || null; }
export function routeDeck(catalog, id) {
  const route = routeInfo(id);
  if (!route) throw new Error('主题旅途无效。');
  const deck = route.scenes.map(scene => catalog.find(round => round.id === scene));
  if (deck.some(round => !round)) throw new Error('主题场景暂未齐备。');
  return deck;
}
export function restoreRouteJourney(value, catalog) {
  const route = routeInfo(value?.route);
  if (!route || value.daily || value.practice || value.timed || value.region !== 'all'
      || JSON.stringify(value.deck) !== JSON.stringify(route.scenes)) return null;
  const journey = restoreJourney(value, catalog, { roundCount: 3 });
  return journey ? { ...journey, route: route.id } : null;
}
export function parseRoute(search) {
  const params = new URLSearchParams(search);
  if (!params.has('route')) return { route: null, error: false };
  if (search.length > 512 || params.has('daily') || ['route', 'v'].some(key => params.getAll(key).length > 1)
      || ![null, '1'].includes(params.get('v')) || !routeInfo(params.get('route'))) return { route: null, error: true };
  return { route: params.get('route'), error: false };
}
export function routeUrl(location, id) {
  if (!routeInfo(id)) throw new Error('主题旅途无效。');
  const url = new URL(location.href);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('请通过网页地址打开旅途。');
  url.username = ''; url.password = ''; url.search = ''; url.hash = '';
  url.searchParams.set('route', id); url.searchParams.set('v', '1');
  return url.href;
}

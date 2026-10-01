export const explorationRoutes = [
  { id: 'architecture', title: '钟楼与旧石墙', description: '从江海关的钟楼走到穹顶和绿色塔尖，收下三段旧上海。', stops: [
    { landmark: 'customs-house', name: '江海关大楼', destination: 0 },
    { landmark: 'hsbc-building', name: '原汇丰银行大楼', destination: 0 },
    { landmark: 'peace-hotel', name: '和平饭店', destination: 1 },
  ] },
  { id: 'bridges', title: '桥边的三段故事', description: '沿苏州河口找领事馆、上海大厦和浦江饭店，看看桥两端的街景。', stops: [
    { landmark: 'british-consulate', name: '原英国领事馆', destination: 2 },
    { landmark: 'broadway-mansions', name: '上海大厦', destination: 2 },
    { landmark: 'astor-house', name: '浦江饭店', destination: 2 },
  ] },
  { id: 'skyline', title: '三种摩天轮廓', description: '在陆家嘴寻找扭转、层叠与开口，完成一次抬头旅行。', stops: [
    { landmark: 'shanghai-tower', name: '上海中心', destination: 4 },
    { landmark: 'jin-mao-tower', name: '金茂大厦', destination: 4 },
    { landmark: 'world-financial-center', name: '环球金融中心', destination: 4 },
  ] },
] as const;
export type RouteId = typeof explorationRoutes[number]['id'];
export function readRoute(search: string): RouteId | null {
  const params = new URLSearchParams(search), values = params.getAll('route');
  return values.length === 1 && explorationRoutes.some(route => route.id === values[0]) ? values[0] as RouteId : null;
}
export function routeProgress(routeId: RouteId | null, visits: readonly string[]) {
  const route = explorationRoutes.find(route => route.id === routeId);
  if (!route) return null;
  const completed = route.stops.filter(stop => visits.includes(stop.landmark)).length;
  return { route, completed, next: route.stops.find(stop => !visits.includes(stop.landmark)) || null };
}
export function routeShareUrl(currentUrl: string, routeId: RouteId | null) {
  const current = new URL(currentUrl), url = new URL(current.origin);
  url.pathname = current.pathname;
  if (explorationRoutes.some(route => route.id === routeId)) url.searchParams.set('route', routeId!);
  return url.href;
}

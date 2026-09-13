// World coordinates: +x east, +z south. Heading 0 faces north; positive turns right.
// Shared by scenery, collision, and both maps. Distances are in world metres.
export const SHORE_RADIUS = 73;
export const DOCK = { x: 0, z: 75, w: 6, d: 20 };
export const STREET_AXES = [-28, 0, 28];
export const ROADS = STREET_AXES.flatMap(n => [
  { x: n, z: 0, w: 10, d: 124 }, { x: 0, z: n, w: 124, d: 10 },
]).concat([
  { x: 0, z: -64, w: 6, d: 8 }, { x: 0, z: 64, w: 6, d: 8 },
  { x: -64, z: 0, w: 8, d: 6 }, { x: 64, z: 0, w: 8, d: 6 },
]);
export const COAST_ROAD = { radius: 68, width: 5 };
export const MARKET_PLAZA = { x: -13, z: 0, w: 20, d: 20 };
export const ROAD_ISLANDS = [
  { x: 0, z: 0, w: 3.8, d: 3.8, name: '中央花坛' },
  { x: 26, z: -13, w: 4, d: 2.5, name: '咖啡弯道' },
  { x: 30, z: -20, w: 4, d: 2.5 },
  { x: 12, z: 26, w: 2.5, d: 4, name: '花园慢行' },
  { x: 19, z: 30, w: 2.5, d: 4 },
];

// Corner shops sit inside the coast road, leaving a continuous alternative route.
export const BUILDINGS = [
  [38, -38, 14, 11, 7.2, 'coral', '海风咖啡', 'SEA BREEZE · COFFEE'],
  [38, 38, 13, 11, 6.8, 'yellow', '面包花园', 'BREAD & BLOOM', Math.PI],
  [-38, 38, 13, 11, 8, 'blue', '慢慢邮局', 'SLOW POST', Math.PI],
  [-43, 14, 12, 11, 6.2, 'cream', '海风杂货', 'SEA BREEZE MARKET'],
  [43, 14, 12, 11, 7.8, 'mint'],
  [14, -43, 12, 11, 7, 'blue'],
  [-14, -44, 12, 11, 6.8, 'yellow'],
  [14, 44, 12, 12, 8, 'coral', '橘屿旅舍', 'SLOW DAYS · WARM STAYS', Math.PI],
  [14, 14, 12, 11, 6.7, 'cream', '小岛花店', 'BLOOM & BREATHE'],
  [14, -14, 11, 10, 7.2, 'mint'],
  [-14, 16, 11, 9, 7, 'coral'],
  [-43, -14, 12, 11, 7.2, 'yellow'],
  [43, -14, 12, 11, 6.5, 'blue'],
  [-14, -17.5, 11, 6, 6.2, 'cream'],
  [-14, 44, 12, 12, 6, 'mint'],
].map(([x, z, w, d, h, color, title, subtitle, rotation = 0]) =>
  ({ x, z, w, d, h, color, title, subtitle, rotation }));

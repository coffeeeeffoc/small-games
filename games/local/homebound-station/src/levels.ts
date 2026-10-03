export type Direction = 'N' | 'E' | 'S' | 'W';
export const ARROWS: Record<Direction, string> = { N: '↑', E: '→', S: '↓', W: '←' };
export const DIRECTIONS: Record<Direction, { x: number; z: number }> = { N: { x: 0, z: -1 }, E: { x: 1, z: 0 }, S: { x: 0, z: 1 }, W: { x: -1, z: 0 } };
export interface GroupConfig { id: string; size: number; allowSplit?: boolean }
export interface VehicleConfig { id: string; capacity: 4 | 6; column: number; row: number; direction: Direction }
export interface LevelConfig { id: number; title: string; subtitle: string; hint: string; groups: GroupConfig[]; vehicles: VehicleConfig[]; stars: [number, number] }

// Each board has several exits and dependencies across rows. Tests independently peel every board to prove solvability.
const board: Direction[][] = [
  ['W', 'N', 'E', 'S', 'E'],
  ['N', 'W', 'N', 'E', 'S'],
  ['W', 'N', 'W', 'E', 'S'],
  ['N', 'W', 'S', 'W', 'E'],
];
function vehicles(cells: number[]): VehicleConfig[] {
  return cells.map((cell, i) => ({ id: `巡${String(i + 1).padStart(2, '0')}`, capacity: i % 7 === 4 ? 6 : 4, column: cell % 5, row: Math.floor(cell / 5), direction: board[Math.floor(cell / 5)]![cell % 5]! }));
}
function groups(sizes: number[]): GroupConfig[] { return sizes.map((size, i) => ({ id: `T${String(i + 1).padStart(2, '0')}`, size, allowSplit: size > 4 })); }
export const LEVELS: LevelConfig[] = [
  { id: 1, title: '解开第一片车阵', subtitle: '12 辆车 · 看箭头，先解开外侧',
    hint: '点击或滑动车辆出库。车只沿箭头前进，被挡住时先移走前面的车。',
    vehicles: vehicles([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14]), groups: groups([2, 4, 3, 1, 4, 2, 3, 4, 2, 1, 3, 4]), stars: [150, 240] },
  { id: 2, title: '一辆解开一串', subtitle: '16 辆车 · 大组分乘，车阵疏通',
    hint: '先解开挡路的车。6 人组遇到普通车时，可分乘两辆；上车位自动安排。',
    vehicles: vehicles([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 17, 19]), groups: groups([6, 2, 4, 3, 5, 1, 3, 2, 4, 3, 1, 4, 2, 4]), stars: [210, 320] },
  { id: 3, title: '满场有序出发', subtitle: '20 辆车 · 四面出库，全场清空',
    hint: '顺着箭头寻找能走的车，逐层解开阻挡。全部接客、所有车离场即可过关。',
    vehicles: vehicles(Array.from({ length: 20 }, (_, i) => i)), groups: groups([3, 4, 2, 4, 1, 3, 4, 2, 4, 3, 1, 4, 2, 3, 4, 2, 4, 3, 2, 4]), stars: [280, 400] },
];

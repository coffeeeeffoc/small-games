export type Direction = 'N' | 'E' | 'S' | 'W';
export const ARROWS: Record<Direction, string> = { N: '↑', E: '→', S: '↓', W: '←' };
export const DIRECTIONS: Record<Direction, { x: number; z: number }> = { N: { x: 0, z: -1 }, E: { x: 1, z: 0 }, S: { x: 0, z: 1 }, W: { x: -1, z: 0 } };
export interface GroupConfig { id: string; size: number; allowSplit?: boolean }
export interface VehicleConfig { id: string; capacity: 4 | 6; column: number; row: number; direction: Direction }
export interface LevelConfig { id: number; title: string; subtitle: string; hint: string; groups: GroupConfig[]; vehicles: VehicleConfig[]; stars: [number, number]; chapter?: number; difficulty?: number; dependencyDepth?: number }

function random(seed: number) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; }; }
function shuffled<T>(values: T[], rand: () => number): T[] { const result = [...values]; for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [result[i], result[j]] = [result[j]!, result[i]!]; } return result; }
const directions = Object.keys(DIRECTIONS) as Direction[];
export function dependencies(vehicles: VehicleConfig[], vehicle: VehicleConfig) { const d = DIRECTIONS[vehicle.direction]; return vehicles.filter(v => v !== vehicle && (v.column - vehicle.column) * d.x + (v.row - vehicle.row) * d.z > 0 && (v.column - vehicle.column) * d.z - (v.row - vehicle.row) * d.x === 0); }
export function boardDepth(vehicles: VehicleConfig[]) { const memo = new Map<string, number>(); const visit = (v: VehicleConfig, visiting = new Set<string>()): number => { if (visiting.has(v.id)) throw new Error('车辆方向形成闭环'); if (memo.has(v.id)) return memo.get(v.id)!; const next = new Set(visiting).add(v.id); const depth = 1 + Math.max(0, ...dependencies(vehicles, v).map(w => visit(w, next))); memo.set(v.id, depth); return depth; }; return Math.max(0, ...vehicles.map(v => visit(v))); }
function makeBoard(count: number, seed: number) {
  const rand = random(seed), cells = shuffled(Array.from({ length: 20 }, (_, i) => i), rand).slice(0, count).sort((a, b) => a - b);
  const vehicles: VehicleConfig[] = cells.map((cell, i) => ({ id: `巡${String(i + 1).padStart(2, '0')}`, capacity: i % 7 === 4 ? 6 : 4, column: cell % 5, row: Math.floor(cell / 5), direction: 'N' }));
  const remaining = [...vehicles];
  // Pick a currently exposed car and a free ray, then peel it. This order is a proof of solvability.
  while (remaining.length) {
    const choices = remaining.flatMap(v => directions.filter(direction => dependencies(remaining, { ...v, direction }).length === 0).map(direction => ({ v, direction })));
    const selected = choices[Math.floor(rand() * choices.length)]!;
    selected.v.direction = selected.direction; remaining.splice(remaining.indexOf(selected.v), 1);
  }
  const depth = boardDepth(vehicles), blocked = vehicles.filter(v => dependencies(vehicles, v).length).length;
  return { vehicles, depth, score: count * 1000 + depth * 30 + blocked, seed };
}
const chapterNames = ['晨光初班', '街角接驳', '花园车站', '午后小城', '林荫大道', '忙碌站台', '环城归途', '晚风同行', '灯火归家', '调度大师'];
function makeLevels(): LevelConfig[] {
  const counts = Array.from({ length: 100 }, (_, i) => 6 + Math.floor(i * 14 / 99));
  const levels: LevelConfig[] = [];
  for (let count = 6; count <= 20; count++) {
    const amount = counts.filter(n => n === count).length;
    const candidates = Array.from({ length: 64 }, (_, i) => makeBoard(count, 20261022 + count * 7919 + i * 104729)).sort((a, b) => a.score - b.score || a.seed - b.seed);
    for (let index = 0; index < amount; index++) {
      const candidate = candidates[Math.floor(index * (candidates.length - 1) / Math.max(1, amount - 1))]!, id = levels.length + 1, chapter = Math.ceil(id / 10), rand = random(candidate.seed + 17);
      levels.push({ id, chapter, title: `${chapterNames[chapter - 1]} · ${String(id).padStart(2, '0')}`, subtitle: `${count} 辆车 · ${candidate.depth} 层出库路线`, hint: id <= 3 ? '看独立方向箭头，点开前方无遮挡的车。可以连续点击，多辆车会同时去接客。' : '先移走挡路车辆。点击时即分配旅客，车辆分别前往约定位置。', vehicles: candidate.vehicles, groups: Array.from({ length: count }, (_, i) => ({ id: `T${String(i + 1).padStart(2, '0')}`, size: 1 + Math.floor(rand() * 4) })), stars: [Math.ceil(75 + count * 8 - id * 0.15), Math.ceil(110 + count * 12)], difficulty: candidate.score, dependencyDepth: candidate.depth });
    }
  }
  return levels;
}
export const LEVELS: LevelConfig[] = makeLevels();
export function validateLevels(levels: LevelConfig[] = LEVELS) { const ids = new Set<number>(), boards = new Set<string>(); for (const level of levels) { if (ids.has(level.id)) throw new Error('关卡 ID 重复'); ids.add(level.id); const board = JSON.stringify(level.vehicles.map(v => [v.column, v.row, v.direction])); if (boards.has(board)) throw new Error('关卡车阵重复'); boards.add(board); boardDepth(level.vehicles); if (level.groups.length > level.vehicles.length || level.groups.some(g => g.size < 1 || g.size > 4)) throw new Error('关卡乘客配置无法由任意合法顺序服务'); } return true; }

export type Direction = 'N' | 'E' | 'S' | 'W';
export const ARROWS: Record<Direction, string> = { N: '↑', E: '→', S: '↓', W: '←' };
export const DIRECTIONS: Record<Direction, { x: number; z: number }> = {
  N: { x: 0, z: -1 },
  E: { x: 1, z: 0 },
  S: { x: 0, z: 1 },
  W: { x: -1, z: 0 },
};
export interface GroupConfig {
  id: string;
  size: number;
  allowSplit?: boolean;
}
export interface VehicleConfig {
  id: string;
  capacity: 4 | 6;
  column: number;
  row: number;
  direction: Direction;
}
export interface LevelConfig {
  id: number;
  title: string;
  subtitle: string;
  hint: string;
  groups: GroupConfig[];
  vehicles: VehicleConfig[];
  stars: [number, number];
  chapter?: number;
  difficulty?: number;
  dependencyDepth?: number;
  // Omitted dimensions preserve the original 5 × 4 fixture layout.
  columns?: number;
  rows?: number;
}

function random(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}
function shuffled<T>(values: T[], rand: () => number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
const directions = Object.keys(DIRECTIONS) as Direction[];
export function dependencies(vehicles: VehicleConfig[], vehicle: VehicleConfig) {
  const d = DIRECTIONS[vehicle.direction];
  return vehicles.filter(
    (v) =>
      v !== vehicle &&
      (v.column - vehicle.column) * d.x + (v.row - vehicle.row) * d.z > 0 &&
      (v.column - vehicle.column) * d.z - (v.row - vehicle.row) * d.x === 0,
  );
}
export function boardDepth(vehicles: VehicleConfig[]) {
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const visit = (v: VehicleConfig): number => {
    if (visiting.has(v.id)) throw new Error('车辆方向形成闭环');
    if (memo.has(v.id)) return memo.get(v.id)!;
    visiting.add(v.id);
    const depth = 1 + Math.max(0, ...dependencies(vehicles, v).map(visit));
    visiting.delete(v.id);
    memo.set(v.id, depth);
    return depth;
  };
  return Math.max(0, ...vehicles.map(visit));
}
function boardKey(vehicles: VehicleConfig[]) {
  return JSON.stringify(vehicles.map((v) => [v.column, v.row, v.direction]));
}
function makeBoard(count: number, columns: number, rows: number, seed: number) {
  const rand = random(seed);
  const cells = shuffled(
    Array.from({ length: columns * rows }, (_, i) => i),
    rand,
  )
    .slice(0, count)
    .sort((a, b) => a - b);
  const vehicles: VehicleConfig[] = cells.map((cell, i) => ({
    id: `巡${String(i + 1).padStart(2, '0')}`,
    capacity: i % 7 === 4 ? 6 : 4,
    column: cell % columns,
    row: Math.floor(cell / columns),
    direction: 'N',
  }));
  const remaining = [...vehicles];
  const occupied = new Set(cells);
  // Each assigned ray is clear in this removal order. All final dependencies
  // therefore point to earlier removals, proving that the board is a DAG.
  while (remaining.length) {
    const choices: { vehicle: VehicleConfig; direction: Direction }[] = [];
    for (const vehicle of remaining) {
      for (const direction of directions) {
        const d = DIRECTIONS[direction];
        let column = vehicle.column + d.x;
        let row = vehicle.row + d.z;
        while (column >= 0 && column < columns && row >= 0 && row < rows) {
          if (occupied.has(row * columns + column)) break;
          column += d.x;
          row += d.z;
        }
        if (column < 0 || column >= columns || row < 0 || row >= rows) {
          choices.push({ vehicle, direction });
        }
      }
    }
    const selected = choices[Math.floor(rand() * choices.length)]!;
    selected.vehicle.direction = selected.direction;
    occupied.delete(selected.vehicle.row * columns + selected.vehicle.column);
    remaining.splice(remaining.indexOf(selected.vehicle), 1);
  }
  const depth = boardDepth(vehicles);
  const blocked = vehicles.filter((v) => dependencies(vehicles, v).length).length;
  // The car count dominates every possible depth/blocked difference (≤ 5,050).
  // For equal counts, depth dominates blocked cars (≤ 50).
  return { vehicles, depth, score: count * 10000 + depth * 100 + blocked, seed };
}
const chapterNames = [
  '晨光初班',
  '街角接驳',
  '花园车站',
  '午后小城',
  '林荫大道',
  '忙碌站台',
  '环城归途',
  '晚风同行',
  '灯火归家',
  '调度大师',
];
const chapters = [
  { columns: 3, rows: 3, first: 6, last: 9 },
  { columns: 3, rows: 4, first: 9, last: 12 },
  { columns: 4, rows: 4, first: 12, last: 16 },
  { columns: 4, rows: 5, first: 16, last: 20 },
  { columns: 4, rows: 6, first: 20, last: 24 },
  { columns: 5, rows: 6, first: 24, last: 30 },
  { columns: 5, rows: 7, first: 30, last: 35 },
  { columns: 6, rows: 7, first: 35, last: 42 },
  { columns: 6, rows: 8, first: 42, last: 48 },
  { columns: 6, rows: 9, first: 48, last: 50 },
];
function makeLevels(): LevelConfig[] {
  const slots = chapters.flatMap((chapter, index) =>
    Array.from({ length: 10 }, (_, step) => ({
      columns: chapter.columns,
      rows: chapter.rows,
      chapter: index + 1,
      count: chapter.first + Math.floor((step * (chapter.last - chapter.first)) / 9),
      id: index * 10 + step + 1,
    })),
  );
  const levels: LevelConfig[] = [];
  const generatedBoards = new Set<string>();
  for (let first = 0; first < slots.length; ) {
    let end = first + 1;
    while (end < slots.length && slots[end]!.count === slots[first]!.count) end++;
    const sameCount = slots.slice(first, end);
    // A small, fixed pool per slot avoids large recursive searches. Independent
    // pools let us order equal-count levels across chapter/size boundaries too.
    const pools = sameCount.map((slot) => {
      const candidates: ReturnType<typeof makeBoard>[] = [];
      for (let attempt = 0; candidates.length < 24 && attempt < 192; attempt++) {
        const candidate = makeBoard(
          slot.count,
          slot.columns,
          slot.rows,
          20261022 + slot.id * 7919 + attempt * 104729,
        );
        const key = boardKey(candidate.vehicles);
        if (generatedBoards.has(key)) continue;
        generatedBoards.add(key);
        candidates.push(candidate);
      }
      if (candidates.length !== 24) throw new Error('独立车阵候选不足');
      return candidates.sort((a, b) => a.score - b.score || a.seed - b.seed);
    });
    // Backwards ceilings guarantee every chosen score leaves a feasible score
    // for the next slot, including a larger grid with the same car count.
    const ceilings: number[] = [];
    let ceiling = Infinity;
    for (let index = pools.length - 1; index >= 0; index--) {
      const eligible = pools[index]!.filter((candidate) => candidate.score <= ceiling);
      if (!eligible.length) throw new Error('同车量关卡无法保持难度递增');
      ceiling = eligible[eligible.length - 1]!.score;
      ceilings[index] = ceiling;
    }
    let previous = -Infinity;
    for (let index = 0; index < sameCount.length; index++) {
      const slot = sameCount[index]!;
      const eligible = pools[index]!.filter(
        (candidate) => candidate.score >= previous && candidate.score <= ceilings[index]!,
      );
      const fraction = sameCount.length === 1 ? 0.5 : index / (sameCount.length - 1);
      const candidate = eligible[Math.floor(fraction * (eligible.length - 1))]!;
      if (!candidate) throw new Error('同车量关卡缺少可用车阵');
      previous = candidate.score;
      const rand = random(candidate.seed + 17);
      levels.push({
        id: slot.id,
        chapter: slot.chapter,
        columns: slot.columns,
        rows: slot.rows,
        title: `${chapterNames[slot.chapter - 1]} · ${String(slot.id).padStart(2, '0')}`,
        subtitle: `${slot.columns} × ${slot.rows} 车阵 · ${slot.count} 辆车 · ${candidate.depth} 层出库路线`,
        hint:
          slot.id <= 3
            ? '看独立方向箭头，点开前方无遮挡的车。可以连续点击，多辆车会同时去接客。'
            : '先移走挡路车辆。点击时即分配旅客，车辆分别前往约定位置。',
        vehicles: candidate.vehicles,
        // Every group fits the smallest taxi, so every legal clearing order
        // has sufficient capacity; larger taxis cannot create an endgame trap.
        groups: Array.from({ length: slot.count }, (_, i) => ({
          id: `T${String(i + 1).padStart(2, '0')}`,
          size: 1 + Math.floor(rand() * 4),
        })),
        stars: [Math.ceil(75 + slot.count * 8 - slot.id * 0.15), Math.ceil(110 + slot.count * 12)],
        difficulty: candidate.score,
        dependencyDepth: candidate.depth,
      });
    }
    first = end;
  }
  return levels;
}
export const LEVELS: LevelConfig[] = makeLevels();
export function validateLevels(levels: LevelConfig[] = LEVELS) {
  const ids = new Set<number>();
  const boards = new Set<string>();
  for (const level of levels) {
    if (ids.has(level.id)) throw new Error('关卡 ID 重复');
    ids.add(level.id);
    const columns = level.columns ?? 5;
    const rows = level.rows ?? 4;
    if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1) {
      throw new Error('关卡网格尺寸不合法');
    }
    const vehicleIds = new Set<string>();
    const occupied = new Set<string>();
    for (const vehicle of level.vehicles) {
      const cell = `${vehicle.column},${vehicle.row}`;
      if (vehicleIds.has(vehicle.id) || occupied.has(cell)) throw new Error('车辆 ID 或车位重复');
      vehicleIds.add(vehicle.id);
      occupied.add(cell);
      if (
        !Number.isInteger(vehicle.column) ||
        !Number.isInteger(vehicle.row) ||
        vehicle.column < 0 ||
        vehicle.column >= columns ||
        vehicle.row < 0 ||
        vehicle.row >= rows ||
        !directions.includes(vehicle.direction) ||
        ![4, 6].includes(vehicle.capacity)
      )
        throw new Error('车辆位置、方向或容量不合法');
    }
    const board = boardKey(level.vehicles);
    if (boards.has(board)) throw new Error('关卡车阵重复');
    boards.add(board);
    const depth = boardDepth(level.vehicles);
    if (level.dependencyDepth !== undefined && level.dependencyDepth !== depth) {
      throw new Error('关卡出库深度与车阵不符');
    }
    const groupIds = new Set(level.groups.map((group) => group.id));
    if (
      groupIds.size !== level.groups.length ||
      level.groups.length > level.vehicles.length ||
      level.groups.some((g) => !Number.isInteger(g.size) || g.size < 1 || g.size > 4)
    )
      throw new Error('关卡乘客配置无法由任意合法顺序服务');
  }
  return true;
}

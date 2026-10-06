import type { Level } from './content.ts';

export type PuzzleSnapshot = { placed: number[]; excluded: number[] };
export type PuzzleState = PuzzleSnapshot & {
  history: PuzzleSnapshot[];
  mistakes: number;
  hints: number;
  completed: boolean;
  message: string;
};

const HISTORY_LIMIT = 100;

/** Only adjacent cells touch. Distant diagonal cells are allowed. */
export function touching(size: number, a: number, b: number): boolean {
  return (
    Math.abs(Math.floor(a / size) - Math.floor(b / size)) <= 1 &&
    Math.abs((a % size) - (b % size)) <= 1
  );
}

function validIndex(level: Level, index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < level.size * level.size;
}

function conflict(level: Level, placed: number[], index: number): string {
  const { size, regions } = level;
  for (const other of placed) {
    if (Math.floor(other / size) === Math.floor(index / size)) return '这一行已有光种。';
    if (other % size === index % size) return '这一列已有光种。';
    if (regions[other] === regions[index]) return '这个花圃已有光种。';
    if (touching(size, other, index)) return '光种不能相邻，斜角也要留空。';
  }
  return '';
}

function finished(level: Level, placed: number[]): boolean {
  return (
    placed.length === level.size &&
    placed.every((index, i) => !conflict(level, placed.slice(0, i), index))
  );
}

function snapshot(state: PuzzleSnapshot): PuzzleSnapshot {
  return { placed: [...state.placed], excluded: [...state.excluded] };
}

function commit(level: Level, state: PuzzleState, next: PuzzleSnapshot, message = ''): PuzzleState {
  const completed = finished(level, next.placed);
  return {
    ...state,
    placed: [...next.placed].sort((a, b) => a - b),
    excluded: [...next.excluded].sort((a, b) => a - b),
    history: [...state.history.slice(-(HISTORY_LIMIT - 1)), snapshot(state)],
    completed,
    message: completed ? '花圃亮起来了！' : message,
  };
}

export function createPuzzle(_level: Level): PuzzleState {
  return {
    placed: [],
    excluded: [],
    history: [],
    mistakes: 0,
    hints: 0,
    completed: false,
    message: '',
  };
}

export function placeSeed(level: Level, state: PuzzleState, index: number): PuzzleState {
  if (state.completed || !validIndex(level, index)) return state;
  if (state.placed.includes(index)) {
    return commit(
      level,
      state,
      { placed: state.placed.filter((cell) => cell !== index), excluded: state.excluded },
      '已取回光种。',
    );
  }
  const reason = conflict(level, state.placed, index);
  if (reason) return { ...state, mistakes: state.mistakes + 1, message: reason };
  return commit(level, state, {
    placed: [...state.placed, index],
    excluded: state.excluded.filter((cell) => cell !== index),
  });
}

export function toggleExclusion(level: Level, state: PuzzleState, index: number): PuzzleState {
  if (state.completed || !validIndex(level, index)) return state;
  if (state.placed.includes(index)) return { ...state, message: '这格已有光种，先轻点取回。' };
  return commit(level, state, {
    placed: state.placed,
    excluded: state.excluded.includes(index)
      ? state.excluded.filter((cell) => cell !== index)
      : [...state.excluded, index],
  });
}

export function undo(level: Level, state: PuzzleState): PuzzleState {
  if (state.completed || !state.history.length) return state;
  const previous = state.history[state.history.length - 1];
  return {
    ...state,
    ...snapshot(previous),
    history: state.history.slice(0, -1),
    completed: finished(level, previous.placed),
    message: '已撤回上一步。',
  };
}

/** Solutions contain one cell index per row. Stop after limit to bound validation. */
export function solve(level: Level, limit = 2): number[][] {
  const { size, regions } = level;
  if (!Number.isInteger(size) || size < 1 || size > 12 || regions.length !== size * size) return [];
  const cap = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 2;
  const answers: number[][] = [];
  const selected: number[] = [];
  const visit = (
    row: number,
    columns: number,
    flowerPlots: number,
    previousColumn: number,
  ): void => {
    if (answers.length >= cap) return;
    if (row === size) {
      answers.push([...selected]);
      return;
    }
    for (let column = 0; column < size; column++) {
      const index = row * size + column;
      const region = regions[index];
      if (!Number.isInteger(region) || region < 0 || region >= size) continue;
      if (
        columns & (1 << column) ||
        flowerPlots & (1 << region) ||
        Math.abs(previousColumn - column) <= 1
      )
        continue;
      selected.push(index);
      visit(row + 1, columns | (1 << column), flowerPlots | (1 << region), column);
      selected.pop();
      if (answers.length >= cap) return;
    }
  };
  visit(0, 0, 0, -2);
  return answers;
}

function forcedTarget(
  level: Level,
  state: PuzzleState,
  solution: number[],
): { index: number; message: string } {
  const available = (index: number): boolean =>
    !state.placed.includes(index) &&
    !state.excluded.includes(index) &&
    !conflict(level, state.placed, index);
  for (let region = 0; region < level.size; region++) {
    if (state.placed.some((index) => level.regions[index] === region)) continue;
    const cells = level.regions.flatMap((value, index) =>
      value === region && available(index) ? [index] : [],
    );
    if (cells.length === 1 && solution.includes(cells[0]))
      return { index: cells[0], message: '这个花圃只剩这一格可以种。' };
  }
  for (let row = 0; row < level.size; row++) {
    if (state.placed.some((index) => Math.floor(index / level.size) === row)) continue;
    const cells = Array.from(
      { length: level.size },
      (_, column) => row * level.size + column,
    ).filter(available);
    if (cells.length === 1 && solution.includes(cells[0]))
      return { index: cells[0], message: '这一行只剩这一格可以种。' };
  }
  for (let column = 0; column < level.size; column++) {
    if (state.placed.some((index) => index % level.size === column)) continue;
    const cells = Array.from({ length: level.size }, (_, row) => row * level.size + column).filter(
      available,
    );
    if (cells.length === 1 && solution.includes(cells[0]))
      return { index: cells[0], message: '这一列只剩这一格可以种。' };
  }
  return {
    index: solution.find((index) => !state.placed.includes(index))!,
    message: '试着把光种种在这格，再观察同行、同列和四周。',
  };
}

export function hint(level: Level, state: PuzzleState): PuzzleState {
  if (state.completed) return state;
  const solution = solve(level, 1)[0];
  if (!solution) return { ...state, message: '这块花圃暂时无法求解。' };
  const wrong = state.placed.find((index) => !solution.includes(index));
  if (wrong !== undefined) {
    const next = commit(
      level,
      state,
      { placed: state.placed.filter((index) => index !== wrong), excluded: state.excluded },
      '这颗光种会挡住后续位置，已帮你取回。',
    );
    return { ...next, hints: state.hints + 1 };
  }
  const target = forcedTarget(level, state, solution);
  const next = commit(
    level,
    state,
    {
      placed: [...state.placed, target.index],
      excluded: state.excluded.filter((index) => index !== target.index),
    },
    target.message,
  );
  return { ...next, hints: state.hints + 1 };
}

/** Game-owned schema: every plot is present, connected, and yields exactly one solution. */
export function validateLevel(level: Level): void {
  if (
    !level ||
    typeof level !== 'object' ||
    typeof level.id !== 'string' ||
    !level.id.trim() ||
    !Number.isInteger(level.number) ||
    level.number < 1 ||
    !Number.isInteger(level.chapter) ||
    level.chapter < 1 ||
    typeof level.title !== 'string' ||
    !level.title.trim()
  )
    throw new Error('Invalid level metadata');
  const { size, regions } = level;
  if (
    !Number.isInteger(size) ||
    size < 4 ||
    size > 8 ||
    !Array.isArray(regions) ||
    regions.length !== size * size
  )
    throw new Error(`${level.id}: invalid board size`);
  if (regions.some((region) => !Number.isInteger(region) || region < 0 || region >= size))
    throw new Error(`${level.id}: invalid region ID`);
  for (let region = 0; region < size; region++) {
    const start = regions.indexOf(region);
    if (start < 0) throw new Error(`${level.id}: missing region ${region}`);
    const visited = new Set<number>([start]);
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      const cell = queue[head];
      const row = Math.floor(cell / size);
      const column = cell % size;
      const neighbors = [
        row > 0 ? cell - size : -1,
        row < size - 1 ? cell + size : -1,
        column > 0 ? cell - 1 : -1,
        column < size - 1 ? cell + 1 : -1,
      ];
      for (const next of neighbors) {
        if (next >= 0 && regions[next] === region && !visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    if (visited.size !== regions.filter((value) => value === region).length)
      throw new Error(`${level.id}: disconnected region ${region}`);
  }
  if (solve(level, 2).length !== 1) throw new Error(`${level.id}: board must have one solution`);
}

export function safeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.min(1_000_000, Math.floor(value))
    : 0;
}

function restoreSnapshot(level: Level, raw: unknown): PuzzleSnapshot {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const placed: number[] = [];
  if (Array.isArray(value.placed)) {
    for (const cell of value.placed.slice(0, level.size * level.size)) {
      if (
        typeof cell === 'number' &&
        validIndex(level, cell) &&
        !placed.includes(cell) &&
        !conflict(level, placed, cell)
      )
        placed.push(cell);
    }
  }
  const excluded = Array.isArray(value.excluded)
    ? [
        ...new Set(
          value.excluded.filter(
            (cell): cell is number =>
              typeof cell === 'number' && validIndex(level, cell) && !placed.includes(cell),
          ),
        ),
      ]
    : [];
  return { placed: placed.sort((a, b) => a - b), excluded: excluded.sort((a, b) => a - b) };
}

export function restorePuzzle(level: Level, raw: unknown): PuzzleState {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const restored = restoreSnapshot(level, raw);
  const completed = finished(level, restored.placed);
  return {
    ...restored,
    history: Array.isArray(value.history)
      ? value.history
          .slice(-HISTORY_LIMIT)
          .filter((item) => item && typeof item === 'object')
          .map((item) => restoreSnapshot(level, item))
      : [],
    mistakes: safeCount(value.mistakes),
    hints: safeCount(value.hints),
    completed,
    message: completed ? '花圃亮起来了！' : '',
  };
}

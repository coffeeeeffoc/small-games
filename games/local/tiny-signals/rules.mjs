/** Tiny Signals rules v1. Pure, deterministic, DOM-free shared simulation. */
export const DIRECTIONS = Object.freeze(['up', 'right', 'down', 'left']);

const topology = new WeakMap();
const clockwise = (direction) => DIRECTIONS[(DIRECTIONS.indexOf(direction) + 1) % 4];
const sorted = (values) => [...values].sort((a, b) => a - b);

function data(board) {
  if (!topology.has(board)) {
    topology.set(board, {
      blocked: new Set([...(board.walls || []), ...(board.voids || [])]),
      reversedEdges: new Set((board.oneWays || []).map(({ from, to }) => `${to}:${from}`)),
      compasses: new Set(board.compasses || []),
      bridges: new Set(board.bridges || []),
      windAt: new Map((board.winds || []).map((wind, index) => [wind.cell, index])),
      gateAt: new Map((board.shutters || []).map((gate, index) => [gate.cell, index])),
    });
  }
  return topology.get(board);
}

function neighbour(cell, direction, size) {
  const x = cell % size;
  const y = Math.floor(cell / size);
  if (direction === 'up') return y > 0 ? cell - size : null;
  if (direction === 'right') return x + 1 < size ? cell + 1 : null;
  if (direction === 'down') return y + 1 < size ? cell + size : null;
  return x > 0 ? cell - 1 : null;
}

function canCross(config, board, from, to) {
  const terrain = data(config);
  if (to === null || terrain.blocked.has(to) || board.collapsed.includes(to)) return false;
  if (terrain.reversedEdges.has(`${from}:${to}`)) return false;
  const gateIndex = terrain.gateAt.get(to);
  return gateIndex === undefined || board.gateOpen[gateIndex];
}

function gates(config, board) {
  return (config.shutters || []).map(
    ({ cell, plate }) =>
      board.pos === plate ||
      board.boxes.includes(plate) ||
      board.pos === cell ||
      board.boxes.includes(cell) ||
      board.echo === cell,
  );
}

/** Initial terrain phases are part of the level, never random or wall-clock based. */
export function createState(level) {
  const boards = level.boards.map((config) => {
    const board = {
      pos: config.start,
      done: config.start === config.home,
      boxes: sorted(config.boxes || []),
      collapsed: [],
      charged: false,
      windDirs: (config.winds || []).map((wind) => wind.dir),
      gateOpen: [],
      echo: config.echo?.start ?? null,
    };
    board.gateOpen = gates(config, board);
    return board;
  });
  return {
    boards,
    turn: 0,
    previousInput: null,
    status: boards.every((board) => board.done) ? 'won' : 'playing',
    failedBoard: null,
    reason: null,
    events: [],
  };
}

function cloneBoard(board) {
  return {
    ...board,
    boxes: [...board.boxes],
    collapsed: [...board.collapsed],
    windDirs: [...board.windDirs],
    gateOpen: [...board.gateOpen],
  };
}

function collapseDeparted(config, board, previouslyOccupied) {
  const bridges = data(config).bridges;
  for (const cell of previouslyOccupied) {
    if (
      bridges.has(cell) &&
      board.pos !== cell &&
      !board.boxes.includes(cell) &&
      !board.collapsed.includes(cell)
    ) {
      board.collapsed.push(cell);
    }
  }
  board.collapsed.sort((a, b) => a - b);
}

/** Returns a collision flag; an illegal terrain move is simply a successful wait. */
function moveMessenger(config, board, direction, canPush, events, boardIndex, kind) {
  const to = neighbour(board.pos, direction, config.size);
  if (!canCross(config, board, board.pos, to)) return false;
  const boxIndex = board.boxes.indexOf(to);
  const wasOccupied = [board.pos, ...board.boxes];
  if (boxIndex !== -1) {
    if (!canPush) return false;
    const boxTo = neighbour(to, direction, config.size);
    if (
      !canCross(config, board, to, boxTo) ||
      boxTo === config.home ||
      boxTo === board.echo ||
      board.boxes.includes(boxTo)
    )
      return false;
    board.boxes[boxIndex] = boxTo;
    board.boxes.sort((a, b) => a - b);
    events.push({ board: boardIndex, kind: 'push', from: to, to: boxTo });
  }
  events.push({ board: boardIndex, kind, from: board.pos, to });
  board.pos = to;
  if (data(config).compasses.has(to)) board.charged = true;
  collapseDeparted(config, board, wasOccupied);
  if (to === config.home) board.done = true;
  return to === board.echo;
}

/** Every accepted input advances exactly one turn, even when everybody hits a wall. */
export function step(level, state, direction) {
  if (state.status !== 'playing') return state;
  if (!DIRECTIONS.includes(direction)) throw new RangeError(`Unknown direction: ${direction}`);
  let failedBoard = null;
  let reason = null;
  const events = [];
  const collision = (index, phase) => {
    if (failedBoard === null) {
      failedBoard = index;
      reason = phase === 'echo' ? '巡检残影撞到了信使' : '信使撞上了巡检残影';
    }
  };
  const boards = state.boards.map((previous, index) => {
    if (previous.done) return previous;
    const board = cloneBoard(previous);
    const config = level.boards[index];
    const localDirection = board.charged ? clockwise(direction) : direction;
    board.charged = false;
    if (moveMessenger(config, board, localDirection, true, events, index, 'move'))
      collision(index, 'main');
    if (board.done) return board;

    const windIndex = data(config).windAt.get(board.pos);
    if (
      windIndex !== undefined &&
      moveMessenger(config, board, previous.windDirs[windIndex], false, events, index, 'wind')
    )
      collision(index, 'wind');
    if (board.done) return board;

    if (board.echo !== null && state.previousInput !== null) {
      const to = neighbour(board.echo, state.previousInput, config.size);
      if (
        canCross(config, board, board.echo, to) &&
        !board.boxes.includes(to) &&
        to !== config.home
      ) {
        events.push({ board: index, kind: 'echo', from: board.echo, to });
        board.echo = to;
      }
      if (board.echo === board.pos) collision(index, 'echo');
    }
    board.gateOpen = gates(config, board);
    board.windDirs = board.windDirs.map(clockwise);
    return board;
  });
  // Independent boards resolve together: main movement/pushing, then wind, then echoes.
  // Events describe presentation only and are deliberately excluded from stateKey.
  const phase = { push: 0, move: 0, wind: 1, echo: 2 };
  events.sort((a, b) => phase[a.kind] - phase[b.kind] || a.board - b.board);
  return {
    boards,
    turn: state.turn + 1,
    previousInput: direction,
    status: failedBoard !== null ? 'lost' : boards.every((board) => board.done) ? 'won' : 'playing',
    failedBoard,
    reason,
    events,
  };
}

/** Turn count is deliberately omitted: it cannot change any future transition. */
export function stateKey(state) {
  return `${state.status}|${state.previousInput || '-'}|${state.boards
    .map((board) =>
      [
        board.pos,
        +board.done,
        +board.charged,
        board.boxes.join(','),
        board.collapsed.join(','),
        board.windDirs.map((direction) => DIRECTIONS.indexOf(direction)).join(''),
        board.gateOpen.map(Number).join(''),
        board.echo ?? '-',
      ].join('/'),
    )
    .join('|')}`;
}

/** Exhaustive breadth-first search of the joint state proves every returned solution optimal. */
export function solve(level, { maxStates = 200000 } = {}) {
  if (!Number.isInteger(maxStates) || maxStates < 1)
    throw new RangeError('maxStates must be a positive integer');
  const initial = createState(level);
  if (initial.status === 'won')
    return { solution: [], explored: 1, optimal: true, exhausted: false };
  const queue = [initial];
  const parents = [-1];
  const inputs = [null];
  const seen = new Set([stateKey(initial)]);
  for (let head = 0; head < queue.length; head += 1) {
    for (const direction of DIRECTIONS) {
      const next = step(level, queue[head], direction);
      if (next.status === 'lost') continue;
      if (next.status === 'won') {
        const solution = [direction];
        for (let cursor = head; parents[cursor] !== -1; cursor = parents[cursor])
          solution.push(inputs[cursor]);
        solution.reverse();
        return { solution, explored: seen.size, optimal: true, exhausted: false };
      }
      const key = stateKey(next);
      if (seen.has(key)) continue;
      if (seen.size >= maxStates)
        return { solution: null, explored: seen.size, optimal: false, exhausted: true };
      seen.add(key);
      queue.push(next);
      parents.push(head);
      inputs.push(direction);
    }
  }
  return { solution: null, explored: seen.size, optimal: true, exhausted: false };
}

/** Validate external/editor data before simulation. Human-readable errors include board numbers. */
export function validateLevel(level) {
  const errors = [];
  if (!level || !Array.isArray(level.boards) || level.boards.length !== 4)
    return ['关卡必须包含四块棋盘'];
  level.boards.forEach((board, index) => {
    const error = (message) => errors.push(`棋盘 ${index + 1}：${message}`);
    if (!board || !Number.isInteger(board.size) || board.size < 2 || board.size > 32) {
      error('size 必须是 2–32 的整数');
      return;
    }
    const validCell = (cell) =>
      Number.isInteger(cell) && cell >= 0 && cell < board.size * board.size;
    for (const key of ['start', 'home']) if (!validCell(board[key])) error(`${key} 格子超出棋盘`);
    const arrays = [
      'walls',
      'voids',
      'oneWays',
      'compasses',
      'bridges',
      'winds',
      'boxes',
      'shutters',
    ];
    if (arrays.some((key) => board[key] !== undefined && !Array.isArray(board[key]))) {
      error('地形与机关必须使用数组');
      return;
    }
    const checkedList = (values, label) => {
      if (values.some((cell) => !validCell(cell))) error(`${label} 包含无效格子`);
      if (new Set(values).size !== values.length) error(`${label} 含重复格子`);
    };
    for (const key of ['walls', 'voids', 'compasses', 'bridges', 'boxes'])
      checkedList(board[key] || [], key);
    const blocked = new Set([...(board.walls || []), ...(board.voids || [])]);
    if ((board.walls || []).some((cell) => (board.voids || []).includes(cell)))
      error('墙与空洞不能重叠');
    for (const cell of [board.start, board.home, ...(board.boxes || []), board.echo?.start].filter(
      (cell) => cell !== undefined,
    )) {
      if (!validCell(cell)) error('角色、家、箱子或残影格子无效');
      if (blocked.has(cell)) error('角色、家、箱子或残影不能位于墙或空洞中');
    }
    if (board.echo !== undefined && (!board.echo || !validCell(board.echo.start)))
      error('echo.start 必须是有效格子');
    const occupants = [board.start, ...(board.boxes || []), board.echo?.start].filter(
      (cell) => cell !== undefined,
    );
    if (new Set(occupants).size !== occupants.length) error('角色、箱子与残影不能同格');
    if ((board.boxes || []).includes(board.home) || board.echo?.start === board.home)
      error('箱子和残影不能位于家中');
    const winds = board.winds || [];
    const shutters = board.shutters || [];
    if (winds.some((wind) => !wind || !validCell(wind.cell) || !DIRECTIONS.includes(wind.dir)))
      error('风场需要有效的 cell 与 dir');
    if (shutters.some((gate) => !gate || !validCell(gate.cell) || !validCell(gate.plate)))
      error('闸门需要有效的 cell 与 plate');
    checkedList(
      winds.map((wind) => wind?.cell),
      'winds',
    );
    checkedList(
      shutters.map((gate) => gate?.cell),
      'shutters',
    );
    const floors = [
      board.home,
      ...(board.compasses || []),
      ...(board.bridges || []),
      ...winds.map((wind) => wind?.cell),
      ...new Set(shutters.map((gate) => gate?.plate)),
      ...shutters.map((gate) => gate?.cell),
    ];
    if (new Set(floors).size !== floors.length) error('家、罗盘、桥、风场、压板与闸门不能重叠');
    if (floors.some((cell) => blocked.has(cell))) error('地面机关不能位于墙或空洞中');
    const edges = new Set();
    for (const edge of board.oneWays || []) {
      if (!edge || !validCell(edge.from) || !validCell(edge.to)) {
        error('单向门需要有效的 from 与 to');
        continue;
      }
      const distance =
        Math.abs((edge.from % board.size) - (edge.to % board.size)) +
        Math.abs(Math.floor(edge.from / board.size) - Math.floor(edge.to / board.size));
      if (distance !== 1) error('单向门必须连接相邻格子');
      if (blocked.has(edge.from) || blocked.has(edge.to)) error('单向门不能连接墙或空洞');
      const key = [edge.from, edge.to].sort((a, b) => a - b).join(':');
      if (edges.has(key)) error('同一条边不能重复放置单向门');
      edges.add(key);
    }
  });
  return errors;
}

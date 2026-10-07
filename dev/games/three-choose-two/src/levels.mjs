import { SHAPE_BY_ID } from './shapes.mjs';

export const CONTENT_VERSION = 1;
export const CHAPTERS = Object.freeze([
  { id: 'foundation', title: '初识积木', start: 1, end: 10 },
  { id: 'choices', title: '留与舍', start: 11, end: 20 },
  { id: 'challenge', title: '空间挑战', start: 21, end: 30 },
]);

const piece = (shapeId, color = 1) => ({ shapeId, color });
const index = (x, y) => y * 8 + x;
const move = (shapeId, x, y) => ({ shapeId, x, y });
const patch = (shapeId, x, y) => ({ shapeId, x, y });
const hfill = (y, lengths = [3, 5]) => {
  let x = 0;
  return lengths.map((length) => { const result = move(length === 1 ? 'dot' : `h${length}`, x, y); x += length; return result; });
};
const vfill = (x, lengths = [4, 4]) => {
  let y = 0;
  return lengths.map((length) => { const result = move(length === 1 ? 'dot' : `v${length}`, x, y); y += length; return result; });
};
const pairFill = (y, rectangular = false) => rectangular
  ? [move('rect3x2', 0, y), move('rect3x2', 3, y), move('square2', 6, y)]
  : [0, 2, 4, 6].map((x) => move('square2', x, y));

// Each entry owns geometry, its fixed stock and its verified route. Adding a
// level changes content here; the engine has no level-specific branches.
const recipes = [
  { title: '第一条线', max: 2, lines: 1, patches: [patch('dot', 3, 4)], hint: '把单格补进缺口。' },
  { title: '放两块，留一块', max: 3, lines: 2, patches: [patch('h3', 2, 2)], fill: hfill(4, [5, 3]), hint: '先完成一组，再铺满下一行。' },
  { title: '小块先行', max: 4, lines: 2, opening: true, hint: '先清掉顶行，大方块才有空间。' },
  { title: '大块也能破局', max: 5, lines: 3, patches: [patch('h4', 2, 2), patch('square2', 3, 5)], hint: '小方块可以一次补满两行。' },
  { title: '十字时刻', max: 5, lines: 3, cross: { row: 3, col: 2, rows: [0] }, goals: { cross: 1 }, hint: '交点补满时，行和列一起消除。' },
  { title: '拐角留白', max: 6, lines: 3, patches: [patch('l3-nw', 2, 1)], fill: hfill(5), hint: '拐角缺口适合固定朝向的L。' },
  { title: '成双成对', max: 6, lines: 4, patches: [patch('rect3x2', 4, 0), patch('h3', 1, 4)], fill: hfill(6, [4, 4]), goals: { multi: 1 }, hint: '长方块能补满两行。' },
  { title: '向下看', max: 7, lines: 4, vertical: true, patches: [patch('h2', 4, 1), patch('h5', 2, 4)], fill: hfill(6, [2, 3, 3]).concat(hfill(0)), hint: '这次沿着列规划。' },
  { title: '三行齐发', max: 7, lines: 4, patches: [patch('l5-ne', 3, 2)], fill: hfill(6, [2, 2, 4]), goals: { multi: 1 }, hint: '大L留住三行的最后几格。' },
  { title: '第一章试炼', max: 8, lines: 5, patches: [patch('t4-down', 2, 0), patch('h4', 4, 4)], fill: pairFill(6), goals: { multi: 1 }, hint: '别把能补缺口的块提前舍掉。' },
  { title: '长短之间', max: 8, lines: 5, patches: [patch('h5', 0, 1), patch('l3-se', 4, 4)], fill: pairFill(0, true), hint: '大块铺路，小块收尾。' },
  { title: 'T形缺口', max: 8, lines: 5, patches: [patch('t4-up', 4, 2), patch('h3', 3, 6)], fill: hfill(0).concat(hfill(7, [2, 3, 3])), goals: { multi: 1 }, hint: '候选的朝向固定，先看轮廓。' },
  { title: '竖向取舍', max: 8, lines: 5, vertical: true, patches: [patch('rect3x2', 1, 1), patch('h2', 5, 5)], fill: pairFill(6, true), hint: '把空间留给长方块。' },
  { title: '第二个交点', max: 9, lines: 6, cross: { row: 2, col: 6, rows: [0, 3, 5, 7] }, goals: { cross: 1 }, hint: '十字清除之后，缺口会改变。' },
  { title: '三个小方块', max: 9, lines: 6, patches: [patch('square3', 2, 1), patch('h2', 6, 5)], fill: pairFill(6), goals: { multi: 1 }, hint: '九格块也有它的位置。' },
  { title: '折线接力', max: 9, lines: 6, patches: [patch('l4-east', 4, 0), patch('l3-sw', 1, 5)], fill: hfill(7), hint: '先后顺序和取舍同样重要。' },
  { title: '一行多用', max: 9, lines: 6, patches: [patch('l5-nw', 0, 3)], fill: hfill(0, [4, 4]).concat(hfill(1, [2, 3, 3]), hfill(2, [5, 3])), hint: '清空的行能继续承接下一组。' },
  { title: '横竖相接', max: 10, lines: 6, cross: { row: 5, col: 0, rows: [1, 2, 4] }, fill: vfill(7), goals: { cross: 1 }, hint: '清掉一列后，要重新观察余下缺口。' },
  { title: '窄边大块', max: 10, lines: 7, vertical: true, patches: [patch('square3', 5, 0), patch('l3-ne', 2, 4)], fill: pairFill(6), goals: { multi: 2 }, hint: '狭窄余地里也有大块的落点。' },
  { title: '取舍终章', max: 10, lines: 7, patches: [patch('l5-se', 4, 1), patch('t4-up', 1, 5)], fill: pairFill(0, true), goals: { multi: 2 }, hint: '连续保留能铺满整行的组合。' },
  { title: '轻装上阵', max: 8, lines: 6, patches: [patch('l5-sw', 2, 0)], fill: pairFill(4, true).concat(hfill(7)), budget: true, hint: '每组丢弃的面积都计入预算。' },
  { title: '拐角预算', max: 9, lines: 6, patches: [patch('l4-east', 0, 4)], fill: hfill(0).concat(pairFill(1)), budget: true, hint: '小弃块给后续组留下余量。' },
  { title: '十字留余量', max: 9, lines: 7, cross: { row: 4, col: 3, rows: [0, 1, 2, 6, 7] }, budget: true, hint: '胜利落子会立即结束，不补算未完成组的弃块。' },
  { title: '两列一组', max: 10, lines: 7, vertical: true, patches: [patch('rect3x2', 2, 2), patch('l3-nw', 0, 5)], fill: pairFill(0, true).concat(hfill(7)), budget: true, hint: '让大块铺满两列，丢掉更小的备选。' },
  { title: '四段拼接', max: 10, lines: 7, patches: [patch('square3', 5, 0)], fill: pairFill(3).concat(pairFill(6, true)), budget: true, hint: '半成的行要为下一组保留落点。' },
  { title: '长线考验', max: 10, lines: 8, patches: [patch('l5-nw', 5, 1), patch('t4-down', 2, 5)], fill: hfill(0, [2, 3, 3]).concat(pairFill(3)), goals: { multi: 2 }, hint: '三段和两行拼接交替进行。' },
  { title: '交叉之后', max: 11, lines: 8, cross: { row: 6, col: 7, rows: [0, 1, 2, 3, 5, 7] }, budget: true, hint: '交叉消除打开边缘，短条负责后续。' },
  { title: '大块回归', max: 11, lines: 8, vertical: true, patches: [patch('l5-ne', 1, 0), patch('square3', 5, 4)], fill: pairFill(0), goals: { multi: 3 }, hint: '保留大块，换取更多同时消除。' },
  { title: '最后的空隙', max: 12, lines: 9, patches: [patch('l5-se', 0, 0), patch('l5-sw', 5, 4)], fill: pairFill(0, true).concat(hfill(7, [2, 3, 3])), budget: true, hint: '预算和空间一起规划。' },
  { title: '三选二大师', max: 12, lines: 9, cross: { row: 0, col: 4, rows: [1, 2, 3, 4, 5, 6] }, fill: hfill(7, [2, 2, 4]), budget: true, hint: '交点、补缺和弃格的最后一场考验。' },
];

function transpose(board) {
  return board.map((_, i) => board[index(Math.floor(i / 8), i % 8)]);
}
function transposedShape(shapeId) {
  const shape = SHAPE_BY_ID[shapeId];
  const wanted = shape.cells.map(([x, y]) => `${y},${x}`).sort().join(';');
  const match = Object.values(SHAPE_BY_ID).find((candidate) => candidate.cells.map(([x, y]) => `${x},${y}`).sort().join(';') === wanted);
  if (!match) throw new Error(`No fixed transpose for ${shapeId}`);
  return match.id;
}

function makeLevel(recipe, number) {
  let board = Array(64).fill(0);
  let plan = [];
  const fillCell = (x, y) => { board[index(x, y)] = 1 + ((x * 2 + y + number) % 5); };
  if (recipe.opening) {
    for (let x = 1; x < 8; x++) fillCell(x, 0);
    for (let y = 1; y <= 2; y++) for (let x = 3; x < 8; x++) fillCell(x, y);
    for (const y of [3, 5, 7]) for (const x of [0, 2, 4, 6]) fillCell(x, y);
    plan = [move('dot', 0, 0), move('square3', 0, 0)];
  } else if (recipe.cross) {
    const { row, col, rows } = recipe.cross;
    const neighbor = col === 7 ? 6 : col + 1;
    for (let x = 0; x < 8; x++) if (x !== col) fillCell(x, row);
    for (let y = 0; y < 8; y++) if (y !== row) fillCell(col, y);
    for (const y of rows) for (let x = 0; x < 8; x++) if (x !== neighbor) fillCell(x, y);
    plan.push(move('dot', col, row), ...rows.map((y) => move('h2', Math.min(col, neighbor), y)));
  } else {
    for (const item of recipe.patches ?? []) {
      const shape = SHAPE_BY_ID[item.shapeId];
      for (let y = item.y; y < item.y + shape.height; y++) for (let x = 0; x < 8; x++) fillCell(x, y);
      for (const [dx, dy] of shape.cells) board[index(item.x + dx, item.y + dy)] = 0;
      plan.push(move(item.shapeId, item.x, item.y));
    }
  }
  plan.push(...(recipe.fill ?? []));
  if (recipe.vertical) {
    board = transpose(board);
    plan = plan.map(({ shapeId, x, y }) => move(transposedShape(shapeId), y, x));
  }
  const candidates = [];
  const solution = [];
  const distractors = ['h5', 'square2', 'l3-ne', 'rect2x3', 't4-down', 'l5-sw', 'square3', 'v3'];
  for (let i = 0; i < plan.length; i += 2) {
    const first = plan[i];
    const second = plan[i + 1];
    const offset = (number + Math.floor(i / 2)) % 3;
    const slots = [piece(distractors[(number + i) % distractors.length], 1 + (number % 5)), piece('dot', 3), piece('h2', 4)];
    slots[offset] = piece(first.shapeId, 1 + ((number + i) % 5));
    if (second) slots[(offset + 1) % 3] = piece(second.shapeId, 1 + ((number + i + 1) % 5));
    // Budget levels retain large useful blocks and leave a small optional block.
    if (recipe.budget && second) slots[(offset + 2) % 3] = piece(i % 4 === 0 ? 'dot' : 'h2', 5);
    candidates.push(slots);
    solution.push({ slot: offset, x: first.x, y: first.y });
    if (second) solution.push({ slot: (offset + 1) % 3, x: second.x, y: second.y });
  }
  while (candidates.length < recipe.max + 2) {
    const i = candidates.length;
    candidates.push([piece(i % 2 ? 'h3' : 'h5', 2), piece(i % 3 ? 'v2' : 'square2', 3), piece(i % 2 ? 'l3-se' : 'dot', 4)]);
  }
  const three = Math.ceil(plan.length / 2);
  const budget = recipe.budget ? Array.from({ length: Math.floor((plan.length - 1) / 2) }, (_, i) => i % 2 === 0 ? 1 : 2).reduce((a, b) => a + b, 0) + 1 : undefined;
  return {
    id: number, number, title: recipe.title, chapter: CHAPTERS[Math.floor((number - 1) / 10)].id,
    maxGroups: recipe.max, goal: { lines: recipe.lines, ...(recipe.goals ?? {}) },
    ...(budget === undefined ? {} : { discardBudget: budget }),
    initialBoard: board, candidates, starThresholds: { two: Math.min(recipe.max, three + 1), three },
    solution, hint: recipe.hint, continuationGroups: 2,
  };
}

export const LEVELS = recipes.map((recipe, i) => makeLevel(recipe, i + 1));
export function getLevel(id) { return LEVELS.find((level) => level.id === Number(id)); }

export function validateLevels(levels = LEVELS) {
  const errors = [];
  const ids = new Set();
  for (const level of levels) {
    const label = `Level ${level.id}`;
    if (ids.has(level.id)) errors.push(`${label}: duplicate id`);
    ids.add(level.id);
    if (!Number.isInteger(level.id) || level.id < 1 || !level.title) errors.push(`${label}: invalid identity`);
    if (!Array.isArray(level.initialBoard) || level.initialBoard.length !== 64 || level.initialBoard.some((cell) => !Number.isInteger(cell) || cell < 0 || cell > 5)) errors.push(`${label}: invalid board`);
    if (!Number.isInteger(level.maxGroups) || level.maxGroups < 1 || level.candidates.length !== level.maxGroups + 2) errors.push(`${label}: invalid stock length`);
    if (!Number.isInteger(level.goal?.lines) || level.goal.lines < 1 || Object.keys(level.goal).length > 2) errors.push(`${label}: invalid goals`);
    for (const group of level.candidates ?? []) if (group.length !== 3 || group.some((candidate) => !SHAPE_BY_ID[candidate.shapeId])) errors.push(`${label}: invalid shape stock`);
    const { two, three } = level.starThresholds ?? {};
    if (!(Number.isInteger(two) && Number.isInteger(three) && three >= 1 && three <= two && two <= level.maxGroups)) errors.push(`${label}: invalid star thresholds`);
    if (level.discardBudget !== undefined && (!Number.isInteger(level.discardBudget) || level.discardBudget < 0)) errors.push(`${label}: invalid discard budget`);
    if (!Array.isArray(level.solution) || !level.solution.length || level.solution.some((action) => ![action.slot, action.x, action.y].every(Number.isInteger) || action.slot < 0 || action.slot > 2 || action.x < 0 || action.x > 7 || action.y < 0 || action.y > 7)) errors.push(`${label}: invalid solution`);
  }
  return { valid: errors.length === 0, errors, version: CONTENT_VERSION };
}

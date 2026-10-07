import { SHAPE_BY_ID } from './shapes.mjs';

export const CONTENT_VERSION = 2;
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
// Keep the five short introductions compatible with earlier saves and help.
const tutorialRecipes = [
  { title: '第一条线', max: 2, lines: 1, patches: [patch('dot', 3, 4)], hint: '把单格补进缺口。' },
  { title: '放两块，留一块', max: 3, lines: 2, patches: [patch('h3', 2, 2)], fill: hfill(4, [5, 3]), hint: '先完成一组，再铺满下一行。' },
  { title: '小块先行', max: 4, lines: 2, opening: true, hint: '先清掉顶行，大方块才有空间。' },
  { title: '大块也能破局', max: 5, lines: 3, patches: [patch('h4', 2, 2), patch('square2', 3, 5)], hint: '小方块可以一次补满两行。' },
  { title: '十字时刻', max: 5, lines: 3, cross: { row: 3, col: 2, rows: [0] }, goals: { cross: 1 }, hint: '交点补满时，行和列一起消除。' },
];

function makeTutorialLevel(recipe, number) {
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
    candidates.push(slots);
    solution.push({ slot: offset, x: first.x, y: first.y });
    if (second) solution.push({ slot: (offset + 1) % 3, x: second.x, y: second.y });
  }
  while (candidates.length < recipe.max + 2) {
    const i = candidates.length;
    candidates.push([piece(i % 2 ? 'h3' : 'h5', 2), piece(i % 3 ? 'v2' : 'square2', 3), piece(i % 2 ? 'l3-se' : 'dot', 4)]);
  }
  const three = Math.ceil(plan.length / 2);
  return {
    id: number, number, title: recipe.title, chapter: CHAPTERS[Math.floor((number - 1) / 10)].id,
    maxGroups: recipe.max, goal: { lines: recipe.lines, ...(recipe.goals ?? {}) },
    initialBoard: board, candidates, starThresholds: { two: Math.min(recipe.max, three + 1), three },
    solution, hint: recipe.hint, continuationGroups: 2,
  };
}

// Fixed planning puzzles start after the five introductory levels. Boards and
// stock are authored together with a legal route; no runtime RNG or engine
// exception is involved. Empty cells are deliberately spread across lines,
// so a matching piece cannot simply close a pre-cut single-shape hole.
const planningPuzzles = [
  {
    title: '先铺再清', max: 6, goal: { lines: 4 },
    rows: '00010000/10001000/10100000/01010000/00001000/01011111/00000000/00000000',
    stock: ['h3,h2,v4', 'l3-se,l3-se,v2', 'l3-ne,l3-sw,h3', 'v2,l3-sw,l3-se', 'l3-sw,v2,l3-sw', 'h2,l3-sw,h3', 'l3-se,v2,l3-nw', 'l3-ne,l3-sw,square2'],
    route: [[2, 0, 3], [0, 0, 0], [0, 1, 4], [1, 0, 5], [2, 0, 7], [1, 1, 1], [0, 2, 5], [1, 1, 3]],
    hint: '先拼出可延续的边，不必每手都消除。',
  },
  {
    title: '拐角留白', max: 6, goal: { lines: 4 },
    rows: '10001001/00000100/01010001/10000100/00110100/01100000/00000000/00000000',
    stock: ['square2,h3,l3-se', 'h2,v3,v4', 'l3-nw,v2,h4', 'h3,square2,l3-sw', 'square2,h4,l3-ne', 'l3-ne,h4,h3', 'v4,l3-ne,l3-sw', 'h4,l3-se,h4'],
    route: [[0, 1, 0], [1, 1, 3], [2, 4, 1], [1, 4, 5], [2, 3, 0], [1, 4, 3], [1, 6, 3], [2, 0, 4]],
    hint: '底部空行是缓冲区，别把拐角散放。',
  },
  {
    title: '两线布局', max: 7, goal: { lines: 5, multi: 1 },
    rows: '00101100/10011000/10110011/00000000/11011001/11011110/00000000/00000000',
    stock: ['v3,l3-ne,square2', 'h2,v3,v4', 'l3-se,l3-sw,l3-ne', 'h3,v2,h2', 'l3-se,h4,l3-sw', 'l3-nw,h2,h3', 'l3-ne,h4,square2', 'l3-ne,v3,square2', 'h4,l3-se,l3-se'],
    route: [[1, 4, 1], [2, 1, 6], [2, 1, 0], [1, 2, 3], [2, 6, 0], [0, 1, 1], [2, 1, 5], [1, 7, 5]],
    hint: '留住能连成两线的组合，再一起收尾。',
  },
  {
    title: '留一条通路', max: 7, goal: { lines: 4, multi: 1 },
    rows: '10000010/01100110/10000010/11000101/11000100/00111100/00000000/00000000',
    stock: ['v3,l3-nw,v3', 'l3-nw,h2,l3-sw', 'l3-nw,l3-ne,h2', 'v2,square2,v2', 'l3-sw,l3-se,l3-nw', 'v3,l3-ne,v3', 'square2,h2,l3-ne', 'v3,h3,h2', 'l3-ne,v4,l3-sw'],
    route: [[0, 6, 3], [2, 7, 4], [1, 0, 5], [2, 2, 3], [1, 3, 3], [0, 5, 2], [1, 5, 6], [0, 6, 4]],
    hint: '给下一组保留连续的落点。',
  },
  {
    title: '第一章试炼', max: 8, goal: { lines: 5 },
    rows: '00101000/10010010/01100000/01010101/10001001/01000011/00000000/00000000',
    stock: ['l3-ne,v3,v4', 'v4,v3,v4', 'l3-ne,v4,h3', 'v4,h4,v4', 'v2,h2,l3-se', 'v4,h2,l3-se', 'v2,l3-se,h3', 'v2,h3,h2', 'l3-sw,square2,l3-ne', 'l3-nw,h3,l3-sw'],
    route: [[2, 5, 4], [1, 5, 0], [1, 6, 2], [0, 5, 1], [2, 1, 4], [0, 3, 1], [1, 2, 5], [0, 0, 2], [0, 7, 1], [1, 1, 1]],
    hint: '先考虑第二块还能放在哪里，再落第一块。',
  },
  {
    title: '隔组接力', max: 8, goal: { lines: 5, multi: 2 },
    rows: '01001100/10000001/00011000/10000010/00001101/10101101/00001011/01010111',
    stock: ['l3-nw,square2,l5-nw', 'l3-ne,l4-east,h5', 'l3-se,h4,h2', 'l3-nw,rect2x3,l5-ne', 'l5-sw,l5-ne,l5-nw', 'l4-west,h5,l5-nw', 'l3-ne,t4-up,l5-ne', 'h2,l3-nw,v2', 'l4-east,l3-sw,v2', 'l5-sw,h3,l5-sw'],
    route: [[2, 1, 4], [1, 1, 2], [0, 5, 1], [2, 1, 1], [1, 2, 1], [0, 6, 1], [1, 0, 0], [2, 1, 0], [0, 3, 3]],
    hint: '这一组铺的边，要由下一组接上。',
  },
  {
    title: '朝向的代价', max: 8, goal: { lines: 6, cross: 1 },
    rows: '00100111/10010001/00110101/10010001/11100001/01000000/00010000/10100001',
    stock: ['rect2x3,l5-ne,l4-west', 'v3,rect2x3,rect3x2', 'rect3x2,l3-sw,h2', 'h5,rect3x2,square2', 'h5,h3,h3', 'v5,l5-se,l5-nw', 'v3,l5-se,h4', 'l5-se,square2,h2', 'l4-east,l5-ne,v2', 'h5,v3,rect2x3'],
    route: [[2, 0, 0], [0, 4, 5], [2, 4, 3], [0, 4, 0], [1, 4, 1], [0, 5, 5], [0, 3, 7], [1, 5, 1], [0, 3, 4]],
    hint: '朝向固定，先留出长条能通过的空间。',
  },
  {
    title: '成双成对', max: 8, goal: { lines: 6, multi: 2 },
    rows: '00110010/11000000/10010101/01000010/01000100/00000001/01001001/01010000',
    stock: ['h4,h4,v4', 'l5-se,v4,v2', 'h5,h5,v3', 'v5,h4,v2', 'h4,l5-nw,t4-down', 'v2,h2,l4-east', 'v4,l3-nw,l4-west', 'l5-ne,l3-se,rect3x2', 'h5,l4-east,l5-nw', 'h5,v5,v3'],
    route: [[2, 2, 1], [0, 3, 5], [0, 0, 5], [1, 3, 3], [2, 2, 1], [0, 3, 1], [0, 3, 0], [1, 0, 5], [0, 4, 5], [1, 3, 5]],
    hint: '同时完成两线，比见缝就补更省空间。',
  },
  {
    title: '纵横换位', max: 9, goal: { lines: 8 },
    rows: '01111001/00010111/01010011/10110010/01110101/01001010/10000001/00000000',
    stock: ['l3-sw,t4-down,h2', 'v4,h2,rect3x2', 'l3-nw,h4,l5-sw', 'l5-nw,rect2x3,h5', 'h5,h4,l5-se', 'rect3x2,l3-sw,l4-east', 'l5-se,rect2x3,v3', 'v3,l3-nw,t4-down', 'l4-west,v4,t4-down', 't4-down,v2,rect2x3', 'l5-nw,v4,h5'],
    route: [[0, 0, 1], [2, 2, 5], [2, 2, 6], [0, 4, 1], [0, 2, 1], [2, 2, 1], [1, 4, 0], [0, 5, 5], [0, 0, 7], [1, 4, 7], [0, 3, 2], [2, 4, 4]],
    hint: '清除之后，重新安排横向和竖向的落点。',
  },
  {
    title: '收拢边角', max: 9, goal: { lines: 7, multi: 1 },
    rows: '11100001/01001100/01101011/10111100/11010100/11010011/00000100/00110000',
    stock: ['l5-ne,rect2x3,l3-ne', 'rect3x2,l5-se,h2', 'l5-ne,l3-se,l5-ne', 't4-up,h3,l3-ne', 'l3-sw,l5-ne,h3', 'l3-se,v2,v3', 'l5-sw,t4-down,l3-se', 'v3,rect3x2,v2', 't4-down,l3-nw,t4-down', 'v5,l4-east,v2', 'l4-west,h4,l4-east'],
    route: [[0, 0, 4], [2, 6, 3], [2, 4, 5], [1, 2, 5], [0, 5, 5], [1, 5, 5], [1, 4, 0], [2, 2, 0], [1, 0, 3], [2, 0, 7], [0, 2, 6], [2, 4, 4]],
    hint: '零散空格装不下大块，先把空地连起来。',
  },
  {
    title: '腾挪长条', max: 9, goal: { lines: 9, cross: 1 },
    rows: '01111010/00111111/10101101/00011000/00000100/01010000/11011001/11111100',
    stock: ['l4-west,rect2x3,v4', 'l3-sw,l3-se,v3', 'h3,h5,h3', 'rect2x3,square2,h5', 't4-up,rect2x3,l5-se', 'l5-ne,v4,l3-sw', 'l5-se,l5-se,t4-up', 'l3-sw,h4,l3-sw', 'h3,h5,t4-up', 'l5-se,t4-up,v4', 'l3-sw,rect2x3,l4-east'],
    route: [[2, 2, 3], [0, 0, 2], [1, 3, 4], [0, 2, 2], [1, 0, 1], [0, 0, 1], [2, 3, 1], [0, 3, 2], [1, 3, 5], [0, 3, 0], [2, 2, 0], [1, 2, 4]],
    hint: '短条可以先接边，给长条腾出位置。',
  },
  {
    title: '保留主干', max: 9, goal: { lines: 7, multi: 2 },
    rows: '11001000/01100000/00111101/01010000/10100001/00110101/10111000/00001010',
    stock: ['t4-up,v5,l4-east', 'l5-nw,l3-nw,v3', 'l4-east,l5-sw,l4-east', 'h2,h4,square2', 'h4,rect2x3,h4', 'l4-west,l4-west,rect3x2', 'l4-east,v4,t4-up', 't4-down,v3,l3-nw', 'l3-se,h2,t4-down', 'l4-east,t4-down,l4-east', 'l5-se,h4,t4-down'],
    route: [[1, 6, 2], [0, 0, 6], [1, 0, 1], [0, 3, 0], [0, 6, 0], [1, 4, 3], [1, 4, 1], [2, 0, 1], [0, 4, 6], [2, 3, 4], [0, 0, 4]],
    hint: '留住跨组可接的主干，不急着填零散缺口。',
  },
  {
    title: '拐角接力', max: 10, goal: { lines: 7, multi: 2 },
    rows: '01010100/00100001/00000011/01001100/00010000/11100000/10000010/00010010',
    stock: ['h3,l3-nw,l4-west', 'l5-nw,v2,rect2x3', 'h4,l3-sw,l5-se', 'l3-nw,rect3x2,h5', 'l5-se,l5-ne,h2', 'v2,l5-nw,l5-nw', 'rect2x3,v3,l5-nw', 'l3-sw,l5-sw,v2', 'rect2x3,v5,h3', 'l4-west,l5-ne,t4-up', 'v4,l5-sw,h4', 'l5-se,l4-west,l5-se'],
    route: [[2, 2, 1], [1, 3, 5], [2, 6, 3], [0, 3, 3], [2, 5, 5], [1, 6, 0], [1, 1, 5], [0, 6, 2], [1, 5, 4], [0, 4, 4], [1, 0, 2]],
    hint: '先看拐角的后续连接，再选要丢的块。',
  },
  {
    title: '一格之外', max: 10, goal: { lines: 9 },
    rows: '00010111/00011100/00000110/11111001/00000110/11110111/01110010/10100100',
    stock: ['h5,t4-down,l5-se', 'rect2x3,l5-se,l5-se', 'rect2x3,l5-nw,l5-sw', 'v4,square2,l4-east', 'l4-east,l3-ne,v5', 'h4,h3,t4-up', 'l3-se,v3,l5-nw', 'v5,l3-se,v2', 'v2,square2,l5-ne', 'rect3x2,l3-ne,rect2x3', 'h4,l5-ne,v4', 'v5,l4-east,v3'],
    route: [[2, 2, 4], [0, 0, 5], [1, 0, 0], [2, 5, 5], [1, 2, 5], [2, 0, 4], [1, 0, 1], [2, 0, 5], [1, 6, 4], [2, 0, 0], [1, 3, 5], [2, 0, 4], [2, 2, 0], [1, 2, 3]],
    hint: '一格的偏移会改变下一组的落点。',
  },
  {
    title: '取舍终章', max: 10, goal: { lines: 9, multi: 2 },
    rows: '00000000/01000000/00011110/11110010/00100100/01001111/01100000/00100010',
    stock: ['l3-sw,h2,rect2x3', 'h3,h4,t4-up', 'l3-se,v2,rect2x3', 'h2,l3-sw,l5-nw', 'rect2x3,h3,rect3x2', 'v3,h4,v5', 't4-down,h3,l3-se', 'l5-nw,l5-sw,h4', 'rect2x3,l3-ne,v2', 'rect2x3,l4-west,l3-se', 'l5-ne,l3-nw,l4-west', 'v3,v2,l3-se'],
    route: [[1, 2, 5], [0, 0, 4], [0, 0, 2], [2, 2, 4], [1, 7, 2], [2, 6, 4], [1, 4, 3], [2, 0, 0], [0, 6, 0], [2, 3, 1], [2, 2, 0], [0, 6, 1], [1, 0, 5], [0, 4, 4]],
    hint: '目标不只是清线，还要组合同时消除。',
  },
  {
    title: '预算初试', max: 8, goal: { lines: 7 },
    rows: '00110001/10001000/01010100/11000001/01000011/10100100/10111001/01101000',
    stock: ['square2,l5-ne,l5-ne', 'l3-se,l5-nw,rect3x2', 'h5,v3,l5-sw', 't4-down,square2,l3-ne', 'l4-west,rect3x2,l4-west', 'h3,l5-sw,l3-sw', 'h4,v5,l5-se', 'rect2x3,l4-west,l5-nw', 'v5,l5-nw,t4-up', 'l5-nw,l5-nw,l5-nw'],
    route: [[0, 2, 3], [1, 4, 1], [1, 2, 1], [0, 1, 3], [2, 2, 5], [1, 2, 0], [1, 1, 5], [2, 5, 5], [0, 6, 1], [2, 6, 5], [1, 3, 5], [0, 1, 1]],
    budget: 32,
    hint: '预算允许试探，先比较放两块后丢的是哪块。',
  },
  {
    title: '小弃块，大空间', max: 9, goal: { lines: 9, cross: 1 },
    rows: '00010011/11110001/00100001/11100111/11000011/10110101/10001010/00010000',
    stock: ['square2,rect2x3,l5-sw', 'v3,l3-nw,l3-nw', 'rect3x2,h4,v3', 'v5,square2,v2', 'l4-west,h2,l5-se', 'l4-east,rect2x3,h5', 'square2,l5-nw,t4-down', 'square2,l5-nw,t4-up', 'v3,rect2x3,square3', 'l5-ne,h2,h4', 'v3,t4-up,v2'],
    route: [[2, 4, 1], [1, 0, 0], [1, 5, 1], [0, 3, 1], [1, 2, 4], [0, 3, 2], [0, 1, 2], [1, 6, 2], [1, 0, 7], [2, 0, 2], [1, 0, 2], [2, 3, 4], [1, 0, 4]],
    budget: 26,
    hint: '小块也能铺路，但丢大块会迅速耗掉预算。',
  },
  {
    title: '舍小留大', max: 9, goal: { lines: 9, multi: 2 },
    rows: '00010110/00001101/00001000/00010011/11001101/01001000/01100001/00001100',
    stock: ['l3-se,l3-ne,h5', 'h3,l5-se,t4-up', 'l3-se,t4-down,square3', 'h4,t4-down,t4-down', 'h3,rect2x3,l3-se', 'l3-nw,l5-sw,h5', 'h5,v2,square3', 'l3-nw,v4,l5-sw', 'l3-nw,l5-se,l5-ne', 'l3-ne,l3-nw,rect2x3', 'l3-ne,l5-se,h2'],
    route: [[1, 4, 2], [0, 2, 4], [0, 0, 3], [2, 4, 5], [1, 5, 3], [2, 0, 1], [1, 3, 3], [0, 4, 3], [2, 4, 0], [1, 3, 1], [1, 0, 3], [2, 0, 3], [2, 5, 2], [1, 6, 1]],
    budget: 29,
    hint: '先为大块预留位置，再让小块接边。',
  },
  {
    title: '窄路接力', max: 10, goal: { lines: 8 },
    rows: '00000010/00010110/11001011/11101010/11000100/00011000/10100010/10001000',
    stock: ['h4,l3-nw,v4', 'square2,l3-sw,v3', 'rect2x3,square2,h2', 'rect2x3,l3-se,l3-ne', 'l4-east,h5,h5', 'rect2x3,h5,l4-east', 'l3-nw,square3,v5', 'h2,l3-sw,rect3x2', 'l5-sw,v3,rect3x2', 'l5-nw,v2,h4', 'l4-west,v4,square2', 'l3-se,h3,t4-up'],
    route: [[2, 7, 3], [1, 1, 6], [1, 3, 6], [2, 5, 5], [2, 6, 7], [0, 0, 5], [2, 0, 0], [0, 1, 5], [1, 3, 6], [2, 3, 7], [1, 3, 7], [2, 6, 4], [1, 0, 5], [2, 1, 0]],
    budget: 29,
    hint: '保留连续空间，预算只够有限的调整。',
  },
  {
    title: '多线预算', max: 10, goal: { lines: 11, multi: 3 },
    rows: '10110110/10100101/10110110/10001111/01001000/01010000/00001010/00010111',
    stock: ['t4-down,v5,v3', 'l5-ne,v5,l3-se', 'square3,l3-se,rect3x2', 'square3,l5-nw,l4-west', 'square2,t4-down,h3', 'h3,l3-sw,h5', 'h5,v5,square3', 'l3-se,square3,rect3x2', 'h4,l3-nw,l3-nw', 'h5,l5-nw,rect3x2', 'h4,h5,square3', 'v2,h3,square2'],
    route: [[2, 2, 5], [0, 1, 3], [1, 0, 3], [2, 1, 3], [0, 0, 0], [2, 0, 6], [1, 0, 3], [0, 0, 2], [0, 5, 3], [1, 4, 5], [2, 0, 1], [1, 5, 1], [1, 7, 2], [0, 0, 1], [2, 5, 0]],
    budget: 36,
    hint: '把两线同时完成，减少占地和弃块成本。',
  },
  {
    title: '半成的行', max: 10, goal: { lines: 11, multi: 3 },
    rows: '01000001/10001000/00001000/00000111/00111111/10000110/00010111/00100000',
    stock: ['t4-down,h3,h3', 't4-down,l5-nw,square3', 'l5-sw,l5-nw,v3', 't4-down,h4,v4', 't4-up,l5-sw,l5-se', 't4-up,rect3x2,l5-ne', 't4-down,l3-se,l4-west', 'square3,square2,l5-sw', 'h5,l3-se,h5', 'h4,v4,h4', 'square3,l3-ne,l3-nw', 'square2,l4-west,l3-nw'],
    route: [[0, 5, 1], [1, 4, 0], [2, 1, 1], [0, 4, 1], [1, 4, 5], [0, 0, 1], [0, 4, 3], [1, 4, 2], [2, 5, 1], [1, 0, 2], [2, 1, 1], [1, 4, 2], [0, 3, 0], [2, 4, 5], [0, 3, 1], [2, 4, 4]],
    budget: 30,
    hint: '半成的行要留到下一组，别填断长边。',
  },
  {
    title: '交叉预留', max: 11, goal: { lines: 12, cross: 2 },
    rows: '11110011/10110001/11101111/00011100/11010000/10010110/10111011/10010011',
    stock: ['l4-east,l3-sw,t4-up', 'v2,l5-se,l5-nw', 't4-up,l3-ne,v2', 'l3-nw,l4-east,h4', 'rect2x3,v5,rect2x3', 'l3-ne,square3,v4', 'l5-sw,h2,l5-se', 'l5-ne,l5-se,l5-ne', 'rect2x3,l3-ne,rect3x2', 'l5-sw,l5-sw,l4-east', 'l5-se,rect2x3,rect2x3', 'square3,square2,l3-sw', 'rect2x3,v3,l5-ne'],
    route: [[0, 1, 5], [1, 6, 3], [1, 0, 3], [0, 3, 2], [0, 4, 0], [1, 1, 2], [2, 0, 1], [1, 3, 1], [0, 0, 1], [1, 7, 1], [1, 5, 1], [2, 2, 1], [2, 2, 0], [0, 2, 5], [0, 0, 0], [2, 4, 1]],
    budget: 27,
    hint: '大块入场前，先安排能接成多线的空隙。',
  },
  {
    title: '成组腾挪', max: 11, goal: { lines: 12, multi: 3 },
    rows: '10101101/10000010/00100110/11110110/10010011/01011101/00000101/11000101',
    stock: ['h2,h5,h5', 't4-down,v3,t4-up', 'h2,h5,l3-sw', 'h3,h3,l4-east', 'h3,l3-ne,l3-ne', 't4-up,v4,t4-up', 'l5-nw,t4-up,t4-down', 'rect3x2,square3,l3-sw', 't4-down,v4,l5-nw', 'l5-sw,h3,square2', 'v3,l3-nw,l4-east', 't4-down,h5,rect3x2', 'l3-se,l5-nw,square2'],
    route: [[1, 1, 1], [2, 0, 6], [1, 7, 1], [0, 0, 1], [0, 4, 4], [1, 3, 1], [2, 3, 0], [0, 5, 7], [0, 2, 7], [1, 4, 2], [1, 5, 4], [0, 4, 0], [1, 5, 5], [0, 3, 5], [1, 3, 2], [0, 3, 0], [0, 3, 6], [2, 3, 3]],
    budget: 28,
    hint: '每组丢弃面积有限，连续规划两到三组。',
  },
  {
    title: '最后的空隙', max: 12, goal: { lines: 12, multi: 3 },
    rows: '00111100/00100110/00011001/00111010/01110000/10000011/10001001/10100111',
    stock: ['l5-sw,v3,l3-nw', 'h3,rect3x2,h5', 'l3-ne,v3,t4-down', 'l5-sw,l5-nw,rect2x3', 'l5-se,t4-down,rect2x3', 'l5-sw,t4-down,l3-sw', 'l3-se,l3-nw,square2', 'rect3x2,l4-west,l3-ne', 't4-down,square2,v4', 'v2,h4,v2', 'l3-se,l3-nw,t4-up', 'square3,l5-sw,rect2x3', 'h4,h5,t4-down', 'l3-ne,h5,rect2x3'],
    route: [[0, 0, 2], [2, 4, 4], [1, 1, 5], [2, 0, 5], [2, 5, 5], [1, 2, 4], [1, 5, 2], [0, 2, 1], [0, 3, 4], [2, 3, 5], [1, 4, 2], [0, 3, 1], [2, 0, 0], [0, 6, 0], [0, 5, 5], [1, 6, 2], [0, 5, 1]],
    budget: 30,
    hint: '只剩少量预算余量，留好下一块的朝向。',
  },
  {
    title: '三选二大师', max: 12, goal: { lines: 12, multi: 3 },
    rows: '00000011/00011000/10100000/01111000/00000010/11100000/00100101/10110001',
    stock: ['l3-nw,l3-ne,l3-nw', 'h2,v4,rect2x3', 'h5,h4,rect3x2', 'l3-se,rect2x3,t4-up', 'l5-ne,l5-ne,l3-sw', 'v3,h2,l4-west', 'rect3x2,t4-down,v3', 'l5-se,v4,l5-ne', 'h3,l4-east,t4-down', 'h4,l5-nw,t4-down', 'v2,t4-up,square3', 'h3,rect2x3,square2', 'l5-se,v3,v5', 'l3-ne,l3-ne,l5-se'],
    route: [[1, 5, 6], [0, 5, 4], [2, 5, 1], [1, 7, 1], [1, 3, 0], [0, 3, 5], [1, 3, 4], [2, 4, 6], [0, 3, 0], [1, 1, 2], [0, 5, 3], [2, 5, 1], [2, 6, 4], [0, 1, 0], [0, 1, 5], [2, 3, 4], [2, 0, 6], [1, 6, 4], [1, 5, 0], [0, 1, 2]],
    budget: 32,
    hint: '空间、组合与弃格一起算，先铺再收。',
  },
];

function makePlanningLevel(puzzle, number) {
  const cells = puzzle.rows.replaceAll('/', '').split('');
  const three = Math.ceil(puzzle.route.length / 2);
  return {
    id: number, number, title: puzzle.title, chapter: CHAPTERS[Math.floor((number - 1) / 10)].id,
    maxGroups: puzzle.max, goal: puzzle.goal,
    ...(puzzle.budget === undefined ? {} : { discardBudget: puzzle.budget }),
    initialBoard: cells.map((cell, i) => cell === '0' ? 0 : 1 + ((i * 3 + number) % 5)),
    candidates: puzzle.stock.map((group, i) => group.split(',').map((shapeId, slot) => piece(shapeId, 1 + ((number + i + slot) % 5)))),
    starThresholds: { two: Math.min(puzzle.max, three + 1), three },
    solution: puzzle.route.map(([slot, x, y]) => ({ slot, x, y })), hint: puzzle.hint, continuationGroups: 2,
  };
}

export const LEVELS = [
  ...tutorialRecipes.map((recipe, i) => makeTutorialLevel(recipe, i + 1)),
  ...planningPuzzles.map((puzzle, i) => makePlanningLevel(puzzle, i + 6)),
];
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

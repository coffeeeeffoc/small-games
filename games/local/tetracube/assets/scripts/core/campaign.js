import { DEFAULT_CONFIG, SHAPES } from './config.js';
import { rotateCells } from './engine.js';

export const CHAPTERS = ['空间入门', '立体进阶', '层叠大师'];
/** @type {[string, string, string[], number, number, number, number, string][]} */
const definitions = [
  ['第一道光', 'line', [], 0, 1, 4, 1, '把长桥放入缺口，完成第一层。'],
  ['方形拼图', 'square', [], 2, 2, 4, 1, '移动到角落，把四个空格填满。'],
  ['转过街角', 'elbow', ['XY'], 1, 0, 4, 1, '平转折角，观察落点轮廓。'],
  ['三岔路口', 'tee', ['XY', 'XY'], 1, 2, 4, 1, '换个方向，把三岔嵌入底层。'],
  ['错位阶梯', 'step', ['XY'], 2, 1, 4, 1, '平转阶梯，对齐交错的缺口。'],
  ['立体初见', 'tripod', [], 1, 1, 4, 1, '立体方块跨层，先看底部的三个格。'],
  ['竖起长桥', 'line', ['XZ'], 2, 2, 4, 1, '前后旋转长桥，竖着填入小孔。'],
  ['双层方庭', 'square', [], 1, 1, 4, 2, '连续填好两层，学会追踪坍落后的空格。'],
  ['侧身而入', 'elbow', ['YZ'], 1, 1, 4, 1, '左右旋转，让折角站起来。'],
  ['立体三岔', 'tee', ['XZ'], 1, 2, 5, 1, '看侧面，找到跨层方块的落脚点。'],
  ['旋阶之路', 'twist', ['XY'], 2, 2, 5, 1, '旋阶跨越两个高度，用层面图确认。'],
  ['回旋拼合', 'helix', ['YZ'], 1, 1, 5, 1, '两次空间观察，完成回旋方块的拼合。'],
  ['三层长桥', 'line', [], 1, 3, 5, 3, '连续三层缺口，稳住节奏。'],
  ['双层折角', 'elbow', ['XY', 'XY'], 2, 2, 5, 2, '两层折角，消层后再次对齐。'],
  ['反向阶梯', 'step', ['XY', 'XY', 'XY'], 3, 2, 6, 2, '反向平转比连续三次正转更快捷。'],
  ['星核落点', 'tripod', ['XZ', 'YZ'], 3, 2, 6, 1, '组合两根旋转轴，寻找星核的底面。'],
  ['深度回旋', 'helix', ['XY', 'XZ'], 2, 3, 6, 1, '用俯视和侧视确认被遮挡的空格。'],
  ['层叠大师', 'tee', ['XY'], 3, 2, 6, 3, '在更大棋盘上连续完成三层。'],
];

export const LEVELS = definitions.map(([name, shapeId, turns, x, y, size, layers, hint], index) => {
  const shape = SHAPES.find((item) => item.id === shapeId);
  const cells = turns.reduce((value, plane) => rotateCells(value, plane), shape.cells);
  const minimum = [0, 1, 2].map((axis) => Math.min(...cells.map((cell) => cell[axis])));
  const target = cells.map((cell) => cell.map((n, axis) => n - minimum[axis] + [x, y, 0][axis]));
  return {
    id: `space-${String(index + 1).padStart(2, '0')}`,
    index,
    name,
    shapeId,
    turns,
    target,
    chapter: Math.floor(index / 6),
    dims: [size, size, index < 6 ? 8 : 10],
    layers,
    targetLines: layers,
    pieceLimit: layers + (index < 6 ? 4 : 3),
    parPieces: layers,
    parSeconds: 35 + layers * 15 + index * 2,
    maxFlips: index < 6 ? 0 : index < 12 ? 1 : 2,
    hint,
  };
});

export function levelConfig(level) {
  if (!LEVELS.includes(level)) throw new Error('Unknown level');
  return {
    ...DEFAULT_CONFIG,
    id: level.id,
    name: level.name,
    dims: level.dims,
    shapes: SHAPES.filter((shape) => shape.id === level.shapeId),
    fallInterval: level.index < 6 ? 2400 : level.index < 12 ? 1900 : 1600,
  };
}

export function prepareLevel(game, level) {
  const holes = new Set(level.target.filter((v) => v[2] === 0).map(([x, y]) => `${x},${y}`));
  const palette = ['#51c7db', '#9d88df', '#e8b764', '#64c9ad'];
  game.board = [];
  for (let z = 0; z < level.layers; z++)
    for (let y = 0; y < level.dims[1]; y++)
      for (let x = 0; x < level.dims[0]; x++)
        if (!holes.has(`${x},${y}`))
          game.board.push({
            id: ++game.serial,
            x,
            y,
            z,
            color: palette[(x + y + z) % palette.length],
          });
  const shape = SHAPES.find((item) => item.id === level.shapeId);
  game.next = Array.from({ length: game.config.previewCount }, () => structuredClone(shape));
  game.pending = null;
  game.spawn();
  game.drainEvents();
}

export function validateLevels() {
  const errors = [];
  const ids = new Set();
  for (const level of LEVELS) {
    if (ids.has(level.id)) errors.push(`Duplicate level ${level.id}`);
    ids.add(level.id);
    if (level.target.some((v) => v.some((n, axis) => n < 0 || n >= level.dims[axis])))
      errors.push(`Out of bounds ${level.id}`);
    if (level.layers > 1 && level.target.some((v) => v[2] !== 0))
      errors.push(`Blocked vertical shaft ${level.id}`);
  }
  return errors;
}

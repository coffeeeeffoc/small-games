export const SHAPES_VERSION = 'shapes-v1';

const line = (length, vertical = false) => Array.from({ length }, (_, i) => vertical ? [0, i] : [i, 0]);
const rectangle = (width, height) => Array.from({ length: width * height }, (_, i) => [i % width, Math.floor(i / width)]);
const definitions = [
  ['dot', '单格', [[0, 0]]],
  ['h2', '横二格', line(2)], ['v2', '竖二格', line(2, true)],
  ['h3', '横三格', line(3)], ['v3', '竖三格', line(3, true)],
  ['h4', '横四格', line(4)], ['v4', '竖四格', line(4, true)],
  ['h5', '横五格', line(5)], ['v5', '竖五格', line(5, true)],
  ['l3-ne', '小L右上', [[1, 0], [0, 1], [1, 1]]],
  ['l3-nw', '小L左上', [[0, 0], [0, 1], [1, 1]]],
  ['l3-se', '小L右下', [[0, 0], [1, 0], [1, 1]]],
  ['l3-sw', '小L左下', [[0, 0], [1, 0], [0, 1]]],
  ['l4-east', '四格L向右', [[0, 0], [0, 1], [0, 2], [1, 2]]],
  ['l4-west', '四格L向左', [[1, 0], [1, 1], [0, 2], [1, 2]]],
  ['t4-up', '四格T向上', [[1, 0], [0, 1], [1, 1], [2, 1]]],
  ['t4-down', '四格T向下', [[0, 0], [1, 0], [2, 0], [1, 1]]],
  ['square2', '小方块', rectangle(2, 2)],
  ['rect3x2', '横长方块', rectangle(3, 2)],
  ['rect2x3', '竖长方块', rectangle(2, 3)],
  ['l5-ne', '大L右上', [[2, 0], [2, 1], [0, 2], [1, 2], [2, 2]]],
  ['l5-nw', '大L左上', [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]]],
  ['l5-se', '大L右下', [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]]],
  ['l5-sw', '大L左下', [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2]]],
  ['square3', '大方块', rectangle(3, 3)],
];

export const SHAPES = Object.freeze(definitions.map(([id, name, cells]) => Object.freeze({
  id, name, cells: Object.freeze(cells.map((cell) => Object.freeze(cell))),
  width: Math.max(...cells.map(([x]) => x)) + 1,
  height: Math.max(...cells.map(([, y]) => y)) + 1,
  size: cells.length,
})));
export const SHAPE_BY_ID = Object.freeze(Object.fromEntries(SHAPES.map((shape) => [shape.id, shape])));

export const DIFFICULTY_VERSION = 'weights-v1';
export const DIFFICULTY_WEIGHTS = Object.freeze([
  Object.freeze({ from: 1, to: 10, small: 8, medium: 4, large: 1 }),
  Object.freeze({ from: 11, to: 30, small: 5, medium: 6, large: 3 }),
  Object.freeze({ from: 31, to: null, small: 3, medium: 6, large: 5 }),
]);

export function shapeWeight(shape, group) {
  const weights = DIFFICULTY_WEIGHTS.find((entry) => group >= entry.from && (entry.to === null || group <= entry.to));
  return weights[shape.size <= 3 ? 'small' : shape.size <= 5 ? 'medium' : 'large'];
}

/** 仅有两个操作面不够；补全观察信息，再完成联动。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'three-face-exam',
  number: 20,
  title: '第三面的答案',
  subtitle: '第二章综合',
  intro: 'A、B、C 的初始位置都过不了各自第一道门，三根轴又分布在三个不同面。',
  lesson: '仅有两个操作面不够；补全观察信息，再完成联动。',
  difficulty: '进阶',
  shafts: [
    ['A', 'front', 0],
    ['B', 'left', 2],
    ['C', 'bottom', 0],
  ],
  latches: [
    ['lock-A', 'A', 'right', [['C', [1]]]],
    ['lock-B', 'B', 'back', [['A', [2]]]],
  ],
  preparation: [
    ['shaft', 'C', 1],
    ['latch', 'lock-A'],
    ['shaft', 'A', 2],
    ['latch', 'lock-B'],
  ],
  route: [
    ['B', [1]],
    ['A', [0]],
    ['C', [2]],
    ['B', [0]],
    ['A', [1]],
    ['C', [1]],
  ],
});

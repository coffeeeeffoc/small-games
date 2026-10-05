/** 长链和双条件锁可以组合；观察窗口里的具体挡位。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'six-convergence',
  number: 48,
  title: '六面汇流',
  subtitle: '先分流，再合流',
  intro: 'F、E、D 依次对齐后释放 C；B 与 C 共同释放 A。每根轴还要在中途回到另一挡位。',
  lesson: '长链和双条件锁可以组合；观察窗口里的具体挡位。',
  difficulty: '大师',
  shafts: [
    ['A', 'front', 0],
    ['B', 'back', 0],
    ['C', 'left', 2],
    ['D', 'right', 0],
    ['E', 'top', 2],
    ['F', 'bottom', 0],
  ],
  latches: [
    [
      'lock-A',
      'A',
      'bottom',
      [
        ['B', [1]],
        ['C', [0]],
      ],
    ],
    [
      'lock-C',
      'C',
      'top',
      [
        ['D', [2]],
        ['E', [0]],
      ],
    ],
    ['lock-D', 'D', 'back', [['E', [0]]]],
    ['lock-E', 'E', 'front', [['F', [1]]]],
  ],
  preparation: [
    ['shaft', 'F', 1],
    ['latch', 'lock-E'],
    ['shaft', 'E', 0],
    ['latch', 'lock-D'],
    ['shaft', 'D', 2],
    ['latch', 'lock-C'],
    ['shaft', 'C', 0],
    ['shaft', 'B', 1],
    ['latch', 'lock-A'],
  ],
  route: [
    ['A', [2]],
    ['C', [1]],
    ['E', [1]],
    ['B', [2]],
    ['D', [1]],
    ['F', [2]],
    ['A', [1]],
    ['E', [2]],
    ['C', [0]],
    ['B', [0]],
    ['D', [0]],
    ['F', [0]],
  ],
});

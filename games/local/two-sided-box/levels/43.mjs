/** 解锁顺序与球道顺序完全不同，记住已松开的锁扣。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'five-weave',
  number: 43,
  title: '五面编织',
  subtitle: '两把钥匙轮流借用',
  intro: 'E 低位解 B、高位解 D；A 中位解 C；B 和 D 最后一起解 A。A 的初态给出入口。',
  lesson: '解锁顺序与球道顺序完全不同，记住已松开的锁扣。',
  difficulty: '大师',
  shafts: [
    ['A', 'front', 1],
    ['B', 'back', 0],
    ['C', 'top', 0],
    ['D', 'left', 2],
    ['E', 'right', 1],
  ],
  latches: [
    [
      'lock-A',
      'A',
      'bottom',
      [
        ['B', [2]],
        ['D', [0]],
      ],
    ],
    ['lock-B', 'B', 'top', [['E', [0]]]],
    ['lock-C', 'C', 'bottom', [['A', [1]]]],
    ['lock-D', 'D', 'back', [['E', [2]]]],
  ],
  preparation: [
    ['latch', 'lock-C'],
    ['shaft', 'E', 0],
    ['latch', 'lock-B'],
    ['shaft', 'B', 2],
    ['shaft', 'E', 2],
    ['latch', 'lock-D'],
    ['shaft', 'D', 0],
    ['latch', 'lock-A'],
  ],
  route: [
    ['C', [2]],
    ['A', [0]],
    ['E', [0]],
    ['B', [1]],
    ['D', [1]],
    ['C', [1]],
    ['A', [2]],
    ['E', [2]],
    ['B', [0]],
    ['D', [2]],
  ],
});

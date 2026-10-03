/** 总锁松开后，三根钥匙轴都能离开钥匙挡位。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'four-conjunction',
  number: 35,
  title: '三窗总锁',
  subtitle: '三个窗口同时对齐',
  intro: 'A 的锁扣同时检查 B、C、D。它们的钥匙挡位又分别不同于各自首门。',
  lesson: '总锁松开后，三根钥匙轴都能离开钥匙挡位。',
  difficulty: '困难',
  shafts: [
    ['A', 'front', 0],
    ['B', 'top', 0],
    ['C', 'left', 2],
    ['D', 'right', 0],
  ],
  latches: [
    [
      'lock-A',
      'A',
      'back',
      [
        ['B', [2]],
        ['C', [0]],
        ['D', [1]],
      ],
    ],
  ],
  preparation: [
    ['shaft', 'B', 2],
    ['shaft', 'C', 0],
    ['shaft', 'D', 1],
    ['latch', 'lock-A'],
  ],
  route: [
    ['A', [1]],
    ['B', [1]],
    ['C', [1]],
    ['D', [2]],
    ['A', [2]],
    ['C', [0]],
    ['D', [0]],
  ],
});

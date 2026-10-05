/** 一个锁扣可能要求多根轴同时到位。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'two-windows',
  number: 15,
  title: '双窗锁扣',
  subtitle: '同时满足两个条件',
  intro: 'C 的锁扣需要 A 高位且 B 中位。两个窗口都对齐后才可松开。',
  lesson: '一个锁扣可能要求多根轴同时到位。',
  difficulty: '进阶',
  shafts: [
    ['A', 'front', 0],
    ['B', 'left', 0],
    ['C', 'top', 2],
  ],
  latches: [
    [
      'lock-C',
      'C',
      'back',
      [
        ['A', [2]],
        ['B', [1]],
      ],
    ],
  ],
  preparation: [
    ['shaft', 'A', 2],
    ['shaft', 'B', 1],
    ['latch', 'lock-C'],
  ],
  route: [
    ['C', [0]],
    ['A', [1]],
    ['B', [2]],
    ['C', [1]],
  ],
});

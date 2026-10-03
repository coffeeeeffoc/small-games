/** 把解锁和送球分成两段思考，途中换挡可以化解互斥孔位。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'triad-final',
  number: 30,
  title: '三面总装',
  subtitle: '中孔、双窗与途中换挡',
  intro: '三根轴组成带入口的闭环，A 锁扣还要额外检查 C。每根轴都有互斥的前后孔位。',
  lesson: '把解锁和送球分成两段思考，途中换挡可以化解互斥孔位。',
  difficulty: '挑战',
  shafts: [
    ['A', 'front', 1],
    ['B', 'right', 2],
    ['C', 'bottom', 0],
  ],
  latches: [
    [
      'lock-A',
      'A',
      'back',
      [
        ['B', [0]],
        ['C', [2]],
      ],
    ],
    ['lock-B', 'B', 'left', [['C', [2]]]],
    ['lock-C', 'C', 'top', [['A', [1]]]],
  ],
  preparation: [
    ['latch', 'lock-C'],
    ['shaft', 'C', 2],
    ['latch', 'lock-B'],
    ['shaft', 'B', 0],
    ['latch', 'lock-A'],
  ],
  route: [
    ['A', [2]],
    ['B', [1]],
    ['C', [1]],
    ['A', [0]],
    ['B', [2]],
    ['C', [0]],
    ['A', [1]],
    ['B', [0]],
  ],
});

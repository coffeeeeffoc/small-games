/** 两条准备支路在锁扣处合流，球道随后要求每根轴再次改变。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'four-final',
  number: 40,
  title: '四方总装',
  subtitle: '先合流，再接力',
  intro: 'B 和 C 先共同释放 D；D 到中位后，与 B 一起释放 A。准备完再进入八道换挡段。',
  lesson: '两条准备支路在锁扣处合流，球道随后要求每根轴再次改变。',
  difficulty: '困难',
  shafts: [
    ['A', 'top', 0],
    ['B', 'left', 0],
    ['C', 'bottom', 2],
    ['D', 'right', 0],
  ],
  latches: [
    [
      'lock-D',
      'D',
      'front',
      [
        ['B', [2]],
        ['C', [0]],
      ],
    ],
    [
      'lock-A',
      'A',
      'back',
      [
        ['B', [1]],
        ['D', [1]],
      ],
    ],
  ],
  preparation: [
    ['shaft', 'B', 2],
    ['shaft', 'C', 0],
    ['latch', 'lock-D'],
    ['shaft', 'D', 1],
    ['shaft', 'B', 1],
    ['latch', 'lock-A'],
  ],
  route: [
    ['A', [2]],
    ['B', [0]],
    ['C', [1]],
    ['D', [2]],
    ['C', [2]],
    ['A', [1]],
    ['D', [0]],
    ['B', [2]],
    ['A', [0]],
  ],
});

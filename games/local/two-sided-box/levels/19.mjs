/** 解锁条件和通球条件是两件不同的事。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'opposite-permission',
  number: 19,
  title: '反向许可',
  subtitle: '先低后高再中位',
  intro: 'B 的锁扣要求 A 低位，A 一开始却处于高位。主动回退才能前进。',
  lesson: '解锁条件和通球条件是两件不同的事。',
  difficulty: '进阶',
  shafts: [
    ['A', 'front', 2],
    ['B', 'right', 0],
    ['C', 'top', 1],
  ],
  latches: [
    ['lock-B', 'B', 'back', [['A', [0]]]],
    ['lock-C', 'C', 'left', [['B', [2]]]],
  ],
  preparation: [
    ['shaft', 'A', 0],
    ['latch', 'lock-B'],
    ['shaft', 'B', 2],
    ['latch', 'lock-C'],
  ],
  route: [
    ['A', [1]],
    ['B', [0]],
    ['C', [2]],
    ['A', [2]],
    ['B', [1]],
    ['C', [0]],
  ],
});

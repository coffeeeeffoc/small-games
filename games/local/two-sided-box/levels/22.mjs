/** 相同的孔位不代表相同的操作顺序。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'triad-middle',
  number: 22,
  title: '三枚中孔',
  subtitle: '相同目标，不同解锁',
  intro: '三根轴都要先到中位；A 由 B 解锁，B 又由 C 解锁。',
  lesson: '相同的孔位不代表相同的操作顺序。',
  difficulty: '挑战',
  shafts: [
    ['A', 'left', 0],
    ['B', 'back', 2],
    ['C', 'top', 0],
  ],
  latches: [
    ['lock-A', 'A', 'bottom', [['B', [1]]]],
    ['lock-B', 'B', 'right', [['C', [1]]]],
  ],
  preparation: [
    ['shaft', 'C', 1],
    ['latch', 'lock-B'],
    ['shaft', 'B', 1],
    ['latch', 'lock-A'],
  ],
  route: [
    ['A', [1]],
    ['B', [1]],
    ['C', [1]],
    ['A', [2]],
    ['C', [0]],
  ],
});

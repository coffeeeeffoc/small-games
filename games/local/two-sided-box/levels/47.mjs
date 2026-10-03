/** 先分清每对钥匙与锁，再按小球顺序把三对机关接起来。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'six-pairs',
  number: 47,
  title: '三对钥匙',
  subtitle: '三条支路铺满六面',
  intro: 'A 释放 B，C 释放 D，E 释放 F。三条独立支路在十道板的球道上交错。',
  lesson: '先分清每对钥匙与锁，再按小球顺序把三对机关接起来。',
  difficulty: '大师',
  shafts: [
    ['A', 'front', 0],
    ['B', 'back', 2],
    ['C', 'left', 0],
    ['D', 'right', 2],
    ['E', 'top', 0],
    ['F', 'bottom', 2],
  ],
  latches: [
    ['lock-B', 'B', 'left', [['A', [1]]]],
    ['lock-D', 'D', 'top', [['C', [2]]]],
    ['lock-F', 'F', 'front', [['E', [1]]]],
  ],
  preparation: [
    ['shaft', 'A', 1],
    ['latch', 'lock-B'],
    ['shaft', 'C', 2],
    ['latch', 'lock-D'],
    ['shaft', 'E', 1],
    ['latch', 'lock-F'],
  ],
  route: [
    ['B', [0]],
    ['D', [0]],
    ['F', [0]],
    ['A', [2]],
    ['C', [1]],
    ['E', [2]],
    ['F', [1]],
    ['B', [1]],
    ['D', [1]],
    ['A', [0]],
  ],
});

/** 沿解锁依赖走一遍，再沿球道走一遍。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'left-right-relay',
  number: 16,
  title: '左右接棒',
  subtitle: '钥匙交到另一边',
  intro: '左面的 A 先释放后面的 B 锁扣，B 高位再释放下面的 C 锁扣。',
  lesson: '沿解锁依赖走一遍，再沿球道走一遍。',
  difficulty: '进阶',
  shafts: [
    ['A', 'left', 1],
    ['B', 'back', 0],
    ['C', 'right', 2],
  ],
  latches: [
    ['lock-B', 'B', 'top', [['A', [1]]]],
    ['lock-C', 'C', 'bottom', [['B', [2]]]],
  ],
  preparation: [
    ['latch', 'lock-B'],
    ['shaft', 'B', 2],
    ['latch', 'lock-C'],
  ],
  route: [
    ['A', [0]],
    ['B', [1]],
    ['C', [0]],
    ['B', [2]],
    ['C', [1]],
  ],
});

/** 把一条长依赖链从末端逐级展开。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'four-chain',
  number: 32,
  title: '四级钥匙',
  subtitle: '从顶面的自由轴开始',
  intro: 'D 中位解 C，C 高位解 B，B 低位解 A。只有 D 可以直接移动。',
  lesson: '把一条长依赖链从末端逐级展开。',
  difficulty: '困难',
  shafts: [
    ['A', 'front', 0],
    ['B', 'left', 2],
    ['C', 'right', 0],
    ['D', 'top', 0],
  ],
  latches: [
    ['lock-A', 'A', 'back', [['B', [0]]]],
    ['lock-B', 'B', 'bottom', [['C', [2]]]],
    ['lock-C', 'C', 'back', [['D', [1]]]],
  ],
  preparation: [
    ['shaft', 'D', 1],
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
    ['D', [2]],
    ['A', [0]],
    ['D', [0]],
  ],
});

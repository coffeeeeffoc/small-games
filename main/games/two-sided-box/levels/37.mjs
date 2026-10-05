/** 把同一根轴的三个挡位当作三次独立的解锁机会。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'four-reused-key',
  number: 37,
  title: '钥匙巡回',
  subtitle: '一根钥匙先后开三把锁',
  intro: 'D 分别在低、中、高位释放 A、B、C，三把锁分散在盒子的不同面。',
  lesson: '把同一根轴的三个挡位当作三次独立的解锁机会。',
  difficulty: '困难',
  shafts: [
    ['A', 'front', 0],
    ['B', 'left', 2],
    ['C', 'top', 0],
    ['D', 'right', 1],
  ],
  latches: [
    ['lock-A', 'A', 'back', [['D', [0]]]],
    ['lock-B', 'B', 'bottom', [['D', [1]]]],
    ['lock-C', 'C', 'back', [['D', [2]]]],
  ],
  preparation: [
    ['shaft', 'D', 0],
    ['latch', 'lock-A'],
    ['shaft', 'D', 1],
    ['latch', 'lock-B'],
    ['shaft', 'D', 2],
    ['latch', 'lock-C'],
  ],
  route: [
    ['C', [1]],
    ['A', [2]],
    ['D', [0]],
    ['B', [0]],
    ['C', [2]],
    ['A', [1]],
    ['D', [2]],
    ['B', [1]],
  ],
});

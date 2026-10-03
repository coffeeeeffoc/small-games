/** 分批揭示新面，并用已经发现的轴控制眼前的挡板。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'five-entry',
  number: 41,
  title: '第五个面',
  subtitle: '五根轴的完整接力',
  intro: '前、后、左、右、上各有一根必需滑轴。两个初始观察面只展示其中一部分。',
  lesson: '分批揭示新面，并用已经发现的轴控制眼前的挡板。',
  difficulty: '大师',
  shafts: [
    ['A', 'front', 0],
    ['B', 'back', 0],
    ['C', 'left', 0],
    ['D', 'right', 0],
    ['E', 'top', 0],
  ],
  latches: [
    [
      'lock-E',
      'E',
      'bottom',
      [
        ['A', [1]],
        ['C', [2]],
      ],
    ],
  ],
  preparation: [
    ['shaft', 'A', 1],
    ['shaft', 'C', 2],
    ['latch', 'lock-E'],
  ],
  route: [
    ['B', [2]],
    ['D', [1]],
    ['E', [1]],
    ['A', [2]],
    ['C', [1]],
    ['B', [0]],
    ['D', [2]],
    ['E', [2]],
  ],
});

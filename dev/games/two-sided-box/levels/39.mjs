/** 观察中途的停球位置，按路段而不是按轴批量设置挡位。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'four-long-route',
  number: 39,
  title: '回环球道',
  subtitle: '九道板，四个把手',
  intro: 'A 轴在球道上出现三次，其余三轴各出现两次。所有锁扣都在钥匙轴的另一侧。',
  lesson: '观察中途的停球位置，按路段而不是按轴批量设置挡位。',
  difficulty: '困难',
  shafts: [
    ['A', 'front', 0],
    ['B', 'back', 2],
    ['C', 'left', 0],
    ['D', 'top', 2],
  ],
  latches: [
    ['lock-B', 'B', 'right', [['A', [1]]]],
    ['lock-C', 'C', 'bottom', [['B', [0]]]],
    ['lock-D', 'D', 'right', [['C', [2]]]],
  ],
  preparation: [
    ['shaft', 'A', 1],
    ['latch', 'lock-B'],
    ['shaft', 'B', 0],
    ['latch', 'lock-C'],
    ['shaft', 'C', 2],
    ['latch', 'lock-D'],
  ],
  route: [
    ['A', [2]],
    ['B', [1]],
    ['C', [1]],
    ['D', [0]],
    ['A', [0]],
    ['C', [2]],
    ['B', [2]],
    ['D', [1]],
    ['A', [1]],
  ],
});

/** 先满足 B 的窗口；解锁后再调整 C，为 A 提供不同的组合。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'four-double-window',
  number: 38,
  title: '双窗接双窗',
  subtitle: '解锁条件相互交叠',
  intro: 'A 需要 B 和 C，B 又需要 C 和 D。C 是两扇锁窗共用的钥匙。',
  lesson: '先满足 B 的窗口；解锁后再调整 C，为 A 提供不同的组合。',
  difficulty: '困难',
  shafts: [
    ['A', 'bottom', 0],
    ['B', 'front', 2],
    ['C', 'right', 0],
    ['D', 'back', 0],
  ],
  latches: [
    [
      'lock-A',
      'A',
      'left',
      [
        ['B', [1]],
        ['C', [2]],
      ],
    ],
    [
      'lock-B',
      'B',
      'top',
      [
        ['C', [1]],
        ['D', [2]],
      ],
    ],
  ],
  preparation: [
    ['shaft', 'C', 1],
    ['shaft', 'D', 2],
    ['latch', 'lock-B'],
    ['shaft', 'B', 1],
    ['shaft', 'C', 2],
    ['latch', 'lock-A'],
  ],
  route: [
    ['A', [2]],
    ['B', [0]],
    ['C', [1]],
    ['D', [1]],
    ['A', [1]],
    ['C', [0]],
    ['B', [2]],
    ['D', [0]],
  ],
});

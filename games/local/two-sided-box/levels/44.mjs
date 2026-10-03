/** 重复使用共享钥匙时，先完成当前解锁，再改为下一组合。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'five-convergence',
  number: 44,
  title: '三路汇合',
  subtitle: '先准备三把钥匙',
  intro: 'A、C、E 三根自由轴先后开 B 与 D 的双条件锁，两次组合共用 C 但要求不同挡位。',
  lesson: '重复使用共享钥匙时，先完成当前解锁，再改为下一组合。',
  difficulty: '大师',
  shafts: [
    ['A', 'top', 0],
    ['B', 'front', 0],
    ['C', 'bottom', 1],
    ['D', 'back', 2],
    ['E', 'left', 2],
  ],
  latches: [
    [
      'lock-B',
      'B',
      'right',
      [
        ['A', [2]],
        ['C', [0]],
      ],
    ],
    [
      'lock-D',
      'D',
      'right',
      [
        ['C', [2]],
        ['E', [0]],
      ],
    ],
  ],
  preparation: [
    ['shaft', 'A', 2],
    ['shaft', 'C', 0],
    ['latch', 'lock-B'],
    ['shaft', 'C', 2],
    ['shaft', 'E', 0],
    ['latch', 'lock-D'],
  ],
  route: [
    ['B', [1]],
    ['D', [0]],
    ['A', [1]],
    ['C', [0]],
    ['E', [1]],
    ['B', [2]],
    ['A', [0]],
    ['D', [1]],
    ['C', [2]],
    ['E', [2]],
  ],
});

/** 双条件锁扣需要同时对齐，而不是先后经过对应挡位。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'triad-intersection',
  number: 25,
  title: '双条件交点',
  subtitle: '先解单窗，再解双窗',
  intro: 'C 先替 B 打开窗口，随后 B 与 C 同时对齐才能解开 A。',
  lesson: '双条件锁扣需要同时对齐，而不是先后经过对应挡位。',
  difficulty: '挑战',
  shafts: [
    ['A', 'back', 0],
    ['B', 'bottom', 2],
    ['C', 'right', 0],
  ],
  latches: [
    ['lock-B', 'B', 'left', [['C', [1]]]],
    [
      'lock-A',
      'A',
      'top',
      [
        ['B', [0]],
        ['C', [2]],
      ],
    ],
  ],
  preparation: [
    ['shaft', 'C', 1],
    ['latch', 'lock-B'],
    ['shaft', 'B', 0],
    ['shaft', 'C', 2],
    ['latch', 'lock-A'],
  ],
  route: [
    ['A', [2]],
    ['B', [1]],
    ['C', [1]],
    ['A', [0]],
    ['B', [2]],
    ['C', [0]],
  ],
});

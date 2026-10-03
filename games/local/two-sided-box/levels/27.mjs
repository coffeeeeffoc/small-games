/** 锁扣松开后可以保留状态，因此同一把钥匙可以先后使用。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'triad-fork',
  number: 27,
  title: '一钥两锁',
  subtitle: '一根轴先后释放两位伙伴',
  intro: 'C 低位释放 A，高位释放 B。两个解锁窗口不能同时对齐。',
  lesson: '锁扣松开后可以保留状态，因此同一把钥匙可以先后使用。',
  difficulty: '挑战',
  shafts: [
    ['A', 'top', 0],
    ['B', 'right', 2],
    ['C', 'back', 1],
  ],
  latches: [
    ['lock-A', 'A', 'front', [['C', [0]]]],
    ['lock-B', 'B', 'bottom', [['C', [2]]]],
  ],
  preparation: [
    ['shaft', 'C', 0],
    ['latch', 'lock-A'],
    ['shaft', 'C', 2],
    ['latch', 'lock-B'],
  ],
  route: [
    ['A', [1]],
    ['C', [0]],
    ['B', [0]],
    ['A', [2]],
    ['C', [2]],
    ['B', [1]],
  ],
});

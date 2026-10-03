/** 记住哪把锁已经松开，避免保留不再需要的钥匙位置。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'triad-detour',
  number: 23,
  title: '三面绕行',
  subtitle: '高位钥匙，低位通道',
  intro: '先把 C 升高解开 A，再用 A 中位解开 B；通球时三根轴需要另一组挡位。',
  lesson: '记住哪把锁已经松开，避免保留不再需要的钥匙位置。',
  difficulty: '挑战',
  shafts: [
    ['A', 'front', 2],
    ['B', 'right', 0],
    ['C', 'bottom', 0],
  ],
  latches: [
    ['lock-A', 'A', 'back', [['C', [2]]]],
    ['lock-B', 'B', 'left', [['A', [1]]]],
  ],
  preparation: [
    ['shaft', 'C', 2],
    ['latch', 'lock-A'],
    ['shaft', 'A', 1],
    ['latch', 'lock-B'],
  ],
  route: [
    ['C', [1]],
    ['A', [0]],
    ['B', [2]],
    ['C', [0]],
    ['A', [2]],
    ['B', [1]],
  ],
});

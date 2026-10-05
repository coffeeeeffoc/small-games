/** 沿链逆向解锁，沿球道正向通行。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'five-chain',
  number: 42,
  title: '五级阶梯',
  subtitle: '最下面的轴先动',
  intro: 'E、D、C、B、A 依次成为下一把锁的钥匙。最后再把它们依球道顺序逐一换挡。',
  lesson: '沿链逆向解锁，沿球道正向通行。',
  difficulty: '大师',
  shafts: [
    ['A', 'front', 0],
    ['B', 'left', 2],
    ['C', 'back', 0],
    ['D', 'right', 2],
    ['E', 'bottom', 0],
  ],
  latches: [
    ['lock-A', 'A', 'top', [['B', [0]]]],
    ['lock-B', 'B', 'front', [['C', [2]]]],
    ['lock-C', 'C', 'top', [['D', [0]]]],
    ['lock-D', 'D', 'back', [['E', [1]]]],
  ],
  preparation: [
    ['shaft', 'E', 1],
    ['latch', 'lock-D'],
    ['shaft', 'D', 0],
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
    ['D', [1]],
    ['E', [2]],
    ['C', [0]],
    ['A', [1]],
    ['E', [0]],
    ['B', [2]],
  ],
});

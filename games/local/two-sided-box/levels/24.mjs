/** 闭环不等于死锁；寻找已经满足的那一项。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'triad-cycle',
  number: 24,
  title: '三角闭环',
  subtitle: '从唯一对齐窗切入',
  intro: 'A 高位允许解 C，C 中位允许解 B，B 低位允许解 A。初态已给出第一步。',
  lesson: '闭环不等于死锁；寻找已经满足的那一项。',
  difficulty: '挑战',
  shafts: [
    ['A', 'top', 2],
    ['B', 'front', 2],
    ['C', 'left', 0],
  ],
  latches: [
    ['lock-A', 'A', 'bottom', [['B', [0]]]],
    ['lock-B', 'B', 'back', [['C', [1]]]],
    ['lock-C', 'C', 'right', [['A', [2]]]],
  ],
  preparation: [
    ['latch', 'lock-C'],
    ['shaft', 'C', 1],
    ['latch', 'lock-B'],
    ['shaft', 'B', 0],
    ['latch', 'lock-A'],
  ],
  route: [
    ['A', [0]],
    ['B', [1]],
    ['C', [2]],
    ['A', [1]],
    ['B', [2]],
    ['C', [0]],
  ],
});

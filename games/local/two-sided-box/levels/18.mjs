/** 缺少关键操作时，揭示下一个面比反复拖动锁住的轴更有效。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'corner-chain',
  number: 18,
  title: '转角解锁链',
  subtitle: '第三根轴藏在后面',
  intro: 'C 中位放开 B，B 低位放开 A。初始看到的两个面未必覆盖整条链。',
  lesson: '缺少关键操作时，揭示下一个面比反复拖动锁住的轴更有效。',
  difficulty: '进阶',
  shafts: [
    ['A', 'right', 0],
    ['B', 'bottom', 2],
    ['C', 'back', 0],
  ],
  latches: [
    ['lock-A', 'A', 'left', [['B', [0]]]],
    ['lock-B', 'B', 'top', [['C', [1]]]],
  ],
  preparation: [
    ['shaft', 'C', 1],
    ['latch', 'lock-B'],
    ['shaft', 'B', 0],
    ['latch', 'lock-A'],
  ],
  route: [
    ['A', [2]],
    ['B', [1]],
    ['C', [2]],
    ['A', [1]],
    ['C', [0]],
  ],
});

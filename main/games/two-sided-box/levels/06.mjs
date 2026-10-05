/** 先 C、再 B、最后 A；解锁后仍需沿球道逐段换挡。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'three-shaft-relay',
  number: 6,
  title: '三轴接力',
  subtitle: '闭环有一个起点',
  intro: 'A 低位释放 C，C 低位释放 B，B 中位释放 A。找到闭环中已经对齐的窗口。',
  lesson: '先 C、再 B、最后 A；解锁后仍需沿球道逐段换挡。',
  difficulty: '入门',
  shafts: [
    ['A', 'front', 0],
    ['B', 'right', 2],
    ['C', 'top', 2],
  ],
  latches: [
    ['lock-A', 'A', 'back', [['B', [1]]]],
    ['lock-B', 'B', 'front', [['C', [0]]]],
    ['lock-C', 'C', 'back', [['A', [0]]]],
  ],
  preparation: [
    ['latch', 'lock-C'],
    ['shaft', 'C', 0],
    ['latch', 'lock-B'],
    ['shaft', 'B', 1],
    ['latch', 'lock-A'],
  ],
  route: [
    ['A', [2]],
    ['B', [1]],
    ['C', [0]],
    ['B', [2]],
    ['A', [0]],
    ['C', [2]],
  ],
});

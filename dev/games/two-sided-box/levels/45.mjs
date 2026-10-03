/** 把已满足的锁窗作为入口，逐层剥开联锁。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'five-cycle',
  number: 45,
  title: '五角联锁',
  subtitle: '完整闭环中的一个缝隙',
  intro: 'A 低位起步，依次释放 E、D、C、B，最后 B 高位才释放 A。没有哪根轴能跳过。',
  lesson: '把已满足的锁窗作为入口，逐层剥开联锁。',
  difficulty: '大师',
  shafts: [
    ['A', 'front', 0],
    ['B', 'top', 0],
    ['C', 'right', 2],
    ['D', 'bottom', 0],
    ['E', 'back', 2],
  ],
  latches: [
    ['lock-A', 'A', 'left', [['B', [2]]]],
    ['lock-B', 'B', 'right', [['C', [0]]]],
    ['lock-C', 'C', 'left', [['D', [1]]]],
    ['lock-D', 'D', 'top', [['E', [0]]]],
    ['lock-E', 'E', 'bottom', [['A', [0]]]],
  ],
  preparation: [
    ['latch', 'lock-E'],
    ['shaft', 'E', 0],
    ['latch', 'lock-D'],
    ['shaft', 'D', 1],
    ['latch', 'lock-C'],
    ['shaft', 'C', 0],
    ['latch', 'lock-B'],
    ['shaft', 'B', 2],
    ['latch', 'lock-A'],
  ],
  route: [
    ['A', [2]],
    ['B', [1]],
    ['C', [1]],
    ['D', [2]],
    ['E', [1]],
    ['A', [0]],
    ['D', [0]],
    ['B', [0]],
    ['E', [2]],
    ['C', [2]],
  ],
});

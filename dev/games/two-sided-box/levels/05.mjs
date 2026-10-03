/** 从现成的高位开始解锁，随后让两根轴交替换挡。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'crossed-latches',
  number: 5,
  title: '交错的两把锁',
  subtitle: '利用已经满足的条件',
  intro: 'A 初始在高位，可以先释放 B；B 到中位后，又能释放 A。',
  lesson: '从现成的高位开始解锁，随后让两根轴交替换挡。',
  difficulty: '入门',
  shafts: [
    ['A', 'front', 2],
    ['B', 'right', 0],
  ],
  latches: [
    ['lock-A', 'A', 'back', [['B', [1]]]],
    ['lock-B', 'B', 'front', [['A', [2]]]],
  ],
  preparation: [
    ['latch', 'lock-B'],
    ['shaft', 'B', 1],
    ['latch', 'lock-A'],
  ],
  route: [
    ['A', [0]],
    ['B', [1]],
    ['B', [2]],
    ['A', [1]],
  ],
});

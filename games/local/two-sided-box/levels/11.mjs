/** 先解决解锁依赖，再寻找孔位交集。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'double-middle',
  number: 11,
  title: '双中位',
  subtitle: '两根轴都找中间',
  intro: 'A 的锁扣需要 B 中位，B 本身没有锁。两组双孔板共享各自的中位。',
  lesson: '先解决解锁依赖，再寻找孔位交集。',
  difficulty: '进阶',
  shafts: [
    ['A', 'left', 0],
    ['B', 'top', 2],
  ],
  latches: [['lock-A', 'A', 'right', [['B', [1]]]]],
  preparation: [
    ['shaft', 'B', 1],
    ['latch', 'lock-A'],
  ],
  route: [
    ['A', [1, 2]],
    ['B', [0, 1]],
    ['A', [0, 1]],
    ['B', [1, 2]],
  ],
});

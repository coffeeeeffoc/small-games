/** 锁扣所在面与轴所在面相互独立。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'split-keys',
  number: 13,
  title: '分开的钥匙',
  subtitle: '两把锁分属两面',
  intro: '上面的锁扣固定 A，下面的锁扣固定 B。打开不同面，才能操作侧面的两根轴。',
  lesson: '锁扣所在面与轴所在面相互独立。',
  difficulty: '进阶',
  shafts: [
    ['A', 'left', 0],
    ['B', 'right', 2],
  ],
  latches: [
    ['lock-A', 'A', 'top', []],
    ['lock-B', 'B', 'bottom', []],
  ],
  preparation: [
    ['latch', 'lock-A'],
    ['latch', 'lock-B'],
  ],
  route: [
    ['A', [1]],
    ['B', [0]],
    ['A', [2]],
    ['B', [1]],
  ],
});

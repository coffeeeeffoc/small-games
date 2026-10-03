/** 锁扣松开后不要求钥匙轴一直停在原处。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'borrowed-height',
  number: 12,
  title: '借来的高位',
  subtitle: '临时位置不是终点答案',
  intro: 'B 高位才能解开 A，但 B 的第一道门需要低位。钥匙位置用完后可以改变。',
  lesson: '锁扣松开后不要求钥匙轴一直停在原处。',
  difficulty: '进阶',
  shafts: [
    ['A', 'front', 0],
    ['B', 'back', 1],
  ],
  latches: [['lock-A', 'A', 'left', [['B', [2]]]]],
  preparation: [
    ['shaft', 'B', 2],
    ['latch', 'lock-A'],
  ],
  route: [
    ['B', [0]],
    ['A', [2]],
    ['B', [1]],
    ['A', [1]],
  ],
});

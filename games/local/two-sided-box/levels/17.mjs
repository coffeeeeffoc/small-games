/** 两个分离的孔不会让中位自动通行。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'wide-and-narrow',
  number: 17,
  title: '宽孔与窄孔',
  subtitle: '保留一个选择',
  intro: 'A 第一扇板允许低、高位，随后窄孔只接受中位。不同板的开孔不一定连续。',
  lesson: '两个分离的孔不会让中位自动通行。',
  difficulty: '进阶',
  shafts: [
    ['A', 'top', 1],
    ['B', 'front', 0],
  ],
  latches: [['lock-A', 'A', 'back', [['B', [2]]]]],
  preparation: [
    ['shaft', 'B', 2],
    ['latch', 'lock-A'],
  ],
  route: [
    ['A', [0, 2]],
    ['B', [1]],
    ['A', [1]],
    ['B', [0]],
    ['A', [2]],
  ],
});

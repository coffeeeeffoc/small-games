/** 每次只需为小球即将经过的那块板对齐孔。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'return-to-zero',
  number: 14,
  title: '归零再启程',
  subtitle: '两段高位之间的低位',
  intro: 'A 先升高又归零，B 则在中间接力。不要把已经通过的孔位当成永久要求。',
  lesson: '每次只需为小球即将经过的那块板对齐孔。',
  difficulty: '进阶',
  shafts: [
    ['A', 'front', 0],
    ['B', 'bottom', 0],
  ],
  latches: [['lock-B', 'B', 'front', [['A', [2]]]]],
  preparation: [
    ['shaft', 'A', 2],
    ['latch', 'lock-B'],
  ],
  route: [
    ['A', [2]],
    ['B', [1]],
    ['A', [0]],
    ['B', [2]],
    ['A', [2]],
  ],
});

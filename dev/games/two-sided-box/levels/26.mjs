/** 分清小球已经通过哪块板，再返回同一个操作面。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'triad-revisit',
  number: 26,
  title: '三次回访',
  subtitle: '同一根轴连续复用',
  intro: 'A 轴在球道上出现三次，分别需要高、中、低位。B 和 C 在间隙中接力。',
  lesson: '分清小球已经通过哪块板，再返回同一个操作面。',
  difficulty: '挑战',
  shafts: [
    ['A', 'front', 0],
    ['B', 'left', 0],
    ['C', 'top', 2],
  ],
  latches: [['lock-C', 'C', 'back', [['B', [1]]]]],
  preparation: [
    ['shaft', 'B', 1],
    ['latch', 'lock-C'],
  ],
  route: [
    ['A', [2]],
    ['B', [1]],
    ['A', [1]],
    ['C', [0]],
    ['A', [0]],
    ['B', [2]],
    ['C', [1]],
  ],
});

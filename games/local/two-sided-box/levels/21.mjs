/** 从这一章开始，任意两个操作面都不足以独立完成球道。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'triad-entry',
  number: 21,
  title: '三向入口',
  subtitle: '三面缺一不可',
  intro: '前、上、右三根轴的初始挡位都不通。先找到全部操作入口。',
  lesson: '从这一章开始，任意两个操作面都不足以独立完成球道。',
  difficulty: '挑战',
  shafts: [
    ['A', 'front', 0],
    ['B', 'top', 0],
    ['C', 'right', 0],
  ],
  latches: [],
  preparation: [],
  route: [
    ['A', [1]],
    ['B', [2]],
    ['C', [1]],
    ['A', [2]],
    ['B', [0]],
  ],
});

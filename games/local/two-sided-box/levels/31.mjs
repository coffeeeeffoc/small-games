/** 按颜色沿球道认领挡板，避免只记观察面的相邻顺序。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'four-directions',
  number: 31,
  title: '四方开场',
  subtitle: '增加一根独立滑轴',
  intro: '前、后、左、右各有一根轴，四道首门都需要改变初始挡位。',
  lesson: '按颜色沿球道认领挡板，避免只记观察面的相邻顺序。',
  difficulty: '困难',
  shafts: [
    ['A', 'front', 0],
    ['B', 'back', 0],
    ['C', 'left', 0],
    ['D', 'right', 0],
  ],
  latches: [],
  preparation: [],
  route: [
    ['A', [1]],
    ['C', [2]],
    ['B', [1]],
    ['D', [2]],
    ['A', [2]],
    ['B', [0]],
  ],
});

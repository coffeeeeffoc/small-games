/** 挡位数字是离散位置；真实位移方向由滑轴所在面决定。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'triad-offset',
  number: 28,
  title: '错位的中孔',
  subtitle: '不同方向，相同挡位',
  intro: '上、下两根轴沿相反方向滑动，第三根轴竖直滑动。三个中位孔仍由同一空间规则判断。',
  lesson: '挡位数字是离散位置；真实位移方向由滑轴所在面决定。',
  difficulty: '挑战',
  shafts: [
    ['A', 'top', 2],
    ['B', 'bottom', 0],
    ['C', 'front', 2],
  ],
  latches: [
    ['lock-A', 'A', 'left', [['C', [0]]]],
    ['lock-B', 'B', 'right', [['A', [1]]]],
  ],
  preparation: [
    ['shaft', 'C', 0],
    ['latch', 'lock-A'],
    ['shaft', 'A', 1],
    ['latch', 'lock-B'],
  ],
  route: [
    ['B', [1]],
    ['C', [1]],
    ['A', [0]],
    ['B', [2]],
    ['C', [2]],
    ['A', [2]],
  ],
});

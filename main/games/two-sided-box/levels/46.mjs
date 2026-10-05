/** 六面看似不同，操作的是同一个三维球道和六组联动挡板。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'six-entry',
  number: 46,
  title: '六面齐备',
  subtitle: '每个面都有一根轴',
  intro: '六个面各有独立的滑轴，每根轴的初态都无法通过自己的首门。完整盒子需要完整观察。',
  lesson: '六面看似不同，操作的是同一个三维球道和六组联动挡板。',
  difficulty: '大师',
  shafts: [
    ['A', 'front', 0],
    ['B', 'back', 0],
    ['C', 'left', 0],
    ['D', 'right', 0],
    ['E', 'top', 0],
    ['F', 'bottom', 0],
  ],
  latches: [],
  preparation: [],
  route: [
    ['A', [1]],
    ['E', [2]],
    ['C', [1]],
    ['F', [2]],
    ['B', [1]],
    ['D', [2]],
    ['A', [2]],
    ['C', [0]],
    ['E', [1]],
    ['F', [0]],
  ],
});

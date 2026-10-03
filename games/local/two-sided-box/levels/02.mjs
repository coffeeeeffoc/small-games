/** 中位能同时照顾两块同轴挡板；高位不总是更好。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'middle-ground',
  number: 2,
  title: '刚刚好的中间',
  subtitle: '两道门共用一个挡位',
  intro: '前一道门有中、高两个孔，后一道门有低、中两个孔。找出共同的挡位。',
  lesson: '中位能同时照顾两块同轴挡板；高位不总是更好。',
  difficulty: '入门',
  shafts: [['A', 'front', 0]],
  latches: [['lock-A', 'A', 'back', []]],
  preparation: [['latch', 'lock-A']],
  route: [
    ['A', [1, 2]],
    ['A', [0, 1]],
  ],
});

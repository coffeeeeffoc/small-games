/** 先通过高位门，等球到下一道门，再把 A 轴调回低位。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'moving-through',
  number: 4,
  title: '过门，再换挡',
  subtitle: '小球停住仍可调整',
  intro: '两块 A 轴挡板分别需要高位、低位，没有一个挡位能一次打开整条球道。',
  lesson: '先通过高位门，等球到下一道门，再把 A 轴调回低位。',
  difficulty: '入门',
  shafts: [['A', 'front', 0]],
  latches: [['lock-A', 'A', 'back', []]],
  preparation: [['latch', 'lock-A']],
  route: [
    ['A', [2]],
    ['A', [0]],
  ],
});

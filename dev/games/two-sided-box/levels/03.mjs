/** 锁扣检查的是另一根轴的真实位置，与当前观察角度无关。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'aligned-window',
  number: 3,
  title: '对齐解锁窗',
  subtitle: '另一根轴就是钥匙',
  intro: 'A 的后面锁扣要求 B 在中位。找到右面的 B 轴，先对齐窗口。',
  lesson: '锁扣检查的是另一根轴的真实位置，与当前观察角度无关。',
  difficulty: '入门',
  shafts: [
    ['A', 'front', 0],
    ['B', 'right', 0],
  ],
  latches: [['lock-A', 'A', 'back', [['B', [1]]]]],
  preparation: [
    ['shaft', 'B', 1],
    ['latch', 'lock-A'],
  ],
  route: [
    ['A', [2]],
    ['B', [1]],
  ],
});

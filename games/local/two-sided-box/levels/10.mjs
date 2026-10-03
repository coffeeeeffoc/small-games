/** 先辨认轴，再看孔位；球停在挡板前不会造成失败。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'first-circuit',
  number: 10,
  title: '绕盒一周',
  subtitle: '第一章综合',
  intro: '前、右、后三根轴各负责一段球道。需要时揭示第三个操作面。',
  lesson: '先辨认轴，再看孔位；球停在挡板前不会造成失败。',
  difficulty: '入门',
  shafts: [
    ['A', 'front', 1],
    ['B', 'right', 0],
    ['C', 'back', 2],
  ],
  latches: [['lock-C', 'C', 'front', [['A', [1]]]]],
  preparation: [['latch', 'lock-C']],
  route: [
    ['A', [2]],
    ['B', [1]],
    ['C', [0]],
    ['A', [0]],
    ['C', [1]],
  ],
});

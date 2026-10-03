/** 面名只表示观察方向，不代表机关的功能。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'side-door',
  number: 7,
  title: '侧面的把手',
  subtitle: '向左找轴，向右找锁',
  intro: '这次滑轴搬到了左面，锁扣在右面；前后面不一定有操作入口。',
  lesson: '面名只表示观察方向，不代表机关的功能。',
  difficulty: '入门',
  shafts: [['A', 'left', 0]],
  latches: [['lock-A', 'A', 'right', []]],
  preparation: [['latch', 'lock-A']],
  route: [
    ['A', [1]],
    ['A', [2]],
  ],
});

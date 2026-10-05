/** 从上面观察时，滑轴沿盒子的前后方向移动。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'vertical-pair',
  number: 8,
  title: '顶底呼应',
  subtitle: '上下也属于同一个盒子',
  intro: '上面的 A 轴初始处于高位。打开下面的锁扣后，从低位孔重新出发。',
  lesson: '从上面观察时，滑轴沿盒子的前后方向移动。',
  difficulty: '入门',
  shafts: [['A', 'top', 2]],
  latches: [['lock-A', 'A', 'bottom', []]],
  preparation: [['latch', 'lock-A']],
  route: [
    ['A', [0]],
    ['A', [1]],
    ['A', [2]],
  ],
});

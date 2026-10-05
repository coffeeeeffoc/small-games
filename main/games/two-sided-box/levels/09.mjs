/** 同色挡板属于同一根轴，转动观察角度不会复制机关。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'two-turns',
  number: 9,
  title: '两个转角',
  subtitle: '辨认不同轴的颜色',
  intro: '下面的 A 和右面的 B 都能自由移动。球道会两次经过各自的挡板。',
  lesson: '同色挡板属于同一根轴，转动观察角度不会复制机关。',
  difficulty: '入门',
  shafts: [
    ['A', 'bottom', 0],
    ['B', 'right', 2],
  ],
  latches: [],
  preparation: [],
  route: [
    ['A', [1]],
    ['B', [0]],
    ['A', [2]],
    ['B', [1]],
  ],
});

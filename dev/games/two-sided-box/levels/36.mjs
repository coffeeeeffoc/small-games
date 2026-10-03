/** 用挡板的开孔判断下一步，不要假定升高一定是前进。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'four-reverse',
  number: 36,
  title: '反向四重奏',
  subtitle: '低、中、高交错',
  intro: '四根轴的初态有高有低；每根轴都必须去另一个挡位，再反向返回。',
  lesson: '用挡板的开孔判断下一步，不要假定升高一定是前进。',
  difficulty: '困难',
  shafts: [
    ['A', 'back', 2],
    ['B', 'bottom', 0],
    ['C', 'front', 2],
    ['D', 'left', 0],
  ],
  latches: [
    ['lock-B', 'B', 'top', [['A', [1]]]],
    ['lock-D', 'D', 'right', [['C', [0]]]],
  ],
  preparation: [
    ['shaft', 'A', 1],
    ['latch', 'lock-B'],
    ['shaft', 'C', 0],
    ['latch', 'lock-D'],
  ],
  route: [
    ['A', [0]],
    ['B', [2]],
    ['C', [1]],
    ['D', [1]],
    ['A', [2]],
    ['B', [0]],
    ['C', [2]],
    ['D', [2]],
  ],
});

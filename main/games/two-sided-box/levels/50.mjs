/** 先从 A 中位释放 F，再依次 E、D、C、B、A；通球时以每道板的实体孔位为准。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'complete-mechanism',
  number: 50,
  title: '完整机关盒',
  subtitle: '六面、双窗、十二道门',
  intro: '六根轴形成一条带双条件窗口的闭环。A 的中位是入口，各轴解锁后都要在球道上两次换挡。',
  lesson: '先从 A 中位释放 F，再依次 E、D、C、B、A；通球时以每道板的实体孔位为准。',
  difficulty: '大师',
  shafts: [
    ['A', 'front', 1],
    ['B', 'back', 0],
    ['C', 'left', 2],
    ['D', 'right', 0],
    ['E', 'top', 2],
    ['F', 'bottom', 0],
  ],
  latches: [
    [
      'lock-A',
      'A',
      'bottom',
      [
        ['B', [2]],
        ['F', [1]],
      ],
    ],
    [
      'lock-B',
      'B',
      'left',
      [
        ['C', [0]],
        ['E', [0]],
      ],
    ],
    [
      'lock-C',
      'C',
      'top',
      [
        ['D', [2]],
        ['F', [1]],
      ],
    ],
    ['lock-D', 'D', 'back', [['E', [0]]]],
    [
      'lock-E',
      'E',
      'right',
      [
        ['F', [1]],
        ['A', [1]],
      ],
    ],
    ['lock-F', 'F', 'front', [['A', [1]]]],
  ],
  preparation: [
    ['latch', 'lock-F'],
    ['shaft', 'F', 1],
    ['latch', 'lock-E'],
    ['shaft', 'E', 0],
    ['latch', 'lock-D'],
    ['shaft', 'D', 2],
    ['latch', 'lock-C'],
    ['shaft', 'C', 0],
    ['latch', 'lock-B'],
    ['shaft', 'B', 2],
    ['latch', 'lock-A'],
  ],
  route: [
    ['A', [2]],
    ['F', [2]],
    ['B', [1]],
    ['E', [1]],
    ['C', [1]],
    ['D', [1]],
    ['A', [0]],
    ['C', [2]],
    ['E', [2]],
    ['B', [0]],
    ['D', [0]],
    ['F', [0]],
  ],
});

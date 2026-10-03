/** 闭环长度增加，仍然先找已满足的窗口。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'four-cycle',
  number: 34,
  title: '四角闭环',
  subtitle: '高位起点藏在左面',
  intro: 'A 初始高位可释放 D，D 低位释放 C，C 中位释放 B，B 高位释放 A。',
  lesson: '闭环长度增加，仍然先找已满足的窗口。',
  difficulty: '困难',
  shafts: [
    ['A', 'left', 2],
    ['B', 'front', 0],
    ['C', 'right', 2],
    ['D', 'bottom', 2],
  ],
  latches: [
    ['lock-A', 'A', 'top', [['B', [2]]]],
    ['lock-B', 'B', 'back', [['C', [1]]]],
    ['lock-C', 'C', 'top', [['D', [0]]]],
    ['lock-D', 'D', 'back', [['A', [2]]]],
  ],
  preparation: [
    ['latch', 'lock-D'],
    ['shaft', 'D', 0],
    ['latch', 'lock-C'],
    ['shaft', 'C', 1],
    ['latch', 'lock-B'],
    ['shaft', 'B', 2],
    ['latch', 'lock-A'],
  ],
  route: [
    ['A', [0]],
    ['B', [1]],
    ['C', [0]],
    ['D', [1]],
    ['B', [2]],
    ['A', [1]],
    ['C', [2]],
    ['D', [2]],
  ],
});

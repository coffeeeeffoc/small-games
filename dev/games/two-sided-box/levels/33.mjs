/** 独立的解锁支路可以分开完成，但通球顺序由路线决定。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'four-branches',
  number: 33,
  title: '两条解锁支路',
  subtitle: '左右各走一条链',
  intro: 'A 能释放 B，C 能释放 D，两条支路最后在球道上交替出现。',
  lesson: '独立的解锁支路可以分开完成，但通球顺序由路线决定。',
  difficulty: '困难',
  shafts: [
    ['A', 'top', 0],
    ['B', 'front', 0],
    ['C', 'bottom', 2],
    ['D', 'back', 2],
  ],
  latches: [
    ['lock-B', 'B', 'left', [['A', [1]]]],
    ['lock-D', 'D', 'right', [['C', [0]]]],
  ],
  preparation: [
    ['shaft', 'A', 1],
    ['latch', 'lock-B'],
    ['shaft', 'C', 0],
    ['latch', 'lock-D'],
  ],
  route: [
    ['B', [2]],
    ['D', [1]],
    ['A', [2]],
    ['C', [1]],
    ['B', [0]],
    ['D', [0]],
  ],
});

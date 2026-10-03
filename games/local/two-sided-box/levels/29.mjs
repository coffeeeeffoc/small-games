/** 先处理依赖链，之后跟随小球而不是跟随锁扣顺序。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'triad-alternation',
  number: 29,
  title: '轮换节拍',
  subtitle: '每过一门换一次观察面',
  intro: '六道单孔板轮流归属于 A、B、C。初始解锁顺序与通球顺序正好相反。',
  lesson: '先处理依赖链，之后跟随小球而不是跟随锁扣顺序。',
  difficulty: '挑战',
  shafts: [
    ['A', 'left', 0],
    ['B', 'top', 0],
    ['C', 'back', 2],
  ],
  latches: [
    ['lock-A', 'A', 'right', [['B', [2]]]],
    ['lock-B', 'B', 'bottom', [['C', [0]]]],
  ],
  preparation: [
    ['shaft', 'C', 0],
    ['latch', 'lock-B'],
    ['shaft', 'B', 2],
    ['latch', 'lock-A'],
  ],
  route: [
    ['A', [1]],
    ['B', [0]],
    ['C', [1]],
    ['A', [2]],
    ['B', [1]],
    ['C', [2]],
    ['A', [0]],
  ],
});

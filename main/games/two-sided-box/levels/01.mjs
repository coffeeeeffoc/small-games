/** 轴和锁扣可能位于不同的面；提示可以揭示还看不到的面。 */
import { defineLevel } from './shared.mjs';

export default defineLevel({
  id: 'first-turn',
  number: 1,
  title: '第一把锁',
  subtitle: '观察面与操作面',
  intro: 'A 轴在前面，固定它的锁扣在后面。先找到锁扣，再让球穿过高位孔。',
  lesson: '轴和锁扣可能位于不同的面；提示可以揭示还看不到的面。',
  difficulty: '入门',
  shafts: [['A', 'front', 0]],
  latches: [['lock-A', 'A', 'back', []]],
  preparation: [['latch', 'lock-A']],
  route: [['A', [2], '高位起步门']],
});

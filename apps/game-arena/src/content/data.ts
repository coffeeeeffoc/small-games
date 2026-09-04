import type { DynamicContentEnvelope } from '@coffeeeeffoc/content-schema';
import type { ArenaContent } from './schema.js';

/** Built-in five-league content used by standalone and test hosts. */
export const defaultArenaContent: ArenaContent = {
  ranks: ['废铁组', '塑料组', '合金组', '超频组', '传说组'],
  rivals: [
    ['纸箱拳王', '🐈'],
    ['食堂霸主', '🦆'],
    ['赛博保安', '🦍'],
    ['量子猛男', '🦈'],
    ['最终老板', '🐲'],
  ],
  species: [
    ['赛博鸡', '🐔'],
    ['朋克鹅', '🪿'],
    ['加班水豚', '🦫'],
    ['机械柴犬', '🐕'],
  ],
  traits: [
    { name: '过载核心', icon: '⚡', attack: 8, hp: -4, speed: 0.3, desc: '攻击更快，但有点漏电' },
    { name: '合金饭盆', icon: '🥣', attack: 1, hp: 18, speed: -0.1, desc: '谁也不能打翻它的饭' },
    { name: '喷火腺体', icon: '🔥', attack: 11, hp: 0, speed: 0, desc: '每口气都很有杀伤力' },
    { name: '量子鸡腿', icon: '🍗', attack: 4, hp: 6, speed: 0.25, desc: '同时存在于饿与不饿之间' },
    { name: '反伤尖刺', icon: '📌', attack: 5, hp: 9, speed: -0.1, desc: '拥抱它需要一点勇气' },
    { name: '暴躁马达', icon: '💢', attack: 7, hp: 2, speed: 0.4, desc: '安静不在设计指标里' },
  ],
};
/** Versioned envelope for the built-in arena content. */
export const defaultArenaEnvelope: DynamicContentEnvelope<ArenaContent> = {
  gameId: 'arena',
  schemaVersion: 1,
  revision: 1,
  payload: defaultArenaContent,
};

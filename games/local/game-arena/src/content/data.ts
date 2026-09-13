import type { DynamicContentEnvelope } from '@coffeeeeffoc/content-schema';
import type { ArenaContent } from './schema.js';

/** Built-in five-league content used by standalone and test hosts. */
export const defaultArenaContent: ArenaContent = {
  ranks: ['巷口初试', '茶摊交锋', '老街擂台', '秋夜争鸣', '虫王之争'],
  rivals: [
    ['乌头将军', '蟋'],
    ['铁背青', '蟋'],
    ['紫衣侯', '蟋'],
    ['铜牙王', '蟋'],
    ['秋夜虫王', '蟋'],
  ],
  species: [
    ['青背将军', '蟋'],
    ['紫翅油葫芦', '蟋'],
    ['金须大牙', '蟋'],
  ],
  traits: [
    { name: '黄豆补食', icon: '豆', attack: 3, hp: 16, speed: 0, desc: '补足体格，耐住对手的扑咬' },
    { name: '草梗练须', icon: '须', attack: 5, hp: 3, speed: 0.2, desc: '练习追草，蓄势更快' },
    { name: '清水养息', icon: '水', attack: 1, hp: 22, speed: 0, desc: '养足精气，打得更从容' },
    { name: '试牙练咬', icon: '牙', attack: 10, hp: -3, speed: 0, desc: '咬合更猛，以攻代守' },
    { name: '沙地走足', icon: '足', attack: 4, hp: 8, speed: 0.15, desc: '壮腿活身，出手利落' },
    {
      name: '静笼养神',
      icon: '笼',
      attack: 6,
      hp: 12,
      speed: -0.1,
      desc: '慢些蓄势，换来更足的底气',
    },
  ],
};
/** Versioned envelope for the built-in arena content. */
export const defaultArenaEnvelope: DynamicContentEnvelope<ArenaContent> = {
  gameId: 'arena',
  schemaVersion: 1,
  revision: 1,
  payload: defaultArenaContent,
};

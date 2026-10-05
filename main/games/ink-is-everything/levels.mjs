// 旧入口保留为兼容导出。所有章节与公共内容在 content/ 中维护。
export {
  CHAPTERS,
  CHAPTER_LIST,
  DEFAULT_CHAPTER_ID,
  DEFAULT_LEVEL_ID,
  LEVELS,
  LEVELS as levels,
  getChapter,
  resolveChapter,
} from './content/chapters/index.mjs';
export { EQUIPMENT, EQUIPMENT_IDS, SHOP_ITEMS } from './content/equipment.mjs';
export { RULES, PROGRESSION } from './content/rules.mjs';
export { SKILLS } from './content/skills.mjs';
export { ENEMY_TYPES } from './content/enemies.mjs';

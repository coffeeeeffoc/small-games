import chapterOne from './chapter-1.mjs';
import { RULES, PROGRESSION, skillRules } from '../rules.mjs';
import { ENEMY_TYPES } from '../enemies.mjs';
import { SKILLS } from '../skills.mjs';
import { EQUIPMENT, SHOP_ITEMS } from '../equipment.mjs';

/** 新章节仅需新增文件，并把导入加入此列表；UI 读取同一份列表。 */
const definitions = [chapterOne];

/** 章节可只调整一个字段，保留模板中未覆写的行为、名称与修正项。 */
function mergeCatalog(base, overrides = {}) {
  const result = {};
  for (const id of new Set([...Object.keys(base), ...Object.keys(overrides)])) {
    result[id] = { ...base[id], ...overrides[id] };
    if (base[id]?.modifiers || overrides[id]?.modifiers)
      result[id].modifiers = { ...base[id]?.modifiers, ...overrides[id]?.modifiers };
  }
  return result;
}

export function resolveChapter(chapter) {
  const skills = mergeCatalog(SKILLS, chapter.skills);
  const equipment = mergeCatalog(EQUIPMENT, chapter.equipment);
  return {
    ...chapter,
    rules: { ...RULES, ...skillRules(skills), ...chapter.rules },
    enemyTypes: mergeCatalog(ENEMY_TYPES, chapter.enemyTypes),
    skills,
    equipment,
    progression: { ...PROGRESSION, ...chapter.progression },
    shopItems:
      chapter.shopItems ??
      SHOP_ITEMS.map((offer) => ({
        ...offer,
        price: equipment[offer.itemId ?? offer.id]?.price ?? offer.price,
      })),
  };
}
export const CHAPTER_LIST = definitions.map(resolveChapter);
export const CHAPTERS = Object.fromEntries(CHAPTER_LIST.map((chapter) => [chapter.id, chapter]));
export const DEFAULT_CHAPTER_ID = CHAPTER_LIST[0].id;
export const LEVELS = CHAPTERS;
export const DEFAULT_LEVEL_ID = DEFAULT_CHAPTER_ID;
export function getChapter(id = DEFAULT_CHAPTER_ID) {
  const chapter = CHAPTERS[id];
  if (!chapter) throw new Error(`未知章节：${id}`);
  return chapter;
}

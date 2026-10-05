/**
 * Data contract for declarative chapters. No expressions, scripts, or dynamic
 * property names are executed: themes are selected from the renderer registry.
 */
export const BOX_IDS = Object.freeze(['red', 'blue', 'green']);
export const CHARACTER_IDS = Object.freeze(['blue', 'orange']);
export const ITEM_IDS = Object.freeze(['gift', 'key']);
export const THEME_IDS = Object.freeze(['birthday', 'afternoon', 'twilight']);

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const record = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function keys(value, allowed, path, errors) {
  if (!record(value)) {
    errors.push(path + ' 必须是普通对象');
    return false;
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(path + '.' + key + ' 是未知字段');
  }
  return true;
}

function text(value, path, errors, max = 500) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    errors.push(path + ' 必须是 1–' + max + ' 字的文字');
  }
}

function id(value, path, errors) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) {
    errors.push(path + ' 必须是最多 64 位的小写字母、数字或连字符标识');
  }
}

function memberArray(value, allowed, path, errors, minimum = 0) {
  if (!Array.isArray(value)) {
    errors.push(path + ' 必须是数组');
    return [];
  }
  if (value.length < minimum) errors.push(path + ' 至少需要 ' + minimum + ' 项');
  if (new Set(value).size !== value.length) errors.push(path + ' 不得重复');
  for (const entry of value) {
    if (!allowed.includes(entry)) errors.push(path + ' 包含未知标识 ' + String(entry));
  }
  return value.filter((entry) => allowed.includes(entry));
}

function locationMap(value, items, path, errors, complete) {
  if (!keys(value, items, path, errors)) return;
  for (const item of Object.keys(value)) {
    if (!BOX_IDS.includes(value[item])) errors.push(path + '.' + item + ' 必须指向红、蓝或绿箱');
  }
  if (complete) {
    for (const item of items) {
      if (!own(value, item)) errors.push(path + '.' + item + ' 缺少初始位置');
    }
  }
}

function actionShape(action, items, path, errors) {
  if (!record(action)) {
    errors.push(path + ' 必须是动作对象');
    return;
  }
  if (action.type === 'move') {
    keys(action, ['type', 'item', 'to'], path, errors);
    if (!items.includes(action.item)) errors.push(path + '.item 不是本关物品');
    if (!BOX_IDS.includes(action.to)) errors.push(path + '.to 不是有效箱子');
  } else if (['leave', 'return', 'screen'].includes(action.type)) {
    keys(action, ['type', 'character'], path, errors);
    if (!CHARACTER_IDS.includes(action.character)) errors.push(path + '.character 不是有效角色');
  } else {
    errors.push(path + '.type 不是有效动作');
  }
}

export function validateLevel(level) {
  const errors = [];
  if (
    !keys(
      level,
      [
        'id',
        'title',
        'theme',
        'intro',
        'objective',
        'hints',
        'items',
        'initial',
        'rules',
        'goals',
        'solution',
        'recommendedSteps',
      ],
      'level',
      errors,
    )
  )
    return { valid: false, errors };

  id(level.id, 'level.id', errors);
  text(level.title, 'level.title', errors, 80);
  text(level.intro, 'level.intro', errors);
  text(level.objective, 'level.objective', errors);
  id(level.theme, 'level.theme', errors);
  if (!Array.isArray(level.hints) || level.hints.length < 1 || level.hints.length > 8) {
    errors.push('level.hints 必须包含 1–8 条提示');
  } else {
    level.hints.forEach((hint, index) => text(hint, 'level.hints[' + index + ']', errors));
  }
  const items = memberArray(level.items, ITEM_IDS, 'level.items', errors, 1);
  let initialAway = 0;

  if (keys(level.initial, ['locations', 'characters'], 'level.initial', errors)) {
    locationMap(level.initial.locations, items, 'level.initial.locations', errors, true);
    if (keys(level.initial.characters, CHARACTER_IDS, 'level.initial.characters', errors)) {
      for (const character of CHARACTER_IDS) {
        const actor = level.initial.characters[character];
        const path = 'level.initial.characters.' + character;
        if (!keys(actor, ['present', 'beliefs'], path, errors)) continue;
        if (typeof actor.present !== 'boolean') errors.push(path + '.present 必须是布尔值');
        if (actor.present === false) initialAway += 1;
        locationMap(actor.beliefs, items, path + '.beliefs', errors, true);
      }
    }
  }
  if (
    keys(
      level.rules,
      ['screens', 'maxAway', 'canLeave', 'movableItems', 'requireEveryoneHome'],
      'level.rules',
      errors,
    )
  ) {
    if (
      !Number.isSafeInteger(level.rules.screens) ||
      level.rules.screens < 0 ||
      level.rules.screens > 32
    ) {
      errors.push('level.rules.screens 必须是 0–32 的整数');
    }
    if (![1, 2].includes(level.rules.maxAway)) errors.push('level.rules.maxAway 必须为 1 或 2');
    if (initialAway > level.rules.maxAway) errors.push('初始离场人数超过 maxAway');
    memberArray(level.rules.canLeave, CHARACTER_IDS, 'level.rules.canLeave', errors);
    memberArray(level.rules.movableItems, items, 'level.rules.movableItems', errors);
    if (level.rules.requireEveryoneHome !== true) errors.push('揭晓惊喜时必须要求所有角色在场');
  }

  let goalCount = 0;
  if (keys(level.goals, ['locations', 'beliefs'], 'level.goals', errors)) {
    locationMap(level.goals.locations, items, 'level.goals.locations', errors, false);
    if (record(level.goals.locations)) goalCount += Object.keys(level.goals.locations).length;
    if (keys(level.goals.beliefs, CHARACTER_IDS, 'level.goals.beliefs', errors)) {
      for (const character of CHARACTER_IDS) {
        const beliefs = level.goals.beliefs[character];
        locationMap(beliefs, items, 'level.goals.beliefs.' + character, errors, false);
        if (record(beliefs)) goalCount += Object.keys(beliefs).length;
      }
    }
  }
  if (goalCount === 0) errors.push('关卡至少需要一个位置或记忆目标');
  if (
    own(level, 'recommendedSteps') &&
    (!Number.isSafeInteger(level.recommendedSteps) ||
      level.recommendedSteps < 1 ||
      level.recommendedSteps > 1000)
  ) {
    errors.push('level.recommendedSteps 必须是 1–1000 的整数');
  }
  if (own(level, 'solution')) {
    if (!Array.isArray(level.solution) || level.solution.length > 256) {
      errors.push('level.solution 必须是最多 256 步的动作数组');
    } else {
      level.solution.forEach((action, index) =>
        actionShape(action, items, 'level.solution[' + index + ']', errors),
      );
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateChapter(chapter) {
  const errors = [];
  if (!keys(chapter, ['id', 'title', 'levels'], 'chapter', errors)) return { valid: false, errors };
  id(chapter.id, 'chapter.id', errors);
  text(chapter.title, 'chapter.title', errors, 80);
  if (!Array.isArray(chapter.levels) || chapter.levels.length === 0) {
    errors.push('chapter.levels 必须是非空关卡数组');
  } else {
    const ids = new Set();
    chapter.levels.forEach((level, index) => {
      const result = validateLevel(level);
      errors.push(...result.errors.map((error) => '第 ' + (index + 1) + ' 关：' + error));
      if (record(level) && typeof level.id === 'string') {
        if (ids.has(level.id)) errors.push('关卡 id 重复：' + level.id);
        ids.add(level.id);
      }
    });
  }
  return { valid: errors.length === 0, errors };
}

import { BOX_IDS, CHARACTER_IDS, validateLevel } from './schema.js';
export {
  BOX_IDS,
  CHARACTER_IDS,
  ITEM_IDS,
  THEME_IDS,
  validateLevel,
  validateChapter,
} from './schema.js';

const CHARACTERS = { blue: '小蓝', orange: '小橙' };
const ITEMS = { gift: '礼物', key: '钥匙' };
const BOXES = { red: '红箱', blue: '蓝箱', green: '绿箱' };

export function createState(level) {
  const validation = validateLevel(level);
  if (!validation.valid) throw new Error('关卡配置无效：' + validation.errors.join('；'));
  const characters = {};
  for (const character of CHARACTER_IDS) {
    const initial = level.initial.characters[character];
    characters[character] = {
      present: initial.present,
      beliefs: { ...initial.beliefs },
      // Step zero records the supplied opening history, not an omniscient view
      // of today's actual location. Opening false beliefs remain false.
      lastSeen: Object.fromEntries(
        level.items.map((item) => [
          item,
          { step: 0, from: initial.beliefs[item], to: initial.beliefs[item] },
        ]),
      ),
    };
  }
  return {
    levelId: level.id,
    locations: { ...level.initial.locations },
    characters,
    screensRemaining: level.rules.screens,
    screenTarget: null,
    steps: 0,
    moveCount: 0,
    events: [],
  };
}

function copyState(state) {
  return {
    ...state,
    locations: { ...state.locations },
    characters: Object.fromEntries(
      CHARACTER_IDS.map((character) => [
        character,
        {
          ...state.characters[character],
          beliefs: { ...state.characters[character].beliefs },
          lastSeen: { ...state.characters[character].lastSeen },
        },
      ]),
    ),
    events: [...state.events],
  };
}

function failure(state, code, message) {
  return { ok: false, state, code, message };
}

export function applyAction(level, state, action) {
  if (!state || state.levelId !== level.id)
    return failure(state, 'level-mismatch', '请先打开对应关卡。');
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    return failure(state, 'invalid-action', '这个操作无法执行。');
  }
  const awayCount = CHARACTER_IDS.filter(
    (character) => !state.characters[character].present,
  ).length;
  if (action.type === 'move') {
    if (!level.items.includes(action.item) || !level.rules.movableItems.includes(action.item)) {
      return failure(state, 'item-fixed', '这件物品在本关不能搬动。');
    }
    if (!BOX_IDS.includes(action.to)) return failure(state, 'unknown-box', '请放进红、蓝或绿箱。');
    if (state.locations[action.item] === action.to) {
      return failure(state, 'same-box', '物品已经在这个箱子里；搬到另一个箱子才会产生目击。');
    }
  } else if (['leave', 'return', 'screen'].includes(action.type)) {
    if (!CHARACTER_IDS.includes(action.character))
      return failure(state, 'unknown-character', '找不到这个角色。');
    const present = state.characters[action.character].present;
    if (action.type === 'leave') {
      if (!present) return failure(state, 'already-away', '这位朋友已经去倒茶了。');
      if (!level.rules.canLeave.includes(action.character)) {
        return failure(
          state,
          'cannot-leave',
          CHARACTERS[action.character] + '在这一关需要留在房间。',
        );
      }
      if (awayCount >= level.rules.maxAway)
        return failure(state, 'away-limit', '倒茶名额已满，请先叫一位朋友回来。');
    } else if (action.type === 'return') {
      if (present) return failure(state, 'already-home', '这位朋友已经在房间里了。');
    } else {
      if (!present) return failure(state, 'screen-away', '朋友回来后，才能把屏风摆在面前。');
      if (state.screenTarget !== null)
        return failure(state, 'screen-pending', '屏风已经摆好，会挡住下一次搬运。');
      if (state.screensRemaining <= 0)
        return failure(state, 'no-screens', '本关屏风已用完；可以免费撤销。');
    }
  } else {
    return failure(state, 'invalid-action', '这个操作无法执行。');
  }

  const next = copyState(state);
  next.steps += 1;
  const event = { step: next.steps, type: action.type, observers: [], missed: [] };
  if (action.type === 'move') {
    event.item = action.item;
    event.from = state.locations[action.item];
    event.to = action.to;
    next.locations[action.item] = action.to;
    next.moveCount += 1;
    for (const character of CHARACTER_IDS) {
      if (!state.characters[character].present) {
        event.missed.push({ character, reason: 'away' });
      } else if (state.screenTarget === character) {
        event.missed.push({ character, reason: 'screen' });
      } else {
        event.observers.push(character);
        next.characters[character].beliefs[action.item] = action.to;
        next.characters[character].lastSeen[action.item] = {
          step: next.steps,
          from: event.from,
          to: action.to,
        };
      }
    }
    // A placed screen expires on the next real move, for either item, even if
    // its protected character left in the meantime. Invalid moves do not.
    if (state.screenTarget !== null) event.screenConsumed = state.screenTarget;
    next.screenTarget = null;
  } else {
    event.character = action.character;
    if (action.type === 'leave') next.characters[action.character].present = false;
    if (action.type === 'return') next.characters[action.character].present = true;
    if (action.type === 'screen') {
      next.screensRemaining -= 1;
      next.screenTarget = action.character;
    }
  }
  next.events.push(event);
  return { ok: true, state: next, event };
}

export function evaluateGoals(level, state) {
  const checks = [];
  for (const [item, expected] of Object.entries(level.goals.locations)) {
    checks.push({
      key: 'location:' + item,
      pass: state.locations[item] === expected,
      label: ITEMS[item] + '实际在' + BOXES[expected],
      expected,
      actual: state.locations[item],
    });
  }
  for (const character of CHARACTER_IDS) {
    for (const [item, expected] of Object.entries(level.goals.beliefs[character])) {
      checks.push({
        key: 'belief:' + character + ':' + item,
        pass: state.characters[character].beliefs[item] === expected,
        label: CHARACTERS[character] + '先去' + BOXES[expected] + '找' + ITEMS[item],
        expected,
        actual: state.characters[character].beliefs[item],
      });
    }
    checks.push({
      key: 'home:' + character,
      pass: state.characters[character].present,
      label: CHARACTERS[character] + '已经回到房间',
      expected: true,
      actual: state.characters[character].present,
    });
  }
  const ready = CHARACTER_IDS.every((character) => state.characters[character].present);
  // Freeze first destinations before the reveal animation. Looking into an
  // empty box during that animation must not rewrite another character's plan.
  const visits = CHARACTER_IDS.flatMap((character) =>
    level.items.map((item) => ({
      character,
      item,
      to: state.characters[character].beliefs[item],
    })),
  );
  return { success: ready && checks.every((check) => check.pass), ready, checks, visits };
}

export function replayActions(level, actions) {
  if (!Array.isArray(actions)) throw new TypeError('回放动作必须是数组。');
  let state = createState(level);
  for (let index = 0; index < actions.length; index += 1) {
    const result = applyAction(level, state, actions[index]);
    if (!result.ok) {
      const error = new Error('第 ' + (index + 1) + ' 步无法执行：' + result.message);
      error.code = result.code;
      error.actionIndex = index;
      throw error;
    }
    state = result.state;
  }
  return state;
}

export function legalActions(level, state) {
  const actions = [];
  for (const item of level.rules.movableItems) {
    for (const to of BOX_IDS) {
      if (state.locations[item] !== to) actions.push({ type: 'move', item, to });
    }
  }
  const awayCount = CHARACTER_IDS.filter(
    (character) => !state.characters[character].present,
  ).length;
  for (const character of CHARACTER_IDS) {
    if (state.characters[character].present) {
      if (level.rules.canLeave.includes(character) && awayCount < level.rules.maxAway) {
        actions.push({ type: 'leave', character });
      }
      if (state.screenTarget === null && state.screensRemaining > 0) {
        actions.push({ type: 'screen', character });
      }
    } else {
      actions.push({ type: 'return', character });
    }
  }
  return actions;
}

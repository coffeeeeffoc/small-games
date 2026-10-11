import { LEVELS } from './content.mjs';
import { createGame, placeStriker, remaining } from './core.mjs';
export const SAVE_KEY = 'carrom-club:v1';
export const freshSave = () => ({
  version: 1,
  stars: {},
  wins: 0,
  sound: true,
  haptics: true,
  match: null,
});
export function validMatch(value) {
  if (
    !value ||
    value.version !== 1 ||
    value.phase !== 'ready' ||
    (value.levelId !== null && !LEVELS.some((l) => l.id === value.levelId))
  )
    return null;
  const level = LEVELS.find((entry) => entry.id === value.levelId);
  if (
    value.playerShots > value.shots ||
    value.fouls > value.playerShots ||
    (level && (value.playerShots !== value.shots || value.playerShots >= level.shots))
  )
    return null;
  const template = createGame(value.levelId);
  if (
    ![0, 1].includes(value.turn) ||
    (value.levelId && value.turn !== 0) ||
    !['board', 'none', 'covered', 'pending-0', 'pending-1'].includes(value.queen) ||
    ![null, 0, 1].includes(value.queenOwner)
  )
    return null;
  if (
    !['shots', 'playerShots', 'fouls'].every(
      (k) => Number.isSafeInteger(value[k]) && value[k] >= 0 && value[k] < 1e6,
    )
  )
    return null;
  if (
    !Array.isArray(value.debt) ||
    value.debt.length !== 2 ||
    value.debt.some((n) => !Number.isInteger(n) || n < 0 || n > 1e6)
  )
    return null;
  if (!Array.isArray(value.coins) || value.coins.length !== template.coins.length) return null;
  for (let i = 0; i < value.coins.length; i++) {
    const c = value.coins[i],
      base = template.coins[i];
    if (
      !c ||
      c.id !== base.id ||
      c.kind !== base.kind ||
      typeof c.pocketed !== 'boolean' ||
      ![c.x, c.y].every((n) => Number.isFinite(n) && n >= 65 && n <= 935)
    )
      return null;
    Object.assign(base, { x: c.x, px: c.x, y: c.y, py: c.y, pocketed: c.pocketed });
  }
  for (const k of ['turn', 'queen', 'queenOwner', 'shots', 'playerShots', 'fouls', 'debt'])
    template[k] = value[k];
  const queen = template.coins.find((coin) => coin.kind === 'queen');
  if (
    (queen ? value.queen === 'none' : value.queen !== 'none') ||
    (queen && queen.pocketed !== (value.queen !== 'board')) ||
    (value.queen === 'covered' ? value.queenOwner === null : value.queenOwner !== null) ||
    (value.queen.startsWith('pending') && value.queen !== `pending-${value.turn}`) ||
    ((value.queen === 'none' || value.queen === 'covered') &&
      (remaining(template, 0) === 0 || (!level && remaining(template, 1) === 0)))
  )
    return null;
  template.message = '对局已恢复 · 从这一杆继续';
  if (!placeStriker(template, Number.isFinite(value.striker?.x) ? value.striker.x : 500))
    return null;
  return template;
}
export function readSave(storage) {
  const save = freshSave();
  try {
    const data = JSON.parse(storage.getItem(SAVE_KEY));
    if (data?.version !== 1) return save;
    for (const l of LEVELS)
      if (Number.isInteger(data.stars?.[l.id]) && data.stars[l.id] >= 1 && data.stars[l.id] <= 3)
        save.stars[l.id] = data.stars[l.id];
    save.wins = Number.isSafeInteger(data.wins) && data.wins >= 0 ? data.wins : 0;
    save.sound = data.sound !== false;
    save.haptics = data.haptics !== false;
    save.match = validMatch(data.match);
  } catch {
    /* A disabled or damaged save must not block a local game. */
  }
  return save;
}
export function writeSave(storage, save) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}
export const unlocked = (save, index) =>
  Number.isInteger(index) &&
  index >= 0 &&
  index < LEVELS.length &&
  (index === 0 || LEVELS.slice(0, index).every((l) => save.stars[l.id] > 0));

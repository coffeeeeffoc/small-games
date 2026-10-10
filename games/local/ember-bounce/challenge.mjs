import { levelById } from './levels.mjs';

export const CHALLENGE_KEYS = ['emberChallenge', 'level', 'turns'];

export function validateChallenge(value) {
  if (!value || value.version !== 1 || !levelById(value.levelId)) return null;
  if (!Number.isSafeInteger(value.turns) || value.turns < 1 || value.turns > 1000) return null;
  return { version: 1, levelId: value.levelId, turns: value.turns };
}

export function readChallenge(value) {
  try {
    const params = new URL(value).searchParams;
    if (CHALLENGE_KEYS.some((key) => params.getAll(key).length !== 1)) return null;
    if (params.get('emberChallenge') !== '1' || !/^[1-9]\d{0,3}$/.test(params.get('turns'))) return null;
    return validateChallenge({ version: 1, levelId: params.get('level'), turns: Number(params.get('turns')) });
  } catch {
    return null;
  }
}

export function challengeParams(value) {
  const challenge = validateChallenge(value);
  return challenge ? { emberChallenge: '1', level: challenge.levelId, turns: String(challenge.turns) } : null;
}

export function compareChallenge(completedTurns, target) {
  return completedTurns < target ? `少用 ${target - completedTurns} 轮，挑战成功！`
    : completedTurns === target ? '同样的轮数，追平好友！'
      : `多用了 ${completedTurns - target} 轮，再试一次更好的角度。`;
}

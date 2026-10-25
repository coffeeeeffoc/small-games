import { levelById } from './levels.mjs';

export const CHALLENGE_KEYS = ['emberChallenge', 'level', 'turns'];
export const CHALLENGE_VERSION = 2;

export function validateChallenge(value) {
  if (!value || value.version !== CHALLENGE_VERSION || !levelById(value.levelId)) return null;
  if (!Number.isSafeInteger(value.turns) || value.turns < 1 || value.turns > 1000) return null;
  return { version: CHALLENGE_VERSION, levelId: value.levelId, turns: value.turns };
}

export function readChallenge(value) {
  try {
    const params = new URL(value).searchParams;
    if (CHALLENGE_KEYS.some((key) => params.getAll(key).length !== 1)) return null;
    if (params.get('emberChallenge') !== String(CHALLENGE_VERSION) || !/^[1-9]\d{0,3}$/.test(params.get('turns'))) return null;
    return validateChallenge({ version: CHALLENGE_VERSION, levelId: params.get('level'), turns: Number(params.get('turns')) });
  } catch {
    return null;
  }
}

export function challengeParams(value) {
  const challenge = validateChallenge(value);
  return challenge ? { emberChallenge: String(CHALLENGE_VERSION), level: challenge.levelId, turns: String(challenge.turns) } : null;
}

export function compareChallenge(completedTurns, target) {
  return completedTurns < target ? `少用 ${target - completedTurns} 轮，挑战成功！`
    : completedTurns === target ? '同样的轮数，追平好友！'
      : `多用了 ${completedTurns - target} 轮，再试一次更好的角度。`;
}

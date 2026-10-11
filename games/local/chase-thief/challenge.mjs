import { LEVELS } from './levels.mjs';

export const CHALLENGE_KEYS = ['chaseChallenge', 'level', 'time', 'mistakes'];
export function readChallenge(value) {
  try {
    const query = new URL(value).searchParams;
    if (CHALLENGE_KEYS.some((key) => query.getAll(key).length !== 1)) return null;
    if (query.get('chaseChallenge') !== '1' || !LEVELS.some((l) => l.id === query.get('level')))
      return null;
    if (!/^\d{1,2}\.\d$/.test(query.get('time')) || !/^[0-2]$/.test(query.get('mistakes')))
      return null;
    const time = Number(query.get('time'));
    if (time <= 0 || time > 60) return null;
    return { levelId: query.get('level'), time, mistakes: Number(query.get('mistakes')) };
  } catch {
    return null;
  }
}
export function challengeParams(run) {
  if (!run || run.phase !== 'won' || run.practice || !LEVELS.some((l) => l.id === run.levelId))
    return null;
  if (
    !Number.isFinite(run.elapsed) ||
    run.elapsed <= 0 ||
    run.elapsed > 60 ||
    !Number.isInteger(run.collisions) ||
    run.collisions < 0 ||
    run.collisions > 2
  )
    return null;
  return {
    chaseChallenge: 1,
    level: run.levelId,
    time: run.elapsed.toFixed(1),
    mistakes: run.collisions,
  };
}
export function compareChallenge(run, target) {
  if (run.phase !== 'won') return '再试一次，先稳稳抓到他。';
  const time = Number(run.elapsed.toFixed(1));
  if (time <= target.time && run.collisions <= target.mistakes)
    return time === target.time && run.collisions === target.mistakes
      ? '追平好友！同一路线，一样稳。'
      : '挑战成功！更快、更稳地抓到了。';
  return `目标 ${target.time.toFixed(1)} 秒 / 失误不超过 ${target.mistakes} 次，再追一次。`;
}

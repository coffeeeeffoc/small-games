import { LEVELS } from './levels.mjs';
export const CHALLENGE_KEYS = ['rallyChallenge', 'level', 'time', 'survivors'];
export function readChallenge(value) {
  try {
    const q = new URL(value).searchParams;
    if (CHALLENGE_KEYS.some((k) => q.getAll(k).length !== 1) || q.get('rallyChallenge') !== '1')
      return null;
    if (
      !LEVELS.some((l) => l.id === q.get('level')) ||
      !/^[1-9]\d{0,2}$/.test(q.get('time')) ||
      !/^[1-6]$/.test(q.get('survivors'))
    )
      return null;
    const time = Number(q.get('time'));
    if (time > 180) return null;
    return { levelId: q.get('level'), time, survivors: Number(q.get('survivors')) };
  } catch {
    return null;
  }
}
export function challengeParams(battle, practice = false) {
  if (
    !battle ||
    practice ||
    battle.mode !== 'campaign' ||
    battle.status !== 'won' ||
    !LEVELS.some((l) => l.id === battle.level.id)
  )
    return null;
  const survivors = battle.units.filter((u) => u.side === 'blue' && u.hp > 0).length;
  if (
    !Number.isFinite(battle.time) ||
    battle.time <= 0 ||
    battle.time > 180 ||
    survivors < 1 ||
    survivors > 6
  )
    return null;
  return { rallyChallenge: 1, level: battle.level.id, time: Math.ceil(battle.time), survivors };
}
export function compareChallenge(battle, target) {
  const result = challengeParams(battle);
  if (!result) return '挑战尚未完成，整军再来。';
  return result.survivors >= target.survivors && result.time <= target.time
    ? '挑战成功！保住士兵，也赶上了时间。'
    : `目标：保全 ${target.survivors} 人，${target.time} 秒内夺旗。`;
}
/** A visible timing aid derived only from the authored volley state. */
export function volleyBeat(battle) {
  const { volley: v, level } = battle;
  const durations = {
    warning: level.warning,
    gap: level.volleyGap,
    impact: 0.45,
    reload: v.serial ? level.reload : 5,
  };
  const counterattack =
    v.phase === 'silent' || (v.phase === 'reload' && v.serial > 0 && v.timer > level.reload - 2);
  return {
    counterattack,
    fraction:
      v.phase === 'silent' ? 1 : Math.max(0, Math.min(1, v.timer / (durations[v.phase] || 1))),
  };
}

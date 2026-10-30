import {
  createDuel,
  advanceDuel,
  commandDuel,
  viewDuel,
  DUEL_VERSION,
  MODS,
  takeoverDuel,
} from '../../../games/local/night-overwatch/assets/scripts/core/Duel.ts';

const copy = (state) => structuredClone(state);
export default {
  id: 'night-overwatch',
  title: '夜航守望',
  version: DUEL_VERSION,
  duel: true,
  nightMods: MODS,
  unrated: true,
  lobby: true,
  noTimeLimit: true,
  durationMs: 24 * 60 * 60 * 1000,
  takeover: (state, seat) => takeoverDuel(copy(state), seat),
  pollMs: 100,
  modes: [
    { id: 'friend', title: '好友对战' },
    { id: 'match', title: '随机匹配' },
    { id: 'bot', title: '服务器陪练' },
  ],
  roomSize: (mode) => (mode === 'bot' ? 1 : 2),
  initial: (seed, mode, _role, loadouts) =>
    createDuel(
      seed,
      mode === 'bot',
      loadouts && [loadouts[0] ?? [], loadouts[1] ?? (mode === 'bot' ? (loadouts[0] ?? []) : [])],
    ),
  advance: (state, elapsedMs) => advanceDuel(copy(state), elapsedMs),
  view: (state, seat) => viewDuel(copy(state), seat),
  action(state, action, elapsedMs, seat) {
    if (
      !action ||
      typeof action !== 'object' ||
      Array.isArray(action) ||
      Object.keys(action).some((key) => !['commands', 'keepAlive'].includes(key)) ||
      !Array.isArray(action.commands) ||
      action.commands.length > 64 ||
      (action.keepAlive !== undefined && action.keepAlive !== true)
    )
      throw Error('Invalid duel action');
    return commandDuel(advanceDuel(copy(state), elapsedMs), seat, action.commands);
  },
  result(state, seat) {
    return {
      finished: state.finished,
      eligible: state.finished,
      outcome: state.winner === null ? 'draw' : state.winner === seat ? 'win' : 'loss',
      score: state.finished && state.winner === seat ? 1 : 0,
      secondary: Math.round((state.ticks * 1000) / 60),
    };
  },
};

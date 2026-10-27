import {
  createDuel,
  advanceDuel,
  commandDuel,
  viewDuel,
  DUEL_VERSION,
  DUEL_SECONDS,
} from '../../../games/local/night-overwatch/assets/scripts/core/Duel.ts';

const copy = (state) => structuredClone(state);
export default {
  id: 'night-overwatch',
  title: '夜航守望',
  version: DUEL_VERSION,
  duel: true,
  unrated: true,
  durationMs: DUEL_SECONDS * 1000,
  pollMs: 200,
  modes: [
    { id: 'friend', title: '好友对战' },
    { id: 'match', title: '随机匹配' },
    { id: 'bot', title: '服务器陪练' },
  ],
  roomSize: (mode) => (mode === 'bot' ? 1 : 2),
  initial: (seed, mode) => createDuel(seed, mode === 'bot'),
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
      eligible: false,
      score: state.finished && state.winner === seat ? 1 : 0,
      secondary: Math.round((state.ticks * 1000) / 60),
    };
  },
};

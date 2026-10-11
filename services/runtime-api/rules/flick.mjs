import { shoot, step, skipTurn, physics } from '../../../games/local/flick-arena/src/core.mjs';
import {
  createTournament,
  createTournamentMatch,
  recordTournamentRound,
  nextTournamentRound,
  tournamentStandings,
} from '../../../games/local/flick-arena/src/tournament.mjs';

const durationMs = 20 * 60_000;
const intermissionMs = 20000;
const modes = [
  { id: 'duel', title: '双人 · 三局两胜' },
  { id: 'party3', title: '三人 · 三局积分' },
  { id: 'party4', title: '四人 · 四局积分' },
  { id: 'duel-relaxed', title: '双人 · 宽松计时' },
  { id: 'party3-relaxed', title: '三人 · 宽松计时' },
  { id: 'party4-relaxed', title: '四人 · 宽松计时' },
];
const roomSize = (mode = 'duel') =>
  mode.startsWith('party3') ? 3 : mode.startsWith('party4') ? 4 : 2;
const playerId = (seat) => `player-${seat + 1}`;

function simulate(match) {
  let frames = 0;
  while (match.phase === 'moving' || match.phase === 'shrinking') {
    if (++frames > 3000) throw new Error('Physics did not settle');
    step(match, physics.step);
  }
  return Math.ceil(frames * physics.step * 1000);
}
function finishTurn(state, at) {
  if (state.match.phase === 'over') {
    recordTournamentRound(state.series, state.match);
    state.turnStartsAtMs = null;
    state.turnDeadlineMs = null;
    state.nextRoundAtMs = state.series.phase === 'finished' ? null : at + intermissionMs;
    state.nextReady = [];
  } else {
    state.turnStartsAtMs = at;
    state.turnDeadlineMs = at + state.series.turnSeconds * 1000;
  }
}
function nextRound(state, at) {
  if (!nextTournamentRound(state.series)) return;
  state.match = createTournamentMatch(state.series);
  state.nextRoundAtMs = null;
  state.nextReady = [];
  state.lastShot = null;
  state.revision++;
  finishTurn(state, at);
}
function advanceMutable(state, elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error('Invalid server clock');
  state.elapsedMs = Math.max(state.elapsedMs, Math.min(durationMs, elapsedMs));
  let steps = 0;
  while (state.series.phase !== 'finished' && steps++ < 1024) {
    if (state.nextRoundAtMs !== null) {
      if (state.elapsedMs < state.nextRoundAtMs) break;
      nextRound(state, state.nextRoundAtMs);
    } else {
      if (state.turnDeadlineMs === null || state.elapsedMs < state.turnDeadlineMs) break;
      const at = state.turnDeadlineMs;
      const seat = state.series.players.findIndex(
        (player) => player.id === state.match.seats[state.match.active],
      );
      if (!skipTurn(state.match)) throw new Error('Cannot skip turn');
      const animationMs = simulate(state.match);
      state.revision++;
      state.lastShot = null;
      state.lastTimeout = { seat, at };
      finishTurn(state, at + animationMs);
    }
  }
  if (state.elapsedMs >= durationMs && state.series.phase !== 'finished') {
    // A completely absent room ends without inventing a winning player or scores.
    state.series.phase = 'finished';
    state.series.winnerId = null;
    state.reason = 'time-limit';
    state.turnDeadlineMs = null;
    state.nextRoundAtMs = null;
    state.revision++;
  }
  return state;
}

export default {
  id: 'flick-arena',
  title: '弹指擂台 · 好友赛',
  version: 'flick-series-v1',
  durationMs,
  duel: true,
  unrated: true,
  roomSize,
  pollMs: 800,
  modes,
  description:
    '双人三局两胜；三至四人轮换先手与出生位积分赛，同分加赛。每手10秒（宽松15秒），超时跳过，第3整轮起收圈。本场积分不计入全站排位。',
  initial(seed, mode = 'duel') {
    if (!modes.some((item) => item.id === mode)) throw new Error('Invalid mode');
    const series = createTournament({
      players: roomSize(mode),
      seed,
      turnSeconds: mode.endsWith('-relaxed') ? 15 : 10,
    });
    const state = {
      series,
      match: createTournamentMatch(series),
      revision: 0,
      elapsedMs: 0,
      turnStartsAtMs: 0,
      turnDeadlineMs: series.turnSeconds * 1000,
      nextRoundAtMs: null,
      nextReady: [],
      lastShot: null,
      lastTimeout: null,
      reason: null,
    };
    return state;
  },
  advance(state, elapsedMs) {
    return advanceMutable(structuredClone(state), elapsedMs);
  },
  view(state) {
    return structuredClone(state);
  },
  action(state, input, elapsedMs, seat) {
    if (!Number.isInteger(seat) || seat < 0 || seat >= state.series.players.length)
      throw new Error('Invalid seat');
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new Error('Invalid action');
    const next = advanceMutable(structuredClone(state), elapsedMs);
    if (next.series.phase === 'finished') throw new Error('Series finished');
    if (input.type === 'next') {
      if (
        Object.keys(input).some((key) => !['type', 'revision', 'roundId'].includes(key)) ||
        next.series.phase !== 'round-result' ||
        input.roundId !== next.match.tournamentRoundId
      )
        throw new Error('Stale round');
      if (!next.nextReady.includes(seat)) next.nextReady.push(seat);
      if (next.nextReady.length === next.series.players.length) nextRound(next, next.elapsedMs);
      return next;
    }
    if (
      input.type !== 'shoot' ||
      Object.keys(input).some((key) => !['type', 'revision', 'x', 'y', 'power'].includes(key)) ||
      ![input.x, input.y, input.power].every(Number.isFinite) ||
      Math.abs(input.x) > 10000 ||
      Math.abs(input.y) > 10000 ||
      input.power < 0.08 ||
      input.power > 1 ||
      !Number.isInteger(input.revision) ||
      input.revision !== next.revision ||
      next.series.phase !== 'playing' ||
      next.match.phase !== 'aim' ||
      next.elapsedMs < next.turnStartsAtMs ||
      next.match.seats[next.match.active] !== playerId(seat)
    )
      throw new Error('Illegal or stale shot');
    const before = structuredClone(next.match);
    if (!shoot(next.match, input.x, input.y, input.power)) throw new Error('Illegal shot');
    const animationMs = simulate(next.match);
    next.revision++;
    next.lastShot = {
      revision: next.revision,
      before,
      x: input.x,
      y: input.y,
      power: input.power,
      seat,
      at: next.elapsedMs,
      animationMs,
    };
    finishTurn(next, next.elapsedMs + animationMs);
    return next;
  },
  result(state, seat = 0) {
    const standing = tournamentStandings(state.series).find((item) => item.id === playerId(seat));
    return {
      finished: state.series.phase === 'finished',
      eligible: false,
      score: standing?.score ?? 0,
      secondary: 0,
    };
  },
};

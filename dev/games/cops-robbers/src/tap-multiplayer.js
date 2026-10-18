import { getDuelLevel, duelLevels } from './duel-levels.js';
import { initialDuel, stepDuel } from './duel.js';
import { createRenderer } from './competition-renderer.js';

const roles = ['pursuer', 'runner'];
export const tapMultiplayer = {
  id: 'cops-robbers',
  title: '围捕小队',
  version: 1,
  durationTicks: 36000,
  modes: [
    { id: 'escape', title: '出口竞速' },
    { id: 'survival', title: '限步周旋' },
  ],
  seats: ['追逐队', '突围队'],
  createRenderer,
  initial({ seed, mode }) {
    const maps = duelLevels.filter((level) => level.mode === mode);
    if (!maps.length || !Number.isSafeInteger(seed) || seed < 0) throw new Error('无效地图');
    const level = maps[seed % maps.length];
    return { mode, levelId: level.id, board: initialDuel(level), tick: 0 };
  },
  advance(state, tick) {
    if (!Number.isSafeInteger(tick) || tick < state.tick || tick > this.durationTicks)
      throw new Error('无效时钟');
    state.tick = tick;
    if (!state.board.winner && tick === this.durationTicks) state.timedOut = true;
  },
  apply(state, action, seat) {
    if (
      state.timedOut ||
      !action ||
      Array.isArray(action) ||
      !roles[seat] ||
      action.side !== roles[seat] ||
      Object.keys(action).some((key) => !['type', 'side', 'actor', 'target'].includes(key)) ||
      !Number.isInteger(action.actor) ||
      !Number.isInteger(action.target)
    )
      throw new Error('请选择自己队伍的合法行动');
    state.board = stepDuel(getDuelLevel(state.mode, state.levelId), state.board, action);
  },
  view(state, seat) {
    return {
      kind: 'cops-duel',
      mode: state.mode,
      levelId: state.levelId,
      board: state.board,
      role: roles[seat],
      elapsedMs: (state.tick * 1000) / 120,
    };
  },
  outcome: (state) =>
    state.board.winner
      ? `${state.board.winner === 'pursuer' ? '追逐队' : '突围队'}获胜`
      : state.timedOut
        ? '本局超时结束'
        : null,
};

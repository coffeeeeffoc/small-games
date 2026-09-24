import { getDuelLevel } from '../../../games/local/cops-robbers/src/duel-levels.js';
import { initialDuel, stepDuel } from '../../../games/local/cops-robbers/src/duel.js';

const roles = ['pursuer', 'runner'];
const durationMs = 300000;
const description =
  '双方分别操控追逐队与突围队，房间可交换角色并选择先手；出口竞速、限步周旋各100张地图，服务端随机抽图。每步移动一名队员或原地等待，双方交替行动；追逐队接触全部对手获胜，突围队抵达出口或撑过回合上限获胜。5分钟未完成由突围队获胜。胜3负0，双方都行动且至少4步才计分；每对身份每天仅首场有效对局计分（UTC日）。单机及旧挑战榜成绩不计入此榜。';
const levelOf = (state) => getDuelLevel(state.mode, state.levelId);
function advance(state, elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < state.elapsedMs) throw new Error('无效服务器时间');
  state.elapsedMs = elapsedMs;
  if (!state.board.winner && elapsedMs >= durationMs) state.board.winner = 'runner';
  return state;
}
export default {
  id: 'cops-robbers',
  title: '围捕小队 · 双队对抗',
  version: 'roles-initiative-duel-v2',
  durationMs,
  duel: true,
  roles,
  modes: [
    { id: 'escape', title: '出口竞速 · 100关' },
    { id: 'survival', title: '限步周旋 · 100关' },
  ],
  description,
  initial(seed, mode = 'escape', firstRole = 'pursuer') {
    const level = getDuelLevel(mode, (seed % 100) + 1);
    if (!level || !roles.includes(firstRole)) throw new Error('无效对战配置');
    return {
      levelId: level.id,
      mode,
      board: initialDuel(level, firstRole),
      firstRole,
      elapsedMs: 0,
      commands: [0, 0],
    };
  },
  advance,
  view(state, seat = 0) {
    const level = levelOf(state);
    return structuredClone({
      kind: 'cops-duel',
      levelId: state.levelId,
      mode: state.mode,
      board: state.board,
      map: { nodes: level.nodes, edges: level.edges, exits: level.exits },
      roundLimit: level.roundLimit,
      name: level.name,
      role: roles[seat],
      firstRole: state.firstRole,
      elapsedMs: state.elapsedMs,
      durationMs,
      rules: description,
    });
  },
  action(state, input, elapsedMs, seat) {
    if (
      !roles[seat] ||
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).some((key) => !['type', 'side', 'actor', 'target'].includes(key)) ||
      input.type !== 'move' ||
      input.side !== roles[seat] ||
      !Number.isInteger(input.actor) ||
      !Number.isInteger(input.target)
    )
      throw new Error('只可操控自己的队伍');
    const next = advance(structuredClone(state), elapsedMs);
    next.board = stepDuel(levelOf(next), next.board, input);
    next.commands[seat]++;
    return next;
  },
  result(state, seat = 0) {
    return {
      finished: Boolean(state.board.winner),
      eligible:
        Boolean(state.board.winner) &&
        state.board.turn >= 4 &&
        state.commands.every((count) => count > 0),
      score: state.board.winner === roles[seat] ? 3 : 0,
      secondary: 0,
    };
  },
};

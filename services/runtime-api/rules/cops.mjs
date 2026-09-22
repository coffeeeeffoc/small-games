import { levels } from '../../../games/local/cops-robbers/src/levels.js';
import { initialState, step } from '../../../games/local/cops-robbers/src/engine.js';

// One published map keeps the main board comparable across all clients.
const level = levels.find(item => item.id === 17);
const finished = state => state.board.robbers.includes(-2)
  || state.board.robbers.every(node => node === -1) || state.board.turn >= 200 || state.elapsedMs >= 300000;

export default {
  id: 'cops-robbers', title: '围捕小队 · 同图围捕', version: 'cooperation-map17-v1', durationMs: 300000,
  description: '固定第17图，初始位置与规则相同；每步移动一名警察，服务器复算小偷行动。全部捕获才上榜，步数更少优先，同步数比较服务器用时；最多200步、5分钟。单人提示/离线成绩不计榜。',
  initial() { return { levelId: level.id, board: initialState(level), elapsedMs: 0 }; },
  view(state) { return structuredClone(state); },
  action(state, action, elapsedMs) {
    if (finished(state)) throw new Error('本局已结束，请再来一局');
    if (!action || action.type !== 'move' || !Number.isInteger(action.cop)
      || action.cop < 0 || action.cop >= state.board.cops.length || !Number.isInteger(action.target)) {
      throw new Error('请选择警察与相邻路口');
    }
    const plan = [...state.board.cops];
    plan[action.cop] = action.target;
    return { ...state, board: step(level, state.board, plan).state, elapsedMs };
  },
  result(state) {
    const eligible = state.board.robbers.every(node => node === -1) && state.elapsedMs < 300000;
    return { finished: finished(state), eligible, score: -state.board.turn, secondary: state.elapsedMs };
  },
};

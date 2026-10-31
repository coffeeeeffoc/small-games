import {
  createRun,
  restoreRun,
  snapshotRun,
  applyInput,
  advanceTicks,
  runResult,
  RANKED_RULE_VERSION,
} from '../../../games/local/tetracube/assets/scripts/core/session.js';

export default {
  id: 'tetracube',
  title: '空间俄罗斯方块',
  version: RANKED_RULE_VERSION,
  boards: [
    {
      id: 'campaign',
      title: '关卡榜',
      guestAllowed: true,
      scoreUnit: '关',
      secondaryUnit: 'steps',
      description: '最高验证通关优先；同关操作步数更少优先。辅助局和开发试玩不计入。',
    },
    {
      id: 'endless',
      title: '积分榜',
      guestAllowed: true,
      scoreUnit: '分',
      secondaryUnit: 'steps',
      description: '单局服务端验证积分优先；同分操作步数更少优先。辅助局和恢复存档不计入。',
    },
  ],
  create(board, seed, levelId) {
    return snapshotRun(createRun(board, seed, levelId));
  },
  apply(state, frames) {
    const run = restoreRun(state);
    for (const { input, ticks } of frames) {
      applyInput(run, input);
      advanceTicks(run, ticks);
    }
    run.game.drainEvents();
    Object.assign(state, snapshotRun(run));
    return state;
  },
  result(state) {
    return runResult(restoreRun(state));
  },
};

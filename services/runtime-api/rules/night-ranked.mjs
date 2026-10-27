import {
  RANKED_RULE_VERSION,
  createNightReplay,
  applyNightReplay,
  nightReplayResult,
} from '../../../games/local/night-overwatch/assets/scripts/core/Replay.ts';
import { MISSIONS } from '../../../games/local/night-overwatch/assets/scripts/core/MissionCatalog.ts';

export default {
  id: 'night-overwatch',
  title: '夜航守望',
  version: RANKED_RULE_VERSION,
  boards: MISSIONS.map((mission) => ({
    id: `level-${mission.id}`,
    title: mission.name[0],
    guestAllowed: true,
    scoreUnit: '次',
    secondaryUnit: 'milliseconds',
    description: '本关经服务端验证的最快通关用时；辅助、试玩和失败不计入。',
  })),
  create(board, _seed, levelId) {
    if (board !== `level-${levelId}` || !MISSIONS.some((mission) => mission.id === levelId))
      throw Error('Invalid level');
    return createNightReplay('campaign', levelId);
  },
  apply: (state, frames) => applyNightReplay(structuredClone(state), frames),
  result(state) {
    const result = nightReplayResult(structuredClone(state));
    return { ...result, score: result.eligible ? 1 : 0 };
  },
};

import * as rescue from '../../../games/local/cage-rescue/src/core.mjs';
import * as tower from '../../../games/local/tower-brake/engine.mjs';
import { LEVELS as towerLevels } from '../../../games/local/tower-brake/levels.mjs';

const boards = (unit) => [
  {
    id: 'campaign',
    title: '闯关榜',
    guestAllowed: true,
    scoreUnit: '关',
    secondaryUnit: 'milliseconds',
    description: '最高验证通关关卡优先；同关按该关用时升序。试玩、好友挑战和复活不计入。',
  },
  {
    id: 'endless',
    title: '无尽榜',
    guestAllowed: true,
    scoreUnit: unit,
    secondaryUnit: 'milliseconds',
    description: `单次无尽挑战累计${unit === '人' ? '救援人数' : '穿越层数'}优先；同分按用时升序。试玩和复活不计入。`,
  },
];
function inputFields(input, allowed) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !allowed.includes(key))
  )
    throw new Error('Invalid action');
}
function create(board, seed, levelId, engine, levels) {
  if (board === 'endless') {
    if (levelId !== undefined) throw new Error('Endless has no campaign level');
    return { game: engine.createEndlessGame(seed), index: -1 };
  }
  const index = levels.findIndex((level) => level.id === levelId);
  if (board !== 'campaign' || index < 0) throw new Error('Unknown level');
  return {
    game: engine === rescue ? engine.createGame(index) : engine.createGame(levels[index]),
    index,
  };
}
function result(state, kind) {
  const game = state.game;
  const complete = ['won', 'lost'].includes(game.status);
  const endless = game.mode === 'endless';
  return {
    complete,
    eligible: complete && !game.usedRevive && !game.continued && (endless || game.status === 'won'),
    score: endless
      ? kind === 'rescue'
        ? game.totalRescued
        : game.totalFloors
      : game.status === 'won'
        ? state.index + 1
        : 0,
    secondary: Math.round((kind === 'rescue' ? game.realTime : game.elapsed) * 1000),
  };
}
export const rankedRules = [
  {
    id: 'cage-rescue',
    title: '打破笼子接住人',
    version: rescue.RANKED_RULE_VERSION,
    boards: boards('人'),
    create: (board, seed, levelId) => create(board, seed, levelId, rescue, rescue.LEVELS),
    apply(state, frames) {
      for (const { input, ticks } of frames) {
        inputFields(input, ['targetX', 'launch']);
        if (
          input.targetX !== undefined &&
          (!Number.isFinite(input.targetX) || Math.abs(input.targetX) > 10000)
        )
          throw new Error('Invalid position');
        if (input.launch !== undefined && typeof input.launch !== 'boolean')
          throw new Error('Invalid launch');
        if (!['ready', 'playing'].includes(state.game.phase)) throw new Error('Run ended');
        if (input.launch && !rescue.launchBall(state.game)) throw new Error('Cannot launch');
        if (input.targetX !== undefined) state.targetX = input.targetX;
        for (let tick = 0; tick < ticks; tick++) {
          if (!['ready', 'playing'].includes(state.game.phase)) throw new Error('Run ended');
          rescue.stepGame(state.game, 1 / 120, { targetX: state.targetX });
        }
      }
      state.game.events = [];
      return state;
    },
    result: (state) => result(state, 'rescue'),
  },
  {
    id: 'tower-brake',
    title: '穿云落星',
    version: tower.RANKED_RULE_VERSION,
    boards: boards('层'),
    create: (board, seed, levelId) => create(board, seed, levelId, tower, towerLevels),
    apply(state, frames) {
      for (const { input, ticks } of frames) {
        inputFields(input, ['rotation', 'brake']);
        if (
          input.rotation !== undefined &&
          (!Number.isFinite(input.rotation) || Math.abs(input.rotation) > 10000)
        )
          throw new Error('Invalid rotation');
        if (input.brake !== undefined && typeof input.brake !== 'boolean')
          throw new Error('Invalid brake');
        if (state.game.status !== 'playing') throw new Error('Run ended');
        if (input.rotation !== undefined) tower.rotate(state.game, input.rotation);
        if (input.brake && !tower.brake(state.game)) throw new Error('Cannot brake');
        for (let tick = 0; tick < ticks; tick++) {
          if (state.game.status !== 'playing') throw new Error('Run ended');
          tower.step(state.game, 1 / 120);
        }
      }
      state.game.events = [];
      return state;
    },
    result: (state) => result(state, 'tower'),
  },
];

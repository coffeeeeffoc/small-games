import {
  createGame,
  placeStriker,
  shoot,
  step,
  STEP,
  scoresFor,
} from '../../../games/local/carrom-club/src/core.mjs';

const durationMs = 30 * 60_000;
const description =
  '双方轮流出杆，本色棋子每枚1分，红后补进成功加3分。服务端统一模拟与计分；一方清台后按总分定胜负，同分清台方胜。30分钟未结束按当前分数结算，同分和局。好友榜胜3、和1、负0；认输或超时须双方均已出杆才计入，每对身份每天仅首场有效对局计分（UTC日）。';

function advance(state, elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error('无效服务器计时');
  const next = structuredClone(state);
  next.elapsedMs = Math.max(next.elapsedMs, Math.min(durationMs, elapsedMs));
  if (next.game.phase !== 'over' && next.elapsedMs >= durationMs) {
    const scores = scoresFor(next.game);
    next.game.phase = 'over';
    next.game.winner = scores[0] === scores[1] ? null : scores[0] > scores[1] ? 0 : 1;
    next.game.message = '时间到 · 按当前积分结算';
    next.reason = 'time-limit';
  }
  return next;
}

function action(state, input, elapsedMs, seat) {
  if (seat !== 0 && seat !== 1) throw new Error('无效玩家席位');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('无效操作');
  const allowed =
    input.type === 'shoot' ? ['type', 'x', 'dx', 'dy', 'power', 'expectedShot'] : ['type'];
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    throw new Error('只接受击球操作，不能提交成绩');
  if (!['shoot', 'resign'].includes(input.type)) throw new Error('未知操作');
  const next = advance(state, elapsedMs);
  if (next.game.phase === 'over') throw new Error('本局已结束');
  if (input.type === 'resign') {
    next.game.phase = 'over';
    next.game.winner = 1 - seat;
    next.game.message = '对手认输 · 本局结束';
    next.reason = 'resign';
    return next;
  }
  if (next.game.turn !== seat) throw new Error('尚未轮到你');
  if (
    !Number.isInteger(input.expectedShot) ||
    input.expectedShot < 0 ||
    input.expectedShot !== next.game.shots
  )
    throw new Error('棋盘已更新，请等待同步');
  if (
    !Number.isFinite(input.x) ||
    input.x < 235 ||
    input.x > 765 ||
    !Number.isFinite(input.dx) ||
    !Number.isFinite(input.dy) ||
    !Number.isFinite(Math.hypot(input.dx, input.dy)) ||
    Math.hypot(input.dx, input.dy) < 0.001 ||
    !Number.isFinite(input.power) ||
    input.power < 0.025 ||
    input.power > 1
  )
    throw new Error('无效的击球位置、方向或力度');
  if (!placeStriker(next.game, input.x)) throw new Error('击球底线被占满');
  next.game.events.length = 0;
  const before = structuredClone(next.game);
  if (!shoot(next.game, input.dx, input.dy, input.power)) throw new Error('当前不能击球');
  // Settle one bounded shot at the same fixed step used by clients. Poll frequency cannot
  // affect the outcome, and no client can submit positions, pocketed coins or a score.
  for (let tick = 0; next.game.phase === 'moving' && tick < Math.ceil(30 / STEP); tick++) {
    step(next.game, STEP);
    next.game.events.length = 0;
  }
  if (next.game.phase === 'moving') throw new Error('击球未能结算，请重试');
  next.lastShot = {
    id: next.game.shots,
    seat,
    x: before.striker.x,
    dx: input.dx,
    dy: input.dy,
    power: input.power,
    before,
  };
  if (next.game.phase === 'over') next.reason = 'clear';
  return next;
}

export default {
  id: 'carrom-club',
  title: '克朗棋 · 好友对战',
  version: 'carrom-points-duel-v1',
  durationMs,
  duel: true,
  pollMs: 800,
  description,
  initial() {
    return { game: createGame(), lastShot: null, elapsedMs: 0, reason: null };
  },
  advance,
  action,
  view(state, seat = 0) {
    return structuredClone({
      ...state,
      scores: scoresFor(state.game),
      durationMs,
      seat,
      finished: state.game.phase === 'over',
    });
  },
  result(state, seat = 0) {
    const finished = state.game.phase === 'over';
    const bothPlayed = state.game.playerShots > 0 && state.game.shots > state.game.playerShots;
    return {
      finished,
      eligible: finished && (state.reason === 'clear' || bothPlayed),
      score: !finished ? 0 : state.game.winner === null ? 1 : state.game.winner === seat ? 3 : 0,
      secondary: 0,
    };
  },
};

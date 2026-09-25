import { randomInt } from 'node:crypto';
import {
  newGame,
  draw,
  deploy,
  deployDirectly,
  move,
  TYPES,
} from '../../../games/submodules/xiangqi-five/game.js';

const durationMs = 15 * 60_000;
const sides = ['red', 'black'];
const random = () => randomInt(0x1000000) / 0x1000000;
const advance = (state, elapsedMs) => {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error('无效服务器计时');
  const next = structuredClone(state);
  next.elapsedMs = Math.max(next.elapsedMs, elapsedMs);
  if (!next.result && (next.elapsedMs >= durationMs || next.ply >= 600)) {
    next.result = 'draw';
    next.reason = next.ply >= 600 ? 'move-limit' : 'time-limit';
  }
  return next;
};

export default {
  id: 'xiangqi-five',
  title: '象五子棋 · 好友积分',
  version: 'xiangqi9x10-duel-v1',
  durationMs,
  duel: true,
  description:
    '9×10 自由部署：象棋走法，同色连五胜。胜3、和1、负0；每对身份每天仅首场有效对局计分（UTC日，北京时间08:00重置）。15分钟或600手和棋；不足10手的超时/认输不计分。单机、机器人及旧休闲房不计入本榜。',
  initial() {
    return { ...newGame('xiangqi'), elapsedMs: 0, reason: null };
  },
  advance,
  view(state, seat = 0) {
    const { mode, cols, rows, board, turn, pending, ply, result, winningLine, elapsedMs, reason } =
      state;
    return structuredClone({
      mode,
      cols,
      rows,
      board,
      turn,
      pending,
      ply,
      result,
      winningLine,
      elapsedMs,
      reason,
      seat,
      poolCounts: Object.fromEntries(
        sides.map((side) => [
          side,
          Object.fromEntries(
            TYPES.map((type) => [type, state.pools[side].filter((p) => p === type).length]),
          ),
        ]),
      ),
    });
  },
  action(state, input, elapsedMs, seat) {
    if (!sides[seat] || !Number.isInteger(seat)) throw new Error('无效玩家席位');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('无效棋步');
    if (Object.keys(input).some((key) => !['type', 'from', 'to'].includes(key)))
      throw new Error('只接受棋步，不能提交成绩');
    const next = advance(state, elapsedMs);
    if (next.result) throw new Error('本局已结束');
    if (input.type === 'resign') {
      next.result = sides[1 - seat];
      next.reason = 'resign';
      return next;
    }
    if (next.turn !== sides[seat]) throw new Error('尚未轮到你');
    if (input.type === 'draw') draw(next, random);
    else if (input.type === 'deploy-directly') deployDirectly(next, input.to, random);
    else if (input.type === 'deploy') deploy(next, input.to);
    else if (input.type === 'move') move(next, input.from, input.to);
    else throw new Error('未知棋步');
    if (next.result) next.reason = next.result === 'draw' ? 'no-action' : 'five';
    return advance(next, elapsedMs);
  },
  result(state, seat = 0) {
    const finished = Boolean(state.result);
    const eligible = finished && (state.reason === 'five' || state.ply >= 10);
    return {
      finished,
      eligible,
      score: !finished ? 0 : state.result === 'draw' ? 1 : state.result === sides[seat] ? 3 : 0,
      secondary: 0,
    };
  },
};

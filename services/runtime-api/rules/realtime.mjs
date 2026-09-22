import { LEVELS } from '../../../games/local/cops-robbers-realtime/src/levels.js';
import { createGame, startGame, stepGame, commandCop, holdCop, roadTarget, isExitBlocked, captureStatus } from '../../../games/local/cops-robbers-realtime/src/engine.js';

const level = LEVELS[0];
const durationMs = 120000;
const description = '同一首关、固定初始位置和小偷行为，120 秒内封住出口并合力抓获。全部抓获的合法完成记录上榜，用时越短越好；失败、超时、离线练习不上榜。比赛不能暂停，断线时按已有命令继续。';
const finished = state => state.game.phase !== 'playing' || state.timedOut;

function initial() {
  const game = createGame(level);
  startGame(game);
  return { game, ticks: 0, serverElapsedMs: 0, timedOut: false, commands: 0 };
}

// A persisted integer clock makes the existing 120 Hz simulation independent of request frequency.
function advance(state, elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < state.serverElapsedMs) throw new Error('无效比赛时间');
  if (finished(state)) return;
  const target = Math.floor(Math.min(durationMs, elapsedMs) * 120 / 1000);
  while (state.ticks < target && state.game.phase === 'playing') {
    stepGame(state.game, 1 / 120);
    state.ticks++;
  }
  state.game.events.length = 0;
  state.serverElapsedMs = elapsedMs;
  state.timedOut = elapsedMs >= durationMs && state.game.phase === 'playing';
}

function action(state, input, elapsedMs) {
  if (!input || !['move', 'hold'].includes(input.type) || !Number.isInteger(input.cop)
    || input.cop < 0 || input.cop >= state.game.cops.length) throw new Error('请选择有效警察和命令');
  const allowed = input.type === 'move' ? ['type', 'cop', 'x', 'y'] : ['type', 'cop'];
  if (Object.keys(input).some(key => !allowed.includes(key))) throw new Error('命令包含无效字段');
  if (input.type === 'move' && (!Number.isFinite(input.x) || !Number.isFinite(input.y)
    || input.x < 0 || input.x > 1000 || input.y < 0 || input.y > 600
    || !roadTarget(state.game, input))) throw new Error('请点击道路，建筑不能通行');
  advance(state, elapsedMs);
  if (finished(state)) throw new Error('比赛已经结束');
  const accepted = input.type === 'hold' ? holdCop(state.game, input.cop) : commandCop(state.game, input.cop, input);
  if (!accepted) throw new Error('该命令不能执行');
  state.commands++;
}

function view(state) {
  const game = state.game;
  const actor = ({ routePoints, destination, ...item }, cop = false) => ({
    id: item.id, x: item.x, y: item.y, angle: item.angle, moving: item.moving, blocked: item.blocked,
    ...(cop ? { routePoints, destination } : {
      caught: item.caught, escaped: item.escaped, capture: item.capture,
      escapeProgress: item.escapeProgress, emotion: item.emotion, ...captureStatus(game, item),
    }),
  });
  return {
    kind: 'realtime', levelId: level.id, name: level.name,
    map: { nodes: level.nodes, edges: level.edges },
    cops: game.cops.map(cop => actor(cop, true)), robbers: game.robbers.map(robber => actor(robber)),
    exits: game.exits.map((exit, index) => ({ x: exit.x, y: exit.y, label: String.fromCharCode(65 + index), blocked: isExitBlocked(game, exit) })),
    phase: state.timedOut ? 'timeout' : game.phase,
    finished: finished(state), elapsedMs: Math.round(state.ticks * 1000 / 120), durationMs,
    caught: game.robbers.filter(robber => robber.caught).length, total: game.robbers.length,
    commands: state.commands, rules: description,
  };
}

function result(state) {
  const won = state.game.phase === 'won';
  return { finished: finished(state), eligible: won,
    score: (won ? 1000 : 0) + state.game.robbers.filter(robber => robber.caught).length,
    secondary: Math.round(state.ticks * 1000 / 120), completed: won,
    captured: state.game.robbers.filter(robber => robber.caught).length };
}

export default { id: 'cops-robbers-realtime', title: '别跑！街区围捕 · 岔路初见', version: 'street1-physics120-v1',
  durationMs, description, realtime: true, pollMs: 250, initial, advance, view, action, result };

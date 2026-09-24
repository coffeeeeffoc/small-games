import { getLevels } from '../../../games/local/cops-robbers-realtime/src/levels.js';
import {
  createGame,
  startGame,
  stepGame,
  commandCop,
  holdCop,
  commandRobber,
  holdRobber,
  roadTarget,
  isExitBlocked,
  captureStatus,
} from '../../../games/local/cops-robbers-realtime/src/engine.js';

const roles = ['pursuer', 'runner'];
const durationMs = 120000;
const description =
  '追逐队与突围队由双方分别实时操控，可交换角色并选择先手，先手先行动2秒。自由追逐、出口竞速各100张地图，服务端随机抽图；追逐队合围全部对手获胜，突围队抵达出口或撑过时限获胜。胜3负0，双方都下达命令且经过开局阶段才计分；每对身份每天仅首场有效对局计分（UTC日）。比赛不能暂停，断线按已有命令继续；单机及旧挑战榜不计入此榜。';
const finished = (state) => state.game.phase !== 'playing' || state.timedOut;

function initial(seed, mode = 'classic', firstRole = 'pursuer') {
  if (!['classic', 'escape'].includes(mode) || !roles.includes(firstRole))
    throw new Error('无效对战配置');
  const level = getLevels(mode)[seed % 100];
  const game = createGame(level, {
    ai: false,
    firstRole: firstRole === 'pursuer' ? 'cop' : 'robber',
  });
  startGame(game);
  return { game, mode, firstRole, ticks: 0, serverElapsedMs: 0, timedOut: false, commands: [0, 0] };
}

// A persisted integer clock makes the existing 120 Hz simulation independent of request frequency.
function advance(state, elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < state.serverElapsedMs)
    throw new Error('无效比赛时间');
  if (finished(state)) return;
  const target = Math.floor((Math.min(durationMs, elapsedMs) * 120) / 1000);
  while (state.ticks < target && state.game.phase === 'playing') {
    stepGame(state.game, 1 / 120);
    state.ticks++;
  }
  state.game.events.length = 0;
  state.serverElapsedMs = elapsedMs;
  state.timedOut = elapsedMs >= durationMs && state.game.phase === 'playing';
}

function action(state, input, elapsedMs, seat) {
  if (
    !roles[seat] ||
    !input ||
    !['move', 'hold'].includes(input.type) ||
    !Number.isInteger(input.actor) ||
    input.actor < 0 ||
    input.actor >= (seat === 0 ? state.game.cops : state.game.robbers).length
  )
    throw new Error('请选择自己队伍的有效队员');
  const allowed = input.type === 'move' ? ['type', 'actor', 'x', 'y'] : ['type', 'actor'];
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw new Error('命令包含无效字段');
  if (
    input.type === 'move' &&
    (!Number.isFinite(input.x) ||
      !Number.isFinite(input.y) ||
      input.x < 0 ||
      input.x > 1000 ||
      input.y < 0 ||
      input.y > 600 ||
      !roadTarget(state.game, input))
  )
    throw new Error('请点击道路，建筑不能通行');
  advance(state, elapsedMs);
  if (finished(state)) throw new Error('比赛已经结束');
  const accepted =
    input.type === 'hold'
      ? (seat === 0 ? holdCop : holdRobber)(state.game, input.actor)
      : (seat === 0 ? commandCop : commandRobber)(state.game, input.actor, input);
  if (!accepted) throw new Error('该命令不能执行，先手开局阶段请等待');
  state.commands[seat]++;
}

function view(state, seat = 0) {
  const game = state.game,
    level = game.level;
  const actor = ({ routePoints, destination, ...item }, cop = false) => ({
    id: item.id,
    x: item.x,
    y: item.y,
    angle: item.angle,
    moving: item.moving,
    blocked: item.blocked,
    ...((cop && seat === 0) || (!cop && seat === 1) ? { routePoints, destination } : {}),
    ...(!cop
      ? {
          caught: item.caught,
          escaped: item.escaped,
          capture: item.capture,
          escapeProgress: item.escapeProgress,
          emotion: item.emotion,
          ...captureStatus(game, item),
        }
      : {}),
  });
  return {
    kind: 'realtime',
    levelId: level.id,
    name: level.name,
    mode: state.mode,
    role: roles[seat],
    firstRole: state.firstRole,
    openingMs: 2000,
    openingRemainingMs: Math.max(0, 2000 - Math.round((state.ticks * 1000) / 120)),
    map: { nodes: level.nodes, edges: level.edges },
    cops: game.cops.map((cop) => actor(cop, true)),
    robbers: game.robbers.map((robber) => actor(robber)),
    exits: game.exits.map((exit, index) => ({
      x: exit.x,
      y: exit.y,
      label: String.fromCharCode(65 + index),
      blocked: isExitBlocked(game, exit),
    })),
    phase: state.timedOut ? 'timeout' : game.phase,
    finished: finished(state),
    elapsedMs: Math.round((state.ticks * 1000) / 120),
    durationMs,
    caught: game.robbers.filter((robber) => robber.caught).length,
    total: game.robbers.length,
    commands: state.commands[seat],
    rules: description,
  };
}

function result(state, seat = 0) {
  const winner = state.game.phase === 'won' ? 'pursuer' : 'runner';
  return {
    finished: finished(state),
    eligible: finished(state) && state.commands.every((count) => count > 0) && state.ticks >= 240,
    score: winner === roles[seat] ? 3 : 0,
    secondary: 0,
  };
}

export default {
  id: 'cops-robbers-realtime',
  title: '别跑！街区围捕 · 双队对抗',
  version: 'street-roles-initiative-v2',
  durationMs,
  description,
  duel: true,
  roles,
  modes: [
    { id: 'classic', title: '自由追逐 · 100关' },
    { id: 'escape', title: '出口竞速 · 100关' },
  ],
  realtime: true,
  pollMs: 250,
  initial,
  advance,
  view,
  action,
  result,
};

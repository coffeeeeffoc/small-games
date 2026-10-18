import { getLevels } from './levels.js';
import {
  createGame,
  startGame,
  stepGame,
  commandCop,
  commandRobber,
  holdCop,
  holdRobber,
  roadTarget,
  isExitBlocked,
  captureStatus,
  routePreview,
} from './engine.js';
import { createRenderer } from './competition-renderer.js';

const roles = ['pursuer', 'runner'];
export const tapMultiplayer = {
  id: 'cops-robbers-realtime',
  title: '街区追捕',
  version: 1,
  realtime: true,
  durationTicks: 14400,
  modes: [
    { id: 'classic', title: '自由追逐' },
    { id: 'escape', title: '出口竞速' },
  ],
  seats: ['追逐队', '突围队'],
  createRenderer,
  initial({ seed, mode }) {
    if (!['classic', 'escape'].includes(mode) || !Number.isSafeInteger(seed) || seed < 0)
      throw new Error('无效地图');
    const maps = getLevels(mode),
      game = createGame(maps[seed % maps.length], { ai: false, firstRole: 'cop' });
    startGame(game);
    return { game, mode, tick: 0, timedOut: false };
  },
  advance(state, tick) {
    if (!Number.isSafeInteger(tick) || tick < state.tick || tick > this.durationTicks)
      throw new Error('无效时钟');
    while (state.tick < tick && state.game.phase === 'playing') {
      stepGame(state.game, 1 / 120);
      state.tick++;
    }
    // The protocol clock continues after a terminal simulation step, identically on both clients.
    state.tick = tick;
    state.game.events.length = 0;
    state.timedOut = tick === this.durationTicks && state.game.phase === 'playing';
  },
  apply(state, action, seat) {
    if (
      !roles[seat] ||
      !action ||
      Array.isArray(action) ||
      !['move', 'hold'].includes(action.type) ||
      !Number.isInteger(action.actor) ||
      action.actor < 0 ||
      action.actor >= (seat === 0 ? state.game.cops : state.game.robbers).length ||
      this.outcome(state)
    )
      throw new Error('请选择可行动的队员');
    const keys = action.type === 'move' ? ['type', 'actor', 'x', 'y'] : ['type', 'actor'];
    if (Object.keys(action).some((key) => !keys.includes(key))) throw new Error('无效命令');
    if (
      action.type === 'move' &&
      (!Number.isFinite(action.x) ||
        !Number.isFinite(action.y) ||
        action.x < 0 ||
        action.x > 1000 ||
        action.y < 0 ||
        action.y > 600 ||
        !roadTarget(state.game, action))
    )
      throw new Error('请点道路');
    const method =
      action.type === 'hold' ? [holdCop, holdRobber][seat] : [commandCop, commandRobber][seat];
    if (!method(state.game, action.actor, action)) throw new Error('开局待命或目标暂不可达');
  },
  view(state, seat) {
    const game = state.game;
    const actor = (value, own) => ({
      id: value.id,
      x: value.x,
      y: value.y,
      angle: value.angle,
      moving: value.moving,
      blocked: value.blocked,
      caught: value.caught,
      escaped: value.escaped,
      capture: value.capture,
      escapeProgress: value.escapeProgress,
      emotion: value.emotion,
      ...(own ? { routePoints: value.routePoints, destination: value.destination } : {}),
      ...(value.caught !== undefined ? captureStatus(game, value) : {}),
    });
    return {
      kind: 'realtime',
      name: game.level.name,
      mode: state.mode,
      role: roles[seat],
      firstRole: 'pursuer',
      openingRemainingMs: Math.max(0, 2000 - (state.tick * 1000) / 120),
      map: { nodes: game.level.nodes, edges: game.level.edges },
      cops: game.cops.map((value) => actor(value, seat === 0)),
      robbers: game.robbers.map((value) => actor(value, seat === 1)),
      exits: game.exits.map((exit, index) => ({
        x: exit.x,
        y: exit.y,
        label: String.fromCharCode(65 + index),
        blocked: isExitBlocked(game, exit),
      })),
      phase: state.timedOut ? 'timeout' : game.phase,
      finished: Boolean(this.outcome(state)),
      elapsedMs: (state.tick * 1000) / 120,
      caught: game.robbers.filter((value) => value.caught).length,
      total: game.robbers.length,
    };
  },
  preview: (state, seat, actor, point) =>
    routePreview(state.game, actor, point, seat === 0 ? 'cop' : 'robber'),
  outcome: (state) =>
    state.game.phase === 'won'
      ? '追逐队获胜'
      : state.game.phase === 'lost' || state.timedOut
        ? '突围队获胜'
        : null,
};

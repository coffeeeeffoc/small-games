import { getLevels } from '../../../games/local/cops-robbers-realtime/src/levels.js';
import {
  createGame,
  startGame,
  stepGame,
  commandCop,
  commandRobber,
  holdCop,
  holdRobber,
} from '../../../games/local/cops-robbers-realtime/src/engine.js';

// A run contains orders and integer simulation ticks, never a trusted score/time.
export function streetRunBoard(config) {
  const { version, mode, role, level, rule, first } = config;
  if (
    version !== 'street-solo-v2' ||
    !['challenge', 'classic', 'escape', 'quick'].includes(mode) ||
    !['cop', 'robber'].includes(role) ||
    !['standard', 'relay'].includes(rule) ||
    !['cop', 'robber', 'simultaneous'].includes(first) ||
    !Number.isInteger(level) ||
    level < 1 ||
    level > (mode === 'quick' ? 3 : 100) ||
    (['challenge', 'quick'].includes(mode) ? first !== 'simultaneous' : first === 'simultaneous') ||
    (mode === 'quick' && (role !== 'cop' || rule !== 'standard'))
  )
    throw new Error('INVALID_RUN');
  return `cops-robbers-realtime:${version}:${mode}:${role}:${level}:${rule}:${first}`;
}

export function verifyStreetRun(config, input) {
  const board = streetRunBoard(config);
  if (
    !input ||
    Object.keys(input).some((key) => !['ticks', 'orders'].includes(key)) ||
    !Number.isInteger(input.ticks) ||
    input.ticks < 1 ||
    input.ticks > 21600 ||
    !Array.isArray(input.orders) ||
    !input.orders.length ||
    input.orders.length > 1500
  )
    throw new Error('INVALID_RUN');
  const game = createGame(getLevels(config.mode)[config.level - 1], {
    playerRole: config.role,
    orderRule: config.rule,
    firstRole: config.first === 'simultaneous' ? null : config.first,
  });
  startGame(game);
  let ticks = 0;
  const advance = (target) => {
    while (ticks < target && game.phase === 'playing') {
      stepGame(game, 1 / 60);
      ticks++;
      game.events.length = 0;
    }
    if (ticks !== target) throw new Error('INVALID_RUN');
  };
  for (const order of input.orders) {
    if (
      !order ||
      !Number.isInteger(order.tick) ||
      order.tick < ticks ||
      order.tick >= input.ticks ||
      !Number.isInteger(order.actor) ||
      order.actor < 0 ||
      !['move', 'hold'].includes(order.type) ||
      Object.keys(order).some(
        (key) =>
          !(
            order.type === 'move' ? ['tick', 'type', 'actor', 'x', 'y'] : ['tick', 'type', 'actor']
          ).includes(key),
      ) ||
      (order.type === 'move' &&
        (!Number.isFinite(order.x) ||
          !Number.isFinite(order.y) ||
          Math.abs(order.x) > 10000 ||
          Math.abs(order.y) > 10000))
    )
      throw new Error('INVALID_RUN');
    advance(order.tick);
    const command =
      order.type === 'move'
        ? config.role === 'cop'
          ? commandCop
          : commandRobber
        : config.role === 'cop'
          ? holdCop
          : holdRobber;
    if (!command(game, order.actor, order)) throw new Error('INVALID_RUN');
  }
  advance(input.ticks);
  if (game.phase !== (config.role === 'cop' ? 'won' : 'lost')) throw new Error('INVALID_RUN');
  return { board, elapsedMs: Math.round((ticks * 1000) / 60) };
}

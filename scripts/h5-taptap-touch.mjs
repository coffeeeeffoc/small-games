import assert from 'node:assert/strict';
import { getLevels } from '../games/local/cops-robbers-realtime/src/levels.js';
import {
  createGame,
  startGame,
  roadTarget,
  routePreview,
} from '../games/local/cops-robbers-realtime/src/engine.js';

// Plan from the public snapshot in Node; the browser still receives only real touch input.
export function reachableStreetNodes(state, actor) {
  const level = getLevels(state.mode).find((item) => item.id === state.levelId);
  assert(level, 'Unknown street level in the authoritative snapshot');
  const game = createGame(level, { ai: false });
  startGame(game);
  for (const team of ['cops', 'robbers'])
    game[team] = state[team].map((item) => ({
      ...game[team][item.id],
      ...item,
      ...roadTarget(game, item),
    }));
  const role = state.role === 'runner' ? 'robber' : 'cop';
  return new Set(
    state.map.nodes.flatMap((node, index) =>
      routePreview(game, actor, node, role) ? [index] : [],
    ),
  );
}

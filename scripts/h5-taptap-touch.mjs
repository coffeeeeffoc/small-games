import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
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

export function reachableStreetMove(state, action) {
  const index = state.map.nodes.findIndex((node) => node.x === action.x && node.y === action.y);
  return index >= 0 && reachableStreetNodes(state, action.actor).has(index);
}

export function isExpectedTouchRequest({ code, path, method, input, expected }) {
  return (
    expected != null &&
    method === 'POST' &&
    typeof code === 'string' &&
    /^[A-F0-9]{12}$/.test(code) &&
    /^\/(?:small-games\/v1|api\/competition\/v1)\/rooms\/([A-F0-9]{12})\/actions$/.exec(
      path,
    )?.[1] === code &&
    isDeepStrictEqual(input, expected.request)
  );
}

export function isBlockedStreetTouch(fixture) {
  return (
    fixture.game === 'cops-robbers-realtime' &&
    fixture.expected?.role === 'runner' &&
    fixture.expected.request?.action?.type === 'move' &&
    fixture.status === 422 &&
    fixture.body?.error === 'ILLEGAL_ACTION' &&
    isExpectedTouchRequest({ ...fixture, method: 'POST' })
  );
}

// The UI-idle barrier must run after tapping. A sent action must finish its own
// response checks even when a different poll has already delivered settlement.
export function touchAttemptFinished(expected, terminal) {
  return expected.sent ? expected.completed === true : terminal;
}

export async function completeTouchResponse(expected, processResponse) {
  try {
    return await processResponse();
  } catch (error) {
    if (expected) expected.error = true;
    throw error;
  } finally {
    if (expected) expected.completed = true;
  }
}

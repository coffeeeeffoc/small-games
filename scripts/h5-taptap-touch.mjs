import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { getLevels } from '../games/local/cops-robbers-realtime/src/levels.js';
import {
  createGame,
  startGame,
  roadTarget,
  routePreview,
  roadDistance,
} from '../games/local/cops-robbers-realtime/src/engine.js';
/** Reuses the game's existing first-level playtest strategy; outputs touch targets only. */
export function soloStreetPlan(snapshot) {
  assert.equal(snapshot.mode, 'challenge');
  assert.equal(snapshot.level, 1);
  assert.equal(snapshot.role, 'cop');
  const level = getLevels('challenge')[0],
    model = createGame(level);
  const origin = roadTarget(model, snapshot.cops[level.hunter]);
  const target = snapshot.robbers
    .filter((actor) => !actor.caught && !actor.escaped)
    .sort(
      (a, b) =>
        roadDistance(model, origin, roadTarget(model, a)) -
        roadDistance(model, origin, roadTarget(model, b)),
    )[0];
  return {
    guards: level.solution.map(({ cop, node }) => ({
      actor: cop,
      target: { ...level.nodes[node] },
    })),
    pursuit: target ? { actor: level.hunter, target: { x: target.x, y: target.y } } : null,
  };
}

/** Pace real guest requests under the unchanged per-IP 20/minute server limit. */
export function guestScheduler(
  initial = [],
  { now = Date.now, pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {},
) {
  const requests = initial.filter((value) => Number.isFinite(value));
  let pending = Promise.resolve();
  return () => {
    const task = pending.then(async () => {
      while (true) {
        while (requests.length && requests[0] <= now() - 60000) requests.shift();
        if (requests.length < 18) {
          requests.push(now());
          return;
        }
        await pause(Math.max(1, Math.min(1000, requests[0] + 60001 - now())));
      }
    });
    pending = task.catch(() => {});
    return task;
  };
}

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

// Rebuild after each response: a rejected route can change which actor or road
// is usable. Moving actors must not starve stationary teammates.
export function streetTouchPlans(state) {
  const runner = state.role === 'runner';
  const own = runner ? state.robbers : state.cops;
  const targets = runner
    ? state.cops
    : state.robbers.filter((item) => !item.caught && !item.escaped);
  if (!targets.length) return [];
  const score = (point) =>
    Math.min(...targets.map((target) => Math.hypot(target.x - point.x, target.y - point.y)));
  return own.flatMap((item, actor) => {
    if (item.caught || item.escaped || item.moving) return [];
    const reachable = reachableStreetNodes(state, actor);
    return state.map.nodes
      .map((node, index) => ({ ...node, index }))
      .filter(
        (node) => reachable.has(node.index) && Math.hypot(item.x - node.x, item.y - node.y) > 1,
      )
      .sort((a, b) => (runner ? score(b) - score(a) : score(a) - score(b)))
      .map((node) => ({ actor, node: node.index }));
  });
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

export async function prepareTouchCanvas(canvas, isFinished) {
  try {
    await canvas.scrollIntoViewIfNeeded({ timeout: 2000 });
  } catch (error) {
    if (error.name !== 'TimeoutError' || !isFinished() || (await canvas.isVisible())) throw error;
    return false;
  }
  return !isFinished();
}

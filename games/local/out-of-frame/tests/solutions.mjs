import { LEVELS, CAMPAIGN_SOLUTIONS } from '../levels.mjs';
import { createState, moveFrame, step } from '../engine.mjs';

/** Real controls only: portable scripts for both simulation and browser QA.
 * frame = drag top-left to (x,y); watch = advance until the object's axis
 * crosses value; walk = hold right to x; jump = pulse jump while holding right
 * for frames; ride = stay still and keep dragging the frame to follow object.
 */
const ORIGINAL_SOLUTIONS = [
  [
    { kind: 'watch', object: 'keeper', axis: 'x', atLeast: 354 },
    { kind: 'frame', x: 0, y: 0 },
    { kind: 'walk', x: 286 },
    { kind: 'jump', frames: 49 },
    { kind: 'walk', x: 900 },
  ],
  [
    { kind: 'watch', object: 'lift', axis: 'y', atMost: 380 },
    { kind: 'frame', x: 0, y: 0 },
    { kind: 'walk', x: 231 },
    { kind: 'jump', frames: 34 },
    { kind: 'walk', x: 413 },
    { kind: 'jump', frames: 39 },
    { kind: 'walk', x: 900 },
  ],
  [
    { kind: 'wait', frames: 2 },
    { kind: 'walk', x: 148 },
    { kind: 'jump', frames: 48 },
    { kind: 'ride', object: 'ferry', untilX: 679, offsetX: -80, y: 250 },
    { kind: 'frame', x: 0, y: 0 },
    { kind: 'walk', x: 900 },
  ],
  [
    { kind: 'watch', object: 'keeper', axis: 'x', atLeast: 240 },
    { kind: 'frame', x: 0, y: 0 },
    { kind: 'walk', x: 171 },
    { kind: 'jump', frames: 45 },
    { kind: 'ride', object: 'ferry', untilX: 660, offsetX: -70, minX: 300, y: 250 },
    { kind: 'frame', x: 0, y: 0 },
    { kind: 'walk', x: 905 },
  ],
  [
    { kind: 'watch', object: 'left-keeper', axis: 'x', atLeast: 297 },
    { kind: 'frame', x: 490, y: 250 },
    { kind: 'watch', object: 'right-keeper', axis: 'x', atLeast: 687 },
    { kind: 'frame', x: 0, y: 0 },
    { kind: 'walk', x: 222 },
    { kind: 'jump', frames: 48 },
    { kind: 'walk', x: 610 },
    { kind: 'jump', frames: 48 },
    { kind: 'walk', x: 905 },
  ],
  [
    { kind: 'watch', object: 'lower-keeper', axis: 'x', atLeast: 243 },
    { kind: 'frame', x: 0, y: 0 },
    { kind: 'walk', x: 175 },
    { kind: 'jump', frames: 45 },
    { kind: 'frame', x: 300, y: 270 },
    { kind: 'watch', object: 'stair-ferry', axis: 'x', atLeast: 376 },
    { kind: 'ride', object: 'stair-ferry', untilX: 701, offsetX: -90, y: 90 },
    { kind: 'frame', x: 0, y: 0 },
    { kind: 'walk', x: 921 },
  ],
];

export const SOLUTIONS = CAMPAIGN_SOLUTIONS.map((route) =>
  Array.isArray(route) ? route : ORIGINAL_SOLUTIONS[route.originalIndex],
);

export function solveRoom(
  index,
  onStep = () => {},
  { reactionFrames = 0, actions = SOLUTIONS[index] } = {},
) {
  const level = LEVELS[index];
  const state = createState(level);
  const tick = (input = {}) => {
    step(level, state, input);
    onStep(state, input);
  };
  const object = (id) => state.objects.find((item) => item.id === id);
  const until = (predicate, input = {}) => {
    for (let guard = 0; guard < 1200; guard++) {
      if (predicate() || state.status === 'won') return;
      if (state.status !== 'playing') throw new Error(`Room ${index + 1} lost during solution`);
      tick(input);
    }
    throw new Error(
      `Room ${index + 1} solution timed out at player ${state.player.x},${state.player.y}`,
    );
  };
  for (const action of actions) {
    if (action.kind === 'frame' || action.kind === 'ride') {
      for (let n = 0; n < reactionFrames; n++) tick();
    }
    switch (action.kind) {
      case 'frame':
        moveFrame(state, action.x, action.y);
        break;
      case 'wait':
        for (let n = 0; n < action.frames; n++) tick();
        break;
      case 'watch':
        until(() =>
          action.atLeast !== undefined
            ? object(action.object)[action.axis] >= action.atLeast
            : object(action.object)[action.axis] <= action.atMost,
        );
        break;
      case 'walk':
        until(() => state.player.x >= action.x, { right: true });
        break;
      case 'jump':
        tick({ right: true, jump: true });
        for (let n = 1; n < action.frames; n++) tick({ right: true });
        break;
      case 'ride':
        until(() => {
          const actor = object(action.object);
          moveFrame(state, Math.max(action.minX ?? 0, actor.x + action.offsetX), action.y);
          return actor.x >= action.untilX;
        });
        break;
      default:
        throw new Error(`Unknown solution action: ${action.kind}`);
    }
  }
  return state;
}

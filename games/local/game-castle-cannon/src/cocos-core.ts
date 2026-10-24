// The Creator runtime imports only this engine-independent boundary; legacy index.ts stays separate.
export { createDuelSession } from './duel-session.js';
export {
  activeGun,
  available,
  selectable,
  transferSeconds,
  gunDirection,
  muzzle,
} from './duel-actions.js';
export { previewTrajectory } from './duel-trajectory.js';
export { DUEL_RULES, duelGroundHeight } from './duel-map.js';
export { direction } from './duel-types.js';
export { CAMPAIGN } from './campaign.js';
export type { DuelView } from './duel-view.js';
export type { Point } from './duel-types.js';
export { createBrowserGameHost } from '@coffeeeeffoc/game-host';

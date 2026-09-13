import type { DynamicContentEnvelope } from '@coffeeeeffoc/content-schema';
import type { CricketContent } from './schema.js';
export const defaultCricketEnvelope: DynamicContentEnvelope<CricketContent> = {
  gameId: 'cricket',
  schemaVersion: 1,
  revision: 1,
  payload: { title: '秋声斗蟋' },
};

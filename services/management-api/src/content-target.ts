import type { DynamicContentEnvelope } from '@coffeeeeffoc/content-schema';
import type { GenerationTarget } from './generation/model.js';

/** Supplied by an installed Game; the service has no default Game or business schema. */
export type ContentTarget = GenerationTarget & {
  defaultEnvelope: DynamicContentEnvelope;
};

import type { ContentValidationResult } from '@coffeeeeffoc/content-schema';
import type { GameDefinition } from '@coffeeeeffoc/game-contract';

/** A trusted, installed Game supplies its own validation and preview implementation. */
export interface StudioContentTarget {
  definition: GameDefinition;
  validate(input: unknown): ContentValidationResult<unknown>;
}

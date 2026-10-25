import type { GameDefinition } from '@coffeeeeffoc/game-contract';
import type { CanvasGameTarget } from '@coffeeeeffoc/canvas-game-adapter';
import type { DynamicContentEnvelope } from '@coffeeeeffoc/content-schema';
import type { NativeViewportOptions } from './viewport.js';

export type ReviewedModule = {
  definition: GameDefinition<CanvasGameTarget>;
  content: DynamicContentEnvelope;
  viewport?: NativeViewportOptions;
  /** Preserve saves when an authored game ID changes. */
  storageGameId?: string;
};

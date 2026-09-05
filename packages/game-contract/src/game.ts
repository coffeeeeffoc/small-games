/// <reference lib="dom" />

import type { GameHost } from './ports.js';
import type { GameManifest } from './schemas.js';

/** Mounted Game lifecycle controlled by a Shell or Standalone Mode. */
export interface GameInstance {
  pause(): void;
  resume(): void;
  dispose(): Promise<void>;
}

/** Public, React-free entry point implemented by every Game. */
export interface GameDefinition<Target = HTMLElement> {
  readonly manifest: GameManifest;
  mount(target: Target, host: GameHost): Promise<GameInstance>;
}

/// <reference lib="dom" />

import type { GameDefinition, GameHost } from '@coffeeeeffoc/game-contract';
import { HostError } from '@coffeeeeffoc/game-contract';

/** Rejects Dynamic Content newer than the schema version advertised by a Game. */
export function assertContentCompatible(
  definition: GameDefinition,
  contentSchemaVersion: number,
): void {
  if (contentSchemaVersion > definition.manifest.contentSchemaVersion) {
    throw new HostError({
      code: 'CONTENT_INCOMPATIBLE',
      message: `Content schema ${contentSchemaVersion} is newer than supported schema ${definition.manifest.contentSchemaVersion}`,
    });
  }
}

/** Exercises mount, pause, resume, dispose, and a second mount using public interfaces only. */
export async function exerciseGameLifecycle(
  definition: GameDefinition,
  target: HTMLElement,
  host: GameHost,
): Promise<void> {
  const first = await definition.mount(target, host);
  first.pause();
  first.resume();
  await first.dispose();
  const second = await definition.mount(target, host);
  await second.dispose();
}

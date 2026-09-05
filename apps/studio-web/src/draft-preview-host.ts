import type { DynamicContentEnvelope } from '@coffeeeeffoc/content-schema';
import { cultivationGameDefinition } from '@coffeeeeffoc/game-cultivation';
import { createInMemoryGameHost } from '@coffeeeeffoc/game-host';

/** Fresh per-mount session: no browser storage, network saves, ads, or player navigation. */
export function createDraftPreviewHost(envelope: DynamicContentEnvelope) {
  return createInMemoryGameHost({
    content: structuredClone(envelope),
    session: {
      gameId: 'cultivation',
      gameVersion: cultivationGameDefinition.manifest.version,
      sessionId: `preview:${crypto.randomUUID()}`,
      releaseChannel: 'development',
      adAuthority: 'none',
      capabilities: ['content', 'storage'],
    },
  });
}

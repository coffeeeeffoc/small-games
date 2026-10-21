import type { DynamicContentEnvelope } from '@coffeeeeffoc/content-schema';
import { createInMemoryGameHost } from '@coffeeeeffoc/game-host';

/** Fresh per-mount session: no browser storage, network saves, ads, or player navigation. */
export function createDraftPreviewHost(envelope: DynamicContentEnvelope, gameVersion: string) {
  return createInMemoryGameHost({
    content: structuredClone(envelope),
    session: {
      gameId: envelope.gameId,
      gameVersion,
      sessionId: `preview:${crypto.randomUUID()}`,
      releaseChannel: 'development',
      adAuthority: 'none',
      capabilities: ['content', 'storage'],
    },
  });
}

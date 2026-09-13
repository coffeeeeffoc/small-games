import { describe, expect, it } from 'vitest';

import { HostError } from '@coffeeeeffoc/game-contract';
import { exerciseGameLifecycle } from '@coffeeeeffoc/game-contract-test';
import { createInMemoryGameHost } from '@coffeeeeffoc/game-host';

import { cricketGameDefinition } from '@coffeeeeffoc/game-cricket';
import { defaultCricketEnvelope } from '@coffeeeeffoc/game-cricket/content';

describe('cricket Game Contract', () => {
  it('mounts, pauses, resumes, disposes, and mounts again', async () => {
    const host = createInMemoryGameHost({
      session: { gameId: 'cricket', capabilities: ['content', 'storage', 'advertising'] },
      content: defaultCricketEnvelope,
    });
    const target = document.createElement('div');

    await exerciseGameLifecycle(cricketGameDefinition, target, host);
    expect(target.childElementCount).toBe(0);
  });

  it('rejects a Host missing a required capability', async () => {
    const host = createInMemoryGameHost({
      session: { gameId: 'cricket', capabilities: [] },
      content: defaultCricketEnvelope,
    });

    await expect(
      cricketGameDefinition.mount(document.createElement('div'), host),
    ).rejects.toMatchObject({
      code: 'CAPABILITY_MISSING',
    });
  });

  it('rejects Dynamic Content newer than its supported schema', async () => {
    const host = createInMemoryGameHost({
      session: { gameId: 'cricket', capabilities: ['content', 'storage'] },
      content: {
        ...defaultCricketEnvelope,
        schemaVersion: cricketGameDefinition.manifest.contentSchemaVersion + 1,
      },
    });

    await expect(
      cricketGameDefinition.mount(document.createElement('div'), host),
    ).rejects.toMatchObject({ code: 'CONTENT_INCOMPATIBLE' });
  });

  it('mounts when local save storage is unavailable', async () => {
    const base = createInMemoryGameHost({
      session: { gameId: 'cricket', capabilities: ['content', 'storage'] },
      content: defaultCricketEnvelope,
    });
    const host = {
      ...base,
      storage: {
        async read() {
          throw new HostError({ code: 'OFFLINE', message: 'offline' });
        },
        async write() {
          throw new HostError({ code: 'OFFLINE', message: 'offline' });
        },
      },
    };

    const lifecycle = await cricketGameDefinition.mount(document.createElement('div'), host);
    await Promise.resolve();
    await lifecycle.dispose();
  });

  it('mounts gracefully without optional advertising authority', async () => {
    const host = createInMemoryGameHost({
      session: { gameId: 'cricket', capabilities: ['content', 'storage'] },
      content: defaultCricketEnvelope,
      offer: async () => ({ status: 'unavailable' }),
    });

    await exerciseGameLifecycle(cricketGameDefinition, document.createElement('div'), host);
  });
});

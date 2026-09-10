import { describe, expect, it } from 'vitest';

import { HostError } from '@coffeeeeffoc/game-contract';
import { exerciseGameLifecycle } from '@coffeeeeffoc/game-contract-test';
import { createInMemoryGameHost } from '@coffeeeeffoc/game-host';

import { cultivationGameDefinition } from '@coffeeeeffoc/game-cultivation';
import { defaultCultivationEnvelope } from '@coffeeeeffoc/game-cultivation/content';

describe('cultivation Game Contract', () => {
  it('mounts published v1 content through the Game-owned migration', async () => {
    const payload = { ...defaultCultivationEnvelope.payload };
    delete (payload as Partial<typeof payload>).title;
    const host = createInMemoryGameHost({
      session: { gameId: 'cultivation' },
      content: { ...defaultCultivationEnvelope, schemaVersion: 1, payload },
    });
    const target = document.createElement('div');
    const instance = await cultivationGameDefinition.mount(target, host);
    expect(target.querySelector('h1')?.textContent).toBe('三分钟修仙');
    await instance.dispose();
  });
  it('mounts, pauses, resumes, disposes, and mounts again', async () => {
    const host = createInMemoryGameHost({
      session: { gameId: 'cultivation', capabilities: ['content', 'storage', 'advertising'] },
      content: defaultCultivationEnvelope,
    });
    const target = document.createElement('div');

    await exerciseGameLifecycle(cultivationGameDefinition, target, host);
    expect(target.childElementCount).toBe(0);
  });

  it('rejects a Host missing a required capability', async () => {
    const host = createInMemoryGameHost({
      session: { gameId: 'cultivation', capabilities: [] },
      content: defaultCultivationEnvelope,
    });

    await expect(
      cultivationGameDefinition.mount(document.createElement('div'), host),
    ).rejects.toMatchObject({
      code: 'CAPABILITY_MISSING',
    });
  });

  it('rejects Dynamic Content newer than its supported schema', async () => {
    const host = createInMemoryGameHost({
      session: { gameId: 'cultivation', capabilities: ['content', 'storage'] },
      content: {
        ...defaultCultivationEnvelope,
        schemaVersion: cultivationGameDefinition.manifest.contentSchemaVersion + 1,
      },
    });

    await expect(
      cultivationGameDefinition.mount(document.createElement('div'), host),
    ).rejects.toMatchObject({ code: 'CONTENT_INCOMPATIBLE' });
  });

  it('mounts when local save storage is unavailable', async () => {
    const base = createInMemoryGameHost({
      session: { gameId: 'cultivation', capabilities: ['content', 'storage'] },
      content: defaultCultivationEnvelope,
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

    const lifecycle = await cultivationGameDefinition.mount(document.createElement('div'), host);
    await Promise.resolve();
    await lifecycle.dispose();
  });

  it('mounts gracefully without optional advertising authority', async () => {
    const host = createInMemoryGameHost({
      session: { gameId: 'cultivation', capabilities: ['content', 'storage'] },
      content: defaultCultivationEnvelope,
      offer: async () => ({ status: 'unavailable' }),
    });

    await exerciseGameLifecycle(cultivationGameDefinition, document.createElement('div'), host);
  });
});

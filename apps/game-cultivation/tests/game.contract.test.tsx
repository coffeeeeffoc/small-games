import { act } from 'react';
import { describe, expect, it } from 'vitest';

import { HostError } from '@coffeeeeffoc/game-contract';
import { exerciseGameLifecycle } from '@coffeeeeffoc/game-contract-test';
import { createInMemoryGameHost, createTestGameHost } from '@coffeeeeffoc/game-host';

import { cultivationGameDefinition } from '@coffeeeeffoc/game-cultivation';
import { defaultCultivationEnvelope } from '@coffeeeeffoc/game-cultivation/content';

describe('cultivation Game Contract', () => {
  it('mounts published v1 content through the Game-owned migration', async () => {
    const { title, ...payload } = defaultCultivationEnvelope.payload;
    const host = createInMemoryGameHost({
      session: { gameId: 'cultivation' },
      content: { ...defaultCultivationEnvelope, schemaVersion: 1, payload },
    });
    const target = document.createElement('div');
    const instance = await cultivationGameDefinition.mount(target, host);
    expect(target.querySelector('h1')?.textContent).toBe(title);
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

  it('keeps the completed life when advertising is unavailable', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let offers = 0;
    const host = createInMemoryGameHost({
      session: {
        gameId: 'cultivation',
        capabilities: ['content', 'storage', 'advertising'],
        adAuthority: 'host',
      },
      content: defaultCultivationEnvelope,
      offer: async () => {
        offers += 1;
        return { status: 'unavailable' };
      },
    });
    const target = document.createElement('div');
    let lifecycle!: Awaited<ReturnType<typeof cultivationGameDefinition.mount>>;
    await act(async () => {
      lifecycle = await cultivationGameDefinition.mount(target, host);
    });

    for (let event = 0; event < 18; event += 1) {
      await act(async () => {
        target.querySelector<HTMLButtonElement>('.choices button')?.click();
      });
    }
    expect(target.textContent).toContain('三章已毕');

    await act(async () => {
      const actions = target.querySelectorAll<HTMLButtonElement>('.ending button');
      expect(actions).toHaveLength(2);
      actions[1].click();
      await Promise.resolve();
    });

    expect(offers).toBe(1);
    expect(target.textContent).toContain('三章已毕');
    await act(async () => lifecycle.dispose());
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('grants reincarnation only from a completed Reward Opportunity outcome', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const { host, observations } = createTestGameHost({
      session: {
        gameId: 'cultivation',
        capabilities: ['content', 'storage', 'advertising'],
        adAuthority: 'host',
      },
      content: defaultCultivationEnvelope,
      offer: async () => ({ status: 'completed' }),
    });
    const target = document.createElement('div');
    let lifecycle!: Awaited<ReturnType<typeof cultivationGameDefinition.mount>>;
    await act(async () => {
      lifecycle = await cultivationGameDefinition.mount(target, host);
    });
    for (let event = 0; event < 18; event += 1) {
      await act(async () => target.querySelector<HTMLButtonElement>('.choices button')?.click());
    }

    await act(async () => {
      target.querySelectorAll<HTMLButtonElement>('.ending button')[1].click();
      await Promise.resolve();
    });

    expect(target.textContent).toContain('骨 6');
    expect(observations.filter((item) => item.port === 'advertising')).toEqual([
      {
        port: 'advertising',
        operation: 'offer',
        value: { id: 'cultivation.reincarnate', reward: { luck: 2 } },
      },
    ]);
    await act(async () => lifecycle.dispose());
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });
});

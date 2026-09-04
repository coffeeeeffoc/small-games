import { act } from 'react';
import { describe, expect, it } from 'vitest';

import { HostError } from '@coffeeeeffoc/game-contract';
import { exerciseGameLifecycle } from '@coffeeeeffoc/game-contract-test';
import { createInMemoryGameHost } from '@coffeeeeffoc/game-host';

import { cultivationGameDefinition } from '@coffeeeeffoc/game-cultivation';
import { defaultCultivationEnvelope } from '@coffeeeeffoc/game-cultivation/content';

describe('cultivation Game Contract', () => {
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
      content: { ...defaultCultivationEnvelope, schemaVersion: 2 },
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
});

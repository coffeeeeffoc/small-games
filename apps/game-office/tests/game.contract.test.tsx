import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { HostError, type AdvertisingPort, type RewardOutcome } from '@coffeeeeffoc/game-contract';
import { exerciseGameLifecycle } from '@coffeeeeffoc/game-contract-test';
import { createInMemoryGameHost, createTestGameHost } from '@coffeeeeffoc/game-host';
import { defaultOfficeEnvelope } from '@coffeeeeffoc/game-office/content';
import { officeGameDefinition } from '@coffeeeeffoc/game-office';

async function mountCaughtGame(offer: AdvertisingPort['offer']) {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const testHost = createTestGameHost({
    session: {
      gameId: 'office',
      capabilities: ['content', 'storage', 'advertising'],
      adAuthority: 'host',
    },
    content: defaultOfficeEnvelope,
    offer,
  });
  const target = document.createElement('div');
  let lifecycle!: Awaited<ReturnType<typeof officeGameDefinition.mount>>;
  await act(async () => {
    lifecycle = await officeGameDefinition.mount(target, testHost.host);
  });
  await act(async () => target.querySelector<HTMLButtonElement>('.day-curtain button')?.click());
  await act(async () => {
    target
      .querySelector<HTMLButtonElement>('.slack-button')
      ?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(13_000);
  });
  expect(target.textContent).toContain('你在工作时间笑出了声');
  return { ...testHost, target, lifecycle };
}

function restoreTestRuntime() {
  vi.useRealTimers();
  vi.restoreAllMocks();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
}

describe('office Game Contract', () => {
  it('mounts, pauses, resumes, disposes, and mounts again', async () => {
    const host = createInMemoryGameHost({
      session: { gameId: 'office', capabilities: ['content', 'storage', 'advertising'] },
      content: defaultOfficeEnvelope,
    });
    await exerciseGameLifecycle(officeGameDefinition, document.createElement('div'), host);
  });

  it('rejects missing capability and newer content', async () => {
    const missing = createInMemoryGameHost({
      session: { gameId: 'office', capabilities: [] },
      content: defaultOfficeEnvelope,
    });
    await expect(
      officeGameDefinition.mount(document.createElement('div'), missing),
    ).rejects.toMatchObject({ code: 'CAPABILITY_MISSING' });
    const newer = createInMemoryGameHost({
      session: { gameId: 'office', capabilities: ['content', 'storage'] },
      content: { ...defaultOfficeEnvelope, schemaVersion: 2 },
    });
    await expect(
      officeGameDefinition.mount(document.createElement('div'), newer),
    ).rejects.toMatchObject({ code: 'CONTENT_INCOMPATIBLE' });
  });

  it('mounts when save storage is unavailable', async () => {
    const base = createInMemoryGameHost({
      session: { gameId: 'office', capabilities: ['content', 'storage'] },
      content: defaultOfficeEnvelope,
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
    const lifecycle = await officeGameDefinition.mount(document.createElement('div'), host);
    await Promise.resolve();
    await lifecycle.dispose();
  });

  it('mounts gracefully without the optional advertising capability', async () => {
    const host = createInMemoryGameHost({
      session: { gameId: 'office', capabilities: ['content', 'storage'] },
      content: defaultOfficeEnvelope,
    });
    await exerciseGameLifecycle(officeGameDefinition, document.createElement('div'), host);
  });

  it('drops active input while paused', async () => {
    vi.useFakeTimers();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = createInMemoryGameHost({
      session: { gameId: 'office', capabilities: ['content', 'storage'] },
      content: defaultOfficeEnvelope,
    });
    const target = document.createElement('div');
    let lifecycle!: Awaited<ReturnType<typeof officeGameDefinition.mount>>;
    await act(async () => {
      lifecycle = await officeGameDefinition.mount(target, host);
    });
    await act(async () => target.querySelector<HTMLButtonElement>('.day-curtain button')?.click());
    await act(async () => {
      target
        .querySelector<HTMLButtonElement>('.slack-button')
        ?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      lifecycle.pause();
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      lifecycle.resume();
    });
    expect(target.querySelector<HTMLButtonElement>('.slack-button')?.textContent).toContain(
      '按住摸鱼',
    );
    await act(async () => lifecycle.dispose());
    restoreTestRuntime();
  });

  it('requests a Reward Opportunity and rescues only after completion', async () => {
    const { target, lifecycle, observations } = await mountCaughtGame(async () => ({
      status: 'completed',
    }));
    await act(async () => {
      const buttons = target.querySelectorAll<HTMLButtonElement>('.result button');
      buttons[1].click();
      await Promise.resolve();
    });
    expect(target.textContent).not.toContain('你在工作时间笑出了声');
    expect(observations.filter((item) => item.port === 'advertising')).toEqual([
      {
        port: 'advertising',
        operation: 'offer',
        value: { id: 'office.destroy-history', reward: { suspicion: 15 } },
      },
    ]);
    await act(async () => lifecycle.dispose());
    restoreTestRuntime();
  });

  it('keeps the caught run when advertising is unavailable', async () => {
    const { target, lifecycle } = await mountCaughtGame(async () => ({ status: 'unavailable' }));
    await act(async () => {
      target.querySelectorAll<HTMLButtonElement>('.result button')[1].click();
      await Promise.resolve();
    });
    expect(target.textContent).toContain('你在工作时间笑出了声');
    await act(async () => lifecycle.dispose());
    restoreTestRuntime();
  });

  it('recovers from a rejecting advertising port without rewarding', async () => {
    const { target, lifecycle } = await mountCaughtGame(async () => {
      throw new Error('adapter rejected');
    });
    await act(async () => {
      target.querySelectorAll<HTMLButtonElement>('.result button')[1].click();
      await Promise.resolve();
    });
    expect(target.textContent).toContain('你在工作时间笑出了声');
    expect(
      [...target.querySelectorAll<HTMLButtonElement>('.result button')].some(
        (button) => button.disabled,
      ),
    ).toBe(false);
    await act(async () => lifecycle.dispose());
    restoreTestRuntime();
  });

  it('ignores a delayed reward after disposal and locks conflicting actions while pending', async () => {
    let complete!: (outcome: RewardOutcome) => void;
    const { target, lifecycle } = await mountCaughtGame(
      () => new Promise((resolve) => (complete = resolve)),
    );
    await act(async () => target.querySelectorAll<HTMLButtonElement>('.result button')[1].click());
    expect(
      [...target.querySelectorAll<HTMLButtonElement>('.result button')].every(
        (button) => button.disabled,
      ),
    ).toBe(true);
    await act(async () => lifecycle.dispose());
    complete({ status: 'completed' });
    await Promise.resolve();
    expect(target.childElementCount).toBe(0);
    restoreTestRuntime();
  });
});

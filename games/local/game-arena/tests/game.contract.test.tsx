import { act } from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import {
  HostError,
  type AdvertisingPort,
  type RewardOutcome,
  type StorageRecord,
} from '@coffeeeeffoc/game-contract';
import { exerciseGameLifecycle } from '@coffeeeeffoc/game-contract-test';
import { createInMemoryGameHost, createTestGameHost } from '@coffeeeeffoc/game-host';
import { arenaGameDefinition } from '@coffeeeeffoc/game-arena';
import { defaultArenaContent, defaultArenaEnvelope } from '@coffeeeeffoc/game-arena/content';

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function weakArenaEnvelope() {
  return {
    ...defaultArenaEnvelope,
    payload: {
      ...defaultArenaContent,
      traits: defaultArenaContent.traits.map((trait) => ({
        ...trait,
        attack: -100,
        hp: -100,
        speed: -10,
      })),
    },
  };
}

async function mountLosingGame(offer: AdvertisingPort['offer']) {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const testHost = createTestGameHost({
    session: {
      gameId: 'arena',
      capabilities: ['content', 'storage', 'advertising'],
      adAuthority: 'host',
    },
    content: weakArenaEnvelope(),
    offer,
  });
  const target = document.createElement('div');
  let lifecycle!: Awaited<ReturnType<typeof arenaGameDefinition.mount>>;
  await act(async () => {
    lifecycle = await arenaGameDefinition.mount(target, testHost.host);
  });
  await act(async () => target.querySelector<HTMLButtonElement>('.arena-picks button')?.click());
  for (let index = 0; index < 2; index += 1)
    await act(async () => target.querySelector<HTMLButtonElement>('.arena-traits button')?.click());
  await act(async () => target.querySelector<HTMLButtonElement>('.arena-ready button')?.click());
  expect(target.querySelector('.arena')?.getAttribute('data-phase')).toBe('battle');
  expect(target.textContent).not.toContain('这一盆，先收虫。');
  await act(async () => vi.advanceTimersByTimeAsync(3_000));
  await act(async () => vi.runOnlyPendingTimersAsync());
  expect(target.textContent).toContain('这一盆，先收虫。');
  return { ...testHost, target, lifecycle };
}

function restoreTestRuntime() {
  vi.useRealTimers();
  vi.restoreAllMocks();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
}

describe('arena Game Contract', () => {
  it('supports repeated embedded lifecycle', async () => {
    const host = createInMemoryGameHost({
      session: { gameId: 'arena', capabilities: ['content', 'storage', 'advertising'] },
      content: defaultArenaEnvelope,
    });
    await exerciseGameLifecycle(arenaGameDefinition, document.createElement('div'), host);
  });

  it('rejects missing capability and newer content', async () => {
    const missing = createInMemoryGameHost({
      session: { gameId: 'arena', capabilities: [] },
      content: defaultArenaEnvelope,
    });
    await expect(
      arenaGameDefinition.mount(document.createElement('div'), missing),
    ).rejects.toMatchObject({ code: 'CAPABILITY_MISSING' });
    const newer = createInMemoryGameHost({
      session: { gameId: 'arena', capabilities: ['content', 'storage'] },
      content: { ...defaultArenaEnvelope, schemaVersion: 2 },
    });
    await expect(
      arenaGameDefinition.mount(document.createElement('div'), newer),
    ).rejects.toMatchObject({ code: 'CONTENT_INCOMPATIBLE' });
  });

  it('mounts when save storage is unavailable', async () => {
    const base = createInMemoryGameHost({
      session: { gameId: 'arena', capabilities: ['content', 'storage'] },
      content: defaultArenaEnvelope,
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
    const lifecycle = await arenaGameDefinition.mount(document.createElement('div'), host);
    await Promise.resolve();
    await lifecycle.dispose();
  });

  it('blocks reward-bearing play until the initial save read settles', async () => {
    let resolveRead!: (record: StorageRecord | null) => void;
    const base = createInMemoryGameHost({
      session: { gameId: 'arena', capabilities: ['content', 'storage'] },
      content: defaultArenaEnvelope,
    });
    const host = {
      ...base,
      storage: {
        ...base.storage,
        read: () => new Promise<StorageRecord | null>((resolve) => (resolveRead = resolve)),
      },
    };
    const target = document.createElement('div');
    let lifecycle!: Awaited<ReturnType<typeof arenaGameDefinition.mount>>;
    await act(async () => {
      lifecycle = await arenaGameDefinition.mount(target, host);
    });
    expect(target.textContent).toContain('正在读取联赛档案');
    expect(target.querySelector('.arena-picks button')).toBeNull();
    await act(async () => resolveRead(null));
    expect(target.querySelector('.arena-picks button')).not.toBeNull();
    await act(async () => lifecycle.dispose());
  });

  it('runs without optional advertising', async () => {
    const host = createInMemoryGameHost({
      session: { gameId: 'arena', capabilities: ['content', 'storage'] },
      content: defaultArenaEnvelope,
    });
    await exerciseGameLifecycle(arenaGameDefinition, document.createElement('div'), host);
  });

  it('pauses combat, cancels held input, resumes and disposes without ticking', async () => {
    vi.useFakeTimers();
    const host = createInMemoryGameHost({
      session: { gameId: 'arena', capabilities: ['content', 'storage'] },
      content: defaultArenaEnvelope,
    });
    const target = document.createElement('div');
    let lifecycle!: Awaited<ReturnType<typeof arenaGameDefinition.mount>>;
    await act(async () => {
      lifecycle = await arenaGameDefinition.mount(target, host);
    });
    await act(async () => target.querySelector<HTMLButtonElement>('.arena-picks button')!.click());
    for (let i = 0; i < 2; i++)
      await act(async () =>
        target.querySelector<HTMLButtonElement>('.arena-traits button')!.click(),
      );
    await act(async () => target.querySelector<HTMLButtonElement>('.arena-ready button')!.click());
    const tease = target.querySelector<HTMLButtonElement>('.arena-tease')!;
    await act(async () =>
      tease.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })),
    );
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(tease.getAttribute('aria-pressed')).toBe('true');
    await act(async () => lifecycle.pause());
    const before = target.querySelector('.arena-clock')!.textContent;
    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(target.querySelector('.arena-clock')!.textContent).toBe(before);
    await act(async () => lifecycle.resume());
    expect(tease.getAttribute('aria-pressed')).toBe('false');
    expect(target.querySelector<HTMLMeterElement>('[aria-label="对手斗志"]')!.value).toBe(46);
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(target.querySelector('.arena-clock')!.textContent).not.toBe(before);
    await act(async () => lifecycle.dispose());
    await act(async () => vi.runAllTimersAsync());
    expect(target.childElementCount).toBe(0);
  });

  it('uses a Reward Opportunity for a completed post-match mutation', async () => {
    const { target, lifecycle, observations } = await mountLosingGame(async () => ({
      status: 'completed',
    }));
    await act(async () => {
      target.querySelectorAll<HTMLButtonElement>('.arena-result button')[1].click();
      await Promise.resolve();
    });
    expect(target.textContent).toContain('开盆，迎战！');
    expect(observations.filter((item) => item.port === 'advertising')).toEqual([
      {
        port: 'advertising',
        operation: 'offer',
        value: { id: 'arena.post-match-mutation', reward: { mutation: 1 } },
      },
    ]);
    await act(async () => lifecycle.dispose());
    restoreTestRuntime();
  });

  it('keeps the loss when advertising is unavailable', async () => {
    const { target, lifecycle } = await mountLosingGame(async () => ({ status: 'unavailable' }));
    await act(async () => {
      target.querySelectorAll<HTMLButtonElement>('.arena-result button')[1].click();
      await Promise.resolve();
    });
    expect(target.textContent).toContain('这一盆，先收虫。');
    expect(
      [...target.querySelectorAll<HTMLButtonElement>('.arena-result button')].some(
        (button) => button.disabled,
      ),
    ).toBe(false);
    await act(async () => lifecycle.dispose());
    restoreTestRuntime();
  });

  it('ignores a delayed reward after disposal and locks conflicting actions while pending', async () => {
    let complete!: (outcome: RewardOutcome) => void;
    const { target, lifecycle } = await mountLosingGame(
      () => new Promise((resolve) => (complete = resolve)),
    );
    await act(async () =>
      target.querySelectorAll<HTMLButtonElement>('.arena-result button')[1].click(),
    );
    expect(
      [...target.querySelectorAll<HTMLButtonElement>('.arena-result button')].every(
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

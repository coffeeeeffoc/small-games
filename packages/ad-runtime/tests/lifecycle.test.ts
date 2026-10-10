import { describe, expect, it, vi } from 'vitest';
import {
  createAdRuntime,
  createCallbackAdProvider,
  createTestAdProvider,
} from '@coffeeeeffoc/ad-runtime';
import type { RewardOutcome } from '@coffeeeeffoc/game-contract';

const reward = { id: 'test.revive', reward: {} };

describe('advertisement lifecycle', () => {
  it('serializes different placements sharing one provider', async () => {
    let finish!: (outcome: RewardOutcome) => void;
    const show = vi.fn(
      () =>
        new Promise<RewardOutcome>((resolve) => {
          finish = resolve;
        }),
    );
    const runtime = createAdRuntime({ authority: 'host', host: { show } });
    const first = runtime.offer(reward);
    const second = runtime.offer({ id: 'other-placement', reward: {} });
    await Promise.resolve();
    expect(show).toHaveBeenCalledTimes(1);
    finish({ status: 'dismissed' });
    await first;
    await vi.waitFor(() => expect(show).toHaveBeenCalledTimes(2));
    finish({ status: 'completed' });
    await expect(second).resolves.toEqual({ status: 'completed' });
  });

  it('times out a hung provider and refuses overlap until the original playback settles', async () => {
    vi.useFakeTimers();
    try {
      let complete!: (outcome: RewardOutcome) => void;
      const show = vi.fn(
        () =>
          new Promise<RewardOutcome>((resolve) => {
            complete = resolve;
          }),
      );
      const runtime = createAdRuntime({ authority: 'host', host: { show }, timeoutMs: 1000 });
      const first = runtime.offer(reward);
      await vi.advanceTimersByTimeAsync(1000);
      await expect(first).resolves.toEqual({ status: 'failed' });
      await expect(runtime.offer(reward)).resolves.toEqual({ status: 'unavailable' });
      expect(show).toHaveBeenCalledTimes(1);
      complete({ status: 'completed' });
      await Promise.resolve();
    } finally {
      vi.useRealTimers();
    }
  });

  it('SDK callback timeouts release listeners and ignore late completions', async () => {
    vi.useFakeTimers();
    try {
      const cleanup = vi.fn();
      let complete!: () => void;
      const provider = createCallbackAdProvider(
        (_request, callbacks) => {
          complete = callbacks.completed;
          return cleanup;
        },
        { timeoutMs: 1000 },
      );
      const pending = provider.show({ opportunityId: reward.id });
      await vi.advanceTimersByTimeAsync(1000);
      await expect(pending).resolves.toEqual({ status: 'failed' });
      complete();
      expect(cleanup).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not block rewards on telemetry that never settles', async () => {
    const runtime = createAdRuntime({
      authority: 'host',
      host: createTestAdProvider([{ status: 'completed' }]),
      telemetry: { track: () => new Promise(() => {}) },
    });
    await expect(runtime.offer(reward)).resolves.toEqual({ status: 'completed' });
  });
});

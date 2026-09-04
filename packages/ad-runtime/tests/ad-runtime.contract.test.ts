import { describe, expect, it } from 'vitest';

import {
  createAdRuntime,
  createCallbackAdProvider,
  createTestAdProvider,
  type AdProvider,
  type AdProviderRequest,
} from '@coffeeeeffoc/ad-runtime';
import type { RewardOutcome } from '@coffeeeeffoc/game-contract';
import { createInMemoryGameHost } from '@coffeeeeffoc/game-host';

const reward = { id: 'cultivation.reincarnate', reward: { luck: 2 } };

describe('ad runtime contract', () => {
  it.each([
    ['completed', 'completed'],
    ['dismissed', 'dismissed'],
    ['unavailable', 'unavailable'],
  ] as const)('maps provider %s playback to %s', async (providerStatus, expectedStatus) => {
    const provider = createTestAdProvider([{ status: providerStatus }]);
    const runtime = createAdRuntime({ authority: 'host', host: provider });

    await expect(runtime.offer(reward)).resolves.toEqual({ status: expectedStatus });
    expect(provider.requests).toEqual([{ opportunityId: reward.id }]);
  });

  it('turns an SDK exception into a non-throwing failed outcome', async () => {
    const runtime = createAdRuntime({
      authority: 'managed',
      managed: createTestAdProvider([new Error('SDK crashed')]),
    });

    await expect(runtime.offer(reward)).resolves.toEqual({ status: 'failed' });
  });

  it('enforces frequency policy before invoking the provider again', async () => {
    const provider = createTestAdProvider([{ status: 'completed' }, { status: 'completed' }]);
    const runtime = createAdRuntime({
      authority: 'managed',
      managed: provider,
      config: { game: { maxPerSession: 1 } },
    });

    await expect(runtime.offer(reward)).resolves.toEqual({ status: 'completed' });
    await expect(runtime.offer(reward)).resolves.toEqual({ status: 'unavailable' });
    expect(provider.requests).toHaveLength(1);
  });

  it('does not consume frequency quota for no inventory or SDK failures', async () => {
    const provider = createTestAdProvider([
      { status: 'unavailable' },
      new Error('SDK crashed'),
      { status: 'completed' },
      { status: 'completed' },
    ]);
    const runtime = createAdRuntime({
      authority: 'managed',
      managed: provider,
      config: { game: { maxPerSession: 1 } },
    });

    await expect(runtime.offer(reward)).resolves.toEqual({ status: 'unavailable' });
    await expect(runtime.offer(reward)).resolves.toEqual({ status: 'failed' });
    await expect(runtime.offer(reward)).resolves.toEqual({ status: 'completed' });
    await expect(runtime.offer(reward)).resolves.toEqual({ status: 'unavailable' });
    expect(provider.requests).toHaveLength(3);
  });

  it('applies frequency policy atomically to concurrent offers', async () => {
    const requests: AdProviderRequest[] = [];
    let complete!: (outcome: RewardOutcome) => void;
    const provider: AdProvider = {
      show(request) {
        requests.push(request);
        return new Promise((resolve) => {
          complete = resolve;
        });
      },
    };
    const runtime = createAdRuntime({
      authority: 'managed',
      managed: provider,
      config: { game: { maxPerSession: 1 } },
    });

    const first = runtime.offer(reward);
    const second = runtime.offer(reward);
    await Promise.resolve();
    expect(requests).toHaveLength(1);

    complete({ status: 'completed' });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: 'completed' },
      { status: 'unavailable' },
    ]);
    expect(requests).toHaveLength(1);
  });

  it('isolates synchronous and asynchronous telemetry failures', async () => {
    const synchronousTelemetry = {
      track(): Promise<void> {
        throw new Error('sync telemetry failure');
      },
    };
    const asynchronousTelemetry = {
      track(): Promise<void> {
        return Promise.reject(new Error('async telemetry failure'));
      },
    };
    const completedRuntime = createAdRuntime({
      authority: 'host',
      host: createTestAdProvider([{ status: 'completed' }]),
      telemetry: synchronousTelemetry,
    });
    const failedRuntime = createAdRuntime({
      authority: 'host',
      host: createTestAdProvider([new Error('SDK crashed')]),
      telemetry: asynchronousTelemetry,
    });

    await expect(completedRuntime.offer(reward)).resolves.toEqual({ status: 'completed' });
    await expect(failedRuntime.offer(reward)).resolves.toEqual({ status: 'failed' });
  });

  it('selects exactly the fixed host, managed, or none authority', async () => {
    const host = createTestAdProvider([{ status: 'completed' }]);
    const managed = createTestAdProvider([{ status: 'completed' }]);
    const hostRuntime = createAdRuntime({ authority: 'host', host, managed });
    const managedRuntime = createAdRuntime({ authority: 'managed', host, managed });
    const noneRuntime = createAdRuntime({ authority: 'none', host, managed });

    await expect(hostRuntime.offer(reward)).resolves.toEqual({ status: 'completed' });
    await expect(managedRuntime.offer(reward)).resolves.toEqual({ status: 'completed' });
    await expect(noneRuntime.offer(reward)).resolves.toEqual({ status: 'unavailable' });
    expect(host.requests).toHaveLength(1);
    expect(managed.requests).toHaveLength(1);
  });

  it('binds its authority from the immutable Game Session created by Game Host', async () => {
    const hostProvider = createTestAdProvider([{ status: 'completed' }]);
    const managedProvider = createTestAdProvider([{ status: 'completed' }]);
    const host = createInMemoryGameHost({
      session: { adAuthority: 'managed' },
      advertising: (session) =>
        createAdRuntime({
          authority: session.adAuthority,
          host: hostProvider,
          managed: managedProvider,
        }),
    });

    expect(Object.isFrozen(host.session)).toBe(true);
    await expect(host.ads.offer(reward)).resolves.toEqual({ status: 'completed' });
    expect(hostProvider.requests).toHaveLength(0);
    expect(managedProvider.requests).toHaveLength(1);
  });

  it('accepts only the first terminal SDK callback', async () => {
    const provider = createCallbackAdProvider((_request, callbacks) => {
      callbacks.dismissed();
      callbacks.completed();
      callbacks.failed();
    });
    const runtime = createAdRuntime({ authority: 'host', host: provider });

    await expect(runtime.offer(reward)).resolves.toEqual({ status: 'dismissed' });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { hostAdapterContractCases } from '@coffeeeeffoc/game-contract-test';
import {
  createBilibiliGameHost,
  createBilibiliAdProvider,
  reviewedCultivation,
} from '@coffeeeeffoc/shell-bilibili';
import { fakeSdk } from './fixture.js';
const { definition, content } = reviewedCultivation;

describe('Bilibili Game Host', () => {
  for (const testCase of hostAdapterContractCases)
    it(testCase.name, () =>
      testCase.run((options) => {
        const { sdk } = fakeSdk();
        if (options?.offer) {
          let close!: (result?: { isEnded?: boolean }) => void;
          sdk.createRewardedVideoAd = () => ({
            load: async () => undefined,
            show: async () => {
              const result = await options.offer!({ id: 'continue', reward: { lives: 1 } });
              close({ isEnded: result.status === 'completed' });
            },
            onClose: (listener) => {
              close = listener;
            },
            offClose() {},
            onError() {},
            offError() {},
            destroy() {},
          });
        }
        return createBilibiliGameHost(sdk, definition.manifest, content, {
          adUnitId: 'contract-placement',
          adAuthority: options?.session?.adAuthority === 'none' ? 'none' : 'host',
          sessionId: 'contract-bilibili',
          online: options?.online,
          capabilities: options?.session?.capabilities,
        });
      }),
    );

  it('owns Host Ad authority and rejects unapproved native navigation', async () => {
    const { sdk } = fakeSdk();
    const host = createBilibiliGameHost(sdk, definition.manifest, content, {
      sessionId: 'native-1',
    });
    expect(host.session.adAuthority).toBe('host');
    await host.navigation.navigate('exit');
    expect(sdk.exitMiniProgram).toHaveBeenCalledOnce();
    await expect(host.navigation.navigate('https://evil.example')).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it.each([true, false, undefined])('only rewards explicit SDK completion %s', async (isEnded) => {
    const { sdk } = fakeSdk();
    let close!: (result?: { isEnded?: boolean }) => void;
    const destroy = vi.fn();
    sdk.createRewardedVideoAd = () => ({
      load: async () => undefined,
      show: async () => {
        close(isEnded === undefined ? undefined : { isEnded });
        close({ isEnded: true });
      },
      onClose: (listener) => {
        close = listener;
      },
      offClose() {},
      onError() {},
      offError() {},
      destroy,
    });
    const provider = createBilibiliAdProvider(sdk, 'reviewed-placement');
    await expect(provider.show({ opportunityId: 'reward' })).resolves.toEqual({
      status: isEnded === true ? 'completed' : 'dismissed',
    });
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('degrades missing SDK ads and failed inventory without rewards', async () => {
    const { sdk } = fakeSdk();
    await expect(
      createBilibiliAdProvider(sdk, 'placement').show({ opportunityId: 'r' }),
    ).resolves.toEqual({ status: 'unavailable' });
    sdk.createRewardedVideoAd = () => ({
      load: async () => {
        throw new Error('no inventory');
      },
      show: async () => undefined,
      onClose() {},
      offClose() {},
      onError() {},
      offError() {},
      destroy() {},
    });
    await expect(
      createBilibiliAdProvider(sdk, 'placement').show({ opportunityId: 'r' }),
    ).resolves.toEqual({ status: 'failed' });
  });
});

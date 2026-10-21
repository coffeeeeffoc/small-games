import { createAdRuntime, type AdRuntimeOptions } from '@coffeeeeffoc/ad-runtime';
import type { AdvertisingPort, RewardOpportunity } from '@coffeeeeffoc/game-contract';
import { createNativeAdProvider, type NativeAdvertisingSdk } from './ads.js';

const globals = { taptap: 'tap', wechat: 'wx', douyin: 'tt', bilibili: 'bl' } as const;
export type CreatorAdPlatform = keyof typeof globals;
/** Public build configuration. No App Secret, SDK instance or reward callback enters a Game. */
export type CreatorAdConfiguration = Readonly<{
  platform: CreatorAdPlatform;
  adsEnabled: boolean;
  adUnitId?: string;
}>;
export type CreatorAdBridge = AdvertisingPort & {
  readonly available: boolean;
  readonly pending: boolean;
  cancel(): void;
  dispose(): void;
};
export type CreatorAdEnvironment = Partial<
  Record<(typeof globals)[CreatorAdPlatform], NativeAdvertisingSdk>
> & { SmallGamesRewardAds?: CreatorAdBridge };

/** Shared Creator composition: no DOM, Canvas creation, or duplicated game lifecycle. */
export function createCreatorAdBridge(
  configuration: CreatorAdConfiguration,
  environment: CreatorAdEnvironment = globalThis as CreatorAdEnvironment,
  options: Pick<AdRuntimeOptions, 'config' | 'telemetry' | 'now' | 'timeoutMs'> = {},
): CreatorAdBridge {
  const globalName = Object.hasOwn(globals, configuration.platform)
    ? globals[configuration.platform]
    : undefined;
  // Target selection is explicit; a missing Tap SDK can never fall through to wx/tt/bl.
  const sdk = globalName && environment[globalName];
  const provider = createNativeAdProvider(
    sdk || {},
    configuration.adsEnabled === true ? configuration.adUnitId : undefined,
    options.timeoutMs,
  );
  let disposed = false,
    generation = 0,
    pending: number | undefined;
  const runtime = createAdRuntime({
    ...options,
    timeoutMs: Math.max(1, options.timeoutMs ?? 120_000) + 1000,
    authority: configuration.adsEnabled === true ? 'host' : 'none',
    host: {
      show(request) {
        return disposed || pending !== generation
          ? Promise.resolve({ status: 'unavailable' as const })
          : provider.show(request);
      },
    },
  });
  return Object.freeze({
    get available() {
      return !disposed && pending === undefined && provider.available;
    },
    get pending() {
      return pending !== undefined || provider.pending;
    },
    async offer(opportunity: RewardOpportunity) {
      if (
        disposed ||
        pending !== undefined ||
        !provider.available ||
        typeof opportunity?.id !== 'string' ||
        !opportunity.id.trim()
      )
        return { status: 'unavailable' as const };
      const token = generation;
      pending = token;
      try {
        const outcome = await runtime.offer(opportunity);
        return generation === token && !disposed ? outcome : { status: 'dismissed' as const };
      } finally {
        pending = undefined;
      }
    },
    cancel() {
      generation++;
      provider.cancel();
    },
    dispose() {
      disposed = true;
      generation++;
      provider.dispose();
    },
  });
}

/** Bundle this entry before Creator's game.js; install one advertised port per host. */
export function installCreatorAdBridge(
  configuration: CreatorAdConfiguration,
  environment: CreatorAdEnvironment = globalThis as CreatorAdEnvironment,
): CreatorAdBridge {
  if (environment.SmallGamesRewardAds)
    throw new Error('A rewarded advertising port is already installed for this host.');
  const bridge = createCreatorAdBridge(configuration, environment);
  environment.SmallGamesRewardAds = bridge;
  return bridge;
}

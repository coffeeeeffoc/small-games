// Games own grants; providers own channel SDKs. TapTap can be selected by config
// without changing game rules. Explicit completion is the only successful result.
export function rewardProvider(environment = globalThis, createPlatformAdProvider) {
  const config = environment.SmallGamesPublishingConfig || {};
  if (config.adMode === 'off') return null;
  const host = environment.SmallGamesRewardAds;
  if (host?.available !== false && typeof host?.offer === 'function')
    return {
      show: (request) => host.offer({ ...request, id: request.opportunityId }),
      cancel: () => host.cancel?.(),
      dispose: () => host.cancel?.(),
    };
  if (config.adMode === 'host' && typeof config.provider?.show === 'function')
    return config.provider;
  const sdkName = { 'taptap-h5': 'tap', wechat: 'wx', douyin: 'tt', bilibili: 'bl' }[
    config.platform
  ];
  if (
    config.adMode !== 'host' ||
    config.adsEnabled === false ||
    !sdkName ||
    !/^[\w-]{1,160}$/.test(config.adUnitId || '') ||
    /^(YOUR_|REPLACE_|TODO)/i.test(config.adUnitId) ||
    typeof environment[sdkName]?.createRewardedVideoAd !== 'function'
  )
    return null;
  return createPlatformAdProvider({
    platform: config.platform,
    adUnitId: config.adUnitId,
    environment,
  });
}
export function createRewardRequests({ provider, isCurrent, eligible, grant }) {
  let active = null,
    generation = 0,
    sequence = 0,
    disposed = false;
  function cancel() {
    generation++;
    const request = active;
    active = null;
    request?.cancel();
    try {
      provider?.cancel?.();
    } catch {
      /* SDK cancellation is optional. */
    }
  }
  return {
    get available() {
      return !!provider && !disposed;
    },
    get pending() {
      return !!active;
    },
    cancel,
    async request(run, kind) {
      if (disposed || !provider || active || !isCurrent(run) || !eligible(run, kind))
        return { status: 'unavailable', granted: false };
      const token = generation,
        id = `ball-roguelite:${kind}:${++sequence}`;
      let resolveCancel;
      const cancelled = new Promise((resolve) => {
        resolveCancel = () => resolve({ status: 'dismissed' });
      });
      const operation = { cancel: resolveCancel };
      active = operation;
      try {
        const result = await Promise.race([
          Promise.resolve().then(() => provider.show({ opportunityId: id, kind: 'rewarded' })),
          cancelled,
        ]);
        if (disposed || generation !== token || active !== operation || !isCurrent(run))
          return { status: 'dismissed', granted: false };
        const granted = result?.status === 'completed' && eligible(run, kind) && grant(run, kind);
        return { status: result?.status || 'failed', granted: !!granted };
      } catch {
        return { status: 'failed', granted: false };
      } finally {
        if (active === operation) active = null;
      }
    },
    dispose() {
      disposed = true;
      cancel();
      try {
        provider?.dispose?.();
      } catch {
        /* Optional SDK teardown. */
      }
    },
  };
}

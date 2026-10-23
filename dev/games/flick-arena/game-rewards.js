import { createPlatformAdProvider } from './platform-ads.js';
import { createInterstitials } from './interstitial.js';

/** Optional H5 reward port. Games own eligibility, pause, persistence and grants. */
export function createGameRewards(environment = globalThis) {
  const config = environment.SmallGamesPublishingConfig || {};
  const available =
    config.adsEnabled === true &&
    config.adMode === 'host' &&
    config.platform === 'taptap-h5' &&
    /^[\w-]{1,160}$/.test(config.adUnitId || '') &&
    !/^(YOUR_|REPLACE_|TODO)/i.test(config.adUnitId);
  const provider = createPlatformAdProvider({
    platform: available ? config.platform : '',
    adUnitId: available ? config.adUnitId : '',
    environment,
  });
  let pending = false,
    disposed = false,
    generation = 0,
    waiting;
  const breaks = createInterstitials(environment, available ? config.adUnitId : '', () => pending);
  const visible = () => {
    if (!environment.document?.hidden) waiting?.('completed');
  };
  const cancel = () => {
    generation++;
    provider.cancel();
    waiting?.('dismissed');
  };
  const exit = () => {
    cancel();
    provider.dispose();
    breaks.dispose();
  };
  environment.addEventListener?.('pagehide', exit);
  environment.document?.addEventListener?.('visibilitychange', visible);
  async function offer(request = {}) {
    if (disposed || !available || pending || breaks.pending || environment.document?.hidden)
      return { status: 'unavailable' };
    const id = request.id || request.opportunityId;
    if (typeof id !== 'string' || !id) return { status: 'unavailable' };
    pending = true;
    breaks.noteReward();
    const token = generation;
    try {
      let result = await provider.show({ ...request, opportunityId: id, kind: 'rewarded' });
      if (token !== generation) return { status: 'dismissed' };
      if (result.status === 'completed' && environment.document?.hidden) {
        result = await new Promise((resolve) => {
          waiting = (status) => {
            waiting = undefined;
            resolve({ status });
          };
          visible();
        });
      }
      return token === generation ? result : { status: 'dismissed' };
    } catch {
      return { status: 'failed' };
    } finally {
      breaks.noteReward();
      pending = false;
    }
  }
  return Object.freeze({
    get available() {
      return available && !disposed;
    },
    get pending() {
      return pending;
    },
    timeoutMs: provider.timeoutMs,
    offer,
    show: offer,
    cancel,
    atBreak: breaks.atBreak,
    dispose() {
      disposed = true;
      cancel();
      provider.dispose();
      breaks.dispose();
      environment.removeEventListener?.('pagehide', exit);
      environment.document?.removeEventListener?.('visibilitychange', visible);
    },
  });
}

if (typeof window !== 'undefined') {
  globalThis.SmallGamesRewardAds = createGameRewards();
  dispatchEvent(new Event('smallgames-rewards-ready'));
}

import type { RewardOpportunity, RewardOutcome } from '@coffeeeeffoc/game-contract';

type RewardPort = {
  offer?(request: RewardOpportunity): Promise<RewardOutcome>;
  show?(request: RewardOpportunity): Promise<RewardOutcome>;
  cancel?(): void;
};
type RewardEnvironment = { SmallGamesRewardAds?: RewardPort };

/** Resolve the packaging host on every request, including late SDK injection. */
export function createHintRewards(environment: RewardEnvironment) {
  let active: RewardPort | undefined;
  let generation = 0;
  return {
    async offer(request: RewardOpportunity): Promise<RewardOutcome> {
      const port = environment.SmallGamesRewardAds;
      const offer = port?.offer ?? port?.show;
      if (active || !port || !offer) return { status: 'unavailable' };
      active = port;
      const token = ++generation;
      try {
        const result = await offer.call(port, request);
        return token === generation ? result : { status: 'dismissed' };
      } catch {
        return { status: 'failed' };
      } finally {
        if (token === generation) active = undefined;
      }
    },
    cancel() {
      generation++;
      const port = active;
      active = undefined;
      try {
        port?.cancel?.();
      } catch {
        /* Host cleanup is best effort. */
      }
    },
  };
}

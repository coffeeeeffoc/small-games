/** Engine-independent progression and rewarded speed policy. */
export const SPEEDS = [1, 2, 3, 5] as const;
export type Speed = (typeof SPEEDS)[number];
export interface Progress {
  stars: number[];
  sound: boolean;
  lowQuality: boolean;
}
export function readProgress(raw: string | null, count: number): Progress {
  let data: Partial<Progress> = {};
  try {
    data = JSON.parse(raw || '{}') || {};
  } catch {
    /* Corrupt storage is optional. */
  }
  return {
    stars: Array.from({ length: count }, (_, i) => {
      const value = data.stars?.[i];
      return Number.isInteger(value) && value! >= 0 && value! <= 3 ? value! : 0;
    }),
    sound: data.sound !== false,
    lowQuality: data.lowQuality === true,
  };
}
export function unlocked(progress: Progress, index: number) {
  return (
    Number.isInteger(index) &&
    index >= 0 &&
    index < progress.stars.length &&
    (index === 0 || progress.stars[index - 1]! > 0)
  );
}
export function continueIndex(progress: Progress) {
  const index = progress.stars.findIndex((value) => value === 0);
  return index < 0 ? progress.stars.length - 1 : index;
}
export function complete(progress: Progress, index: number, stars: number, practice: boolean) {
  if (practice || !unlocked(progress, index) || !Number.isInteger(stars) || stars < 1 || stars > 3)
    return false;
  progress.stars[index] = Math.max(progress.stars[index]!, stars);
  return true;
}
export type AdStatus = 'completed' | 'dismissed' | 'unavailable' | 'failed';
export interface RewardRequest {
  id: string;
  reward: { speed: Speed };
  onShown?: () => void;
}
export interface RewardProvider {
  available?: boolean;
  offer(request: RewardRequest): Promise<{ status: AdStatus }>;
  cancel?(): void;
}
const activeProviders = new WeakSet<RewardProvider>();
/** Every run owns its gate. A late callback cannot reward a new run or a cancelled offer. */
export class SpeedGate {
  speed: Speed = 1;
  readonly unlocked = new Set<Speed>([1]);
  pending = false;
  private token = 0;
  private provider?: RewardProvider;
  async choose(
    speed: Speed,
    provider?: RewardProvider,
  ): Promise<AdStatus | 'selected' | 'busy' | 'stale'> {
    if (!SPEEDS.includes(speed)) return 'failed';
    if (this.pending) return 'busy';
    if (this.unlocked.has(speed)) {
      this.speed = speed;
      return 'selected';
    }
    if (!provider || provider.available === false || activeProviders.has(provider))
      return 'unavailable';
    activeProviders.add(provider);
    this.provider = provider;
    this.pending = true;
    const token = ++this.token;
    try {
      const result = await provider.offer({
        id: `homebound-station:speed:${speed}`,
        reward: { speed },
      });
      if (token !== this.token) return 'stale';
      if (result?.status === 'completed') {
        this.unlocked.add(speed);
        this.speed = speed;
        return 'completed';
      }
      return ['dismissed', 'unavailable', 'failed'].includes(result?.status)
        ? result.status
        : 'failed';
    } catch {
      return token === this.token ? 'failed' : 'stale';
    } finally {
      activeProviders.delete(provider);
      if (this.provider === provider) this.provider = undefined;
      if (token === this.token) this.pending = false;
    }
  }
  cancel(_provider?: RewardProvider) {
    this.token++;
    this.pending = false;
    const provider = this.provider;
    this.provider = undefined;
    try {
      provider?.cancel?.();
    } catch {
      /* SDK cleanup must never interrupt navigation. */
    }
  }
}

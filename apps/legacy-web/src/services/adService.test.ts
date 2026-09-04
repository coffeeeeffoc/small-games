import { describe, it, expect } from 'vitest';
import { playRewardedAd } from './adService';
describe('ad service', () => {
  it('rewards preview playback', async () =>
    expect((await playRewardedAd('preview')).rewarded).toBe(true));
  it('rewards directly when ads are off', async () =>
    expect((await playRewardedAd('off')).rewarded).toBe(true));
});

import { ZOOM_LEVELS } from './Data.ts';

export type RewardKind = 'supply' | 'zoom';
export type SupplyReward = 'tracking' | 'ammo' | 'rate';
export type RewardOutcome = { status: 'completed' | 'dismissed' | 'unavailable' | 'failed' };
// Structurally compatible with GameHost.ads.offer; the SDK bridge owns playback and completion.
export type RewardProvider = (opportunity: {
  id: string; reward: Record<string, number>;
}) => Promise<RewardOutcome>;
export type RewardSave = { ammo: number; zoomLimit: number; pendingSupply: boolean };
export function readRewards(raw: string | null): RewardSave {
  try {
    const data = JSON.parse(raw || '{}');
    return {
      ammo: Number.isSafeInteger(data?.ammo) && data.ammo >= 0 ? data.ammo : 0,
      zoomLimit: ZOOM_LEVELS.some(value => value === data?.zoomLimit) ? Math.max(10, data.zoomLimit) : 10,
      pendingSupply: data?.pendingSupply === true,
    };
  } catch { return { ammo: 0, zoomLimit: 10, pendingSupply: false }; }
}
export const nextZoomLimit = (limit: number) => ZOOM_LEVELS.find(value => value > limit);

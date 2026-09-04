/** Minimal values affected by one office timer tick. */
export type OfficeMetrics = { joy: number; suspicion: number };

/** Applies one second of slacking or work under the current inspection state. */
export function tickOffice(
  metrics: OfficeMetrics,
  slacking: boolean,
  bossWatching: boolean,
  shieldLevel = 0,
): OfficeMetrics {
  const danger = Math.max(2, 8 - shieldLevel * 2);
  return {
    joy: metrics.joy + (slacking && !bossWatching ? 2 : 0),
    suspicion: Math.max(
      0,
      Math.min(100, metrics.suspicion + (slacking && bossWatching ? danger : -2)),
    ),
  };
}

/** Returns the shared-wallet cost for the next privacy-screen level. */
export function upgradeCost(level: number): number {
  return 15 + level * 12;
}

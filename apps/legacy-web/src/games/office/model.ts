export type OfficeState = { joy: number; suspicion: number; coins: number };
export function tick(
  s: OfficeState,
  slacking: boolean,
  bossWatching: boolean,
  shieldLevel = 0,
): OfficeState {
  const danger = Math.max(2, 8 - shieldLevel * 2);
  return {
    joy: s.joy + (slacking && !bossWatching ? 2 : 0),
    coins: s.coins + (slacking && !bossWatching ? 1 : 0),
    suspicion: Math.max(0, Math.min(100, s.suspicion + (slacking && bossWatching ? danger : -2))),
  };
}
export function upgradeCost(level: number) {
  return 15 + level * 12;
}

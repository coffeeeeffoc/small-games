import { routes } from './RouteCatalog.ts';
import { readSelection, type Selection } from './Selection.ts';
import { formatTime } from './RankingSystem.ts';
import type { RaceManager } from './RaceManager.ts';
import { KartConfig } from './KartConfig.ts';

export type RoutePassport = Record<string, number>;
export const STAMPS = [
  { bit: 1, name: '路线冠军', goal: '三圈获得第 1 名' },
  { bit: 2, name: '漂移达人', goal: '三圈释放 4 次漂移加速' },
  { bit: 4, name: '补给猎手', goal: '三圈拾取 6 个有益补给' },
] as const;
export function readPassport(raw: string | null): RoutePassport {
  const result: RoutePassport = {};
  try {
    const value = raw && raw.length < 4000 ? JSON.parse(raw) : {};
    for (const route of routes) {
      const bits = value?.[route.id];
      if (Number.isInteger(bits) && bits >= 0 && bits <= 7) result[route.id] = bits;
    }
  } catch { /* A damaged passport cannot erase the existing race records. */ }
  return result;
}
export function earnedStamps(race: RaceManager) {
  const p = race.drivers[0].progress;
  if (race.networked || race.phase !== 'finished' || p.finishedAt <= 0 || p.laps < KartConfig.laps) return 0;
  return Number(race.order[0] === 0) |
    (race.driftBoosts >= 4 ? 2 : 0) | (race.suppliesCollected >= 6 ? 4 : 0);
}
export function awardPassport(passport: RoutePassport, route: string, race: RaceManager): RoutePassport {
  if (!routes.some((r) => r.id === route)) return { ...passport };
  return { ...passport, [route]: (passport[route] || 0) | earnedStamps(race) };
}
export function stampCount(bits: number) {
  return STAMPS.filter((stamp) => Boolean(bits & stamp.bit)).length;
}
export function passportCount(passport: RoutePassport) {
  return routes.reduce((n, route) => n + stampCount(passport[route.id] || 0), 0);
}
export type KartChallenge = { selection: Selection; seed: number; time: number };
export function readKartChallenge(query: Record<string, unknown>): KartChallenge | undefined {
  if (!query || query.room || query.kartChallenge !== 'v1') return;
  if (['theme', 'route', 'vehicle', 'driver'].some((field) => typeof query[field] !== 'string')) return;
  const selection = readSelection(JSON.stringify({ theme: query.theme, route: query.route,
    vehicle: query.vehicle, driver: query.driver }));
  if (Object.entries(selection).some(([field, value]) => query[field] !== value)) return;
  if (typeof query.seed !== 'string' || !/^(0|[1-9]\d{0,9})$/.test(query.seed) ||
      typeof query.target !== 'string' || !/^[1-9]\d{0,6}$/.test(query.target)) return;
  const seed = Number(query.seed), target = Number(query.target);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || target < 1 || target > 3600000) return;
  return { selection, seed, time: target / 1000 };
}
export function readKartChallengeSearch(search: string): KartChallenge | undefined {
  const params = new URLSearchParams(search);
  if (['kartChallenge', 'theme', 'route', 'vehicle', 'driver', 'seed', 'target']
    .some((field) => params.getAll(field).length !== 1)) return;
  return readKartChallenge(Object.fromEntries(params));
}
export function kartChallengeQuery(selection: Selection, seed: number, time: number) {
  const query = { kartChallenge: 'v1', ...selection, seed: String(seed), target: String(Math.round(time * 1000)) };
  if (!readKartChallenge(query)) throw new Error('A share challenge requires a valid route, seed and finish time.');
  return Object.entries(query).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
}
export function kartChallengeTitle(challenge: KartChallenge) {
  return `浪湾卡丁车 · ${routes.find((r) => r.id === challenge.selection.route)!.name}三圈 ${formatTime(challenge.time)}，同道具来挑战！`;
}

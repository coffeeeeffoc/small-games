import { routes, routeRecordKey } from './RouteCatalog.ts';
import { readSelection, type Selection } from './Selection.ts';
import { formatTime } from './RankingSystem.ts';
import type { RaceManager, RaceMode } from './RaceManager.ts';
import { KartConfig } from './KartConfig.ts';
import type { KartUpgrades } from './KartPhysics.ts';

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
  if (race.mode !== 'standard' || race.networked || race.phase !== 'finished' || p.finishedAt <= 0 || p.laps < KartConfig.laps) return 0;
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
export const raceRecordKey = (route: string, mode: RaceMode) =>
  mode === 'sprint' ? `kart-sprint-records-v1-${route}` : routeRecordKey(route);
export function readRaceMode(query: Record<string, unknown>): RaceMode | undefined {
  if (query.kartChallenge !== undefined || query.room) return;
  return query.mode === 'standard' || query.mode === 'sprint' ? query.mode : undefined;
}
export function readRaceModeSearch(search: string): RaceMode | undefined {
  const params = new URLSearchParams(search);
  if (params.getAll('mode').length !== 1) return;
  return readRaceMode(Object.fromEntries(params));
}
export function sprintNextGoal(race: RaceManager) {
  if (race.collisions > 0) return '下一场目标：少碰一次护栏，让出弯速度留下来';
  if (!race.driftBoosts) return '下一场目标：过弯蓄力，完成一次松手漂移加速';
  if (race.order[0] !== 0) return '下一场目标：把漂移加速留到出弯，挑战第 1 名';
  return '一圈冠军！换条路线试手感，或挑战三圈路线印章';
}
export type KartChallenge = { selection: Selection; seed: number; time: number; mode: RaceMode; parts?: KartUpgrades };
export function readKartChallenge(query: Record<string, unknown>): KartChallenge | undefined {
  if (!query || query.room || !['v1', 'v2', 'v3'].includes(query.kartChallenge as string)) return;
  const mode = query.kartChallenge === 'v1' && query.mode === undefined ? 'standard'
    : ['v2', 'v3'].includes(query.kartChallenge as string) && (query.mode === 'standard' || query.mode === 'sprint') ? query.mode : undefined;
  if (!mode) return;
  if (query.kartChallenge === 'v3' && (typeof query.parts !== 'string' || !/^[0-5],[0-5],[0-5]$/.test(query.parts))) return;
  if (query.kartChallenge !== 'v3' && query.parts !== undefined) return;
  if (['theme', 'route', 'vehicle', 'driver'].some((field) => typeof query[field] !== 'string')) return;
  const selection = readSelection(JSON.stringify({ theme: query.theme, route: query.route,
    vehicle: query.vehicle, driver: query.driver }));
  if (Object.entries(selection).some(([field, value]) => query[field] !== value)) return;
  if (typeof query.seed !== 'string' || !/^(0|[1-9]\d{0,9})$/.test(query.seed) ||
      typeof query.target !== 'string' || !/^[1-9]\d{0,6}$/.test(query.target)) return;
  const seed = Number(query.seed), target = Number(query.target);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || target < 1 || target > 3600000) return;
  const [engine, grip, nitro] = query.kartChallenge === 'v3' ? (query.parts as string).split(',').map(Number) : [];
  return { selection, seed, time: target / 1000, mode,
    ...(query.kartChallenge === 'v3' ? { parts: { engine, grip, nitro } } : {}) };
}
export function readKartChallengeSearch(search: string): KartChallenge | undefined {
  const params = new URLSearchParams(search);
  if (['kartChallenge', 'theme', 'route', 'vehicle', 'driver', 'seed', 'target']
    .some((field) => params.getAll(field).length !== 1)) return;
  if (params.getAll('mode').length > 1) return;
  if (params.getAll('parts').length > 1) return;
  return readKartChallenge(Object.fromEntries(params));
}
export function kartChallengeQuery(selection: Selection, seed: number, time: number, mode: RaceMode = 'standard', parts?: KartUpgrades) {
  const upgraded = parts && Object.values(parts).some(level => level > 0);
  const query = { kartChallenge: upgraded ? 'v3' : 'v2', mode, ...selection, seed: String(seed), target: String(Math.round(time * 1000)),
    ...(upgraded ? { parts: `${parts.engine},${parts.grip},${parts.nitro}` } : {}) };
  if (!readKartChallenge(query)) throw new Error('A share challenge requires a valid route, seed and finish time.');
  return Object.entries(query).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
}
export function kartChallengeTitle(challenge: KartChallenge) {
  return `浪湾卡丁车 · ${routes.find((r) => r.id === challenge.selection.route)!.name}${challenge.mode === 'sprint' ? '一圈' : '三圈'} ${formatTime(challenge.time)}，同道具来挑战！`;
}

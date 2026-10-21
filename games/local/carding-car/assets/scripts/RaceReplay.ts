import { RaceManager, type RaceMode } from './RaceManager.ts';
import { routes } from './RouteCatalog.ts';
import type { KartInput } from './KartConfig.ts';
import type { KartUpgrades } from './KartPhysics.ts';

export const RANKED_RULE_VERSION = 'kart-input-replay-v1';
const requireInput = (ok: unknown) => { if (!ok) throw new Error('Invalid kart input'); };
export function raceLevel(route: string, count: number, parts: KartUpgrades) {
  return `${route}:${count}:${parts.engine}:${parts.grip}:${parts.nitro}`;
}
export function raceSetup(board: string, levelId: string) {
  const match = /^([a-z-]+):([1-8]):([0-5]):([0-5]):([0-5])$/.exec(levelId);
  const route = routes.find(route => route.id === match?.[1]);
  requireInput(route && (board === `${route.id}-standard` || board === `${route.id}-sprint`));
  return { route: route!, count: Number(match![2]), mode: board.endsWith('-sprint') ? 'sprint' as const : 'standard' as const,
    upgrades: { engine: Number(match![3]), grip: Number(match![4]), nitro: Number(match![5]) } };
}
export function raceCheckpoint(race: RaceManager) {
  const value = { drivers: race.drivers, items: race.items, phase: race.phase, time: race.time,
    boosts: race.boosts, collisions: race.collisions, resets: race.resets,
    itemsCollected: race.itemsCollected, suppliesCollected: race.suppliesCollected, driftBoosts: race.driftBoosts };
  return JSON.parse(JSON.stringify(value)) as typeof value;
}
export function createKartReplay(board: string, seed: number, levelId: string) {
  const setup = raceSetup(board, levelId);
  const race = new RaceManager(setup.route.track, seed, setup.count, setup.mode);
  race.upgrades = setup.upgrades;
  // The countdown has no physics; the journal begins with the first driving frame.
  race.phase = 'racing'; race.countdown = 0;
  return { board, seed, levelId, race: raceCheckpoint(race) };
}
export type KartReplay = ReturnType<typeof createKartReplay>;
export function restoreKartReplay(state: KartReplay) {
  const setup = raceSetup(state.board, state.levelId);
  const race = new RaceManager(setup.route.track, state.seed, setup.count, setup.mode);
  Object.assign(race, state.race);
  race.upgrades = setup.upgrades; race.countdown = 0;
  return race;
}
export function applyKartReplay(state: KartReplay, frames: { input: Record<string, unknown>; ticks: number }[]) {
  const race = restoreKartReplay(state);
  for (const { input, ticks } of frames) {
    requireInput(Number.isSafeInteger(ticks) && ticks > 0 && ticks <= 2400 && ticks % 2 === 0);
    requireInput(input && typeof input === 'object' && !Array.isArray(input) && Object.keys(input).length === 1 && Object.hasOwn(input, 'drive'));
    const drive = input.drive as KartInput;
    requireInput(drive && typeof drive === 'object' && !Array.isArray(drive) &&
      Object.keys(drive).every(key => ['steer', 'throttle', 'brake', 'drift', 'reverse', 'nitro'].includes(key)) &&
      Number.isFinite(drive.steer) && drive.steer >= -1 && drive.steer <= 1 &&
      Number.isFinite(drive.throttle) && drive.throttle >= 0 && drive.throttle <= 1 &&
      typeof drive.brake === 'boolean' && typeof drive.drift === 'boolean' &&
      (drive.reverse === undefined || typeof drive.reverse === 'boolean') &&
      (drive.nitro === undefined || typeof drive.nitro === 'boolean'));
    for (let tick = 0; tick < ticks; tick += 2) {
      requireInput(race.phase === 'racing');
      race.step(drive, 1 / 60);
    }
  }
  state.race = raceCheckpoint(race);
  return state;
}
export function kartReplayResult(state: KartReplay) {
  const race = restoreKartReplay(state), player = race.drivers[0].progress;
  const complete = race.phase === 'finished' && player.laps === race.laps && player.finishedAt > 0;
  // Local garage ownership is not server-authoritative; tuned races retain private verified records.
  const stock = Object.values(race.upgrades).every(level => level === 0);
  return { complete, eligible: complete && stock && race.drivers.length === 4,
    score: complete ? 1 : 0, secondary: complete ? Math.round(player.finishedAt * 1000) : 0 };
}

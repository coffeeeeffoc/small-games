import { MISSIONS } from './MissionCatalog.ts';
import type { Simulation } from './Simulation.ts';
import type { Kind } from './Data.ts';

export type MissionTimes = Record<string, { bestMs: number; attempts: number }>;
export type TimeComparison = { currentMs: number; bestMs: number; previousMs?: number; newRecord: boolean };
export function readMissionTimes(raw: string | null): MissionTimes {
  const result: MissionTimes = {};
  try {
    const data = raw && raw.length < 64000 ? JSON.parse(raw) : {};
    for (const { id } of MISSIONS) {
      const item = data?.[id];
      if (Number.isSafeInteger(item?.bestMs) && item.bestMs > 0 && Number.isSafeInteger(item.attempts) && item.attempts > 0)
        result[id] = { bestMs: item.bestMs, attempts: item.attempts };
    }
  } catch { /* A broken optional record never blocks a mission. */ }
  return result;
}
export function recordMissionTime(records: MissionTimes, sim: Pick<Simulation, 'mission' | 'phase' | 'time' | 'completionTime'>, practice = false): TimeComparison | undefined {
  if (practice || sim.mission.mode !== 'escort' || sim.phase !== 'success' || !Number.isFinite(sim.time) || sim.time <= 0) return;
  const currentMs = Math.round((sim.completionTime ?? sim.time) * 1000), previous = records[sim.mission.id];
  const bestMs = Math.min(currentMs, previous?.bestMs ?? currentMs);
  records[sim.mission.id] = { bestMs, attempts: Math.min(Number.MAX_SAFE_INTEGER, (previous?.attempts ?? 0) + 1) };
  return { currentMs, bestMs, previousMs: previous?.bestMs, newRecord: !previous || currentMs < previous.bestMs };
}
export function battleCounts(sim: Pick<Simulation, 'units' | 'mission' | 'spawned'>, friendly = false, duel = false) {
  return (['light', 'turret', 'heavy', 'rescue', 'escort'] as Kind[]).map(kind => {
    const units = sim.units.filter(unit => unit.kind === kind && unit.friendly === friendly);
    const pending = friendly || duel ? 0 : sim.mission.events.filter((event, index) => event.kind === kind && !sim.spawned.has(index)).length;
    const alive = units.filter(unit => unit.hp > 0).length;
    return { kind, total: units.length + pending, alive, destroyed: units.length - alive, pending };
  }).filter(row => row.total > 0);
}
export function formatTime(ms: number) {
  const centiseconds = Math.round(ms / 10);
  return `${Math.floor(centiseconds / 6000).toString().padStart(2, '0')}:${(centiseconds % 6000 / 100).toFixed(2).padStart(5, '0')}`;
}

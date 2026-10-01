import { KartConfig } from './KartConfig.ts';
import type { Progress } from './CheckpointSystem.ts';
export function updateLap(p: Progress, crossed: boolean, raceTime: number, requiredLaps: number = KartConfig.laps) {
  if (!crossed || p.finishedAt || (requiredLaps !== 1 && requiredLaps !== KartConfig.laps)) return false;
  p.laps++;
  p.lapTimes.push(raceTime - p.lapStarted);
  p.lapStarted = raceTime;
  if (p.laps >= requiredLaps) p.finishedAt = raceTime;
  return p.laps >= requiredLaps;
}

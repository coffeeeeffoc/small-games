import { KartConfig } from './KartConfig.ts';
import type { Progress } from './CheckpointSystem.ts';
export function updateLap(p: Progress, crossed: boolean, raceTime: number) {
  if (!crossed || p.finishedAt) return false;
  p.laps++;
  p.lapTimes.push(raceTime - p.lapStarted);
  p.lapStarted = raceTime;
  if (p.laps >= KartConfig.laps) p.finishedAt = raceTime;
  return p.laps >= KartConfig.laps;
}

import type { Progress } from './CheckpointSystem.ts';
export function ranking(drivers: { progress: Progress }[]) {
  return drivers
    .map((_, i) => i)
    .sort((a, b) => {
      const x = drivers[a].progress,
        y = drivers[b].progress;
      if (x.finishedAt || y.finishedAt)
        return (x.finishedAt || Infinity) - (y.finishedAt || Infinity);
      return y.distance - x.distance;
    });
}

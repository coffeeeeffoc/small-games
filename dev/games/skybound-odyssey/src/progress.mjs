import { ROUTES } from './content.mjs';
export function cleanProgress(value) {
  const ids = ROUTES.map((r) => r.id);
  const completed = Array.isArray(value?.completed)
    ? value.completed.filter((id, i, all) => ids.includes(id) && all.indexOf(id) === i)
    : [];
  const valid = [];
  for (const route of ROUTES)
    if (completed.includes(route.id) && (!route.unlock || valid.includes(route.unlock)))
      valid.push(route.id);
  const finite = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  return {
    version: 1,
    completed: valid,
    bestDistance: finite(value?.bestDistance),
    bestScore: finite(value?.bestScore),
    runs: finite(value?.runs),
    motion: value?.motion === true,
    sound: value?.sound !== false,
  };
}
export const isUnlocked = (progress, route) =>
  !route.unlock || progress.completed.includes(route.unlock);
export function settle(progress, run, runScore) {
  const next = cleanProgress(progress);
  if (run.practice || !['failed', 'complete'].includes(run.status)) return next;
  next.runs++;
  next.bestDistance = Math.max(next.bestDistance, Math.floor(run.distance));
  next.bestScore = Math.max(next.bestScore, runScore);
  if (
    run.status === 'complete' &&
    run.routeId !== 'endless' &&
    !next.completed.includes(run.routeId)
  ) {
    const route = ROUTES.find((r) => r.id === run.routeId);
    if (route && isUnlocked(next, route)) next.completed.push(route.id);
  }
  return next;
}

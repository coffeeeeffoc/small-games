// Personal feedback only: no ranking or competitive score depends on this streak.
export const freshWordFlow = () => ({ current: 0, best: 0, assisted: false });
export function restoreWordFlow(value, completed) {
  if (!value || !Number.isInteger(value.current) || !Number.isInteger(value.best)
      || value.current < 0 || value.current > value.best || value.best > completed
      || typeof value.assisted !== 'boolean') return freshWordFlow();
  return { current: value.current, best: value.best, assisted: value.assisted };
}
export function interruptWordFlow(flow) { flow.current = 0; flow.assisted = true; }
export function recordWordFlow(flow) {
  flow.current = flow.assisted ? 0 : flow.current + 1;
  flow.best = Math.max(flow.best, flow.current);
  flow.assisted = false;
}

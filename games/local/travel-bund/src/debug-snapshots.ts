// The shared dev API has one callback. Each game subsystem contributes its own
// fields without replacing diagnostics registered by another subsystem.
const snapshots = new Map<symbol, () => Record<string, unknown>>();
const readSnapshot = () => Object.assign({}, ...[...snapshots.values()].map((read) => read()));
export function registerSnapshot(read: () => Record<string, unknown>) {
  const key = Symbol();
  snapshots.set(key, read);
  const unregister = window.SmallGamesDev.registerSnapshot(readSnapshot);
  return () => {
    snapshots.delete(key);
    if (!snapshots.size) unregister();
  };
}

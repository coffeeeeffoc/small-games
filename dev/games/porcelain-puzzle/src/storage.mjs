import { restore } from './core.mjs';
import { VERSION, vesselFor, levelAt } from './content.mjs';
const KEY = 'porcelain-puzzle.save.v1';
export function emptySave() {
  return {
    version: VERSION,
    unlocked: 1,
    collection: [],
    best: {},
    attempt: null,
    settings: { sound: true, motion: true, haptics: true },
  };
}
export function loadSave(port) {
  try {
    const s = JSON.parse(port.getItem(KEY));
    if (!s || s.version !== VERSION) return emptySave();
    const out = emptySave();
    out.unlocked = Math.max(1, Math.min(100, Number(s.unlocked) || 1));
    out.collection = Array.isArray(s.collection)
      ? s.collection.filter((x) => typeof x === 'string')
      : [];
    out.best = s.best && typeof s.best === 'object' ? s.best : {};
    out.attempt = restore(s.attempt);
    out.settings = { ...out.settings, ...s.settings };
    return out;
  } catch {
    return emptySave();
  }
}
export function persist(port, save) {
  try {
    port.setItem(KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}
export function settle(save, state, practice = false, advanceMainline = true) {
  if (state.phase !== 'won' || practice) return false;
  if (advanceMainline) save.unlocked = Math.max(save.unlocked, Math.min(100, state.number + 1));
  const id = vesselFor(levelAt(state.number)).id;
  if (!save.collection.includes(id)) save.collection.push(id);
  const key = state.levelId + (state.assisted ? ':assisted' : ':clean'),
    old = save.best[key];
  if (!old || state.elapsedMs < old.elapsedMs)
    save.best[key] = { elapsedMs: state.elapsedMs, revives: state.revives };
  save.attempt = null;
  return true;
}

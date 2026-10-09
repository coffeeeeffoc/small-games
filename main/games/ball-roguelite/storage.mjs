import { LEVELS, levelById } from './levels.mjs';
import { checkpoint, restoreGame } from './core.mjs';
export const STORAGE_KEY = 'ball-roguelite:save:v1';
const copy = (value) => JSON.parse(JSON.stringify(value));
const record = (value) => value && typeof value === 'object' && !Array.isArray(value);
const number = (value) => Number.isInteger(value) && value >= 0 && value <= 10000000;
const modes = ['campaign', 'endless'];
const modeOf = (game) => game.level.endless ? 'endless' : 'campaign';
export function createStorage(storage) {
  if (storage === undefined) { try { storage = globalThis.localStorage; } catch { storage = null; } }
  let persistent = !!storage;
  const data = { schemaVersion: 2, completed: {}, bestEndless: 0, lastLevel: LEVELS[0].id, lastMode: 'campaign', sound: true, haptics: true, runs: { campaign: null, endless: null } };
  try {
    const raw = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null');
    if (record(raw) && [0, 1, 2].includes(raw.schemaVersion)) {
      if (typeof raw.sound === 'boolean') data.sound = raw.sound;
      if (typeof raw.haptics === 'boolean') data.haptics = raw.haptics;
      if (number(raw.bestEndless)) data.bestEndless = raw.bestEndless;
      if (record(raw.completed)) for (const level of LEVELS) {
        const result = raw.completed[level.id];
        if ((!level.unlock || data.completed[level.unlock]) && record(result) && number(result.score) && number(result.turns) && result.turns > 0) {
          data.completed[level.id] = { score: result.score, turns: result.turns, stars: stars(level, result.turns) };
        }
      }
      // Older saves used one lastLevel for both modes. Recover the next campaign
      // destination when that field points at endless instead of a starfield.
      data.lastLevel = LEVELS.find((level) => unlocked(level.id) && !data.completed[level.id])?.id || LEVELS.at(-1).id;
      if (LEVELS.some((level) => level.id === raw.lastLevel) && unlocked(raw.lastLevel)) data.lastLevel = raw.lastLevel;
      if (raw.schemaVersion === 2) {
        if (modes.includes(raw.lastMode)) data.lastMode = raw.lastMode;
        if (record(raw.runs)) for (const mode of modes) acceptResume(raw.runs[mode], mode);
      } else {
        if (raw.lastLevel === 'endless') data.lastMode = 'endless';
        const resume = restoreGame(raw.resume);
        if (resume && unlocked(resume.levelId)) {
          data.lastMode = modeOf(resume);
          acceptResume(raw.resume, data.lastMode);
        }
      }
    }
  } catch { /* Corrupt or unavailable storage falls back to this session. */ }
  function unlocked(id) { const level = levelById(id); return !!level && (!level.unlock || !!data.completed[level.unlock]); }
  function acceptResume(saved, mode) {
    const resume = restoreGame(saved);
    if (!resume || modeOf(resume) !== mode || !unlocked(resume.levelId)) return;
    data.runs[mode] = checkpoint(resume);
    if (mode === 'campaign') data.lastLevel = resume.levelId;
  }
  function stars(level, turns) { return turns <= level.waves.length + 2 ? 3 : turns <= level.waves.length + 6 ? 2 : 1; }
  function persist() { try { storage?.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { persistent = false; } }
  return {
    // The alias keeps integrations that inspect the last played run compatible.
    read: () => copy({ ...data, resume: data.runs[data.lastMode] }),
    getResume: (mode = data.lastMode) => copy(data.runs[mode] || null),
    isUnlocked: unlocked,
    get persistent() { return persistent; },
    saveRun(game) {
      if (game.practice) return;
      const saved = checkpoint(game);
      if (saved) {
        const mode = modeOf(game);
        // Persist the restorable round state, without stale previous-volley
        // counters, so switching modes and reloading produce the same snapshot.
        const restored = restoreGame(saved);
        if (!restored) return;
        data.runs[mode] = checkpoint(restored); data.lastMode = mode;
        if (mode === 'campaign') data.lastLevel = game.levelId;
        persist();
      }
    },
    finish(game) {
      if (game.practice || !['won', 'lost'].includes(game.phase)) return false;
      const mode = modeOf(game);
      data.runs[mode] = null; data.lastMode = mode;
      if (mode === 'campaign') data.lastLevel = game.levelId;
      if (game.level.endless) data.bestEndless = Math.max(data.bestEndless, game.score);
      else if (game.phase === 'won') {
        const old = data.completed[game.levelId];
        const turns = Math.max(1, game.turn);
        data.completed[game.levelId] = { score: Math.max(old?.score || 0, game.score), turns: Math.min(old?.turns || Infinity, turns), stars: Math.max(old?.stars || 0, stars(game.level, turns)) };
      }
      persist(); return true;
    },
    setting(key, value) { if (['sound', 'haptics'].includes(key)) { data[key] = !!value; persist(); } },
    clearResume(mode = data.lastMode) { if (modes.includes(mode)) { data.runs[mode] = null; persist(); } },
  };
}

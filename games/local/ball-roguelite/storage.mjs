import { LEVELS, levelById } from './levels.mjs';
import { checkpoint, restoreGame } from './core.mjs';
export const STORAGE_KEY = 'ball-roguelite:save:v1';
const copy = (value) => JSON.parse(JSON.stringify(value));
const record = (value) => value && typeof value === 'object' && !Array.isArray(value);
const number = (value) => Number.isInteger(value) && value >= 0 && value <= 10000000;
export function createStorage(storage) {
  if (storage === undefined) { try { storage = globalThis.localStorage; } catch { storage = null; } }
  let persistent = !!storage;
  let data = { schemaVersion: 1, completed: {}, bestEndless: 0, lastLevel: LEVELS[0].id, sound: true, haptics: true, resume: null };
  try {
    const raw = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null');
    if (record(raw) && [0, 1].includes(raw.schemaVersion)) {
      if (typeof raw.sound === 'boolean') data.sound = raw.sound;
      if (typeof raw.haptics === 'boolean') data.haptics = raw.haptics;
      if (number(raw.bestEndless)) data.bestEndless = raw.bestEndless;
      if (record(raw.completed)) for (const level of LEVELS) {
        const result = raw.completed[level.id];
        if ((!level.unlock || data.completed[level.unlock]) && record(result) && number(result.score) && number(result.turns) && result.turns > 0) {
          data.completed[level.id] = { score: result.score, turns: result.turns, stars: stars(level, result.turns) };
        }
      }
      if (levelById(raw.lastLevel) && unlocked(raw.lastLevel)) data.lastLevel = raw.lastLevel;
      const resume = restoreGame(raw.resume);
      if (resume && unlocked(resume.levelId)) data.resume = checkpoint(resume);
    }
  } catch { /* Corrupt or unavailable storage falls back to this session. */ }
  function unlocked(id) { const level = levelById(id); return !!level && (!level.unlock || !!data.completed[level.unlock]); }
  function stars(level, turns) { return turns <= level.waves.length + 2 ? 3 : turns <= level.waves.length + 6 ? 2 : 1; }
  function persist() { try { storage?.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { persistent = false; } }
  return {
    read: () => copy(data),
    isUnlocked: unlocked,
    get persistent() { return persistent; },
    saveRun(game) {
      if (game.practice) return;
      const saved = checkpoint(game);
      if (saved) { data.resume = saved; data.lastLevel = game.levelId; persist(); }
    },
    finish(game) {
      if (game.practice || !['won', 'lost'].includes(game.phase)) return false;
      data.resume = null; data.lastLevel = game.levelId;
      if (game.level.endless) data.bestEndless = Math.max(data.bestEndless, game.score);
      else if (game.phase === 'won') {
        const old = data.completed[game.levelId];
        const turns = Math.max(1, game.turn);
        data.completed[game.levelId] = { score: Math.max(old?.score || 0, game.score), turns: Math.min(old?.turns || Infinity, turns), stars: Math.max(old?.stars || 0, stars(game.level, turns)) };
      }
      persist(); return true;
    },
    setting(key, value) { if (['sound', 'haptics'].includes(key)) { data[key] = !!value; persist(); } },
    clearResume() { data.resume = null; persist(); },
  };
}

import { Game } from './engine.js';
import { readRevives } from './rewards.js';
export const SAVE_KEY = 'tetracube.save.v1';

// A failed read locks writes for this session, including after a fresh local run.
export function createSaveStore(storage, key = SAVE_KEY) {
  let writable = true;
  return {
    get writable() {
      return writable;
    },
    read() {
      try {
        const raw = storage.getItem(key);
        if (!raw) return null;
        const value = JSON.parse(raw);
        if (value?.version !== 1) throw Error('Unknown save envelope.');
        const game = new Game().restore(value.game);
        return {
          game,
          revivesUsed: readRevives(value),
          tutorialStep: Math.max(0, Math.min(4, Number(value.tutorialStep) || 0)),
        };
      } catch {
        writable = false;
        return null;
      }
    },
    write(game, revivesUsed, tutorialStep) {
      if (!writable) return false;
      try {
        storage.setItem(
          key,
          JSON.stringify({ version: 1, game: game.getSnapshot(), revivesUsed, tutorialStep }),
        );
        return true;
      } catch {
        return false;
      }
    },
  };
}

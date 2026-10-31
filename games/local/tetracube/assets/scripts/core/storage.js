import { Game } from './engine.js';
import { readRevives } from './rewards.js';
import { createRun, restoreRun, snapshotRun, checkRun } from './session.js';
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
        if (![1, 2].includes(value?.version)) throw Error('Unknown save envelope.');
        const run = value.version === 2 ? restoreRun(value.run) : createRun();
        if (value.version === 1) {
          run.game = new Game().restore(value.game);
          checkRun(run);
        }
        const game = run.game;
        return {
          game,
          run,
          revivesUsed: readRevives(value),
          tutorialStep: Math.max(0, Math.min(4, Number(value.tutorialStep) || 0)),
        };
      } catch {
        writable = false;
        return null;
      }
    },
    write(game, revivesUsed, tutorialStep, run) {
      if (!writable) return false;
      try {
        storage.setItem(
          key,
          JSON.stringify(
            run
              ? { version: 2, run: snapshotRun(run), revivesUsed, tutorialStep }
              : { version: 1, game: game.getSnapshot(), revivesUsed, tutorialStep },
          ),
        );
        return true;
      } catch {
        return false;
      }
    },
  };
}

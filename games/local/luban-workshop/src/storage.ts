import { restoreGame, serializeGame, type GameState, type Level } from './core/index.ts';

const PREFIX = 'luban-workshop:v1:';
export const storage = {
  load(level: Level): GameState | null {
    try {
      const raw = localStorage.getItem(PREFIX + level.id);
      return raw ? restoreGame(level, raw) : null;
    } catch {
      return null;
    }
  },
  save(state: GameState): boolean {
    try {
      localStorage.setItem(PREFIX + state.levelId, serializeGame(state));
      localStorage.setItem(PREFIX + 'current', state.levelId);
      return true;
    } catch {
      return false;
    }
  },
  current(): string | null {
    try {
      return localStorage.getItem(PREFIX + 'current');
    } catch {
      return null;
    }
  },
  completed(id: string): boolean {
    try {
      return localStorage.getItem(PREFIX + 'complete:' + id) === '1';
    } catch {
      return false;
    }
  },
  complete(id: string): void {
    try {
      localStorage.setItem(PREFIX + 'complete:' + id, '1');
    } catch {
      /* Session remains fully playable without persistence. */
    }
  },
};

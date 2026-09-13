import { create } from 'zustand';
import { chapters, readStamps } from './journey.ts';

export const STORAGE_KEY = 'travel2:bund:stamps:v1';
let initial: string[] = [];
try {
  initial = readStamps(localStorage.getItem(STORAGE_KEY));
} catch {
  /* Private browsing still permits a session. */
}

export const useJourney = create<{
  stamps: string[];
  storageAvailable: boolean;
  collect: (id: string) => void;
}>((set) => ({
  stamps: initial,
  storageAvailable: true,
  collect: (id) =>
    set((state) => {
      if (!chapters.some((chapter) => chapter.id === id) || state.stamps.includes(id)) return state;
      const stamps = [...state.stamps, id];
      let storageAvailable = true;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stamps));
      } catch {
        storageAvailable = false;
      }
      return { stamps, storageAvailable };
    }),
}));

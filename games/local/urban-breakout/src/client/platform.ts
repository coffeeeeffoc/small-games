export type RecordEntry = { score: number; survivors: number; won: boolean; at: string };
export const storage = {
  read<T>(key: string, fallback: T): T {
    try {
      return JSON.parse(localStorage.getItem(`urban-breakout:${key}`) ?? 'null') ?? fallback;
    } catch {
      return fallback;
    }
  },
  write(key: string, value: unknown) {
    try {
      localStorage.setItem(`urban-breakout:${key}`, JSON.stringify(value));
    } catch {
      /* Practice remains playable with storage disabled. */
    }
  },
};

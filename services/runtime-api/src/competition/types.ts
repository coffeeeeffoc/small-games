export type Result = { finished: boolean; eligible: boolean; score: number; secondary: number };
export type Rule = {
  id: string; title: string; version: string; durationMs: number; description?: string;
  duel?: boolean;
  pollMs?: number;
  advance?(state: unknown, elapsedMs: number): unknown;
  initial(seed: number): unknown;
  view(state: unknown, seat?: number): unknown;
  action(state: unknown, action: unknown, elapsedMs: number, seat?: number): unknown;
  result(state: unknown, seat?: number): Result;
};
export type Member = { id: string; ready: boolean; seq: number; state: unknown; result?: Result; before?: unknown };
export type Room = {
  code: string; game: string; version: string; status: 'waiting' | 'playing' | 'finished' | 'abandoned' | 'expired';
  seed: number; players: Member[]; createdAt: number; startedAt?: number; deadline: number;
  results?: unknown; rematch?: string;
};
export class CompetitionError extends Error {
  constructor(public code: string, public status = 409) { super(code); }
}

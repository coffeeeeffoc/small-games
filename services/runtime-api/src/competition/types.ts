import type { NightLoadout, NightCatalog } from './night-wallet.js';

export type Result = {
  finished: boolean;
  eligible: boolean;
  score: number;
  secondary: number;
  outcome?: 'win' | 'loss' | 'draw';
};
export type Rule = {
  id: string;
  title: string;
  version: string;
  durationMs: number;
  description?: string;
  duel?: boolean;
  nightMods?: NightCatalog;
  clearCoins?(levelId: string, first: boolean): number;
  lobby?: boolean;
  noTimeLimit?: boolean;
  takeover?(state: unknown, seat: number): unknown;
  /** Shared friend rooms can have more than two seats without entering ranked duels. */
  roomSize?(mode?: string): number;
  unrated?: boolean;
  roles?: readonly string[];
  modes?: readonly { id: string; title: string }[];
  pollMs?: number;
  advance?(state: unknown, elapsedMs: number): unknown;
  initial(seed: number, mode?: string, firstRole?: string, loadouts?: NightLoadout[]): unknown;
  view(state: unknown, seat?: number): unknown;
  action(state: unknown, action: unknown, elapsedMs: number, seat?: number): unknown;
  result(state: unknown, seat?: number): Result;
  runBoard?(config: Record<string, unknown>): string;
  verifyRun?(config: Record<string, unknown>, input: unknown): { board: string; elapsedMs: number };
};
export type Member = {
  id: string;
  loadout?: NightLoadout;
  role?: string;
  ready: boolean;
  seq: number;
  state: unknown;
  result?: Result;
  before?: unknown;
  leaseId?: string;
  seenAt?: number;
  disconnected?: boolean;
  reconnectUntil?: number;
  takenOver?: boolean;
  settlement?: {
    points: number;
    totalPoints: number;
    wins: number;
    games: number;
    outcome: 'win' | 'loss' | 'draw';
    reason: string;
  };
};
export type Room = {
  id?: string;
  killEpoch?: number;
  code: string;
  game: string;
  version: string;
  status: 'waiting' | 'playing' | 'finished' | 'abandoned' | 'expired';
  seed: number;
  mode?: string;
  initiative?: string;
  firstRole?: string;
  players: Member[];
  createdAt: number;
  startedAt?: number;
  trialRoundId?: string;
  deadline: number;
  results?: unknown;
  rematch?: string;
  visibility?: 'public' | 'private';
  passwordSalt?: string;
  passwordHash?: string;
  spectators?: string[];
  spectatorSeenAt?: Record<string, number>;
  settledAt?: number;
};
export class CompetitionError extends Error {
  constructor(
    public code: string,
    public status = 409,
  ) {
    super(code);
  }
}

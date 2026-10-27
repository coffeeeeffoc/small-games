export type BoardDefinition = {
  id: string;
  title: string;
  description: string;
  guestAllowed: boolean;
  scoreUnit: string;
  secondaryUnit: 'milliseconds';
};
export type Frame = { ticks: number; input: Record<string, unknown> };
export type RankedResult = {
  cleared?: boolean;
  fastestEligible?: boolean;
  assisted?: boolean;
  complete: boolean;
  eligible: boolean;
  score: number;
  secondary: number;
};
export type RankedRule = {
  id: string;
  title: string;
  version: string;
  boardVersion?: string;
  boards: readonly BoardDefinition[];
  create(board: string, seed: number, levelId?: string): unknown;
  apply(state: unknown, frames: Frame[]): unknown;
  result(state: unknown): RankedResult;
};
export type Settlement = RankedResult & {
  accepted: boolean;
  reason: string | null;
  runId: string;
  points?: number;
  totalPoints?: number;
  clears?: number;
  wins?: number;
  games?: number;
};
export type RankedRun = {
  killEpoch?: number;
  kind: 'ranked-run-v1';
  id: string;
  game: string;
  board: string;
  boardKey: string;
  version: string;
  playerId: string;
  seed: number;
  levelId?: string;
  seq: number;
  ticks: number;
  state: unknown;
  createdAt: number;
  expiresAt: number;
  status: 'active' | 'finished';
  settlement?: Settlement;
};
export type RunView = {
  id: string;
  game: string;
  board: string;
  version: string;
  seed: number;
  levelId?: string;
  seq: number;
  status: RankedRun['status'];
  stepHz: 120;
  expiresAt: number;
};
export type Receipt = { hash: string; response: RunView };
export type RunTransaction = {
  assertControl?(): void;
  run: RankedRun;
  receipt(seq: number): Promise<Receipt | undefined>;
  saveReceipt(seq: number, receipt: Receipt): Promise<void>;
  record(result: Settlement): Promise<void>;
};
export type RunRepository = {
  create(run: RankedRun, auth?: PlayerAuth): Promise<void>;
  mutate<T>(id: string, change: (tx: RunTransaction) => Promise<T>, auth?: PlayerAuth): Promise<T>;
};
import type { PlayerAuth } from './auth.js';

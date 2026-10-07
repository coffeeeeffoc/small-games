import type { openDatabase } from '@coffeeeeffoc/service-kit';

export type Database = ReturnType<typeof openDatabase>['db'];
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type EngineState = {
  board: number[];
  candidates: { shapeId: string; color: number }[];
  used: number[];
  group: number;
  completedGroups: number;
  placedInGroup: number;
  score: number;
  combo: number;
  status: 'playing' | 'lost' | 'finished';
  reason: string | null;
  stats: Record<string, number>;
  lastEvent: unknown;
  [key: string]: unknown;
};
export type Engine = {
  RULE_VERSION: string;
  SHAPES_VERSION: string;
  DIFFICULTY_VERSION: string;
  SCORING_VERSION: string;
  RANDOM_VERSION: string;
  createEndless(seed: number | string, options: { ranked: boolean }): EngineState;
  place(state: EngineState, slot: number, x: number, y: number): EngineState;
  finishEndless(state: EngineState): EngineState;
};
export type Placement = { seq: number; group: number; slot: number; x: number; y: number };
export type Settlement = {
  status: 'verified' | 'pending-review' | 'ineligible' | 'rejected';
  reason: string | null;
  score: number;
  stats: Record<string, number>;
  finishedAt: number;
  isPersonalBest: boolean;
};
export type RankedSession = {
  id: string;
  playerId: string;
  version: string;
  shapeVersion: string;
  difficultyVersion: string;
  scoringVersion: string;
  randomVersion: string;
  seed: string;
  seq: number;
  status: 'active' | 'finished';
  createdAt: number;
  expiresAt: number;
  eligible: boolean;
  state: EngineState;
  settlement: Settlement | null;
};
export const LOGIN_REASON = '请使用微信或B站登录后参与全站榜';
export const publicState = (state: EngineState) => ({
  version: state.version,
  mode: 'endless',
  ranked: true,
  undoRemaining: 0,
  canUndo: false,
  stars: 0,
  continued: false,
  starBoard: state.starBoard,
  board: state.board,
  candidates: state.candidates,
  used: state.used,
  group: state.group,
  completedGroups: state.completedGroups,
  placedInGroup: state.placedInGroup,
  score: state.score,
  combo: state.combo,
  status: state.status,
  reason: state.reason,
  stats: state.stats,
  lastEvent: state.lastEvent,
});

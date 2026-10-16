export type Settings = {
  mode: 'singles' | 'doubles' | 'colors';
  board: 'ordinary' | 'level' | 'random';
  levelId: string | null;
  maxPlayers: number;
};
export type Shot = { position: number; dx: number; dy: number; power: number };
export type Match = {
  turn: number;
  turnNumber: number;
  phase: string;
  players: { id: string; name: string }[];
  ranking?: { playerId: string; rank: number; points: number; remaining: number }[];
  [key: string]: unknown;
};
export type Engine = {
  multiplayerVersion: number;
  createMultiplayerMatch(options: Record<string, unknown>): Match;
  applyMultiplayerShot(
    state: Match,
    input: Shot & { playerId: string },
  ): {
    state: Match;
    initialState: Match;
    steps: number;
    durationMs: number;
  };
  skipMultiplayerTurn(state: Match): Match;
};
export type Level = { id: string; title: string; playerCounts: number[] };
export type Member = {
  id: string;
  name: string;
  ready: boolean;
  lastSeen: number;
  seq: number;
  lastHash?: string;
};
export type Room = {
  killEpoch?: number;
  game: 'carrom-club';
  code: string;
  version: number;
  hostId: string;
  status: 'waiting' | 'playing' | 'finished' | 'abandoned' | 'expired';
  players: Member[];
  settings: Settings;
  revision: number;
  readyRevision: number;
  round: number;
  deadline: number;
  turnDeadline: number;
  state: Match | null;
  series: { playerId: string; points: number; wins: number }[];
  settledRound: number;
  lastShot: {
    id: number;
    playerId: string;
    input: Shot;
    initialState: Match;
    steps: number;
    durationMs: number;
    startedAt: number;
  } | null;
  reason?: string;
};
export type Repository = {
  create(room: Room): Promise<void>;
  mutate<T>(
    code: string,
    change: (room: Room) => T,
    operation?: string,
    input?: Input,
    playerId?: string,
  ): Promise<T>;
  name(playerId: string): Promise<string>;
};
export type Input = {
  revision?: number;
  settings?: Partial<Settings>;
  ready?: boolean;
  round?: number;
  expectedTurnNumber?: number;
  seq?: number;
  shot?: Shot;
};

export type Axis = 'x' | 'y' | 'z';
export type Vec3 = readonly [number, number, number];
export interface Box {
  min: Vec3;
  max: Vec3;
}
export interface PieceDefinition {
  id: string;
  name: string;
  color: string;
  axis: Axis;
  /** Every box is used by both the renderer and the collision solver. */
  boxes: readonly Box[];
  range: readonly [number, number];
  /** At this absolute offset the piece is outside the original assembly. */
  removedAt: number;
}
export interface Level {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  difficulty: string;
  estimatedMinutes: string;
  pieces: readonly PieceDefinition[];
}
export type Phase = 'disassemble' | 'reassemble';
export type Offsets = Record<string, number>;
export interface Snapshot {
  offsets: Offsets;
  moves: number;
}
export interface GameState {
  levelId: string;
  offsets: Offsets;
  phase: Phase;
  moves: number;
  history: Snapshot[];
  future: Snapshot[];
}
export interface MoveResult {
  state: GameState;
  actualOffset: number;
  blocked: boolean;
  blockedBy: string[];
}
export interface Transaction {
  pieceId: string;
  before: GameState;
  state: GameState;
  /** The safe release position computed against the same collision geometry. */
  snappedState: GameState;
}
export interface Progress {
  removed: number;
  total: number;
  assembled: number;
  complete: boolean;
}
export interface Hint {
  pieceId: string;
  targetOffset: number;
  direction: -1 | 1;
  message: string;
}

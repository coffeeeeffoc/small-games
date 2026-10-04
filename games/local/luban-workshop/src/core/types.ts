export type Axis = 'x' | 'y' | 'z';
export type Vec3 = readonly [number, number, number];
/** Row-major proper orthonormal rotation matrix, including partial turns. */
export type Orientation = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
export type Orientations = Record<string, Orientation>;
export interface Box {
  min: Vec3;
  max: Vec3;
}
export interface PieceDefinition {
  id: string;
  name: string;
  color: string;
  /** Preferred presentation direction; movement is allowed on every world axis. */
  axis: Axis;
  /** Every box is used by both the renderer and the collision solver. */
  boxes: readonly Box[];
  /** Legacy save metadata, not a movement constraint. */
  range: readonly [number, number];
  removedAt: number;
}
export interface Level {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  difficulty: string;
  estimatedMinutes: string;
  /** A short hands-on introduction; advanced tools stay optional. */
  tutorial?: boolean;
  /** A chapter groups puzzles around a shared structure or spatial skill. */
  chapter?: string;
  mechanic?: string;
  clue?: string;
  source?: { title: string; url: string; note?: string };
  /** Optional angle choices in degrees; omitted levels default to 90°. */
  rotationSteps?: readonly number[];
  /** State-matched, validated tutorial suggestions for this mechanism. */
  hintRules?: readonly HintRule[];
  pieces: readonly PieceDefinition[];
}
export type Phase = 'disassemble' | 'reassemble';
export type Offsets = Record<string, Vec3>;
export interface Snapshot {
  offsets: Offsets;
  orientations: Orientations;
  moves: number;
}
export interface GameState {
  levelId: string;
  offsets: Offsets;
  orientations: Orientations;
  phase: Phase;
  moves: number;
  history: Snapshot[];
  future: Snapshot[];
}
export interface MoveResult {
  state: GameState;
  /** The leader's resulting coordinate on the requested world axis. */
  actualOffset: number;
  blocked: boolean;
  blockedBy: string[];
}
export interface RotationResult {
  state: GameState;
  blocked: boolean;
  blockedBy: string[];
  pivot: Vec3;
}
export interface Transaction {
  pieceId: string;
  pieceIds: string[];
  axis?: Axis;
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
export interface HintPoseCondition {
  pieceId: string;
  offset?: Vec3;
  offsetRange?: { min: Vec3; max: Vec3 };
  orientation?: Orientation;
  tolerance?: number;
}
export interface HintRule {
  id: string;
  /** Optional translated rule frame, following this piece's live offset. */
  relativeToPieceId?: string;
  phase?: Phase;
  when?: readonly HintPoseCondition[];
  action: Hint;
}
export interface Hint {
  /** Pose/phase fingerprint; delayed hints must match before execution. */
  stateKey?: string;
  kind?: 'move' | 'rotate';
  /** Angle for rotate hints; omitted preserves the original 90° action. */
  rotationDegrees?: number;
  pieceId: string;
  pieceIds: string[];
  axis: Axis;
  targetOffset: number;
  direction: -1 | 1;
  message: string;
}
